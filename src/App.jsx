import React, { useState, useEffect, useRef } from 'react';
import { detectShapeAndStraighten } from './shapeDetection';

export default function App() {
  // Notebooks & Pages Data State
  const [notebooks, setNotebooks] = useState([]);
  const [activeNotebookId, setActiveNotebookId] = useState(null);
  const [activePageId, setActivePageId] = useState(null);

  // App Drawing / View States
  const [currentMode, setCurrentMode] = useState('brush'); // brush, eraser, pan, select
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [currentBrushSize, setCurrentBrushSize] = useState(1.5);
  const [currentGlow, setCurrentGlow] = useState(false);
  const [pressureEnabled, setPressureEnabled] = useState(true);
  const [shapeDetectionEnabled, setShapeDetectionEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  // Active Drawing View Canvas transformations
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1.0);

  // Active Notebook / Page title states
  const [notebookTitle, setNotebookTitle] = useState('');
  const [pageTitle, setPageTitle] = useState('');

  // Undo & Redo History for Active page
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Canvas DOM refs
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const isPanning = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const isResizing = useRef(null); // 'nw', 'ne', 'sw', 'se' or null
  const isMoving = useRef(false);
  const imageRefs = useRef({}); // Cache for HTMLImageElements

  const currentStrokeRef = useRef(null);

  // Initialize from LocalStorage
  useEffect(() => {
    const localData = localStorage.getItem('zendraw_onenote_notebooks');
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (parsed && parsed.length > 0) {
          setNotebooks(parsed);
          setActiveNotebookId(parsed[0].id);
          setNotebookTitle(parsed[0].title);
          if (parsed[0].pages && parsed[0].pages.length > 0) {
            setActivePageId(parsed[0].pages[0].id);
            setPageTitle(parsed[0].pages[0].title);
            setUndoStack([{ strokes: parsed[0].pages[0].strokes || [], images: parsed[0].pages[0].images || [] }]);
            setZoom(parsed[0].pages[0].zoom || 1.0);
            setPanX(parsed[0].pages[0].panX || 0);
            setPanY(parsed[0].pages[0].panY || 0);
          } else {
            createNewPage(parsed[0].id);
          }
        } else {
          setNotebooks([]);
          setActiveNotebookId(null);
          setActivePageId(null);
        }
      } catch (err) {
        setNotebooks([]);
        setActiveNotebookId(null);
        setActivePageId(null);
      }
    } else {
      setNotebooks([]);
      setActiveNotebookId(null);
      setActivePageId(null);
    }
  }, []);

  // Sync current mode's visual classes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Handle keyboard shortcuts (Delete, Undo, Redo)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId && currentMode === 'select') {
          deleteSelectedImage();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, currentMode, undoStack, redoStack]);

  const deleteSelectedImage = () => {
    // Prevent deleting a locked image
    const activePage = notebooks.find(nb => nb.id === activeNotebookId)?.pages.find(p => p.id === activePageId);
    const imgToDelete = activePage?.images?.find(i => i.id === selectedElementId);
    if (imgToDelete?.locked) return;

    const updatedNotebooks = notebooks.map((nb) => {
      if (nb.id === activeNotebookId) {
        return {
          ...nb,
          pages: nb.pages.map((p) => {
            if (p.id === activePageId) {
              return {
                ...p,
                images: (p.images || []).filter(img => img.id !== selectedElementId)
              };
            }
            return p;
          })
        };
      }
      return nb;
    });
    setNotebooks(updatedNotebooks);
    setSelectedElementId(null);
    syncToLocalStorage(updatedNotebooks);
    
    // Save to undo stack
    const updatedPage = updatedNotebooks.find(nb => nb.id === activeNotebookId)?.pages.find(p => p.id === activePageId);
    if (updatedPage) {
      setUndoStack([...undoStack, { strokes: updatedPage.strokes, images: updatedPage.images }]);
    }
  };

  const toggleImageLock = () => {
    if (!selectedElementId) return;
    const updatedNotebooks = notebooks.map((nb) => {
      if (nb.id === activeNotebookId) {
        return {
          ...nb,
          pages: nb.pages.map((p) => {
            if (p.id === activePageId) {
              return {
                ...p,
                images: (p.images || []).map((img) =>
                  img.id === selectedElementId ? { ...img, locked: !img.locked } : img
                )
              };
            }
            return p;
          })
        };
      }
      return nb;
    });
    setNotebooks(updatedNotebooks);
    syncToLocalStorage(updatedNotebooks);
  };

  // Handle Resize & Render continuous redraw
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvasRef.current.width = rect.width * dpr;
      canvasRef.current.height = rect.height * dpr;
      canvasRef.current.style.width = `${rect.width}px`;
      canvasRef.current.style.height = `${rect.height}px`;

      redraw();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [panX, panY, zoom, activePageId, notebooks, darkMode]);

  const redraw = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    const activeNotebook = notebooks.find((nb) => nb.id === activeNotebookId);
    if (!activeNotebook || !activeNotebook.pages) return;

    const activePage = activeNotebook.pages.find((p) => p.id === activePageId);
    if (!activePage) return;

    ctx.save();
    ctx.scale(zoom * dpr, zoom * dpr);
    ctx.translate(panX, panY);

    // Draw images
    if (activePage.images) {
      activePage.images.forEach((img) => {
        let imgObj = imageRefs.current[img.id];
        if (!imgObj) {
          imgObj = new Image();
          imgObj.src = img.src;
          imgObj.onload = () => redraw();
          imageRefs.current[img.id] = imgObj;
        }

        if (imgObj.complete) {
          ctx.drawImage(imgObj, img.x, img.y, img.width, img.height);
          
          if (img.locked) {
            // Draw golden locked overlay
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(img.x, img.y, img.width, img.height);
            ctx.setLineDash([]);

            // Draw lock icon (padlock) at top-right corner
            const iconSize = 18 / zoom;
            const iconX = img.x + img.width - iconSize - 4 / zoom;
            const iconY = img.y + 4 / zoom;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath();
            ctx.roundRect(iconX - 2/zoom, iconY - 2/zoom, iconSize + 4/zoom, iconSize + 4/zoom, 3/zoom);
            ctx.fill();
            ctx.fillStyle = '#f59e0b';
            ctx.font = `${iconSize}px "Font Awesome 6 Free"`;
            ctx.fontWeight = '900';
            ctx.textBaseline = 'top';
            // Draw a simple padlock shape manually
            const lx = iconX + iconSize / 2;
            const ly = iconY + iconSize / 2;
            const lw = iconSize * 0.5;
            const lh = iconSize * 0.38;
            // shackle
            ctx.beginPath();
            ctx.arc(lx, ly - lh * 0.35, lw * 0.45, Math.PI, 0);
            ctx.lineWidth = 2 / zoom;
            ctx.strokeStyle = '#f59e0b';
            ctx.stroke();
            // body
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.roundRect(lx - lw / 2, ly - lh * 0.2, lw, lh * 1.1, 2 / zoom);
            ctx.fill();
            // keyhole
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath();
            ctx.arc(lx, ly + lh * 0.2, lw * 0.16, 0, Math.PI * 2);
            ctx.fill();
          } else if (selectedElementId === img.id) {
            // Normal selection: blue dashed border + resize handles
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(img.x, img.y, img.width, img.height);
            ctx.setLineDash([]);

            const handleSize = 8 / zoom;
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(img.x - handleSize / 2, img.y - handleSize / 2, handleSize, handleSize); // nw
            ctx.fillRect(img.x + img.width - handleSize / 2, img.y - handleSize / 2, handleSize, handleSize); // ne
            ctx.fillRect(img.x - handleSize / 2, img.y + img.height - handleSize / 2, handleSize, handleSize); // sw
            ctx.fillRect(img.x + img.width - handleSize / 2, img.y + img.height - handleSize / 2, handleSize, handleSize); // se
          }
        }
      });
    }

    if (activePage.strokes) {
      activePage.strokes.forEach((stroke) => {
        if (!stroke.points || stroke.points.length < 1) return;

        ctx.beginPath();
        if (stroke.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = stroke.color;
        }

        if (stroke.isGlow && stroke.tool !== 'eraser') {
          ctx.shadowBlur = stroke.width * 1.5;
          ctx.shadowColor = stroke.color;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

        for (let i = 1; i < stroke.points.length; i++) {
          const prev = stroke.points[i - 1];
          const pt = stroke.points[i];
          ctx.lineWidth = stroke.width * ((prev.p + pt.p) / 2);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      });
    }

    ctx.restore();
  };

  const drawSegment = (p1, p2, stroke) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.scale(zoom * dpr, zoom * dpr);
    ctx.translate(panX, panY);

    ctx.beginPath();
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
    }

    if (stroke.isGlow && stroke.tool !== 'eraser') {
      ctx.shadowBlur = stroke.width * 1.5;
      ctx.shadowColor = stroke.color;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const computedWidth = stroke.width * ((p1.p + p2.p) / 2);
    ctx.lineWidth = computedWidth;

    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.restore();
  };

  // Pointer events handling
  const handlePointerDown = (e) => {
    e.preventDefault();
    if (!activeNotebookId || !activePageId) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = ((e.clientX - rect.left) * dpr) / (zoom * dpr) - panX;
    const y = ((e.clientY - rect.top) * dpr) / (zoom * dpr) - panY;

    lastX.current = e.clientX;
    lastY.current = e.clientY;

    if (currentMode === 'pan' || e.button === 1 || e.button === 2) {
      isPanning.current = true;
      return;
    }

    // Selection / Image Interaction Logic
    if (currentMode === 'select') {
      const activePage = notebooks.find(nb => nb.id === activeNotebookId)?.pages.find(p => p.id === activePageId);
      if (activePage && activePage.images) {
        // Check handles of selected image first (only if not locked)
        if (selectedElementId) {
          const img = activePage.images.find(i => i.id === selectedElementId);
          if (img && !img.locked) {
            const handleSize = 10 / zoom;
            const handles = {
              nw: { x: img.x, y: img.y },
              ne: { x: img.x + img.width, y: img.y },
              sw: { x: img.x, y: img.y + img.height },
              se: { x: img.x + img.width, y: img.y + img.height }
            };

            for (const [type, pos] of Object.entries(handles)) {
              if (x >= pos.x - handleSize && x <= pos.x + handleSize &&
                  y >= pos.y - handleSize && y <= pos.y + handleSize) {
                isResizing.current = type;
                return;
              }
            }
          }
        }

        // Check for image click (selection or move; locked images can only be selected, not moved)
        const clickedImg = [...activePage.images].reverse().find(img => 
          x >= img.x && x <= img.x + img.width && y >= img.y && y <= img.y + img.height
        );

        if (clickedImg) {
          setSelectedElementId(clickedImg.id);
          if (!clickedImg.locked) {
            isMoving.current = true;
          }
          return;
        } else {
          setSelectedElementId(null);
        }
      }
      return;
    }

    isDrawing.current = true;
    const p = pressureEnabled && e.pressure ? e.pressure : 1.0;

    currentStrokeRef.current = {
      tool: currentMode,
      color: currentColor,
      width: currentBrushSize,
      isGlow: currentGlow,
      points: [{ x, y, p }]
    };
  };

  const handlePointerMove = (e) => {
    e.preventDefault();
    const dpr = window.devicePixelRatio || 1;
    const dx = (e.clientX - lastX.current) / zoom;
    const dy = (e.clientY - lastY.current) / zoom;

    if (isPanning.current) {
      setPanX((prev) => prev + (e.clientX - lastX.current) / (zoom * dpr));
      setPanY((prev) => prev + (e.clientY - lastY.current) / (zoom * dpr));

      lastX.current = e.clientX;
      lastY.current = e.clientY;
      return;
    }

    if (isResizing.current || isMoving.current) {
      const updatedNotebooks = notebooks.map((nb) => {
        if (nb.id === activeNotebookId) {
          return {
            ...nb,
            pages: nb.pages.map((p) => {
              if (p.id === activePageId) {
                return {
                  ...p,
                  images: (p.images || []).map((img) => {
                    if (img.id === selectedElementId) {
                      if (isMoving.current) {
                        return { ...img, x: img.x + dx, y: img.y + dy };
                      }
                      if (isResizing.current) {
                        let { x, y, width, height } = img;
                        const type = isResizing.current;
                        if (type.includes('e')) width += dx;
                        if (type.includes('s')) height += dy;
                        if (type.includes('w')) { x += dx; width -= dx; }
                        if (type.includes('n')) { y += dy; height -= dy; }
                        return { ...img, x, y, width: Math.max(10, width), height: Math.max(10, height) };
                      }
                    }
                    return img;
                  })
                };
              }
              return p;
            })
          };
        }
        return nb;
      });
      setNotebooks(updatedNotebooks);
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      redraw();
      return;
    }

    if (!isDrawing.current || !currentStrokeRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * dpr) / (zoom * dpr) - panX;
    const y = ((e.clientY - rect.top) * dpr) / (zoom * dpr) - panY;

    const p = pressureEnabled && e.pressure ? e.pressure : 1.0;

    currentStrokeRef.current.points.push({ x, y, p });

    const pts = currentStrokeRef.current.points;
    if (pts.length > 1) {
      const prev = pts[pts.length - 2];
      drawSegment(prev, { x, y, p }, currentStrokeRef.current);
    }
  };

  const handlePointerUp = (e) => {
    e.preventDefault();
    if (isPanning.current) {
      isPanning.current = false;
      return;
    }

    if (isResizing.current || isMoving.current) {
      isResizing.current = null;
      isMoving.current = false;
      syncToLocalStorage(notebooks);
      return;
    }

    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
      const stroke = currentStrokeRef.current;

      // iPad shape matching automation
      if (stroke.tool === 'brush' && shapeDetectionEnabled) {
        const matchedShape = detectShapeAndStraighten(stroke.points);
        if (matchedShape) {
          stroke.points = matchedShape.points;
        }
      }

      // Update notebooks state with new stroke
      const activePage = notebooks.find(nb => nb.id === activeNotebookId)?.pages.find(p => p.id === activePageId);
      if (activePage) {
        setUndoStack([...undoStack, { strokes: activePage.strokes || [], images: activePage.images || [] }]);
      }

      const updatedNotebooks = notebooks.map((nb) => {
        if (nb.id === activeNotebookId) {
          return {
            ...nb,
            pages: nb.pages.map((p) => {
              if (p.id === activePageId) {
                return {
                  ...p,
                  strokes: [...(p.strokes || []), stroke],
                  panX,
                  panY,
                  zoom
                };
              }
              return p;
            })
          };
        }
        return nb;
      });

      setNotebooks(updatedNotebooks);
      setRedoStack([]);

      currentStrokeRef.current = null;
      syncToLocalStorage(updatedNotebooks);
    }
  };

  const undo = () => {
    if (undoStack.length <= 1) return; // Keep at least one state
    const currentState = undoStack[undoStack.length - 1];
    const prevState = undoStack[undoStack.length - 2];

    setUndoStack(undoStack.slice(0, -1));
    setRedoStack([...redoStack, currentState]);

    const updatedNotebooks = notebooks.map((nb) => {
      if (nb.id === activeNotebookId) {
        return {
          ...nb,
          pages: nb.pages.map((p) => {
            if (p.id === activePageId) {
              return {
                ...p,
                strokes: prevState.strokes || [],
                images: prevState.images || []
              };
            }
            return p;
          })
        };
      }
      return nb;
    });

    setNotebooks(updatedNotebooks);
    syncToLocalStorage(updatedNotebooks);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];

    setRedoStack(redoStack.slice(0, -1));
    setUndoStack([...undoStack, nextState]);

    const updatedNotebooks = notebooks.map((nb) => {
      if (nb.id === activeNotebookId) {
        return {
          ...nb,
          pages: nb.pages.map((p) => {
            if (p.id === activePageId) {
              return {
                ...p,
                strokes: nextState.strokes || [],
                images: nextState.images || []
              };
            }
            return p;
          })
        };
      }
      return nb;
    });

    setNotebooks(updatedNotebooks);
    syncToLocalStorage(updatedNotebooks);
  };

  // Notebook and Page creating functions
  const createNewNotebook = (title = 'Fresh Notebook') => {
    const nbId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    const newPage = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      title: 'Page 1',
      date: new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      strokes: [],
      panX: 0,
      panY: 0,
      zoom: 1.0
    };

    const newNotebook = {
      id: nbId,
      title: title,
      pages: [newPage]
    };

    const nextNotebooks = [newNotebook, ...notebooks];
    setNotebooks(nextNotebooks);
    setActiveNotebookId(nbId);
    setNotebookTitle(title);
    setActivePageId(newPage.id);
    setPageTitle(newPage.title);
    setUndoStack([{ strokes: [], images: [] }]);
    setRedoStack([]);
    setPanX(0);
    setPanY(0);
    setZoom(1.0);
    syncToLocalStorage(nextNotebooks);
  };

  const createNewPage = (nbId) => {
    const pageId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    const notebook = notebooks.find((nb) => nb.id === nbId);
    if (!notebook) return;

    const newPage = {
      id: pageId,
      title: `Page ${notebook.pages.length + 1}`,
      date: new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      strokes: [],
      panX: 0,
      panY: 0,
      zoom: 1.0
    };

    const updatedNotebooks = notebooks.map((nb) => {
      if (nb.id === nbId) {
        return {
          ...nb,
          pages: [...nb.pages, newPage]
        };
      }
      return nb;
    });

    setNotebooks(updatedNotebooks);
    setActivePageId(pageId);
    setPageTitle(newPage.title);
    setUndoStack([{ strokes: [], images: [] }]);
    setRedoStack([]);
    setPanX(0);
    setPanY(0);
    setZoom(1.0);
    syncToLocalStorage(updatedNotebooks);
  };

  const selectNotebook = (nbId) => {
    const found = notebooks.find((nb) => nb.id === nbId);
    if (!found) return;

    setActiveNotebookId(nbId);
    setNotebookTitle(found.title);

    if (found.pages && found.pages.length > 0) {
      const page = found.pages[0];
      setActivePageId(page.id);
      setPageTitle(page.title);
      setUndoStack([{ strokes: page.strokes || [], images: page.images || [] }]);
      setRedoStack([]);
      setZoom(page.zoom || 1.0);
      setPanX(page.panX || 0);
      setPanY(page.panY || 0);
    } else {
      createNewPage(nbId);
    }
  };

  const selectPage = (pageId) => {
    const notebook = notebooks.find((nb) => nb.id === activeNotebookId);
    if (!notebook) return;

    const found = notebook.pages.find((p) => p.id === pageId);
    if (!found) return;

    setActivePageId(pageId);
    setPageTitle(found.title);
    setUndoStack([{ strokes: found.strokes || [], images: found.images || [] }]);
    setRedoStack([]);
    setZoom(found.zoom || 1.0);
    setPanX(found.panX || 0);
    setPanY(found.panY || 0);
  };

  const deleteNotebook = (nbId, e) => {
    e.stopPropagation();
    const filtered = notebooks.filter((nb) => nb.id !== nbId);
    setNotebooks(filtered);

    if (activeNotebookId === nbId) {
      if (filtered.length > 0) {
        selectNotebook(filtered[0].id);
      } else {
        setActiveNotebookId(null);
        setActivePageId(null);
        setNotebookTitle('');
        setPageTitle('');
      }
    }
    syncToLocalStorage(filtered);
  };

  const deletePage = (pageId, e) => {
    e.stopPropagation();
    const activeNotebook = notebooks.find((nb) => nb.id === activeNotebookId);
    if (!activeNotebook) return;

    const filteredPages = activeNotebook.pages.filter((p) => p.id !== pageId);

    const updatedNotebooks = notebooks.map((nb) => {
      if (nb.id === activeNotebookId) {
        return {
          ...nb,
          pages: filteredPages
        };
      }
      return nb;
    });

    setNotebooks(updatedNotebooks);

    if (activePageId === pageId) {
      if (filteredPages.length > 0) {
        const first = filteredPages[0];
        setActivePageId(first.id);
        setPageTitle(first.title);
        setUndoStack([{ strokes: first.strokes || [], images: first.images || [] }]);
        setRedoStack([]);
        setZoom(first.zoom || 1.0);
        setPanX(first.panX || 0);
        setPanY(first.panY || 0);
      } else {
        setActivePageId(null);
        setPageTitle('');
        setUndoStack([{ strokes: [], images: [] }]);
        setRedoStack([]);
      }
    }
    syncToLocalStorage(updatedNotebooks);
  };

  const handleNotebookTitleChange = (e) => {
    const val = e.target.value;
    setNotebookTitle(val);

    const updated = notebooks.map((nb) => {
      if (nb.id === activeNotebookId) {
        return { ...nb, title: val || 'Untitled Notebook' };
      }
      return nb;
    });
    setNotebooks(updated);
    syncToLocalStorage(updated);
  };

  const handlePageTitleChange = (e) => {
    const val = e.target.value;
    setPageTitle(val);

    const updated = notebooks.map((nb) => {
      if (nb.id === activeNotebookId) {
        return {
          ...nb,
          pages: nb.pages.map((p) => {
            if (p.id === activePageId) {
              return { ...p, title: val || 'Untitled Page' };
            }
            return p;
          })
        };
      }
      return nb;
    });
    setNotebooks(updated);
    syncToLocalStorage(updated);
  };

  const clearCanvas = () => {
    const updated = notebooks.map((nb) => {
      if (nb.id === activeNotebookId) {
        return {
          ...nb,
          pages: nb.pages.map((p) => {
            if (p.id === activePageId) {
              return { ...p, strokes: [], images: [] };
            }
            return p;
          })
        };
      }
      return nb;
    });

    setNotebooks(updated);
    setUndoStack([]);
    setRedoStack([]);
    syncToLocalStorage(updated);
  };

  const syncToLocalStorage = (nextNotebooks) => {
    localStorage.setItem('zendraw_onenote_notebooks', JSON.stringify(nextNotebooks));
  };

  const exportNote = () => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rect.width * dpr;
    tempCanvas.height = rect.height * dpr;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.fillStyle = darkMode ? '#111116' : '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    const activeNotebook = notebooks.find((nb) => nb.id === activeNotebookId);
    const activePage = activeNotebook?.pages.find((p) => p.id === activePageId);

    if (activePage) {
      tempCtx.save();
      tempCtx.scale(zoom * dpr, zoom * dpr);
      tempCtx.translate(panX, panY);

      // 1. Draw images
      if (activePage.images) {
        activePage.images.forEach((img) => {
          const imgObj = imageRefs.current[img.id];
          if (imgObj && imgObj.complete) {
            tempCtx.drawImage(imgObj, img.x, img.y, img.width, img.height);
          }
        });
      }

      // 2. Draw strokes
      if (activePage.strokes) {
        activePage.strokes.forEach((stroke) => {
          if (!stroke.points || stroke.points.length < 1) return;

          tempCtx.beginPath();
          if (stroke.tool === 'eraser') {
            tempCtx.globalCompositeOperation = 'destination-out';
            tempCtx.strokeStyle = 'rgba(0,0,0,1)';
          } else {
            tempCtx.globalCompositeOperation = 'source-over';
            tempCtx.strokeStyle = stroke.color;
          }

          if (stroke.isGlow && stroke.tool !== 'eraser') {
            tempCtx.shadowBlur = stroke.width * 1.5;
            tempCtx.shadowColor = stroke.color;
          } else {
            tempCtx.shadowBlur = 0;
          }

          tempCtx.lineCap = 'round';
          tempCtx.lineJoin = 'round';

          tempCtx.moveTo(stroke.points[0].x, stroke.points[0].y);

          for (let i = 1; i < stroke.points.length; i++) {
            const prev = stroke.points[i - 1];
            const pt = stroke.points[i];
            tempCtx.lineWidth = stroke.width * ((prev.p + pt.p) / 2);
            tempCtx.lineTo(pt.x, pt.y);
          }
          tempCtx.stroke();
        });
      }

      tempCtx.restore();
    }

    const link = document.createElement('a');
    link.href = tempCanvas.toDataURL('image/png');
    link.download = `${pageTitle.toLowerCase().replace(/\s+/g, '-')}.png`;
    link.click();
  };

  const exportNotebookData = () => {
    const dataStr = JSON.stringify(notebooks, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zendraw-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importNotebookData = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported) && imported.length > 0 && imported[0].id) {
          setNotebooks(imported);
          setActiveNotebookId(imported[0].id);
          setNotebookTitle(imported[0].title);
          if (imported[0].pages && imported[0].pages.length > 0) {
            setActivePageId(imported[0].pages[0].id);
            setPageTitle(imported[0].pages[0].title);
            setUndoStack([{ strokes: imported[0].pages[0].strokes || [], images: imported[0].pages[0].images || [] }]);
            setZoom(imported[0].pages[0].zoom || 1.0);
            setPanX(imported[0].pages[0].panX || 0);
            setPanY(imported[0].pages[0].panY || 0);
          }
          syncToLocalStorage(imported);
          alert('Notebooks imported successfully!');
        } else {
          alert('Invalid notebooks JSON format.');
        }
      } catch (err) {
        alert('Failed to parse notebook JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset file picker
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !activePageId) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target.result;
      const img = new Image();
      img.onload = () => {
        const newImage = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
          src,
          x: -panX + 50,
          y: -panY + 50,
          width: img.width > 500 ? 500 : img.width,
          height: (img.height / img.width) * (img.width > 500 ? 500 : img.width)
        };

        const updatedNotebooks = notebooks.map((nb) => {
          if (nb.id === activeNotebookId) {
            return {
              ...nb,
              pages: nb.pages.map((p) => {
                if (p.id === activePageId) {
                  return {
                    ...p,
                    images: [...(p.images || []), newImage]
                  };
                }
                return p;
              })
            };
          }
          return nb;
        });

        setNotebooks(updatedNotebooks);
        syncToLocalStorage(updatedNotebooks);
        setSelectedElementId(newImage.id);
        setCurrentMode('select');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };


  const exportNotebookToPdf = () => {
    const activeNotebook = notebooks.find((nb) => nb.id === activeNotebookId);
    if (!activeNotebook || !activeNotebook.pages || activeNotebook.pages.length === 0) return;

    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      alert('jsPDF library is not loaded. Please try again.');
      return;
    }

    let pdfWidth = 800;
    let pdfHeight = 600;
    if (canvasRef.current) {
      const rect = canvasRef.current.parentElement.getBoundingClientRect();
      if (rect.width && rect.height) {
        pdfWidth = rect.width;
        pdfHeight = rect.height;
      }
    }

    const doc = new jsPDF('landscape', 'px', [pdfWidth, pdfHeight]);
    const dpr = window.devicePixelRatio || 1;

    activeNotebook.pages.forEach((page, index) => {
      // Create a temporary strokes canvas at high resolution
      const strokesCanvas = document.createElement('canvas');
      strokesCanvas.width = pdfWidth * dpr;
      strokesCanvas.height = pdfHeight * dpr;
      const sCtx = strokesCanvas.getContext('2d');

      const pZoom = page.zoom || 1.0;
      const pPanX = page.panX || 0;
      const pPanY = page.panY || 0;

      sCtx.save();
      sCtx.scale(pZoom * dpr, pZoom * dpr);
      sCtx.translate(pPanX, pPanY);

      // Draw images
      if (page.images) {
        page.images.forEach((img) => {
          const imgObj = imageRefs.current[img.id];
          if (imgObj && imgObj.complete) {
            sCtx.drawImage(imgObj, img.x, img.y, img.width, img.height);
          }
        });
      }

      if (page.strokes) {
        page.strokes.forEach((stroke) => {
          if (!stroke.points || stroke.points.length < 1) return;
          sCtx.beginPath();
          if (stroke.tool === 'eraser') {
            sCtx.globalCompositeOperation = 'destination-out';
            sCtx.strokeStyle = 'rgba(0,0,0,1)';
          } else {
            sCtx.globalCompositeOperation = 'source-over';
            sCtx.strokeStyle = stroke.color;
          }

          if (stroke.isGlow && stroke.tool !== 'eraser') {
            sCtx.shadowBlur = stroke.width * 1.5;
            sCtx.shadowColor = stroke.color;
          } else {
            sCtx.shadowBlur = 0;
          }

          sCtx.lineCap = 'round';
          sCtx.lineJoin = 'round';

          sCtx.moveTo(stroke.points[0].x, stroke.points[0].y);

          for (let i = 1; i < stroke.points.length; i++) {
            const prev = stroke.points[i - 1];
            const pt = stroke.points[i];
            sCtx.lineWidth = stroke.width * ((prev.p + pt.p) / 2);
            sCtx.lineTo(pt.x, pt.y);
          }
          sCtx.stroke();
        });
      }

      sCtx.restore();

      // Create main offCanvas, draw solid background, and overlay the strokes
      const offCanvas = document.createElement('canvas');
      offCanvas.width = pdfWidth * dpr;
      offCanvas.height = pdfHeight * dpr;
      const oCtx = offCanvas.getContext('2d');

      oCtx.fillStyle = darkMode ? '#111116' : '#ffffff';
      oCtx.fillRect(0, 0, pdfWidth * dpr, pdfHeight * dpr);

      oCtx.drawImage(strokesCanvas, 0, 0);

      const imgData = offCanvas.toDataURL('image/jpeg', 0.82);
      if (index > 0) {
        doc.addPage([pdfWidth, pdfHeight], 'landscape');
      }
      doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
    });

    doc.save(`${activeNotebook.title.toLowerCase().replace(/\s+/g, '-')}.pdf`);
  };

  const activeNotebook = notebooks.find((nb) => nb.id === activeNotebookId);

  return (
    <div className="app-container" data-mode={currentMode}>
      {/* Sidebar Notebooks & Pages Sections */}
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-wrapper">
            <i className="fa-solid fa-feather-pointed brand-logo"></i>
          </div>
          <h2>ZenDraw</h2>
          <span className="badge">OneNote Mode</span>
        </div>

        {/* 1. Notebooks Manager */}
        <div className="sidebar-section">
          <div className="section-header">
            <h3>Notebooks</h3>
            <button className="icon-btn tooltip" onClick={() => createNewNotebook('New Notebook')} data-tooltip="Create Notebook">
              <i className="fa-solid fa-folder-plus"></i>
            </button>
          </div>
          <div className="notes-list">
            {notebooks.map((nb) => (
              <div
                key={nb.id}
                className={`note-item ${nb.id === activeNotebookId ? 'active' : ''}`}
                onClick={() => selectNotebook(nb.id)}
              >
                <div className="note-info">
                  <span className="note-name"><i className="fa-solid fa-book-open"></i> {nb.title}</span>
                  <span className="note-date">{nb.pages ? nb.pages.length : 0} pages</span>
                </div>
                <div className="note-actions">
                  <button className="delete-note-btn tooltip" onClick={(e) => deleteNotebook(nb.id, e)} data-tooltip="Delete notebook">
                    <i className="fa-solid fa-circle-xmark"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Pages Manager */}
        {activeNotebook && (
          <div className="sidebar-section">
            <div className="section-header">
              <h3>Pages</h3>
              <button className="icon-btn tooltip" onClick={() => createNewPage(activeNotebookId)} data-tooltip="New page in this notebook">
                <i className="fa-solid fa-plus"></i>
              </button>
            </div>
            <div className="notes-list">
              {activeNotebook.pages && activeNotebook.pages.map((page) => (
                <div
                  key={page.id}
                  className={`note-item ${page.id === activePageId ? 'active' : ''}`}
                  onClick={() => selectPage(page.id)}
                >
                  <div className="note-info">
                    <span className="note-name"><i className="fa-solid fa-file-signature"></i> {page.title}</span>
                    <span className="note-date"><i className="fa-solid fa-clock"></i> {page.date}</span>
                  </div>
                  <div className="note-actions">
                    <button className="delete-note-btn tooltip" onClick={(e) => deletePage(page.id, e)} data-tooltip="Delete page">
                      <i className="fa-solid fa-circle-xmark"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeNotebook && (
          <div className="sidebar-section">
            <div className="section-header">
              <h3>Page Meta</h3>
            </div>
            <div className="input-group">
              <label htmlFor="notebookTitleInput">Notebook Title</label>
              <input
                type="text"
                id="notebookTitleInput"
                value={notebookTitle}
                onChange={handleNotebookTitleChange}
                placeholder="Active Notebook"
                autoComplete="off"
              />
            </div>
            <div className="input-group">
              <label htmlFor="pageTitleInput">Page Title</label>
              <input
                type="text"
                id="pageTitleInput"
                value={pageTitle}
                onChange={handlePageTitleChange}
                placeholder="Active Page"
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          <div className="shortcuts-guide">
            <h4><i className="fa-solid fa-shapes"></i> Shape AutoDetect</h4>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Draw rough lines, circles, or rectangles. End the stroke and it automatically snaps into a perfectly clean shape.
            </p>
          </div>
          <button className="action-btn download-btn" onClick={() => alert('Fully saved to OneNote-style notebooks!')}>
            <i className="fa-solid fa-cloud-arrow-up"></i> Save notebook
          </button>
          <div className="backup-buttons" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="action-btn download-btn tooltip" onClick={exportNotebookData} data-tooltip="Backup & Export notebooks to a JSON file" style={{ flex: 1, padding: '8px 10px', fontSize: '12px' }}>
              <i className="fa-solid fa-file-export"></i> Export JSON
            </button>
            <label className="action-btn download-btn tooltip" data-tooltip="Import notebooks from a JSON file" style={{ flex: 1, padding: '8px 10px', fontSize: '12px', textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <i className="fa-solid fa-file-import"></i> Import JSON
              <input type="file" accept=".json" onChange={importNotebookData} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      </aside>

      {/* Main Workspace Workspace area */}
      <main className="workspace">
        {/* Responsive Toolbar */}
        <header className="toolbar-header">
          <div className="tool-group draw-tools">
            <button
              className={`tool-btn tooltip ${currentMode === 'brush' ? 'active' : ''}`}
              onClick={() => {
                setCurrentMode('brush');
                setSelectedElementId(null);
              }}
              data-tooltip="Brush / Marker"
            >
              <i className="fa-solid fa-pen-nib"></i>
            </button>
            <button
              className={`tool-btn tooltip ${currentMode === 'eraser' ? 'active' : ''}`}
              onClick={() => {
                setCurrentMode('eraser');
                setSelectedElementId(null);
              }}
              data-tooltip="Eraser"
            >
              <i className="fa-solid fa-eraser"></i>
            </button>
            <button
              className={`tool-btn tooltip ${currentMode === 'select' ? 'active' : ''}`}
              onClick={() => setCurrentMode('select')}
              data-tooltip="Select & Resize Images"
            >
              <i className="fa-solid fa-arrow-pointer"></i>
            </button>
            <label className="tool-btn tooltip" data-tooltip="Add Image">
              <i className="fa-solid fa-image"></i>
              <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
            </label>
            <button
              className={`tool-btn tooltip ${currentMode === 'pan' ? 'active' : ''}`}
              onClick={() => {
                setCurrentMode('pan');
                setSelectedElementId(null);
              }}
              data-tooltip="Translate pan View"
            >
              <i className="fa-solid fa-hand"></i>
            </button>
            {/* Lock / Unlock button — only visible when an image is selected in select mode */}
            {currentMode === 'select' && selectedElementId && (() => {
              const activePage = notebooks.find(nb => nb.id === activeNotebookId)?.pages.find(p => p.id === activePageId);
              const selectedImg = activePage?.images?.find(i => i.id === selectedElementId);
              if (!selectedImg) return null;
              return (
                <button
                  className={`tool-btn tooltip ${selectedImg.locked ? 'lock-active' : ''}`}
                  onClick={toggleImageLock}
                  data-tooltip={selectedImg.locked ? 'Unlock Image' : 'Lock Image Position & Size'}
                  style={selectedImg.locked ? { color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' } : {}}
                >
                  <i className={`fa-solid ${selectedImg.locked ? 'fa-lock' : 'fa-lock-open'}`}></i>
                </button>
              );
            })()}
            <button className="tool-btn tooltip" onClick={clearCanvas} data-tooltip="Clear Drawings">
              <i className="fa-solid fa-trash-can"></i>
            </button>
          </div>

          <div className="divider"></div>

          {/* Stroke brush options */}
          <div className="tool-group stroke-preset-tools">
            <span className="toolbar-section-label">Strokes:</span>
            <button
              className={`style-preset-btn tooltip ${currentBrushSize === 1.5 && !currentGlow ? 'active' : ''}`}
              onClick={() => {
                setCurrentBrushSize(1.5);
                setCurrentGlow(false);
                setCurrentMode('brush');
              }}
              data-tooltip="Thin Precision Pencil (1.5px)"
            >
              <i className="fa-solid fa-pencil"></i> Thin
            </button>
            <button
              className={`style-preset-btn tooltip ${currentBrushSize === 4 && !currentGlow ? 'active' : ''}`}
              onClick={() => {
                setCurrentBrushSize(4);
                setCurrentGlow(false);
                setCurrentMode('brush');
              }}
              data-tooltip="Ink pen line (4px)"
            >
              <i className="fa-solid fa-pen"></i> Ink
            </button>
            <button
              className={`style-preset-btn tooltip ${currentBrushSize === 9 && !currentGlow ? 'active' : ''}`}
              onClick={() => {
                setCurrentBrushSize(9);
                setCurrentGlow(false);
                setCurrentMode('brush');
              }}
              data-tooltip="Highlighter (9px)"
            >
              <i className="fa-solid fa-marker"></i> Marker
            </button>
            <button
              className={`style-preset-btn tooltip ${currentBrushSize === 18 && !currentGlow ? 'active' : ''}`}
              onClick={() => {
                setCurrentBrushSize(18);
                setCurrentGlow(false);
                setCurrentMode('brush');
              }}
              data-tooltip="Artistic Heavy Brush (18px)"
            >
              <i className="fa-solid fa-paint-brush"></i> Brush
            </button>
            <button
              className={`style-preset-btn tooltip glow-style ${currentGlow ? 'active' : ''}`}
              onClick={() => {
                setCurrentBrushSize(7);
                setCurrentGlow(true);
                setCurrentMode('brush');
              }}
              data-tooltip="Glow magical stroke"
            >
              <i className="fa-solid fa-wand-magic-sparkles"></i> Magic
            </button>
          </div>

          <div className="divider"></div>

          {/* Preset aesthetics colors */}
          <div className="tool-group color-tools">
            <div className="preset-colors">
              {['#ffffff', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#a855f7', '#ef4444'].map((col) => (
                <button
                  key={col}
                  className={`color-swatch tooltip ${currentColor === col ? 'active' : ''}`}
                  style={{ backgroundColor: col }}
                  onClick={() => {
                    setCurrentColor(col);
                    setCurrentMode('brush');
                  }}
                  data-tooltip={`Color ${col}`}
                ></button>
              ))}
            </div>
            <div className="custom-color-picker-wrapper tooltip" data-tooltip="Eye Dropper Palette">
              <input
                type="color"
                value={currentColor}
                onChange={(e) => {
                  setCurrentColor(e.target.value);
                  setCurrentMode('brush');
                }}
              />
              <i className="fa-solid fa-eye-dropper"></i>
            </div>
          </div>

          <div className="divider"></div>

          {/* Transform infinite canvas properties */}
          <div className="tool-group canvas-options">
            <div className="toggle-wrapper tooltip" data-tooltip="Apply variable thickness per pressure dynamically">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={pressureEnabled}
                  onChange={(e) => setPressureEnabled(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
              <span className="toggle-label"><i className="fa-solid fa-arrow-up-right-dots"></i> Pressure</span>
            </div>

            <div className="toggle-wrapper tooltip" data-tooltip="Enable auto shape & straight line detection">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={shapeDetectionEnabled}
                  onChange={(e) => setShapeDetectionEnabled(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
              <span className="toggle-label"><i className="fa-solid fa-shapes"></i> Shapes</span>
            </div>

            <div className="zoom-controls">
              <button className="zoom-btn tooltip" onClick={() => setZoom(Math.max(0.1, zoom - 0.1))} data-tooltip="Zoom Out">
                <i className="fa-solid fa-magnifying-glass-minus"></i>
              </button>
              <span className="zoom-val">{Math.round(zoom * 100)}%</span>
              <button className="zoom-btn tooltip" onClick={() => setZoom(Math.min(5.0, zoom + 0.1))} data-tooltip="Zoom In">
                <i className="fa-solid fa-magnifying-glass-plus"></i>
              </button>
              <button
                className="zoom-btn tooltip"
                onClick={() => {
                  setZoom(1.0);
                  setPanX(0);
                  setPanY(0);
                }}
                data-tooltip="Reset View"
              >
                <i className="fa-solid fa-arrows-to-circle"></i>
              </button>
            </div>
          </div>

          <div className="divider"></div>

          {/* Undoing/Redoing */}
          <div className="tool-group actions-tools">
            <button className="tool-btn tooltip" onClick={undo} data-tooltip="Undo (Cmd/Ctrl + Z)">
              <i className="fa-solid fa-arrow-rotate-left"></i>
            </button>
            <button className="tool-btn tooltip" onClick={redo} data-tooltip="Redo (Cmd/Ctrl + Y)">
              <i className="fa-solid fa-arrow-rotate-right"></i>
            </button>
            <button className="tool-btn tooltip highlight" onClick={exportNote} data-tooltip="Export current page as PNG">
              <i className="fa-solid fa-download"></i> PNG
            </button>
            <button className="tool-btn tooltip highlight" onClick={exportNotebookToPdf} data-tooltip="Export whole notebook to PDF">
              <i className="fa-solid fa-file-pdf"></i> PDF
            </button>
          </div>

          <div className="divider"></div>

          {/* Theme modes */}
          <div className="tool-group theme-tools">
            <button className="tool-btn tooltip" onClick={() => setDarkMode(!darkMode)} data-tooltip="Theme Background Mode">
              <i className={`fa-solid ${darkMode ? 'fa-moon' : 'fa-sun'}`}></i>
            </button>
          </div>
        </header>

        {/* Visual Infinite Drawings Canvas */}
        <div className="canvas-wrapper">
          <canvas
            id="noteCanvas"
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerOut={handlePointerUp}
          ></canvas>
          {(!activeNotebookId || !activePageId) && (
            <div className="empty-state-overlay" style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: darkMode ? '#111116' : '#ffffff',
              color: 'var(--text)',
              zIndex: 10,
              textAlign: 'center',
              padding: '24px'
            }}>
              <i className="fa-solid fa-book-open" style={{ fontSize: '48px', color: 'var(--primary)', marginBottom: '16px' }}></i>
              <h3 style={{ margin: '0 0 8px 0' }}>No Notebook Active</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                Create a notebook or import your data from the sidebar to start drawing.
              </p>
            </div>
          )}
          <div className="canvas-overlay">
            <p className="canvas-hint"><i className="fa-solid fa-hand-pointer"></i> Infinite whiteboard with OneNote-style notebooks active...</p>
          </div>
        </div>
      </main>
    </div>
  );
}
