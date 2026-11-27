import { useEffect, useRef, useCallback } from 'react';
import {
  renderPageToContext,
  renderStroke,
  renderLiveSegment,
  smoothPoint,
  resolveStrokeColor,
} from '../utils/drawingEngine';
import {
  detectShapeAndStraighten,
  buildShapePoints,
} from '../utils/shapeDetection';
import {
  FONT_FAMILIES,
  getTextMetrics,
  getTableMetrics,
  hitTestTableCell,
  getSchemaMetrics,
  hitTestRelation,
} from '../utils/structuredElements';
import { createId } from '../utils/storage';

function getStrokeBoundingBox(stroke) {
  if (!stroke?.points || stroke.points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < stroke.points.length; i++) {
    const pt = stroke.points[i];
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  const pad = Math.max(8, (stroke.width || 3) * 1.2);
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

function pointInPolygon(x, y, poly) {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function rectsOverlap(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function getGroupBoundingBox(page, group, ctx) {
  if (!page || !group) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const expand = (x0, y0, x1, y1) => {
    if (x0 < minX) minX = x0;
    if (y0 < minY) minY = y0;
    if (x1 > maxX) maxX = x1;
    if (y1 > maxY) maxY = y1;
  };

  (group.strokeIndices || []).forEach((idx) => {
    const b = getStrokeBoundingBox(page.strokes?.[idx]);
    if (b) expand(b.minX, b.minY, b.maxX, b.maxY);
  });

  if (ctx) {
    (group.textIds || []).forEach((id) => {
      const txt = (page.texts || []).find((t) => t.id === id);
      if (txt) {
        const m = getTextMetrics(ctx, txt);
        expand(txt.x, txt.y, txt.x + m.width, txt.y + m.height);
      }
    });
    (group.tableIds || []).forEach((id) => {
      const tbl = (page.tables || []).find((t) => t.id === id);
      if (tbl) {
        const m = getTableMetrics(ctx, tbl);
        expand(tbl.x, tbl.y, tbl.x + m.totalWidth, tbl.y + m.totalHeight);
      }
    });
  }

  (group.schemaIds || []).forEach((id) => {
    const sch = (page.schemas || []).find((s) => s.id === id);
    if (sch) {
      const m = getSchemaMetrics(sch);
      expand(sch.x, sch.y, sch.x + m.width, sch.y + m.height);
    }
  });

  (group.imageIds || []).forEach((id) => {
    const img = (page.images || []).find((i) => i.id === id);
    if (img) expand(img.x, img.y, img.x + img.width, img.y + img.height);
  });

  if (!Number.isFinite(minX)) return null;
  return { minX: minX - 8, minY: minY - 8, maxX: maxX + 8, maxY: maxY + 8 };
}

function hitTestStroke(stroke, worldX, worldY, tolerance) {
  if (!stroke?.points || stroke.points.length === 0 || stroke.tool === 'eraser') return false;
  const hitDist = Math.max(tolerance, (stroke.width || 3) / 2 + 6);
  const pts = stroke.points;
  for (let i = 0; i < pts.length; i++) {
    if (Math.hypot(worldX - pts[i].x, worldY - pts[i].y) <= hitDist) {
      return true;
    }
    if (i > 0) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > 0) {
        const t = Math.max(0, Math.min(1, ((worldX - a.x) * dx + (worldY - a.y) * dy) / lenSq));
        const projX = a.x + t * dx;
        const projY = a.y + t * dy;
        if (Math.hypot(worldX - projX, worldY - projY) <= hitDist) {
          return true;
        }
      }
    }
  }
  return false;
}

function buildStarterSchema(templateId, x, y, color) {
  if (templateId === 'users') {
    return {
      id: createId(),
      x,
      y,
      width: 260,
      name: 'users',
      color,
      locked: false,
      fields: [
        { id: createId(), name: 'id', type: 'uuid', isPK: true, isFK: false, isNullable: false, isUnique: true },
        { id: createId(), name: 'email', type: 'varchar', isPK: false, isFK: false, isNullable: false, isUnique: true },
        { id: createId(), name: 'full_name', type: 'varchar', isPK: false, isFK: false, isNullable: false, isUnique: false },
        { id: createId(), name: 'created_at', type: 'timestamp', isPK: false, isFK: false, isNullable: false, isUnique: false },
      ],
    };
  }
  if (templateId === 'orders') {
    return {
      id: createId(),
      x,
      y,
      width: 260,
      name: 'orders',
      color,
      locked: false,
      fields: [
        { id: createId(), name: 'id', type: 'uuid', isPK: true, isFK: false, isNullable: false, isUnique: true },
        { id: createId(), name: 'user_id', type: 'uuid', isPK: false, isFK: true, isNullable: false, isUnique: false },
        { id: createId(), name: 'total_cents', type: 'int', isPK: false, isFK: false, isNullable: false, isUnique: false },
        { id: createId(), name: 'status', type: 'varchar', isPK: false, isFK: false, isNullable: false, isUnique: false },
      ],
    };
  }
  if (templateId === 'posts') {
    return {
      id: createId(),
      x,
      y,
      width: 260,
      name: 'posts',
      color,
      locked: false,
      fields: [
        { id: createId(), name: 'id', type: 'serial', isPK: true, isFK: false, isNullable: false, isUnique: true },
        { id: createId(), name: 'author_id', type: 'uuid', isPK: false, isFK: true, isNullable: false, isUnique: false },
        { id: createId(), name: 'title', type: 'varchar', isPK: false, isFK: false, isNullable: false, isUnique: false },
        { id: createId(), name: 'published', type: 'boolean', isPK: false, isFK: false, isNullable: false, isUnique: false },
      ],
    };
  }
  return {
    id: createId(),
    x,
    y,
    width: 256,
    name: 'new_table',
    color,
    locked: false,
    fields: [
      { id: createId(), name: 'id', type: 'uuid', isPK: true, isFK: false, isNullable: false, isUnique: true },
      { id: createId(), name: 'name', type: 'varchar', isPK: false, isFK: false, isNullable: false, isUnique: false },
      { id: createId(), name: 'created_at', type: 'timestamp', isPK: false, isFK: false, isNullable: false, isUnique: false },
    ],
  };
}

export default function CanvasWorkspace({
  page,
  panX,
  panY,
  zoom,
  onPanZoomChange,
  currentTool,
  currentColor,
  currentWidth,
  currentGlow,
  shapeType,
  strokeStyle,
  shapeFill,
  textStyle,
  tablePreset,
  schemaTemplate,
  pressureEnabled,
  shapeDetectionEnabled,
  stylusOnly,
  smoothingEnabled,
  darkMode,
  spacePressed,
  selectedElementId,
  selectedElementType,
  selectedStrokeIndex,
  selectMode,
  selectedGroup,
  editingTextId,
  editingCell,
  connectingFromId,
  onSelectElement,
  onSelectStructuredElement,
  onSelectStroke,
  onSelectGroup,
  onUpdateGroupItems,
  onCommitGroupItems,
  onSetEditingTextId,
  onSetEditingCell,
  onOpenSchemaEditor,
  onStartConnectSchema,
  onCompleteConnect,
  onCommitStroke,
  onUpdateImages,
  onCommitImages,
  onUpdateStrokes,
  onCommitStrokes,
  onCommitText,
  onUpdateTexts,
  onCommitTexts,
  onDeleteEmptyText,
  onCommitTable,
  onUpdateTables,
  onCommitTables,
  onCommitSchema,
  onUpdateSchemas,
  onCommitSchemas,
  imageCache,
  canvasSizeRef,
}) {
  const containerRef = useRef(null);
  const baseCanvasRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const textEditorRef = useRef(null);
  const cellEditorRef = useRef(null);

  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const isMovingImgRef = useRef(false);
  const isResizingImgRef = useRef(null);
  const isMovingStrokeRef = useRef(false);
  const isMovingStructuredRef = useRef(null); // { type: 'text'|'table'|'schema', id }
  const isResizingStructuredRef = useRef(null); // { type: 'text'|'table'|'schema', id, dir }
  const isMovingGroupRef = useRef(false);
  const marqueeRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const shapeStartRef = useRef(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const activePointersRef = useRef(new Map());
  const pinchStartRef = useRef(null);
  const rafRef = useRef(null);

  const stateRef = useRef({});
  stateRef.current = {
    page,
    panX,
    panY,
    zoom,
    currentTool,
    currentColor,
    currentWidth,
    currentGlow,
    shapeType,
    strokeStyle,
    shapeFill,
    textStyle,
    tablePreset,
    schemaTemplate,
    pressureEnabled,
    shapeDetectionEnabled,
    stylusOnly,
    smoothingEnabled,
    darkMode,
    spacePressed,
    selectedElementId,
    selectedElementType,
    selectedStrokeIndex,
    selectMode,
    selectedGroup,
    editingTextId,
    editingCell,
    connectingFromId,
  };

  const syncCanvasDimensions = useCallback(() => {
    const container = containerRef.current;
    const baseCanvas = baseCanvasRef.current;
    const liveCanvas = liveCanvasRef.current;
    if (!container || !baseCanvas || !liveCanvas) return null;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (baseCanvas.width !== targetW || baseCanvas.height !== targetH) {
      baseCanvas.width = targetW;
      baseCanvas.height = targetH;
    }
    if (liveCanvas.width !== targetW || liveCanvas.height !== targetH) {
      liveCanvas.width = targetW;
      liveCanvas.height = targetH;
    }

    if (canvasSizeRef) {
      canvasSizeRef.current = { width: rect.width, height: rect.height };
    }
    return { width: rect.width, height: rect.height, dpr };
  }, [canvasSizeRef]);

  const clearLiveCanvas = useCallback(() => {
    const liveCanvas = liveCanvasRef.current;
    if (!liveCanvas) return;
    const lCtx = liveCanvas.getContext('2d');
    lCtx.setTransform(1, 0, 0, 1, 0, 0);
    lCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  }, []);

  const renderBaseCanvas = useCallback(
    (includeActiveEraser = false) => {
      const dims = syncCanvasDimensions();
      if (!dims) return;

      const s = stateRef.current;
      const ctx = baseCanvasRef.current.getContext('2d');
      renderPageToContext(ctx, s.page, dims.width, dims.height, {
        panX: s.panX,
        panY: s.panY,
        zoom: s.zoom,
        dpr: dims.dpr,
        darkMode: s.darkMode,
        includePaper: true,
        imageCache,
        selectedElementId: s.selectedElementId,
        selectedElementType: s.selectedElementType,
        editingTextId: s.editingTextId,
        editingCell: s.editingCell,
        showSchemaAnchors: Boolean(s.connectingFromId),
        activeStroke: includeActiveEraser ? activeStrokeRef.current : null,
        onImageLoad: () => renderBaseCanvas(false),
      });

      if (
        s.selectedStrokeIndex !== null &&
        s.page?.strokes &&
        s.page.strokes[s.selectedStrokeIndex]
      ) {
        const bounds = getStrokeBoundingBox(s.page.strokes[s.selectedStrokeIndex]);
        if (bounds) {
          ctx.save();
          ctx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
          ctx.scale(s.zoom, s.zoom);
          ctx.translate(s.panX, s.panY);
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1.5 / s.zoom;
          ctx.setLineDash([5 / s.zoom, 4 / s.zoom]);
          ctx.strokeRect(
            bounds.minX,
            bounds.minY,
            bounds.maxX - bounds.minX,
            bounds.maxY - bounds.minY
          );
          ctx.restore();
        }
      }

      if (s.selectedGroup) {
        const gBounds = getGroupBoundingBox(s.page, s.selectedGroup, ctx);
        if (gBounds) {
          ctx.save();
          ctx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
          ctx.scale(s.zoom, s.zoom);
          ctx.translate(s.panX, s.panY);
          ctx.fillStyle = 'rgba(59, 130, 246, 0.05)';
          ctx.fillRect(
            gBounds.minX,
            gBounds.minY,
            gBounds.maxX - gBounds.minX,
            gBounds.maxY - gBounds.minY
          );
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1.5 / s.zoom;
          ctx.setLineDash([6 / s.zoom, 4 / s.zoom]);
          ctx.strokeRect(
            gBounds.minX,
            gBounds.minY,
            gBounds.maxX - gBounds.minX,
            gBounds.maxY - gBounds.minY
          );
          ctx.restore();
        }
      }
    },
    [syncCanvasDimensions, imageCache]
  );

  const paintLiveMarquee = useCallback((marquee) => {
    const liveCanvas = liveCanvasRef.current;
    if (!liveCanvas || !marquee) return;
    const dpr = window.devicePixelRatio || 1;
    const s = stateRef.current;
    const lCtx = liveCanvas.getContext('2d');

    lCtx.setTransform(1, 0, 0, 1, 0, 0);
    lCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);

    lCtx.save();
    lCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lCtx.scale(s.zoom, s.zoom);
    lCtx.translate(s.panX, s.panY);
    lCtx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    lCtx.strokeStyle = '#3b82f6';
    lCtx.lineWidth = 1.5 / s.zoom;

    if (marquee.mode === 'lasso' && marquee.points.length > 1) {
      lCtx.setLineDash([5 / s.zoom, 4 / s.zoom]);
      lCtx.beginPath();
      lCtx.moveTo(marquee.points[0].x, marquee.points[0].y);
      for (let i = 1; i < marquee.points.length; i++) {
        lCtx.lineTo(marquee.points[i].x, marquee.points[i].y);
      }
      lCtx.closePath();
      lCtx.fill();
      lCtx.stroke();
    } else {
      const x = Math.min(marquee.start.x, marquee.current.x);
      const y = Math.min(marquee.start.y, marquee.current.y);
      const w = Math.abs(marquee.current.x - marquee.start.x);
      const h = Math.abs(marquee.current.y - marquee.start.y);
      lCtx.fillRect(x, y, w, h);
      lCtx.strokeRect(x, y, w, h);
    }
    lCtx.restore();
  }, []);

  const paintLiveIncremental = useCallback((stroke) => {
    const liveCanvas = liveCanvasRef.current;
    if (!liveCanvas || !stroke) return;
    const dpr = window.devicePixelRatio || 1;
    const s = stateRef.current;
    const lCtx = liveCanvas.getContext('2d');

    lCtx.save();
    lCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lCtx.scale(s.zoom, s.zoom);
    lCtx.translate(s.panX, s.panY);
    renderLiveSegment(lCtx, stroke.points, stroke, s.darkMode);
    lCtx.restore();
  }, []);

  const paintLiveFullStroke = useCallback((stroke) => {
    const liveCanvas = liveCanvasRef.current;
    if (!liveCanvas || !stroke) return;
    const dpr = window.devicePixelRatio || 1;
    const s = stateRef.current;
    const lCtx = liveCanvas.getContext('2d');

    lCtx.setTransform(1, 0, 0, 1, 0, 0);
    lCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);

    lCtx.save();
    lCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lCtx.scale(s.zoom, s.zoom);
    lCtx.translate(s.panX, s.panY);
    renderStroke(lCtx, stroke, s.darkMode);
    lCtx.restore();
  }, []);

  useEffect(() => {
    renderBaseCanvas(false);
  }, [
    page,
    panX,
    panY,
    zoom,
    darkMode,
    selectedElementId,
    selectedElementType,
    selectedStrokeIndex,
    selectedGroup,
    editingTextId,
    editingCell,
    connectingFromId,
    renderBaseCanvas,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => renderBaseCanvas(false));
    observer.observe(container);

    const handleBlur = () => {
      activePointersRef.current.clear();
      pinchStartRef.current = null;
      isDrawingRef.current = false;
      isPanningRef.current = false;
      isMovingImgRef.current = false;
      isResizingImgRef.current = null;
      isMovingStrokeRef.current = false;
      isMovingStructuredRef.current = null;
      isResizingStructuredRef.current = null;
      isMovingGroupRef.current = false;
      marqueeRef.current = null;
      clearLiveCanvas();
    };
    window.addEventListener('blur', handleBlur);

    return () => {
      observer.disconnect();
      window.removeEventListener('blur', handleBlur);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [renderBaseCanvas, clearLiveCanvas]);

  useEffect(() => {
    const canvas = liveCanvasRef.current;
    if (!canvas) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = Math.exp(-e.deltaY * 0.008);
        const nextZoom = Math.min(5, Math.max(0.2, s.zoom * zoomFactor));
        const worldX = pointerX / s.zoom - s.panX;
        const worldY = pointerY / s.zoom - s.panY;
        const nextPanX = pointerX / nextZoom - worldX;
        const nextPanY = pointerY / nextZoom - worldY;
        onPanZoomChange(nextPanX, nextPanY, nextZoom);
      } else {
        onPanZoomChange(
          s.panX - e.deltaX / s.zoom,
          s.panY - e.deltaY / s.zoom,
          s.zoom
        );
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [onPanZoomChange]);

  // Auto-focus inline text editor when editingTextId changes
  useEffect(() => {
    if (editingTextId && textEditorRef.current) {
      const el = textEditorRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editingTextId]);

  useEffect(() => {
    if (editingCell && cellEditorRef.current) {
      cellEditorRef.current.focus();
      cellEditorRef.current.select();
    }
  }, [editingCell]);

  const toWorld = (clientX, clientY) => {
    const rect = liveCanvasRef.current.getBoundingClientRect();
    const s = stateRef.current;
    return {
      x: (clientX - rect.left) / s.zoom - s.panX,
      y: (clientY - rect.top) / s.zoom - s.panY,
    };
  };

  const getPressure = (e) => {
    const s = stateRef.current;
    if (!s.pressureEnabled) return 0.75;
    if (e.pointerType === 'pen') {
      return e.pressure > 0 ? Math.max(0.15, Math.min(1.4, e.pressure * 1.25)) : 0.75;
    }
    return 0.75;
  };

  const findHitText = (world) => {
    const ctx = baseCanvasRef.current?.getContext('2d');
    if (!ctx) return null;
    const texts = stateRef.current.page?.texts || [];
    return [...texts].reverse().find((txt) => {
      const m = getTextMetrics(ctx, txt);
      return (
        world.x >= txt.x &&
        world.x <= txt.x + m.width &&
        world.y >= txt.y &&
        world.y <= txt.y + m.height
      );
    });
  };

  const findHitTable = (world) => {
    const ctx = baseCanvasRef.current?.getContext('2d');
    if (!ctx) return null;
    const tables = stateRef.current.page?.tables || [];
    return [...tables].reverse().find((tbl) => {
      const m = getTableMetrics(ctx, tbl);
      return (
        world.x >= tbl.x &&
        world.x <= tbl.x + m.totalWidth &&
        world.y >= tbl.y &&
        world.y <= tbl.y + m.totalHeight
      );
    });
  };

  const findHitSchema = (world) => {
    const schemas = stateRef.current.page?.schemas || [];
    return [...schemas].reverse().find((sch) => {
      const m = getSchemaMetrics(sch);
      return (
        world.x >= sch.x &&
        world.x <= sch.x + m.width &&
        world.y >= sch.y &&
        world.y <= sch.y + m.height
      );
    });
  };

  const handlePointerDown = (e) => {
    if (!stateRef.current.page) return;
    e.preventDefault();
    try {
      liveCanvasRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore if pointer capture is unsupported
    }

    activePointersRef.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
    });

    if (activePointersRef.current.size === 2 && e.pointerType === 'touch') {
      isDrawingRef.current = false;
      activeStrokeRef.current = null;
      clearLiveCanvas();
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      pinchStartRef.current = {
        dist,
        midX,
        midY,
        panX: stateRef.current.panX,
        panY: stateRef.current.panY,
        zoom: stateRef.current.zoom,
      };
      return;
    }

    const s = stateRef.current;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };

    const touchForcedPan =
      s.stylusOnly &&
      e.pointerType === 'touch' &&
      s.currentTool !== 'select';

    if (
      s.currentTool === 'pan' ||
      s.spacePressed ||
      e.button === 1 ||
      e.button === 2 ||
      touchForcedPan
    ) {
      isPanningRef.current = true;
      return;
    }

    const world = toWorld(e.clientX, e.clientY);

    // Handle schema connection mode
    if (s.connectingFromId) {
      const targetSchema = findHitSchema(world);
      if (targetSchema && targetSchema.id !== s.connectingFromId) {
        onCompleteConnect(targetSchema.id);
      } else {
        onCompleteConnect(null);
      }
      return;
    }

    // Text Tool: click existing text to edit, or click empty space to create new text box
    if (s.currentTool === 'text') {
      const hitTxt = findHitText(world);
      if (hitTxt) {
        onSelectStructuredElement('text', hitTxt.id);
        onSetEditingTextId(hitTxt.id);
        return;
      }
      const newTxt = {
        id: createId(),
        x: world.x,
        y: world.y,
        width: 240,
        text: '',
        color: s.currentColor,
        fontSize: s.textStyle?.fontSize || 18,
        fontFamily: s.textStyle?.fontFamily || 'sans',
        fontWeight: s.textStyle?.fontWeight || 'normal',
        fontStyle: s.textStyle?.fontStyle || 'normal',
        textAlign: s.textStyle?.textAlign || 'left',
        locked: false,
      };
      onCommitText(newTxt);
      onSelectStructuredElement('text', newTxt.id);
      onSetEditingTextId(newTxt.id);
      return;
    }

    // Table Tool: click existing table cell to edit, or click empty space to place new table
    if (s.currentTool === 'table') {
      const hitTbl = findHitTable(world);
      if (hitTbl) {
        onSelectStructuredElement('table', hitTbl.id);
        const ctx = baseCanvasRef.current?.getContext('2d');
        const cell = ctx ? hitTestTableCell(ctx, hitTbl, world.x, world.y) : null;
        if (cell) onSetEditingCell({ tableId: hitTbl.id, row: cell.row, col: cell.col });
        return;
      }
      const rCount = s.tablePreset?.rows || 3;
      const cCount = s.tablePreset?.cols || 3;
      const headerRow = s.tablePreset?.headerRow ?? true;
      const rows = Array.from({ length: rCount }, (_, r) =>
        Array.from({ length: cCount }, (_, c) =>
          headerRow && r === 0 ? `Column ${c + 1}` : ''
        )
      );
      const newTable = {
        id: createId(),
        x: world.x,
        y: world.y,
        colWidths: Array.from({ length: cCount }, () => 130),
        rowHeight: 34,
        rows,
        headerRow,
        color: s.currentColor,
        locked: false,
      };
      onCommitTable(newTable);
      onSelectStructuredElement('table', newTable.id);
      return;
    }

    // Schema Tool: click existing schema to select/edit, or click empty space to place new entity
    if (s.currentTool === 'schema') {
      const hitSch = findHitSchema(world);
      if (hitSch) {
        onSelectStructuredElement('schema', hitSch.id);
        onOpenSchemaEditor(hitSch.id);
        return;
      }
      const newSchema = buildStarterSchema(s.schemaTemplate, world.x, world.y, s.currentColor);
      onCommitSchema(newSchema);
      onSelectStructuredElement('schema', newSchema.id);
      return;
    }

    if (s.currentTool === 'select') {
      const ctx = baseCanvasRef.current?.getContext('2d');
      const hitRadius = 12 / s.zoom;

      // 0. If clicking inside an active area/group selection box, drag the whole group
      if (s.selectedGroup && ctx) {
        const gBounds = getGroupBoundingBox(s.page, s.selectedGroup, ctx);
        if (
          gBounds &&
          world.x >= gBounds.minX &&
          world.x <= gBounds.maxX &&
          world.y >= gBounds.minY &&
          world.y <= gBounds.maxY
        ) {
          isMovingGroupRef.current = true;
          return;
        }
        onSelectGroup(null);
      }

      // 1. Check resize handles / anchor ports on currently selected structured element
      if (s.selectedElementId && s.selectedElementType === 'schema') {
        const sch = (s.page.schemas || []).find((i) => i.id === s.selectedElementId);
        if (sch && !sch.locked) {
          const m = getSchemaMetrics(sch);
          for (const pt of Object.values(m.anchors)) {
            if (Math.hypot(world.x - pt.x, world.y - pt.y) <= hitRadius) {
              onStartConnectSchema(sch.id);
              return;
            }
          }
        }
      }

      if (s.selectedElementId && s.selectedElementType === 'text' && ctx) {
        const txt = (s.page.texts || []).find((i) => i.id === s.selectedElementId);
        if (txt && !txt.locked) {
          const m = getTextMetrics(ctx, txt);
          if (
            Math.abs(world.x - (txt.x + m.width)) <= hitRadius &&
            world.y >= txt.y - hitRadius &&
            world.y <= txt.y + m.height + hitRadius
          ) {
            isResizingStructuredRef.current = { type: 'text', id: txt.id, dir: 'e' };
            return;
          }
        }
      }

      if (s.selectedElementId && s.selectedElementType === 'table' && ctx) {
        const tbl = (s.page.tables || []).find((i) => i.id === s.selectedElementId);
        if (tbl && !tbl.locked) {
          const m = getTableMetrics(ctx, tbl);
          if (
            Math.abs(world.x - (tbl.x + m.totalWidth)) <= hitRadius &&
            Math.abs(world.y - (tbl.y + m.totalHeight)) <= hitRadius
          ) {
            isResizingStructuredRef.current = { type: 'table', id: tbl.id, dir: 'se' };
            return;
          }
        }
      }

      // 2. Check resize handles on selected image
      const images = s.page.images || [];
      if (s.selectedElementId && (!s.selectedElementType || s.selectedElementType === 'image')) {
        const img = images.find((i) => i.id === s.selectedElementId);
        if (img && !img.locked) {
          const handles = {
            nw: { x: img.x, y: img.y },
            ne: { x: img.x + img.width, y: img.y },
            sw: { x: img.x, y: img.y + img.height },
            se: { x: img.x + img.width, y: img.y + img.height },
          };
          for (const [dir, pos] of Object.entries(handles)) {
            if (
              Math.abs(world.x - pos.x) <= hitRadius &&
              Math.abs(world.y - pos.y) <= hitRadius
            ) {
              isResizingImgRef.current = dir;
              return;
            }
          }
        }
      }

      // 3. Hit-test Texts
      const hitTxt = findHitText(world);
      if (hitTxt) {
        onSelectStroke(null);
        onSelectStructuredElement('text', hitTxt.id);
        if (!hitTxt.locked) isMovingStructuredRef.current = { type: 'text', id: hitTxt.id };
        return;
      }

      // 4. Hit-test Schemas
      const hitSch = findHitSchema(world);
      if (hitSch) {
        onSelectStroke(null);
        onSelectStructuredElement('schema', hitSch.id);
        if (!hitSch.locked) isMovingStructuredRef.current = { type: 'schema', id: hitSch.id };
        return;
      }

      // 5. Hit-test Tables
      const hitTbl = findHitTable(world);
      if (hitTbl) {
        onSelectStroke(null);
        onSelectStructuredElement('table', hitTbl.id);
        if (!hitTbl.locked) isMovingStructuredRef.current = { type: 'table', id: hitTbl.id };
        return;
      }

      // 6. Hit-test Images
      const hitImg = [...images]
        .reverse()
        .find(
          (img) =>
            world.x >= img.x &&
            world.x <= img.x + img.width &&
            world.y >= img.y &&
            world.y <= img.y + img.height
        );

      if (hitImg) {
        onSelectStroke(null);
        onSelectStructuredElement('image', hitImg.id);
        if (!hitImg.locked) {
          isMovingImgRef.current = true;
        }
        return;
      }

      // 7. Hit-test Schema Relations
      const relations = s.page.relations || [];
      const schemas = s.page.schemas || [];
      const hitRel = [...relations]
        .reverse()
        .find((rel) => hitTestRelation(rel, schemas, world.x, world.y, 12 / s.zoom));
      if (hitRel) {
        onSelectStroke(null);
        onSelectStructuredElement('relation', hitRel.id);
        return;
      }

      // 8. Hit-test Strokes
      const strokes = s.page.strokes || [];
      const tolerance = 12 / s.zoom;
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (hitTestStroke(strokes[i], world.x, world.y, tolerance)) {
          onSelectElement(null);
          onSelectStroke(i);
          isMovingStrokeRef.current = true;
          return;
        }
      }

      onSelectElement(null);
      onSelectStroke(null);
      onSelectGroup(null);
      marqueeRef.current = {
        mode: s.selectMode || 'box',
        start: world,
        current: world,
        points: [world],
      };
      paintLiveMarquee(marqueeRef.current);
      return;
    }

    if (s.currentTool === 'shape') {
      isDrawingRef.current = true;
      shapeStartRef.current = world;
      const arrowHeads =
        s.shapeType === 'arrow' || s.shapeType === 'curvedArrow' || s.shapeType === 'elbowArrow'
          ? 'end'
          : s.shapeType === 'doubleArrow'
          ? 'both'
          : s.shapeType === 'axes'
          ? 'axes'
          : null;
      activeStrokeRef.current = {
        tool: 'pen',
        color: s.currentColor,
        width: s.currentWidth,
        isGlow: false,
        isShape: true,
        arrowHeads,
        strokeStyle: s.strokeStyle || 'solid',
        fill: Boolean(s.shapeFill),
        points: [
          { x: world.x, y: world.y, p: 0.85 },
          { x: world.x, y: world.y, p: 0.85 },
        ],
      };
      paintLiveFullStroke(activeStrokeRef.current);
      return;
    }

    // Freehand Drawing (Pen, Pencil, Highlighter, Eraser)
    isDrawingRef.current = true;
    const pressure = getPressure(e);
    activeStrokeRef.current = {
      tool: s.currentTool,
      color: s.currentColor,
      width: s.currentWidth,
      isGlow: s.currentTool === 'pen' ? s.currentGlow : false,
      points: [{ x: world.x, y: world.y, p: pressure }],
    };

    if (s.currentTool === 'eraser') {
      renderBaseCanvas(true);
    } else if (s.currentTool === 'highlighter' || s.currentTool === 'pencil') {
      paintLiveFullStroke(activeStrokeRef.current);
    } else {
      clearLiveCanvas();
      paintLiveIncremental(activeStrokeRef.current);
    }
  };

  const handleDoubleClick = (e) => {
    const s = stateRef.current;
    if (!s.page) return;
    const world = toWorld(e.clientX, e.clientY);

    const hitTxt = findHitText(world);
    if (hitTxt && !hitTxt.locked) {
      onSelectStructuredElement('text', hitTxt.id);
      onSetEditingTextId(hitTxt.id);
      return;
    }

    const hitTbl = findHitTable(world);
    if (hitTbl && !hitTbl.locked) {
      onSelectStructuredElement('table', hitTbl.id);
      const ctx = baseCanvasRef.current?.getContext('2d');
      const cell = ctx ? hitTestTableCell(ctx, hitTbl, world.x, world.y) : null;
      if (cell) {
        onSetEditingCell({ tableId: hitTbl.id, row: cell.row, col: cell.col });
      }
      return;
    }

    const hitSch = findHitSchema(world);
    if (hitSch && !hitSch.locked) {
      onSelectStructuredElement('schema', hitSch.id);
      onOpenSchemaEditor(hitSch.id);
    }
  };

  const handlePointerMove = (e) => {
    if (!stateRef.current.page) return;
    e.preventDefault();

    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        type: e.pointerType,
      });
    }

    if (activePointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const start = pinchStartRef.current;

      const scale = dist / Math.max(10, start.dist);
      const nextZoom = Math.min(5, Math.max(0.2, start.zoom * scale));

      const rect = liveCanvasRef.current.getBoundingClientRect();
      const startLocalX = start.midX - rect.left;
      const startLocalY = start.midY - rect.top;
      const currLocalX = midX - rect.left;
      const currLocalY = midY - rect.top;

      const worldMidX = startLocalX / start.zoom - start.panX;
      const worldMidY = startLocalY / start.zoom - start.panY;

      const nextPanX = currLocalX / nextZoom - worldMidX;
      const nextPanY = currLocalY / nextZoom - worldMidY;

      onPanZoomChange(nextPanX, nextPanY, nextZoom);
      return;
    }

    const s = stateRef.current;
    const dxScreen = e.clientX - lastPointerRef.current.x;
    const dyScreen = e.clientY - lastPointerRef.current.y;

    if (isPanningRef.current) {
      onPanZoomChange(s.panX + dxScreen / s.zoom, s.panY + dyScreen / s.zoom, s.zoom);
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (isMovingGroupRef.current && s.selectedGroup) {
      const dx = dxScreen / s.zoom;
      const dy = dyScreen / s.zoom;
      onUpdateGroupItems(dx, dy);
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (marqueeRef.current) {
      const world = toWorld(e.clientX, e.clientY);
      marqueeRef.current.current = world;
      if (marqueeRef.current.mode === 'lasso') {
        const pts = marqueeRef.current.points;
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(world.x - last.x, world.y - last.y) >= 3 / s.zoom) {
          pts.push(world);
        }
      }
      paintLiveMarquee(marqueeRef.current);
      return;
    }

    if (isMovingStructuredRef.current) {
      const dx = dxScreen / s.zoom;
      const dy = dyScreen / s.zoom;
      const { type, id } = isMovingStructuredRef.current;
      if (type === 'text') {
        onUpdateTexts((s.page.texts || []).map((t) => (t.id === id ? { ...t, x: t.x + dx, y: t.y + dy } : t)));
      } else if (type === 'table') {
        onUpdateTables((s.page.tables || []).map((t) => (t.id === id ? { ...t, x: t.x + dx, y: t.y + dy } : t)));
      } else if (type === 'schema') {
        onUpdateSchemas((s.page.schemas || []).map((sc) => (sc.id === id ? { ...sc, x: sc.x + dx, y: sc.y + dy } : sc)));
      }
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (isResizingStructuredRef.current) {
      const dx = dxScreen / s.zoom;
      const { type, id } = isResizingStructuredRef.current;
      if (type === 'text') {
        onUpdateTexts(
          (s.page.texts || []).map((t) =>
            t.id === id ? { ...t, width: Math.max(90, (t.width || 240) + dx) } : t
          )
        );
      } else if (type === 'table') {
        onUpdateTables(
          (s.page.tables || []).map((t) => {
            if (t.id !== id) return t;
            const cols = t.colWidths || [130, 130, 130];
            const deltaPerCol = dx / cols.length;
            return {
              ...t,
              colWidths: cols.map((w) => Math.max(60, w + deltaPerCol)),
            };
          })
        );
      }
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (isMovingStrokeRef.current && s.selectedStrokeIndex !== null) {
      const dx = dxScreen / s.zoom;
      const dy = dyScreen / s.zoom;
      const nextStrokes = (s.page.strokes || []).map((stroke, idx) => {
        if (idx !== s.selectedStrokeIndex) return stroke;
        return {
          ...stroke,
          points: stroke.points.map((pt) => ({
            ...pt,
            x: pt.x + dx,
            y: pt.y + dy,
          })),
        };
      });
      onUpdateStrokes(nextStrokes);
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (isMovingImgRef.current || isResizingImgRef.current) {
      const dx = dxScreen / s.zoom;
      const dy = dyScreen / s.zoom;
      const nextImages = (s.page.images || []).map((img) => {
        if (img.id !== s.selectedElementId) return img;
        if (isMovingImgRef.current) {
          return { ...img, x: img.x + dx, y: img.y + dy };
        }
        const dir = isResizingImgRef.current;
        let { x, y, width, height } = img;
        if (dir.includes('e')) width += dx;
        if (dir.includes('s')) height += dy;
        if (dir.includes('w')) {
          x += dx;
          width -= dx;
        }
        if (dir.includes('n')) {
          y += dy;
          height -= dy;
        }
        return {
          ...img,
          x,
          y,
          width: Math.max(24, width),
          height: Math.max(24, height),
        };
      });
      onUpdateImages(nextImages);
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!isDrawingRef.current || !activeStrokeRef.current) return;

    if (s.currentTool === 'shape' && shapeStartRef.current) {
      const world = toWorld(e.clientX, e.clientY);
      activeStrokeRef.current.points = buildShapePoints(
        s.shapeType,
        shapeStartRef.current,
        world,
        e.shiftKey
      );
      paintLiveFullStroke(activeStrokeRef.current);
      return;
    }

    const coalesced = e.nativeEvent?.getCoalescedEvents?.();
    const events = coalesced && coalesced.length > 0 ? coalesced : [e];
    const pts = activeStrokeRef.current.points;
    let added = false;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const world = toWorld(ev.clientX, ev.clientY);
      const pressure = getPressure(ev);
      const rawPt = { x: world.x, y: world.y, p: pressure };
      const prev = pts[pts.length - 1];

      if (prev && Math.hypot(rawPt.x - prev.x, rawPt.y - prev.y) < 0.7) {
        continue;
      }

      const finalPt = s.smoothingEnabled ? smoothPoint(prev, rawPt, 0.14) : rawPt;
      pts.push(finalPt);
      added = true;

      if (s.currentTool !== 'eraser' && s.currentTool !== 'highlighter' && s.currentTool !== 'pencil') {
        paintLiveIncremental(activeStrokeRef.current);
      }
    }

    if (!added) return;

    if (s.currentTool === 'highlighter' || s.currentTool === 'pencil') {
      paintLiveFullStroke(activeStrokeRef.current);
    } else if (s.currentTool === 'eraser') {
      if (!rafRef.current) {
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = null;
          renderBaseCanvas(true);
        });
      }
    }
  };

  const handlePointerUp = (e) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }

    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (isMovingGroupRef.current) {
      isMovingGroupRef.current = false;
      onCommitGroupItems();
      return;
    }

    if (marqueeRef.current) {
      const m = marqueeRef.current;
      marqueeRef.current = null;
      clearLiveCanvas();

      const s = stateRef.current;
      const ctx = baseCanvasRef.current?.getContext('2d');
      const isLasso = m.mode === 'lasso' && m.points.length >= 3;
      const box = {
        minX: Math.min(m.start.x, m.current.x),
        minY: Math.min(m.start.y, m.current.y),
        maxX: Math.max(m.start.x, m.current.x),
        maxY: Math.max(m.start.y, m.current.y),
      };

      const hasDragArea = isLasso
        ? m.points.length >= 4
        : Math.hypot(box.maxX - box.minX, box.maxY - box.minY) > 6 / s.zoom;
      if (!hasDragArea) return;

      const pointHits = (x, y) =>
        isLasso
          ? pointInPolygon(x, y, m.points)
          : x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;

      const rectHits = (r) => {
        if (!isLasso) return rectsOverlap(r, box);
        const cx = (r.minX + r.maxX) / 2;
        const cy = (r.minY + r.maxY) / 2;
        return (
          pointInPolygon(cx, cy, m.points) ||
          pointInPolygon(r.minX, r.minY, m.points) ||
          pointInPolygon(r.maxX, r.minY, m.points) ||
          pointInPolygon(r.minX, r.maxY, m.points) ||
          pointInPolygon(r.maxX, r.maxY, m.points)
        );
      };

      const strokeIndices = [];
      (s.page.strokes || []).forEach((st, idx) => {
        if (!st || st.tool === 'eraser' || !st.points?.length) return;
        if (st.points.some((pt) => pointHits(pt.x, pt.y))) {
          strokeIndices.push(idx);
        } else if (!isLasso) {
          const sb = getStrokeBoundingBox(st);
          if (sb && rectsOverlap(sb, box) && st.points.length <= 2) {
            strokeIndices.push(idx);
          }
        }
      });

      const textIds = [];
      if (ctx) {
        (s.page.texts || []).forEach((txt) => {
          const tm = getTextMetrics(ctx, txt);
          if (rectHits({ minX: txt.x, minY: txt.y, maxX: txt.x + tm.width, maxY: txt.y + tm.height })) {
            textIds.push(txt.id);
          }
        });
      }

      const tableIds = [];
      if (ctx) {
        (s.page.tables || []).forEach((tbl) => {
          const tm = getTableMetrics(ctx, tbl);
          if (rectHits({ minX: tbl.x, minY: tbl.y, maxX: tbl.x + tm.totalWidth, maxY: tbl.y + tm.totalHeight })) {
            tableIds.push(tbl.id);
          }
        });
      }

      const schemaIds = [];
      (s.page.schemas || []).forEach((sch) => {
        const sm = getSchemaMetrics(sch);
        if (rectHits({ minX: sch.x, minY: sch.y, maxX: sch.x + sm.width, maxY: sch.y + sm.height })) {
          schemaIds.push(sch.id);
        }
      });

      const imageIds = [];
      (s.page.images || []).forEach((img) => {
        if (rectHits({ minX: img.x, minY: img.y, maxX: img.x + img.width, maxY: img.y + img.height })) {
          imageIds.push(img.id);
        }
      });

      const count =
        strokeIndices.length + textIds.length + tableIds.length + schemaIds.length + imageIds.length;
      if (count === 0) return;

      if (count === 1) {
        if (strokeIndices.length === 1) onSelectStroke(strokeIndices[0]);
        else if (textIds.length === 1) onSelectStructuredElement('text', textIds[0]);
        else if (tableIds.length === 1) onSelectStructuredElement('table', tableIds[0]);
        else if (schemaIds.length === 1) onSelectStructuredElement('schema', schemaIds[0]);
        else if (imageIds.length === 1) onSelectStructuredElement('image', imageIds[0]);
        return;
      }

      onSelectGroup({ strokeIndices, textIds, tableIds, schemaIds, imageIds, count });
      return;
    }

    if (isMovingStructuredRef.current || isResizingStructuredRef.current) {
      const ref = isMovingStructuredRef.current || isResizingStructuredRef.current;
      isMovingStructuredRef.current = null;
      isResizingStructuredRef.current = null;
      if (ref.type === 'text') onCommitTexts();
      else if (ref.type === 'table') onCommitTables();
      else if (ref.type === 'schema') onCommitSchemas();
      return;
    }

    if (isMovingStrokeRef.current) {
      isMovingStrokeRef.current = false;
      onCommitStrokes();
      return;
    }

    if (isMovingImgRef.current || isResizingImgRef.current) {
      isMovingImgRef.current = false;
      isResizingImgRef.current = null;
      onCommitImages();
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    shapeStartRef.current = null;
    clearLiveCanvas();

    if (!stroke || !stroke.points || stroke.points.length === 0) return;

    const s = stateRef.current;
    if (
      (stroke.tool === 'pen' || stroke.tool === 'brush') &&
      !stroke.isShape &&
      s.shapeDetectionEnabled
    ) {
      const matched = detectShapeAndStraighten(stroke.points);
      if (matched) {
        stroke.points = matched.points;
        stroke.isShape = true;
      }
    }

    onCommitStroke(stroke);
  };

  const cursorMode =
    spacePressed || currentTool === 'pan'
      ? 'pan'
      : currentTool === 'text'
      ? 'text'
      : currentTool === 'select' || connectingFromId
      ? 'select'
      : currentTool === 'eraser'
      ? 'eraser'
      : 'draw';

  // Compute inline text editor screen box
  const editingText = editingTextId
    ? (page?.texts || []).find((t) => t.id === editingTextId)
    : null;
  let textEditorStyle = null;
  if (editingText && baseCanvasRef.current) {
    const ctx = baseCanvasRef.current.getContext('2d');
    const metrics = getTextMetrics(ctx, editingText);
    const resolvedColor = resolveStrokeColor(editingText.color, darkMode, 'pen');
    textEditorStyle = {
      left: `${(editingText.x + panX) * zoom}px`,
      top: `${(editingText.y + panY) * zoom}px`,
      width: `${metrics.width * zoom}px`,
      minHeight: `${metrics.height * zoom}px`,
      padding: `${metrics.padY * zoom}px ${metrics.padX * zoom}px`,
      fontSize: `${(editingText.fontSize || 18) * zoom}px`,
      fontFamily: FONT_FAMILIES[editingText.fontFamily] || FONT_FAMILIES.sans,
      fontWeight: editingText.fontWeight === 'bold' ? 600 : 400,
      fontStyle: editingText.fontStyle === 'italic' ? 'italic' : 'normal',
      textAlign: editingText.textAlign || 'left',
      color: resolvedColor || (darkMode ? '#f8fafc' : '#1e1e1e'),
    };
  }

  // Compute inline table cell editor screen box
  let cellEditorStyle = null;
  let cellEditorValue = '';
  if (editingCell && baseCanvasRef.current) {
    const tbl = (page?.tables || []).find((t) => t.id === editingCell.tableId);
    if (tbl) {
      const ctx = baseCanvasRef.current.getContext('2d');
      const m = getTableMetrics(ctx, tbl);
      let cx = tbl.x;
      for (let c = 0; c < editingCell.col; c++) cx += m.colWidths[c] || 130;
      let cy = tbl.y;
      for (let r = 0; r < editingCell.row; r++) cy += m.rowHeights[r] || 34;
      const cw = m.colWidths[editingCell.col] || 130;
      const ch = m.rowHeights[editingCell.row] || 34;
      cellEditorValue = tbl.rows?.[editingCell.row]?.[editingCell.col] ?? '';
      cellEditorStyle = {
        left: `${(cx + panX) * zoom}px`,
        top: `${(cy + panY) * zoom}px`,
        width: `${cw * zoom}px`,
        height: `${ch * zoom}px`,
        padding: `${4 * zoom}px ${8 * zoom}px`,
        fontSize: `${m.fontSize * zoom}px`,
        fontWeight: tbl.headerRow && editingCell.row === 0 ? 600 : 400,
      };
    }
  }

  return (
    <div
      ref={containerRef}
      className="sp-canvas-container"
      data-cursor={cursorMode}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={baseCanvasRef} className="sp-canvas" style={{ pointerEvents: 'none' }} />
      <canvas
        ref={liveCanvasRef}
        className="sp-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />

      {editingText && textEditorStyle && (
        <textarea
          ref={textEditorRef}
          className="sp-canvas-text-editor"
          style={textEditorStyle}
          value={editingText.text}
          placeholder="Type here..."
          onChange={(e) => {
            const val = e.target.value;
            onUpdateTexts(
              (page?.texts || []).map((t) =>
                t.id === editingText.id ? { ...t, text: val } : t
              )
            );
          }}
          onBlur={() => {
            if (!editingText.text.trim()) {
              onDeleteEmptyText(editingText.id);
            } else {
              onCommitTexts();
            }
            onSetEditingTextId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      )}

      {editingCell && cellEditorStyle && (
        <input
          ref={cellEditorRef}
          type="text"
          className="sp-canvas-cell-editor"
          style={cellEditorStyle}
          value={cellEditorValue}
          onChange={(e) => {
            const val = e.target.value;
            onUpdateTables(
              (page?.tables || []).map((tbl) => {
                if (tbl.id !== editingCell.tableId) return tbl;
                const nextRows = tbl.rows.map((r, rIdx) =>
                  rIdx === editingCell.row
                    ? r.map((c, cIdx) => (cIdx === editingCell.col ? val : c))
                    : r
                );
                return { ...tbl, rows: nextRows };
              })
            );
          }}
          onBlur={() => {
            onCommitTables();
            onSetEditingCell(null);
          }}
          onKeyDown={(e) => {
            const tbl = (page?.tables || []).find((t) => t.id === editingCell.tableId);
            if (!tbl) return;
            const numRows = tbl.rows.length;
            const numCols = tbl.colWidths.length;

            if (e.key === 'Escape') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Tab') {
              e.preventDefault();
              let nextCol = editingCell.col + (e.shiftKey ? -1 : 1);
              let nextRow = editingCell.row;
              if (nextCol >= numCols) {
                nextCol = 0;
                nextRow += 1;
              } else if (nextCol < 0) {
                nextCol = numCols - 1;
                nextRow -= 1;
              }
              if (nextRow >= 0 && nextRow < numRows) {
                onCommitTables();
                onSetEditingCell({ tableId: tbl.id, row: nextRow, col: nextCol });
              } else {
                e.currentTarget.blur();
              }
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const nextRow = editingCell.row + 1;
              if (nextRow < numRows) {
                onCommitTables();
                onSetEditingCell({ tableId: tbl.id, row: nextRow, col: editingCell.col });
              } else {
                e.currentTarget.blur();
              }
            }
          }}
        />
      )}
    </div>
  );
}
