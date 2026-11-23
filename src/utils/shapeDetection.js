/**
 * Freehand Shape Detection & Geometric Shape Builder
 * Supports freehand auto-snapping (line, circle/ellipse, rectangle/square, triangle)
 * and 12 interactive geometric shapes for everyday note-taking, math, and diagrams.
 */

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function detectShapeAndStraighten(points) {
  if (!points || points.length < 8) return null;

  const pStart = points[0];
  const pEnd = points[points.length - 1];

  const directDist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
  let pathLength = 0;
  for (let i = 1; i < points.length; i++) {
    pathLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }

  // 1. Straight Line Detection (with subtle horizontal/vertical axis snapping)
  if (pathLength > 18 && directDist / pathLength > 0.88) {
    let endX = pEnd.x;
    let endY = pEnd.y;
    const angle = Math.atan2(endY - pStart.y, endX - pStart.x);
    const snapTolerance = (6 * Math.PI) / 180;
    const cardinalAngles = [0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI];

    for (const target of cardinalAngles) {
      if (Math.abs(angle - target) < snapTolerance) {
        if (Math.abs(target) === Math.PI / 2) {
          endX = pStart.x;
        } else {
          endY = pStart.y;
        }
        break;
      }
    }

    const avgP = (pStart.p + pEnd.p) / 2;
    return {
      type: 'line',
      points: [
        { x: pStart.x, y: pStart.y, p: avgP },
        { x: endX, y: endY, p: avgP },
      ],
    };
  }

  // Compute bounding box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  const w = maxX - minX;
  const h = maxY - minY;
  const cx = minX + w / 2;
  const cy = minY + h / 2;

  if (w < 18 || h < 18) return null;

  // Must be a reasonably closed path
  const startEndDist = Math.hypot(pStart.x - pEnd.x, pStart.y - pEnd.y);
  const maxDim = Math.max(w, h);
  if (startEndDist > maxDim * 0.36) {
    return null;
  }

  // 2. Circle / Ellipse Detection
  const rx = w / 2;
  const ry = h / 2;
  let ellipseErrorSum = 0;
  for (let i = 0; i < points.length; i++) {
    const nx = (points[i].x - cx) / rx;
    const ny = (points[i].y - cy) / ry;
    ellipseErrorSum += Math.abs(Math.hypot(nx, ny) - 1);
  }
  const avgEllipseError = ellipseErrorSum / points.length;

  if (avgEllipseError < 0.14) {
    const aspectRatio = Math.min(w, h) / Math.max(w, h);
    const isCircle = aspectRatio > 0.82;
    const finalRx = isCircle ? (rx + ry) / 2 : rx;
    const finalRy = isCircle ? (rx + ry) / 2 : ry;

    const segments = 56;
    const perfectPoints = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      perfectPoints.push({
        x: cx + Math.cos(angle) * finalRx,
        y: cy + Math.sin(angle) * finalRy,
        p: 0.85,
      });
    }
    return { type: isCircle ? 'circle' : 'ellipse', points: perfectPoints };
  }

  // 3. Triangle Detection (upright isosceles triangle fit)
  const triA = { x: cx, y: minY };
  const triB = { x: maxX, y: maxY };
  const triC = { x: minX, y: maxY };
  let triErrorSum = 0;
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const d1 = distanceToSegment(pt.x, pt.y, triA.x, triA.y, triB.x, triB.y);
    const d2 = distanceToSegment(pt.x, pt.y, triB.x, triB.y, triC.x, triC.y);
    const d3 = distanceToSegment(pt.x, pt.y, triC.x, triC.y, triA.x, triA.y);
    triErrorSum += Math.min(d1, d2, d3);
  }
  const avgTriError = triErrorSum / points.length;

  if (avgTriError < Math.min(w, h) * 0.12) {
    return {
      type: 'triangle',
      points: [
        { x: triA.x, y: triA.y, p: 0.85 },
        { x: triB.x, y: triB.y, p: 0.85 },
        { x: triC.x, y: triC.y, p: 0.85 },
        { x: triA.x, y: triA.y, p: 0.85 },
      ],
    };
  }

  // 4. Rectangle / Square Detection
  let rectErrorSum = 0;
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const dLeft = Math.abs(pt.x - minX);
    const dRight = Math.abs(pt.x - maxX);
    const dTop = Math.abs(pt.y - minY);
    const dBottom = Math.abs(pt.y - maxY);
    rectErrorSum += Math.min(dLeft, dRight, dTop, dBottom);
  }
  const avgRectError = rectErrorSum / points.length;

  if (avgRectError < Math.min(w, h) * 0.14) {
    const aspectRatio = Math.min(w, h) / Math.max(w, h);
    let rW = w;
    let rH = h;
    if (aspectRatio > 0.88) {
      const side = (w + h) / 2;
      rW = side;
      rH = side;
    }
    const left = cx - rW / 2;
    const top = cy - rH / 2;
    const right = cx + rW / 2;
    const bottom = cy + rH / 2;

    return {
      type: 'rectangle',
      points: [
        { x: left, y: top, p: 0.85 },
        { x: right, y: top, p: 0.85 },
        { x: right, y: bottom, p: 0.85 },
        { x: left, y: bottom, p: 0.85 },
        { x: left, y: top, p: 0.85 },
      ],
    };
  }

  return null;
}

