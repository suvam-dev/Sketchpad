import { useState, useEffect, useRef, useCallback } from 'react';
import { BookOpen, Plus, Upload, Minimize2 } from 'lucide-react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import FloatingToolbar from './components/FloatingToolbar';
import BottomBar from './components/BottomBar';
import CanvasWorkspace from './components/CanvasWorkspace';
import SchemaEditorPanel from './components/SchemaEditorPanel';
import ExportModal from './components/ExportModal';
import SettingsModal from './components/SettingsModal';
import Toast from './components/Toast';
import {
  loadWorkspaceData,
  saveWorkspaceData,
  loadSessionPrefs,
  saveSessionPrefs,
  createDefaultNotebook,
  createDefaultPage,
  createId,
  formatTimestamp,
  normalizeNotebooks,
} from './utils/storage';
import {
  exportPageToPng,
  exportPageToSvg,
  exportNotebookToPdf,
  exportNotebooksToJson,
} from './utils/exporters';
import { resolveStrokeColor } from './utils/drawingEngine';
import { generateAllSchemasSql } from './utils/structuredElements';

const MAX_HISTORY = 50;

const DEFAULT_TOOL_WIDTHS = {
  pen: 2.5,
  pencil: 2,
  highlighter: 18,
  eraser: 24,
  shape: 2.5,
};

function makeSnapshot(page) {
  return {
    strokes: page?.strokes || [],
    images: page?.images || [],
    texts: page?.texts || [],
    tables: page?.tables || [],
    schemas: page?.schemas || [],
    relations: page?.relations || [],
  };
}

