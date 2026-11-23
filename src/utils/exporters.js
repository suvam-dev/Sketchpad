/**
 * Offline Export & Import utilities: PNG, Vector SVG, Multi-page PDF, and JSON Backup.
 */
import { renderPageToContext, PAPER_COLORS, resolveStrokeColor } from './drawingEngine';

function sanitizeFilename(name, fallback = 'scratchpad-note') {
  const clean = (name || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

function triggerDownload(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export active page as high-resolution PNG.
 */
export function exportPageToPng({
  page,
  width,
  height,
  panX,
  panY,
  zoom,
  darkMode,
  includePaper = true,
  imageCache = {},
}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');

  renderPageToContext(ctx, page, width, height, {
    panX,
    panY,
    zoom,
    dpr,
    darkMode,
    includePaper,
    imageCache,
  });

  const dataUrl = canvas.toDataURL('image/png');
  triggerDownload(dataUrl, `${sanitizeFilename(page?.title, 'page')}.png`);
}

/**
 * Export active page as clean, scalable Vector SVG.
 */
export function exportPageToSvg({
  page,
  width,
  height,
  panX,
  panY,
  zoom,
  darkMode,
  includePaper = true,
}) {
  const palette = darkMode ? PAPER_COLORS.dark : PAPER_COLORS.light;
  const strokes = page?.strokes || [];
  const images = page?.images || [];

  const svgParts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}">`,
  ];

  if (includePaper) {
    svgParts.push(`<rect width="100%" height="100%" fill="${palette.bg}" />`);
  }

  svgParts.push(`<g transform="scale(${zoom}) translate(${panX}, ${panY})">`);

  // Embedded images
  images.forEach((img) => {
    svgParts.push(
      `<image href="${img.src}" x="${img.x}" y="${img.y}" width="${img.width}" height="${img.height}" preserveAspectRatio="none" />`
    );
  });

  // Vector strokes
  strokes.forEach((stroke) => {
    if (!stroke.points || stroke.points.length === 0) return;
    if (stroke.tool === 'eraser') return; // SVG export omits destination-out strokes cleanly

    const pts = stroke.points;
    const color = resolveStrokeColor(stroke.color, darkMode, stroke.tool);
    const opacity =
      stroke.tool === 'highlighter'
        ? stroke.opacity ?? 0.36
        : stroke.tool === 'pencil'
        ? stroke.opacity ?? 0.78
        : stroke.opacity ?? 1;

    if (pts.length === 1) {
      const r = (stroke.width || 2) / 2;
      svgParts.push(
        `<circle cx="${pts[0].x.toFixed(2)}" cy="${pts[0].y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" fill-opacity="${opacity}" />`
      );
      return;
    }

    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i].x + pts[i + 1].x) / 2).toFixed(2);
      const my = ((pts[i].y + pts[i + 1].y) / 2).toFixed(2);
      d += ` Q ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)} ${mx} ${my}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;

    const cap = stroke.tool === 'highlighter' ? 'butt' : 'round';
    const w = stroke.width || 2;
    const dashAttr =
      stroke.strokeStyle === 'dashed'
        ? ` stroke-dasharray="${Math.max(4, w * 2.8)} ${Math.max(4, w * 2.1)}"`
        : stroke.strokeStyle === 'dotted'
        ? ` stroke-dasharray="0.5 ${Math.max(4, w * 2.1)}"`
        : '';
    const fillAttr =
      stroke.fill && stroke.isShape
        ? ` fill="${color}" fill-opacity="0.14"`
        : ' fill="none"';

    svgParts.push(
      `<path d="${d}"${fillAttr} stroke="${color}" stroke-width="${w.toFixed(2)}" stroke-linecap="${cap}" stroke-linejoin="round" stroke-opacity="${opacity}"${dashAttr} />`
    );
  });

  svgParts.push('</g></svg>');

  const blob = new Blob([svgParts.join('\n')], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${sanitizeFilename(page?.title, 'page')}.svg`);
  URL.revokeObjectURL(url);
}

/**
 * Export entire notebook as a multi-page PDF using jsPDF (if loaded).
 */
export function exportNotebookToPdf({
  notebook,
  width,
  height,
  darkMode,
  includePaper = true,
  imageCache = {},
}) {
  if (!notebook || !notebook.pages || notebook.pages.length === 0) {
    throw new Error('No pages available to export.');
  }

  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    throw new Error('PDF export requires jsPDF to be loaded. Try PNG or SVG export while offline.');
  }

  const pdfWidth = Math.max(600, Math.round(width || 1024));
  const pdfHeight = Math.max(400, Math.round(height || 768));
  const orientation = pdfWidth >= pdfHeight ? 'landscape' : 'portrait';
  const doc = new jsPDF(orientation, 'px', [pdfWidth, pdfHeight]);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  notebook.pages.forEach((page, index) => {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = Math.round(pdfWidth * dpr);
    offCanvas.height = Math.round(pdfHeight * dpr);
    const ctx = offCanvas.getContext('2d');

    renderPageToContext(ctx, page, pdfWidth, pdfHeight, {
      panX: page.panX || 0,
      panY: page.panY || 0,
      zoom: page.zoom || 1,
      dpr,
      darkMode,
      includePaper,
      imageCache,
    });

    const imgData = offCanvas.toDataURL('image/jpeg', 0.88);
    if (index > 0) {
      doc.addPage([pdfWidth, pdfHeight], orientation);
    }
    doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  });

  doc.save(`${sanitizeFilename(notebook.title, 'notebook')}.pdf`);
}

/**
 * Export all notebooks as a portable JSON backup.
 */
export function exportNotebooksToJson(notebooks) {
  const payload = JSON.stringify(notebooks, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().split('T')[0];
  triggerDownload(url, `scratchpad-backup-${dateStr}.json`);
  URL.revokeObjectURL(url);
}