/**
 * Generates crisp geometric points for interactive Shape Tool dragging.
 */
export function buildShapePoints(shapeType, start, end, constrain = false) {
  let dx = end.x - start.x;
  let dy = end.y - start.y;

  if (constrain) {
    if (shapeType === 'line' || shapeType === 'arrow' || shapeType === 'doubleArrow') {
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      dx = Math.cos(snapped) * len;
      dy = Math.sin(snapped) * len;
    } else {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * side;
      dy = Math.sign(dy || 1) * side;
    }
  }

  const endX = start.x + dx;
  const endY = start.y + dy;
  const left = Math.min(start.x, endX);
  const right = Math.max(start.x, endX);
  const top = Math.min(start.y, endY);
  const bottom = Math.max(start.y, endY);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const w = right - left;
  const h = bottom - top;

  if (shapeType === 'line') {
    return [
      { x: start.x, y: start.y, p: 0.85 },
      { x: endX, y: endY, p: 0.85 },
    ];
  }

  if (shapeType === 'arrow' || shapeType === 'doubleArrow') {
    return [
      { x: start.x, y: start.y, p: 0.85 },
      { x: endX, y: endY, p: 0.85 },
    ];
  }

  if (shapeType === 'curvedArrow') {
    const midX = (start.x + endX) / 2;
    const midY = (start.y + endY) / 2;
    const len = Math.hypot(dx, dy);
    const nx = len > 0 ? -dy / len : 0;
    const ny = len > 0 ? dx / len : 0;
    const curveOffset = Math.min(90, len * 0.24);
    const ctrlX = midX + nx * curveOffset;
    const ctrlY = midY + ny * curveOffset;

    const pts = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const omt = 1 - t;
      pts.push({
        x: omt * omt * start.x + 2 * omt * t * ctrlX + t * t * endX,
        y: omt * omt * start.y + 2 * omt * t * ctrlY + t * t * endY,
        p: 0.85,
      });
    }
    return pts;
  }

  if (shapeType === 'elbowArrow') {
    const midX = (start.x + endX) / 2;
    return [
      { x: start.x, y: start.y, p: 0.85 },
      { x: midX, y: start.y, p: 0.85 },
      { x: midX, y: endY, p: 0.85 },
      { x: endX, y: endY, p: 0.85 },
    ];
  }

  if (shapeType === 'rectangle') {
    return [
      { x: left, y: top, p: 0.85 },
      { x: right, y: top, p: 0.85 },
      { x: right, y: bottom, p: 0.85 },
      { x: left, y: bottom, p: 0.85 },
      { x: left, y: top, p: 0.85 },
    ];
  }

  if (shapeType === 'roundedRect') {
    const r = Math.min(20, w * 0.22, h * 0.22);
    const pts = [];
    const arc = (acx, acy, startA, endA) => {
      const steps = 6;
      for (let i = 0; i <= steps; i++) {
        const a = startA + ((endA - startA) * i) / steps;
        pts.push({ x: acx + Math.cos(a) * r, y: acy + Math.sin(a) * r, p: 0.85 });
      }
    };
    arc(right - r, top + r, -Math.PI / 2, 0);
    arc(right - r, bottom - r, 0, Math.PI / 2);
    arc(left + r, bottom - r, Math.PI / 2, Math.PI);
    arc(left + r, top + r, Math.PI, Math.PI * 1.5);
    pts.push({ ...pts[0] });
    return pts;
  }

  if (shapeType === 'circle') {
    const rx = w / 2;
    const ry = h / 2;
    const segments = 56;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, p: 0.85 });
    }
    return pts;
  }

  if (shapeType === 'triangle') {
    return [
      { x: cx, y: top, p: 0.85 },
      { x: right, y: bottom, p: 0.85 },
      { x: left, y: bottom, p: 0.85 },
      { x: cx, y: top, p: 0.85 },
    ];
  }

  if (shapeType === 'diamond') {
    return [
      { x: cx, y: top, p: 0.85 },
      { x: right, y: cy, p: 0.85 },
      { x: cx, y: bottom, p: 0.85 },
      { x: left, y: cy, p: 0.85 },
      { x: cx, y: top, p: 0.85 },
    ];
  }

  if (shapeType === 'star') {
    const rx = w / 2;
    const ry = h / 2;
    const innerScale = 0.42;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const scale = i % 2 === 0 ? 1 : innerScale;
      pts.push({
        x: cx + Math.cos(a) * rx * scale,
        y: cy + Math.sin(a) * ry * scale,
        p: 0.85,
      });
    }
    return pts;
  }

  if (shapeType === 'axes') {
    return [
      { x: left, y: top, p: 0.85 },
      { x: left, y: bottom, p: 0.85 },
      { x: right, y: bottom, p: 0.85 },
    ];
  }

  return [
    { x: start.x, y: start.y, p: 0.85 },
    { x: endX, y: endY, p: 0.85 },
  ];
}
