/**
 * ZenDraw Advanced iPad Auto Shape and Straight Line Detection
 */

export function detectShapeAndStraighten(points) {
    if (!points || points.length < 8) return null;

    // 1. Straight Line Detection
    const pStart = points[0];
    const pEnd = points[points.length - 1];

    const directDist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
    let pathLength = 0;
    for (let i = 1; i < points.length; i++) {
        pathLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }

    if (pathLength > 0 && directDist / pathLength > 0.85) {
        // Straight line detection matches! Convert into a perfectly crisp straight vector segment
        return {
            type: 'line',
            points: [
                { x: pStart.x, y: pStart.y, p: pStart.p },
                { x: pEnd.x, y: pEnd.y, p: pEnd.p }
            ]
        };
    }

    // Compute bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    points.forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
    });

    const w = maxX - minX;
    const h = maxY - minY;
    const cx = minX + w / 2;
    const cy = minY + h / 2;

    // We only test for circle/rectangle if shape has some thickness/width
    if (w < 15 || h < 15) return null;

    // Ensure the shape is a relatively closed path.
    // The distance between the start and end point of the stroke must be small.
    const startEndDist = Math.hypot(pStart.x - pEnd.x, pStart.y - pEnd.y);
    const maxDim = Math.max(w, h);
    if (startEndDist > maxDim * 0.35) {
        return null;
    }


    // 2. Circle Detection
    const idealRadius = (w + h) / 4;
    let sumDistFromCenter = 0;
    points.forEach(pt => {
        sumDistFromCenter += Math.hypot(pt.x - cx, pt.y - cy);
    });
    const avgDist = sumDistFromCenter / points.length;

    let varianceSum = 0;
    points.forEach(pt => {
        varianceSum += Math.pow(Math.hypot(pt.x - cx, pt.y - cy) - avgDist, 2);
    });
    const stdDev = Math.sqrt(varianceSum / points.length);

    // If points are equidistant from the center within a small margin, it's a circle!
    if (stdDev < idealRadius * 0.16) {
        // Construct perfect circular SVG/Points
        const perfectCirclePoints = [];
        const segments = 40;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            perfectCirclePoints.push({
                x: cx + Math.cos(angle) * idealRadius,
                y: cy + Math.sin(angle) * idealRadius,
                p: 1.0
            });
        }
        return { type: 'circle', points: perfectCirclePoints };
    }

    // 3. Rectangle/Square Detection
    let rectErrorSum = 0;
    points.forEach(pt => {
        // Distance to ideal rectangle boundaries
        const distToLeft = Math.abs(pt.x - minX);
        const distToRight = Math.abs(pt.x - maxX);
        const distToTop = Math.abs(pt.y - minY);
        const distToBottom = Math.abs(pt.y - maxY);

        rectErrorSum += Math.min(distToLeft, distToRight, distToTop, distToBottom);
    });
    const avgRectError = rectErrorSum / points.length;

    // If points lie perfectly on ideal boundary within a small error margin
    if (avgRectError < Math.min(w, h) * 0.14) {
        const perfectRectPoints = [
            { x: minX, y: minY, p: 1.0 },
            { x: maxX, y: minY, p: 1.0 },
            { x: maxX, y: maxY, p: 1.0 },
            { x: minX, y: maxY, p: 1.0 },
            { x: minX, y: minY, p: 1.0 } // closed
        ];
        return { type: 'rectangle', points: perfectRectPoints };
    }

    // No iPad gesture match
    return null;
}
