import { useEffect, useRef, useCallback } from 'react';
import {
  renderPageToContext,
  renderStroke,
  renderLiveSegment,
  smoothPoint,
} from '../utils/drawingEngine';
import {
  detectShapeAndStraighten,
  buildShapePoints,
} from '../utils/shapeDetection';

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
  pressureEnabled,
  shapeDetectionEnabled,
  stylusOnly,
  smoothingEnabled,
  darkMode,
  spacePressed,
  selectedElementId,
  selectedStrokeIndex,
  onSelectElement,
  onSelectStroke,
  onCommitStroke,
  onUpdateImages,
  onCommitImages,
  onUpdateStrokes,
  onCommitStrokes,
  imageCache,
  canvasSizeRef,
}) {
  const containerRef = useRef(null);
  const baseCanvasRef = useRef(null);
  const liveCanvasRef = useRef(null);

  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const isMovingImgRef = useRef(false);
  const isResizingImgRef = useRef(null);
  const isMovingStrokeRef = useRef(false);
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
    pressureEnabled,
    shapeDetectionEnabled,
    stylusOnly,
    smoothingEnabled,
    darkMode,
    spacePressed,
    selectedElementId,
    selectedStrokeIndex,
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

  // Renders static committed page (paper + images + committed strokes + selection box)
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
    },
    [syncCanvasDimensions, imageCache]
  );

  // Immediately paints the newest live stroke segment onto the overlay canvas (zero frame lag)
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

  // Paints a full live stroke (used for Shape preview and Highlighter so alpha doesn't double-blend)
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

  // Redraw base layer when page, pan/zoom, theme, or selection updates
  useEffect(() => {
    renderBaseCanvas(false);
  }, [page, panX, panY, zoom, darkMode, selectedElementId, selectedStrokeIndex, renderBaseCanvas]);

  // Observe container resize & clean up stale pointers on window blur
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

  // Trackpad two-finger infinite pan & pinch-to-zoom
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

    if (s.currentTool === 'select') {
      const images = s.page.images || [];
      if (s.selectedElementId) {
        const img = images.find((i) => i.id === s.selectedElementId);
        if (img && !img.locked) {
          const hitRadius = 12 / s.zoom;
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
        onSelectElement(hitImg.id);
        if (!hitImg.locked) {
          isMovingImgRef.current = true;
        }
        return;
      }

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

      // Paint immediately onto the live overlay canvas for zero-latency opaque pen ink
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
      : currentTool === 'select'
      ? 'select'
      : currentTool === 'eraser'
      ? 'eraser'
      : 'draw';

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
      />
    </div>
  );
}