export default function App() {
  // Loading & persistence state
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'error'

  // Notebooks, pages, and trash
  const [notebooks, setNotebooks] = useState([]);
  const [trash, setTrash] = useState([]);
  const [activeNotebookId, setActiveNotebookId] = useState(null);
  const [activePageId, setActivePageId] = useState(null);

  // UI & layout state
  const [darkMode, setDarkMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 960 : true
  );
  const [focusMode, setFocusMode] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Drawing & structured tool state
  const [currentTool, setCurrentTool] = useState('pen'); // pen, pencil, highlighter, shape, text, table, schema, eraser, select, pan
  const [shapeType, setShapeType] = useState('arrow');
  const [strokeStyle, setStrokeStyle] = useState('solid');
  const [shapeFill, setShapeFill] = useState(false);
  const [textStyle, setTextStyle] = useState({
    fontFamily: 'sans',
    fontSize: 18,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
  });
  const [tablePreset, setTablePreset] = useState({
    rows: 3,
    cols: 3,
    headerRow: true,
  });
  const [schemaTemplate, setSchemaTemplate] = useState('users');

  const [currentColor, setCurrentColor] = useState('#f8fafc');
  const [toolWidths, setToolWidths] = useState(DEFAULT_TOOL_WIDTHS);
  const [currentGlow, setCurrentGlow] = useState(false);
  const [pressureEnabled, setPressureEnabled] = useState(true);
  const [shapeDetectionEnabled, setShapeDetectionEnabled] = useState(true);
  const [stylusOnly, setStylusOnly] = useState(false);
  const [smoothingEnabled, setSmoothingEnabled] = useState(true);
  const [spacePressed, setSpacePressed] = useState(false);

  // Canvas view transform & selection
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [selectedElementType, setSelectedElementType] = useState(null);
  const [selectedStrokeIndex, setSelectedStrokeIndex] = useState(null);

  // Active inline editors & schema connector mode
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [schemaEditorId, setSchemaEditorId] = useState(null);
  const [connectingFromId, setConnectingFromId] = useState(null);

  // Undo / Redo history for active page
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Shared refs
  const imageCacheRef = useRef({});
  const canvasSizeRef = useRef({ width: 1024, height: 768 });
  const saveTimerRef = useRef(null);
  const toastTimerRef = useRef(null);

  const currentWidth = toolWidths[currentTool] ?? 2.5;

  const showToast = useCallback((message, actionLabel = null, onAction = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message, actionLabel, onAction });
    toastTimerRef.current = setTimeout(() => setToast(null), 4200);
  }, []);

  // Load workspace from IndexedDB + session preferences on mount
  useEffect(() => {
    let mounted = true;
    const prefs = loadSessionPrefs();

    if (typeof prefs.darkMode === 'boolean') {
      setDarkMode(prefs.darkMode);
      setCurrentColor(prefs.darkMode ? '#f8fafc' : '#0f172a');
    }
    if (typeof prefs.pressureEnabled === 'boolean') setPressureEnabled(prefs.pressureEnabled);
    if (typeof prefs.shapeDetectionEnabled === 'boolean')
      setShapeDetectionEnabled(prefs.shapeDetectionEnabled);
    if (typeof prefs.stylusOnly === 'boolean') setStylusOnly(prefs.stylusOnly);
    if (typeof prefs.smoothingEnabled === 'boolean') setSmoothingEnabled(prefs.smoothingEnabled);

    loadWorkspaceData().then(({ notebooks: loaded, trash: loadedTrash, migrated }) => {
      if (!mounted) return;
      setNotebooks(loaded);
      setTrash(loadedTrash);

      if (loaded.length > 0) {
        const targetNb =
          loaded.find((nb) => nb.id === prefs.activeNotebookId) || loaded[0];
        setActiveNotebookId(targetNb.id);

        if (targetNb.pages && targetNb.pages.length > 0) {
          const targetPage =
            targetNb.pages.find((p) => p.id === prefs.activePageId) || targetNb.pages[0];
          setActivePageId(targetPage.id);
          setPanX(targetPage.panX || 0);
          setPanY(targetPage.panY || 0);
          setZoom(targetPage.zoom || 1.0);
        }
      }
      setIsLoaded(true);
      if (migrated) {
        showToast('Existing notebooks migrated to offline IndexedDB storage');
      }
    });

    return () => {
      mounted = false;
    };
  }, [showToast]);

  // Apply theme attribute & auto-adapt default ink color for visibility
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const handleToggleTheme = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      setCurrentColor((col) => resolveStrokeColor(col, next, currentTool));
      return next;
    });
  }, [currentTool]);

  // Persist session preferences
  useEffect(() => {
    if (!isLoaded) return;
    saveSessionPrefs({
      darkMode,
      activeNotebookId,
      activePageId,
      pressureEnabled,
      shapeDetectionEnabled,
      stylusOnly,
      smoothingEnabled,
    });
  }, [
    isLoaded,
    darkMode,
    activeNotebookId,
    activePageId,
    pressureEnabled,
    shapeDetectionEnabled,
    stylusOnly,
    smoothingEnabled,
  ]);

  // Debounced auto-save to IndexedDB
  useEffect(() => {
    if (!isLoaded) return;
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      saveWorkspaceData(notebooks, trash)
        .then(() => setSaveStatus('saved'))
        .catch(() => {
          setSaveStatus('error');
          showToast('Local storage error — consider exporting a JSON backup');
        });
    }, 320);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [notebooks, trash, isLoaded, showToast]);

  // Derived active notebook, page, and selected elements
  const activeNotebook = notebooks.find((nb) => nb.id === activeNotebookId) || null;
  const activePage = activeNotebook?.pages.find((p) => p.id === activePageId) || null;
  const activePageIndex = activeNotebook
    ? activeNotebook.pages.findIndex((p) => p.id === activePageId)
    : -1;

  const selectedImage =
    (!selectedElementType || selectedElementType === 'image')
      ? activePage?.images?.find((img) => img.id === selectedElementId) || null
      : null;
  const selectedText =
    selectedElementType === 'text'
      ? activePage?.texts?.find((t) => t.id === selectedElementId) || null
      : null;
  const selectedTable =
    selectedElementType === 'table'
      ? activePage?.tables?.find((t) => t.id === selectedElementId) || null
      : null;
  const selectedSchema =
    selectedElementType === 'schema'
      ? activePage?.schemas?.find((s) => s.id === selectedElementId) || null
      : null;
  const selectedRelation =
    selectedElementType === 'relation'
      ? activePage?.relations?.find((r) => r.id === selectedElementId) || null
      : null;
  const editingSchema =
    schemaEditorId
      ? activePage?.schemas?.find((s) => s.id === schemaEditorId) || null
      : null;

  // Helper to update the active page cleanly
  const mutateActivePage = useCallback(
    (updater) => {
      if (!activeNotebookId || !activePageId) return;
      setNotebooks((prev) =>
        prev.map((nb) => {
          if (nb.id !== activeNotebookId) return nb;
          return {
            ...nb,
            updatedAt: Date.now(),
            pages: nb.pages.map((p) => {
              if (p.id !== activePageId) return p;
              return updater(p);
            }),
          };
        })
      );
    },
    [activeNotebookId, activePageId]
  );

  // Push current page state to undo stack before mutating
  const pushUndoSnapshot = useCallback((page) => {
    if (!page) return;
    const snapshot = makeSnapshot(page);
    setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snapshot]);
    setRedoStack([]);
  }, []);

  // Undo & Redo
  const handleUndo = useCallback(() => {
    if (!activePage || undoStack.length === 0) return;
    const prevSnapshot = undoStack[undoStack.length - 1];
    const currentSnapshot = makeSnapshot(activePage);
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, currentSnapshot]);
    setSelectedElementId(null);
    setSelectedElementType(null);
    setEditingTextId(null);
    setEditingCell(null);

    mutateActivePage((p) => ({
      ...p,
      ...prevSnapshot,
      updatedAt: Date.now(),
    }));
  }, [activePage, undoStack, mutateActivePage]);

  const handleRedo = useCallback(() => {
    if (!activePage || redoStack.length === 0) return;
    const nextSnapshot = redoStack[redoStack.length - 1];
    const currentSnapshot = makeSnapshot(activePage);
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, currentSnapshot]);
    setSelectedElementId(null);
    setSelectedElementType(null);
    setEditingTextId(null);
    setEditingCell(null);

    mutateActivePage((p) => ({
      ...p,
      ...nextSnapshot,
      updatedAt: Date.now(),
    }));
  }, [activePage, redoStack, mutateActivePage]);

  // Selection helper
  const handleSelectStructuredElement = useCallback((type, id) => {
    setSelectedElementType(type);
    setSelectedElementId(id);
    setSelectedStrokeIndex(null);
  }, []);

  const handleSelectElementCompat = useCallback((id) => {
    setSelectedElementId(id);
    setSelectedElementType(id ? 'image' : null);
  }, []);

  // Drawing callbacks
  const handleCommitStroke = useCallback(
    (stroke) => {
      if (!activePage) return;
      pushUndoSnapshot(activePage);
      mutateActivePage((p) => ({
        ...p,
        strokes: [...(p.strokes || []), stroke],
        panX,
        panY,
        zoom,
        date: formatTimestamp(),
        updatedAt: Date.now(),
      }));
    },
    [activePage, pushUndoSnapshot, mutateActivePage, panX, panY, zoom]
  );

  const preDragImagesRef = useRef(null);
  const preDragStrokesRef = useRef(null);
  const preDragTextsRef = useRef(null);
  const preDragTablesRef = useRef(null);
  const preDragSchemasRef = useRef(null);

  const handleUpdateImages = useCallback(
    (nextImages) => {
      if (!preDragImagesRef.current && activePage) {
        preDragImagesRef.current = makeSnapshot(activePage);
      }
      mutateActivePage((p) => ({ ...p, images: nextImages }));
    },
    [activePage, mutateActivePage]
  );

  const handleCommitImages = useCallback(() => {
    if (preDragImagesRef.current) {
      const snap = preDragImagesRef.current;
      preDragImagesRef.current = null;
      setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap]);
      setRedoStack([]);
    }
  }, []);

  const handleUpdateStrokes = useCallback(
    (nextStrokes) => {
      if (!preDragStrokesRef.current && activePage) {
        preDragStrokesRef.current = makeSnapshot(activePage);
      }
      mutateActivePage((p) => ({ ...p, strokes: nextStrokes }));
    },
    [activePage, mutateActivePage]
  );

  const handleCommitStrokes = useCallback(() => {
    if (preDragStrokesRef.current) {
      const snap = preDragStrokesRef.current;
      preDragStrokesRef.current = null;
      setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap]);
      setRedoStack([]);
    }
  }, []);

  // Text callbacks
  const handleCommitText = useCallback(
    (newTxt) => {
      if (!activePage) return;
      pushUndoSnapshot(activePage);
      mutateActivePage((p) => ({
        ...p,
        texts: [...(p.texts || []), newTxt],
        date: formatTimestamp(),
        updatedAt: Date.now(),
      }));
    },
    [activePage, pushUndoSnapshot, mutateActivePage]
  );

  const handleUpdateTexts = useCallback(
    (nextTexts) => {
      if (!preDragTextsRef.current && activePage) {
        preDragTextsRef.current = makeSnapshot(activePage);
      }
      mutateActivePage((p) => ({ ...p, texts: nextTexts }));
    },
    [activePage, mutateActivePage]
  );

  const handleCommitTexts = useCallback(() => {
    if (preDragTextsRef.current) {
      const snap = preDragTextsRef.current;
      preDragTextsRef.current = null;
      setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap]);
      setRedoStack([]);
    }
  }, []);

  const handleDeleteEmptyText = useCallback(
    (txtId) => {
      preDragTextsRef.current = null;
      mutateActivePage((p) => ({
        ...p,
        texts: (p.texts || []).filter((t) => t.id !== txtId),
      }));
      if (selectedElementId === txtId) {
        setSelectedElementId(null);
        setSelectedElementType(null);
      }
    },
    [mutateActivePage, selectedElementId]
  );

  const handleUpdateSelectedText = useCallback(
    (updated) => {
      if (!activePage) return;
      pushUndoSnapshot(activePage);
      mutateActivePage((p) => ({
        ...p,
        texts: (p.texts || []).map((t) => (t.id === updated.id ? updated : t)),
        updatedAt: Date.now(),
      }));
    },
    [activePage, pushUndoSnapshot, mutateActivePage]
  );

  const handleToggleTextLock = useCallback(() => {
    if (!selectedText || !activePage) return;
    pushUndoSnapshot(activePage);
    mutateActivePage((p) => ({
      ...p,
      texts: (p.texts || []).map((t) =>
        t.id === selectedText.id ? { ...t, locked: !t.locked } : t
      ),
    }));
  }, [selectedText, activePage, pushUndoSnapshot, mutateActivePage]);

  const handleDeleteSelectedText = useCallback(() => {
    if (!selectedText || selectedText.locked || !activePage) return;
    pushUndoSnapshot(activePage);
    mutateActivePage((p) => ({
      ...p,
      texts: (p.texts || []).filter((t) => t.id !== selectedText.id),
    }));
    setSelectedElementId(null);
    setSelectedElementType(null);
  }, [selectedText, activePage, pushUndoSnapshot, mutateActivePage]);

  // Table callbacks
  const handleCommitTable = useCallback(
    (newTable) => {
      if (!activePage) return;
      pushUndoSnapshot(activePage);
      mutateActivePage((p) => ({
        ...p,
        tables: [...(p.tables || []), newTable],
        date: formatTimestamp(),
        updatedAt: Date.now(),
      }));
      setCurrentTool('select');
    },
    [activePage, pushUndoSnapshot, mutateActivePage]
  );

  const handleUpdateTables = useCallback(
    (nextTables) => {
      if (!preDragTablesRef.current && activePage) {
        preDragTablesRef.current = makeSnapshot(activePage);
      }
      mutateActivePage((p) => ({ ...p, tables: nextTables }));
    },
    [activePage, mutateActivePage]
  );

  const handleCommitTables = useCallback(() => {
    if (preDragTablesRef.current) {
      const snap = preDragTablesRef.current;
      preDragTablesRef.current = null;
      setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap]);
      setRedoStack([]);
    }
  }, []);

  const handleTableAction = useCallback(
    (action) => {
      if (!selectedTable || !activePage) return;
      if (action === 'toggleLock') {
        pushUndoSnapshot(activePage);
        mutateActivePage((p) => ({
          ...p,
          tables: (p.tables || []).map((t) =>
            t.id === selectedTable.id ? { ...t, locked: !t.locked } : t
          ),
        }));
        return;
      }
      if (selectedTable.locked) return;
      if (action === 'delete') {
        pushUndoSnapshot(activePage);
        mutateActivePage((p) => ({
          ...p,
          tables: (p.tables || []).filter((t) => t.id !== selectedTable.id),
        }));
        setSelectedElementId(null);
        setSelectedElementType(null);
        return;
      }

      pushUndoSnapshot(activePage);
      mutateActivePage((p) => ({
        ...p,
        tables: (p.tables || []).map((t) => {
          if (t.id !== selectedTable.id) return t;
          const cols = t.colWidths || [130, 130];
          const rows = t.rows || [['']];
          if (action === 'addRow') {
            return { ...t, rows: [...rows, Array.from({ length: cols.length }, () => '')] };
          }
          if (action === 'removeRow' && rows.length > 1) {
            return { ...t, rows: rows.slice(0, -1) };
          }
          if (action === 'addCol') {
            return {
              ...t,
              colWidths: [...cols, 130],
              rows: rows.map((r, rIdx) => [...r, t.headerRow && rIdx === 0 ? `Column ${cols.length + 1}` : '']),
            };
          }
          if (action === 'removeCol' && cols.length > 1) {
            return {
              ...t,
              colWidths: cols.slice(0, -1),
              rows: rows.map((r) => r.slice(0, -1)),
            };
          }
          if (action === 'toggleHeader') {
            return { ...t, headerRow: !t.headerRow };
          }
          return t;
        }),
      }));
    },
    [selectedTable, activePage, pushUndoSnapshot, mutateActivePage]
  );

  // Schema & Relation callbacks
  const handleCommitSchema = useCallback(
    (newSchema) => {
      if (!activePage) return;
      pushUndoSnapshot(activePage);
      mutateActivePage((p) => ({
        ...p,
        schemas: [...(p.schemas || []), newSchema],
        date: formatTimestamp(),
        updatedAt: Date.now(),
      }));
      setCurrentTool('select');
      setSchemaEditorId(newSchema.id);
    },
    [activePage, pushUndoSnapshot, mutateActivePage]
  );

  const handleUpdateSchemas = useCallback(
    (nextSchemas) => {
      if (!preDragSchemasRef.current && activePage) {
        preDragSchemasRef.current = makeSnapshot(activePage);
      }
      mutateActivePage((p) => ({ ...p, schemas: nextSchemas }));
    },
    [activePage, mutateActivePage]
  );

  const handleCommitSchemas = useCallback(() => {
    if (preDragSchemasRef.current) {
      const snap = preDragSchemasRef.current;
      preDragSchemasRef.current = null;
      setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap]);
      setRedoStack([]);
    }
  }, []);

  const handleChangeSchemaFromEditor = useCallback(
    (updatedSchema) => {
      mutateActivePage((p) => ({
        ...p,
        schemas: (p.schemas || []).map((s) => (s.id === updatedSchema.id ? updatedSchema : s)),
        updatedAt: Date.now(),
      }));
    },
    [mutateActivePage]
  );

  const handleToggleSchemaLock = useCallback(() => {
    if (!selectedSchema || !activePage) return;
    pushUndoSnapshot(activePage);
    mutateActivePage((p) => ({
      ...p,
      schemas: (p.schemas || []).map((s) =>
        s.id === selectedSchema.id ? { ...s, locked: !s.locked } : s
      ),
    }));
  }, [selectedSchema, activePage, pushUndoSnapshot, mutateActivePage]);

  const handleDeleteSelectedSchema = useCallback(() => {
    if (!selectedSchema || selectedSchema.locked || !activePage) return;
    pushUndoSnapshot(activePage);
    mutateActivePage((p) => ({
      ...p,
      schemas: (p.schemas || []).filter((s) => s.id !== selectedSchema.id),
      relations: (p.relations || []).filter(
        (r) => r.fromId !== selectedSchema.id && r.toId !== selectedSchema.id
      ),
    }));
    if (schemaEditorId === selectedSchema.id) setSchemaEditorId(null);
    setSelectedElementId(null);
    setSelectedElementType(null);
  }, [selectedSchema, activePage, pushUndoSnapshot, mutateActivePage, schemaEditorId]);

  const handleStartConnectSchema = useCallback((fromId) => {
    setConnectingFromId(fromId);
    setCurrentTool('select');
  }, []);

  const handleCompleteConnect = useCallback(
    (toSchemaId) => {
      const fromId = connectingFromId;
      setConnectingFromId(null);
      if (!toSchemaId || !fromId || toSchemaId === fromId || !activePage) return;

      const newRelation = {
        id: createId(),
        fromId,
        toId: toSchemaId,
        fromSide: 'auto',
        toSide: 'auto',
        cardinality: '1:N',
        label: '',
        color: currentColor,
      };
      pushUndoSnapshot(activePage);
      mutateActivePage((p) => ({
        ...p,
        relations: [...(p.relations || []), newRelation],
        updatedAt: Date.now(),
      }));
      handleSelectStructuredElement('relation', newRelation.id);
      showToast('Connected schema tables (1:N)');
    },
    [connectingFromId, activePage, currentColor, pushUndoSnapshot, mutateActivePage, handleSelectStructuredElement, showToast]
  );

  const handleUpdateRelation = useCallback(
    (updatedRel) => {
      if (!activePage) return;
      pushUndoSnapshot(activePage);
      mutateActivePage((p) => ({
        ...p,
        relations: (p.relations || []).map((r) => (r.id === updatedRel.id ? updatedRel : r)),
        updatedAt: Date.now(),
      }));
    },
    [activePage, pushUndoSnapshot, mutateActivePage]
  );

  const handleDeleteSelectedRelation = useCallback(() => {
    if (!selectedRelation || !activePage) return;
    pushUndoSnapshot(activePage);
    mutateActivePage((p) => ({
      ...p,
      relations: (p.relations || []).filter((r) => r.id !== selectedRelation.id),
    }));
    setSelectedElementId(null);
    setSelectedElementType(null);
  }, [selectedRelation, activePage, pushUndoSnapshot, mutateActivePage]);

  const handleCopyAllSql = useCallback(() => {
    const schemas = activePage?.schemas || [];
    if (schemas.length === 0) {
      showToast('Add a Schema table to the page first');
      return;
    }
    const sql = generateAllSchemasSql(schemas, activePage?.relations || []);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(sql).then(() => {
        showToast(`Copied SQL for ${schemas.length} table${schemas.length > 1 ? 's' : ''}`);
      });
    }
  }, [activePage, showToast]);

  const handleDeleteSelectedStroke = useCallback(() => {
    if (selectedStrokeIndex === null || !activePage) return;
    pushUndoSnapshot(activePage);
    mutateActivePage((p) => ({
      ...p,
      strokes: (p.strokes || []).filter((_, idx) => idx !== selectedStrokeIndex),
    }));
    setSelectedStrokeIndex(null);
  }, [selectedStrokeIndex, activePage, pushUndoSnapshot, mutateActivePage]);

  const handlePanZoomChange = useCallback((nextPanX, nextPanY, nextZoom) => {
    setPanX(nextPanX);
    setPanY(nextPanY);
    setZoom(nextZoom);
  }, []);

  const handleZoomStep = useCallback((delta) => {
    setZoom((prev) => Math.min(5, Math.max(0.2, Math.round((prev + delta) * 100) / 100)));
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  }, []);

  // Image actions
  const handleUploadImage = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file || !activePage) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result;
        if (!src) return;
        const img = new Image();
        img.onload = () => {
          const maxW = 460;
          const width = img.width > maxW ? maxW : img.width;
          const height = (img.height / img.width) * width;
          const newImg = {
            id: createId(),
            src,
            x: -panX + 64,
            y: -panY + 64,
            width,
            height,
            locked: false,
          };
          pushUndoSnapshot(activePage);
          mutateActivePage((p) => ({
            ...p,
            images: [...(p.images || []), newImg],
            updatedAt: Date.now(),
          }));
          handleSelectStructuredElement('image', newImg.id);
          setCurrentTool('select');
          showToast('Image added to page');
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [activePage, panX, panY, pushUndoSnapshot, mutateActivePage, handleSelectStructuredElement, showToast]
  );

  const handleToggleImageLock = useCallback(() => {
    if (!selectedElementId || !activePage) return;
    pushUndoSnapshot(activePage);
    mutateActivePage((p) => ({
      ...p,
      images: (p.images || []).map((img) =>
        img.id === selectedElementId ? { ...img, locked: !img.locked } : img
      ),
    }));
  }, [selectedElementId, activePage, pushUndoSnapshot, mutateActivePage]);

  const handleDeleteSelectedImage = useCallback(() => {
    if (!selectedElementId || !activePage) return;
    const target = (activePage.images || []).find((i) => i.id === selectedElementId);
    if (!target || target.locked) return;
    pushUndoSnapshot(activePage);
    mutateActivePage((p) => ({
      ...p,
      images: (p.images || []).filter((i) => i.id !== selectedElementId),
    }));
    setSelectedElementId(null);
    setSelectedElementType(null);
  }, [selectedElementId, activePage, pushUndoSnapshot, mutateActivePage]);

  const handleClearPage = useCallback(() => {
    if (!activePage) return;
    const isEmpty =
      (activePage.strokes?.length || 0) === 0 &&
      (activePage.images?.length || 0) === 0 &&
      (activePage.texts?.length || 0) === 0 &&
      (activePage.tables?.length || 0) === 0 &&
      (activePage.schemas?.length || 0) === 0 &&
      (activePage.relations?.length || 0) === 0;
    if (isEmpty) return;

    pushUndoSnapshot(activePage);
    mutateActivePage((p) => ({
      ...p,
      strokes: [],
      images: [],
      texts: [],
      tables: [],
      schemas: [],
      relations: [],
      updatedAt: Date.now(),
    }));
    setSelectedElementId(null);
    setSelectedElementType(null);
    setSchemaEditorId(null);
    showToast('Page cleared', 'Undo', handleUndo);
  }, [activePage, pushUndoSnapshot, mutateActivePage, showToast, handleUndo]);

  // Notebook & Page CRUD + Trash recovery
  const selectPageAndResetHistory = useCallback((page) => {
    setActivePageId(page.id);
    setPanX(page.panX || 0);
    setPanY(page.panY || 0);
    setZoom(page.zoom || 1.0);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedElementId(null);
    setSelectedElementType(null);
    setEditingTextId(null);
    setEditingCell(null);
    setSchemaEditorId(null);
    setConnectingFromId(null);
  }, []);

  const handleCreateNotebook = useCallback(
    (title) => {
      const nb = createDefaultNotebook(title || `Notebook ${notebooks.length + 1}`, 'dotted');
      setNotebooks((prev) => [nb, ...prev]);
      setActiveNotebookId(nb.id);
      selectPageAndResetHistory(nb.pages[0]);
      showToast(`Created "${nb.title}"`);
    },
    [notebooks.length, selectPageAndResetHistory, showToast]
  );

  const handleSelectNotebook = useCallback(
    (nbId) => {
      const target = notebooks.find((nb) => nb.id === nbId);
      if (!target) return;
      setActiveNotebookId(nbId);
      if (target.pages.length > 0) {
        selectPageAndResetHistory(target.pages[0]);
      } else {
        const fresh = createDefaultPage(1, 'dotted');
        setNotebooks((prev) =>
          prev.map((nb) => (nb.id === nbId ? { ...nb, pages: [fresh] } : nb))
        );
        selectPageAndResetHistory(fresh);
      }
    },
    [notebooks, selectPageAndResetHistory]
  );

  const handleRenameNotebook = useCallback((nbId, newTitle) => {
    setNotebooks((prev) =>
      prev.map((nb) =>
        nb.id === nbId ? { ...nb, title: newTitle || 'Untitled Notebook', updatedAt: Date.now() } : nb
      )
    );
  }, []);

  const handleRestoreTrashItem = useCallback(
    (trashId) => {
      const item = trash.find((t) => t.trashId === trashId);
      if (!item) return;
      setTrash((prev) => prev.filter((t) => t.trashId !== trashId));

      if (item.type === 'notebook') {
        setNotebooks((prev) => [item.data, ...prev]);
        setActiveNotebookId(item.data.id);
        if (item.data.pages?.[0]) selectPageAndResetHistory(item.data.pages[0]);
        showToast(`Restored "${item.data.title}"`);
      } else if (item.type === 'page') {
        setNotebooks((prev) => {
          const exists = prev.some((nb) => nb.id === item.notebookId);
          if (exists) {
            return prev.map((nb) =>
              nb.id === item.notebookId
                ? { ...nb, pages: [...nb.pages, item.data] }
                : nb
            );
          }
          const recoveredNb = {
            id: createId(),
            title: 'Recovered Notes',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            pages: [item.data],
          };
          return [recoveredNb, ...prev];
        });
        showToast(`Restored "${item.data.title}"`);
      }
    },
    [trash, selectPageAndResetHistory, showToast]
  );

  const handleDeleteNotebook = useCallback(
    (nbId) => {
      const target = notebooks.find((nb) => nb.id === nbId);
      if (!target) return;
      const trashEntry = {
        trashId: createId(),
        type: 'notebook',
        deletedAt: Date.now(),
        data: target,
      };
      const remaining = notebooks.filter((nb) => nb.id !== nbId);
      setNotebooks(remaining);
      setTrash((prev) => [trashEntry, ...prev].slice(0, 20));

      if (activeNotebookId === nbId) {
        if (remaining.length > 0) {
          setActiveNotebookId(remaining[0].id);
          if (remaining[0].pages[0]) selectPageAndResetHistory(remaining[0].pages[0]);
          else setActivePageId(null);
        } else {
          setActiveNotebookId(null);
          setActivePageId(null);
          setUndoStack([]);
          setRedoStack([]);
        }
      }
      showToast(`Moved "${target.title}" to Trash`, 'Undo', () =>
        handleRestoreTrashItem(trashEntry.trashId)
      );
    },
    [notebooks, activeNotebookId, selectPageAndResetHistory, showToast, handleRestoreTrashItem]
  );

  const handleCreatePage = useCallback(
    (nbId = activeNotebookId) => {
      const nb = notebooks.find((n) => n.id === nbId);
      if (!nb) return;
      const inheritedPaper = activePage?.paperStyle || 'dotted';
      const newPage = createDefaultPage(nb.pages.length + 1, inheritedPaper);
      setNotebooks((prev) =>
        prev.map((n) =>
          n.id === nbId ? { ...n, pages: [...n.pages, newPage], updatedAt: Date.now() } : n
        )
      );
      selectPageAndResetHistory(newPage);
    },
    [activeNotebookId, notebooks, activePage, selectPageAndResetHistory]
  );

  const handleSelectPage = useCallback(
    (pageId) => {
      if (!activeNotebook) return;
      const target = activeNotebook.pages.find((p) => p.id === pageId);
      if (!target) return;
      selectPageAndResetHistory(target);
      if (window.innerWidth <= 900) {
        setSidebarOpen(false);
      }
    },
    [activeNotebook, selectPageAndResetHistory]
  );

  const handleRenamePage = useCallback(
    (pageId, newTitle) => {
      setNotebooks((prev) =>
        prev.map((nb) => {
          if (nb.id !== activeNotebookId) return nb;
          return {
            ...nb,
            pages: nb.pages.map((p) =>
              p.id === pageId ? { ...p, title: newTitle || 'Untitled Page' } : p
            ),
          };
        })
      );
    },
    [activeNotebookId]
  );

  const handleDuplicatePage = useCallback(
    (pageId) => {
      if (!activeNotebook) return;
      const idx = activeNotebook.pages.findIndex((p) => p.id === pageId);
      if (idx === -1) return;
      const src = activeNotebook.pages[idx];
      const copy = {
        ...src,
        id: createId(),
        title: `${src.title} (Copy)`,
        date: formatTimestamp(),
        updatedAt: Date.now(),
        strokes: JSON.parse(JSON.stringify(src.strokes || [])),
        images: JSON.parse(JSON.stringify(src.images || [])),
        texts: JSON.parse(JSON.stringify(src.texts || [])),
        tables: JSON.parse(JSON.stringify(src.tables || [])),
        schemas: JSON.parse(JSON.stringify(src.schemas || [])),
        relations: JSON.parse(JSON.stringify(src.relations || [])),
      };
      setNotebooks((prev) =>
        prev.map((nb) => {
          if (nb.id !== activeNotebookId) return nb;
          const nextPages = [...nb.pages];
          nextPages.splice(idx + 1, 0, copy);
          return { ...nb, pages: nextPages, updatedAt: Date.now() };
        })
      );
      selectPageAndResetHistory(copy);
      showToast(`Duplicated "${src.title}"`);
    },
    [activeNotebook, activeNotebookId, selectPageAndResetHistory, showToast]
  );

  const handleDeletePage = useCallback(
    (pageId) => {
      if (!activeNotebook) return;
      const target = activeNotebook.pages.find((p) => p.id === pageId);
      if (!target) return;

      const trashEntry = {
        trashId: createId(),
        type: 'page',
        notebookId: activeNotebook.id,
        deletedAt: Date.now(),
        data: target,
      };
      const remaining = activeNotebook.pages.filter((p) => p.id !== pageId);

      setNotebooks((prev) =>
        prev.map((nb) =>
          nb.id === activeNotebookId ? { ...nb, pages: remaining, updatedAt: Date.now() } : nb
        )
      );
      setTrash((prev) => [trashEntry, ...prev].slice(0, 20));

      if (activePageId === pageId) {
        if (remaining.length > 0) {
          selectPageAndResetHistory(remaining[0]);
        } else {
          setActivePageId(null);
          setUndoStack([]);
          setRedoStack([]);
        }
      }
      showToast(`Moved "${target.title}" to Trash`, 'Undo', () =>
        handleRestoreTrashItem(trashEntry.trashId)
      );
    },
    [activeNotebook, activeNotebookId, activePageId, selectPageAndResetHistory, showToast, handleRestoreTrashItem]
  );

  const handleEmptyTrash = useCallback(() => {
    setTrash([]);
    showToast('Trash emptied');
  }, [showToast]);

  const handleChangePaperStyle = useCallback(
    (style) => {
      mutateActivePage((p) => ({ ...p, paperStyle: style, updatedAt: Date.now() }));
    },
    [mutateActivePage]
  );

  // Export & Import handlers
  const handleExportPng = useCallback(
    (includePaper) => {
      if (!activePage) return;
      exportPageToPng({
        page: activePage,
        width: canvasSizeRef.current.width,
        height: canvasSizeRef.current.height,
        panX,
        panY,
        zoom,
        darkMode,
        includePaper,
        imageCache: imageCacheRef.current,
      });
      showToast('Exported page as PNG');
    },
    [activePage, panX, panY, zoom, darkMode, showToast]
  );

  const handleExportSvg = useCallback(
    (includePaper) => {
      if (!activePage) return;
      exportPageToSvg({
        page: activePage,
        width: canvasSizeRef.current.width,
        height: canvasSizeRef.current.height,
        panX,
        panY,
        zoom,
        darkMode,
        includePaper,
      });
      showToast('Exported page as SVG');
    },
    [activePage, panX, panY, zoom, darkMode, showToast]
  );

  const handleExportPdf = useCallback(
    (includePaper) => {
      if (!activeNotebook) return;
      try {
        exportNotebookToPdf({
          notebook: activeNotebook,
          width: canvasSizeRef.current.width,
          height: canvasSizeRef.current.height,
          darkMode,
          includePaper,
          imageCache: imageCacheRef.current,
        });
        showToast('Exported notebook as PDF');
      } catch (err) {
        showToast(err.message || 'PDF export failed');
      }
    },
    [activeNotebook, darkMode, showToast]
  );

  const handleExportJson = useCallback(() => {
    exportNotebooksToJson(notebooks);
    showToast('Exported offline JSON backup');
  }, [notebooks, showToast]);

  const handleImportJson = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result);
          const imported = normalizeNotebooks(parsed);
          if (imported.length === 0) {
            showToast('Invalid notebook JSON file');
            return;
          }
          setNotebooks(imported);
          setActiveNotebookId(imported[0].id);
          if (imported[0].pages?.[0]) {
            selectPageAndResetHistory(imported[0].pages[0]);
          }
          showToast(`Imported ${imported.length} notebook${imported.length > 1 ? 's' : ''}`);
        } catch {
          showToast('Failed to read JSON backup file');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [selectPageAndResetHistory, showToast]
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const isTyping = (target) =>
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);

    const onKeyDown = (e) => {
      if (isTyping(e.target)) return;

      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (meta && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (meta && key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (meta && e.key === '\\') {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setSpacePressed(true);
        return;
      }
      if (e.key === 'Escape') {
        setExportModalOpen(false);
        setSettingsModalOpen(false);
        setSchemaEditorId(null);
        setConnectingFromId(null);
        setSelectedElementId(null);
        setSelectedElementType(null);
        setSelectedStrokeIndex(null);
        if (focusMode) setFocusMode(false);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && currentTool === 'select') {
        if (selectedImage) {
          e.preventDefault();
          handleDeleteSelectedImage();
          return;
        }
        if (selectedText) {
          e.preventDefault();
          handleDeleteSelectedText();
          return;
        }
        if (selectedTable) {
          e.preventDefault();
          handleTableAction('delete');
          return;
        }
        if (selectedSchema) {
          e.preventDefault();
          handleDeleteSelectedSchema();
          return;
        }
        if (selectedRelation) {
          e.preventDefault();
          handleDeleteSelectedRelation();
          return;
        }
        if (selectedStrokeIndex !== null) {
          e.preventDefault();
          handleDeleteSelectedStroke();
          return;
        }
      }

      if (meta) return;

      if (key === 'p') setCurrentTool('pen');
      else if (key === 'c') setCurrentTool('pencil');
      else if (key === 'h') setCurrentTool('highlighter');
      else if (key === 's') setCurrentTool('shape');
      else if (key === 't') setCurrentTool('text');
      else if (key === 'g') setCurrentTool('table');
      else if (key === 'd') setCurrentTool('schema');
      else if (key === 'e') setCurrentTool('eraser');
      else if (key === 'v') setCurrentTool('select');
      else if (key === 'f') setFocusMode((prev) => !prev);
      else if (e.key === '=' || e.key === '+') handleZoomStep(0.15);
      else if (e.key === '-') handleZoomStep(-0.15);
      else if (e.key === '0') handleResetView();
    };

    const onKeyUp = (e) => {
      if (e.code === 'Space') setSpacePressed(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    handleUndo,
    handleRedo,
    handleDeleteSelectedImage,
    handleDeleteSelectedText,
    handleTableAction,
    handleDeleteSelectedSchema,
    handleDeleteSelectedRelation,
    handleDeleteSelectedStroke,
    handleZoomStep,
    handleResetView,
    selectedImage,
    selectedText,
    selectedTable,
    selectedSchema,
    selectedRelation,
    selectedStrokeIndex,
    currentTool,
    focusMode,
  ]);

  const handleSelectTool = useCallback((tool) => {
    setCurrentTool(tool);
    setConnectingFromId(null);
    if (tool !== 'select') {
      setSelectedElementId(null);
      setSelectedElementType(null);
      setSelectedStrokeIndex(null);
    }
  }, []);

  const handleChangeWidth = useCallback(
    (width) => {
      setToolWidths((prev) => ({ ...prev, [currentTool]: width }));
    },
    [currentTool]
  );

  return (
    <div className="sp-app">
      {!focusMode && (
        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          notebookTitle={activeNotebook?.title || ''}
          pageTitle={activePage?.title || ''}
          hasActiveNotebook={Boolean(activeNotebook)}
          hasActivePage={Boolean(activePage)}
          onNotebookTitleChange={(val) =>
            activeNotebook && handleRenameNotebook(activeNotebook.id, val)
          }
          onPageTitleChange={(val) =>
            activePage && handleRenamePage(activePage.id, val)
          }
          saveStatus={saveStatus}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onOpenExport={() => setExportModalOpen(true)}
          onOpenSettings={() => setSettingsModalOpen(true)}
          darkMode={darkMode}
          onToggleTheme={handleToggleTheme}
        />
      )}

      <div className="sp-body">
        <Sidebar
          open={sidebarOpen && !focusMode}
          onClose={() => setSidebarOpen(false)}
          notebooks={notebooks}
          activeNotebookId={activeNotebookId}
          activePageId={activePageId}
          trash={trash}
          darkMode={darkMode}
          imageCache={imageCacheRef.current}
          onCreateNotebook={handleCreateNotebook}
          onSelectNotebook={handleSelectNotebook}
          onRenameNotebook={handleRenameNotebook}
          onDeleteNotebook={handleDeleteNotebook}
          onCreatePage={handleCreatePage}
          onSelectPage={handleSelectPage}
          onRenamePage={handleRenamePage}
          onDuplicatePage={handleDuplicatePage}
          onDeletePage={handleDeletePage}
          onRestoreTrashItem={handleRestoreTrashItem}
          onEmptyTrash={handleEmptyTrash}
        />

        <main className="sp-stage" aria-label="Drawing canvas workspace">
          {activePage ? (
            <>
              <CanvasWorkspace
                page={activePage}
                panX={panX}
                panY={panY}
                zoom={zoom}
                onPanZoomChange={handlePanZoomChange}
                currentTool={currentTool}
                currentColor={currentColor}
                currentWidth={currentWidth}
                currentGlow={currentGlow}
                shapeType={shapeType}
                strokeStyle={strokeStyle}
                shapeFill={shapeFill}
                textStyle={textStyle}
                tablePreset={tablePreset}
                schemaTemplate={schemaTemplate}
                pressureEnabled={pressureEnabled}
                shapeDetectionEnabled={shapeDetectionEnabled}
                stylusOnly={stylusOnly}
                smoothingEnabled={smoothingEnabled}
                darkMode={darkMode}
                spacePressed={spacePressed}
                selectedElementId={selectedElementId}
                selectedElementType={selectedElementType}
                selectedStrokeIndex={selectedStrokeIndex}
                editingTextId={editingTextId}
                editingCell={editingCell}
                connectingFromId={connectingFromId}
                onSelectElement={handleSelectElementCompat}
                onSelectStructuredElement={handleSelectStructuredElement}
                onSelectStroke={setSelectedStrokeIndex}
                onSetEditingTextId={setEditingTextId}
                onSetEditingCell={setEditingCell}
                onOpenSchemaEditor={(id) => setSchemaEditorId(id)}
                onStartConnectSchema={handleStartConnectSchema}
                onCompleteConnect={handleCompleteConnect}
                onCommitStroke={handleCommitStroke}
                onUpdateImages={handleUpdateImages}
                onCommitImages={handleCommitImages}
                onUpdateStrokes={handleUpdateStrokes}
                onCommitStrokes={handleCommitStrokes}
                onCommitText={handleCommitText}
                onUpdateTexts={handleUpdateTexts}
                onCommitTexts={handleCommitTexts}
                onDeleteEmptyText={handleDeleteEmptyText}
                onCommitTable={handleCommitTable}
                onUpdateTables={handleUpdateTables}
                onCommitTables={handleCommitTables}
                onCommitSchema={handleCommitSchema}
                onUpdateSchemas={handleUpdateSchemas}
                onCommitSchemas={handleCommitSchemas}
                imageCache={imageCacheRef.current}
                canvasSizeRef={canvasSizeRef}
              />

              <FloatingToolbar
                currentTool={currentTool}
                onSelectTool={handleSelectTool}
                currentColor={currentColor}
                onChangeColor={setCurrentColor}
                currentWidth={currentWidth}
                onChangeWidth={handleChangeWidth}
                currentGlow={currentGlow}
                onToggleGlow={() => setCurrentGlow((prev) => !prev)}
                shapeType={shapeType}
                onChangeShapeType={setShapeType}
                strokeStyle={strokeStyle}
                onChangeStrokeStyle={setStrokeStyle}
                shapeFill={shapeFill}
                onToggleShapeFill={() => setShapeFill((prev) => !prev)}
                textStyle={textStyle}
                onChangeTextStyle={setTextStyle}
                tablePreset={tablePreset}
                onChangeTablePreset={setTablePreset}
                schemaTemplate={schemaTemplate}
                onChangeSchemaTemplate={setSchemaTemplate}
                onCopyAllSql={handleCopyAllSql}
                darkMode={darkMode}
                onUploadImage={handleUploadImage}
                onClearPage={handleClearPage}
                selectedImage={selectedImage}
                selectedText={selectedText}
                selectedTable={selectedTable}
                selectedSchema={selectedSchema}
                selectedRelation={selectedRelation}
                selectedStrokeIndex={selectedStrokeIndex}
                onToggleImageLock={handleToggleImageLock}
                onDeleteSelectedImage={handleDeleteSelectedImage}
                onDeleteSelectedStroke={handleDeleteSelectedStroke}
                onUpdateSelectedText={handleUpdateSelectedText}
                onToggleTextLock={handleToggleTextLock}
                onDeleteSelectedText={handleDeleteSelectedText}
                onTableAction={handleTableAction}
                onOpenSchemaEditor={() => selectedSchema && setSchemaEditorId(selectedSchema.id)}
                onStartConnectSchema={handleStartConnectSchema}
                onToggleSchemaLock={handleToggleSchemaLock}
                onDeleteSelectedSchema={handleDeleteSelectedSchema}
                onUpdateRelation={handleUpdateRelation}
                onDeleteSelectedRelation={handleDeleteSelectedRelation}
                connectingFromId={connectingFromId}
                onCancelConnect={() => setConnectingFromId(null)}
              />

              {editingSchema && (
                <SchemaEditorPanel
                  schema={editingSchema}
                  allSchemas={activePage.schemas || []}
                  relations={activePage.relations || []}
                  onChange={handleChangeSchemaFromEditor}
                  onClose={() => setSchemaEditorId(null)}
                  onStartConnect={(id) => {
                    setSchemaEditorId(null);
                    handleStartConnectSchema(id);
                  }}
                  onCopySql={() => showToast(`Copied SQL for "${editingSchema.name}"`)}
                />
              )}

              {focusMode && (
                <div className="sp-focus-exit">
                  <button
                    type="button"
                    className="sp-btn"
                    onClick={() => setFocusMode(false)}
                    title="Exit Focus Mode (F or Esc)"
                  >
                    <Minimize2 size={14} />
                    Exit Focus
                  </button>
                </div>
              )}

              <BottomBar
                zoom={zoom}
                onZoomIn={() => handleZoomStep(0.15)}
                onZoomOut={() => handleZoomStep(-0.15)}
                onResetView={handleResetView}
                pageIndex={activePageIndex}
                pageCount={activeNotebook?.pages.length || 0}
                onPrevPage={() => {
                  if (activeNotebook && activePageIndex > 0) {
                    selectPageAndResetHistory(activeNotebook.pages[activePageIndex - 1]);
                  }
                }}
                onNextPage={() => {
                  if (activeNotebook && activePageIndex < activeNotebook.pages.length - 1) {
                    selectPageAndResetHistory(activeNotebook.pages[activePageIndex + 1]);
                  }
                }}
                onAddPage={() => handleCreatePage(activeNotebookId)}
                focusMode={focusMode}
                onToggleFocusMode={() => setFocusMode((prev) => !prev)}
              />
            </>
          ) : (
            <div className="sp-empty-state">
              <div className="sp-empty-card">
                <div className="sp-empty-icon">
                  <BookOpen size={22} />
                </div>
                <h3>{activeNotebook ? 'This notebook has no pages' : 'No notebooks yet'}</h3>
                <p>
                  {activeNotebook
                    ? 'Add a fresh page to start sketching, annotating, or taking notes offline.'
                    : 'Create a new notebook or restore an offline JSON backup to begin.'}
                </p>
                <div className="sp-empty-actions">
                  <button
                    type="button"
                    className="sp-btn sp-btn-primary"
                    onClick={() =>
                      activeNotebook ? handleCreatePage(activeNotebook.id) : handleCreateNotebook('Quick Notes')
                    }
                  >
                    <Plus size={15} />
                    {activeNotebook ? 'New Page' : 'New Notebook'}
                  </button>
                  {!activeNotebook && (
                    <label className="sp-btn" style={{ cursor: 'pointer' }}>
                      <Upload size={15} />
                      Import JSON
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportJson}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        hasActivePage={Boolean(activePage)}
        hasActiveNotebook={Boolean(activeNotebook && activeNotebook.pages.length > 0)}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onExportPdf={handleExportPdf}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
      />

      <SettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        paperStyle={activePage?.paperStyle || 'dotted'}
        onChangePaperStyle={handleChangePaperStyle}
        pressureEnabled={pressureEnabled}
        onTogglePressure={() => setPressureEnabled((prev) => !prev)}
        shapeDetectionEnabled={shapeDetectionEnabled}
        onToggleShapeDetection={() => setShapeDetectionEnabled((prev) => !prev)}
        stylusOnly={stylusOnly}
        onToggleStylusOnly={() => setStylusOnly((prev) => !prev)}
        smoothingEnabled={smoothingEnabled}
        onToggleSmoothing={() => setSmoothingEnabled((prev) => !prev)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
