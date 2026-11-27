/**
 * Rendering, geometry, hit-testing, SVG export, and SQL DDL generation
 * for structured canvas elements: Text boxes, Tables, Schema/ER entities,
 * and Relationship connectors.
 */

export const FONT_FAMILIES = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  hand: '"Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive',
};

export const DATA_TYPE_PRESETS = [
  'uuid',
  'serial',
  'int',
  'bigint',
  'varchar',
  'text',
  'boolean',
  'timestamp',
  'date',
  'float',
  'decimal',
  'jsonb',
];

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getFontString({ fontSize = 18, fontFamily = 'sans', fontWeight = 'normal', fontStyle = 'normal' }) {
  const family = FONT_FAMILIES[fontFamily] || FONT_FAMILIES.sans;
  return `${fontStyle === 'italic' ? 'italic ' : ''}${fontWeight === 'bold' ? '600 ' : '400 '}${fontSize}px ${family}`;
}

function wrapTextLines(ctx, text, maxWidth) {
  const rawParagraphs = String(text ?? '').split('\n');
  const lines = [];
  const safeMax = Math.max(24, maxWidth);

  for (let p = 0; p < rawParagraphs.length; p++) {
    const para = rawParagraphs[p];
    if (para === '') {
      lines.push('');
      continue;
    }
    const words = para.split(/(\s+)/);
    let current = '';

    for (let i = 0; i < words.length; i++) {
      const token = words[i];
      const test = current + token;
      if (ctx.measureText(test).width <= safeMax || current === '') {
        current = test;
      } else {
        lines.push(current.trimEnd());
        current = token.trimStart();
      }
    }
    if (current !== '' || para.length === 0) {
      lines.push(current);
    }
  }
  return lines.length > 0 ? lines : [''];
}

/* ==========================================================================
   Selection & Lock Overlays
   ========================================================================== */

export function renderSelectionBox(ctx, x, y, width, height, { isSelected, locked, zoom = 1, showSideHandles = false }) {
  if (!isSelected && !locked) return;
  ctx.save();
  if (locked) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);

    const badgeSize = 20 / zoom;
    const bx = x + width - badgeSize - 5 / zoom;
    const by = y + 5 / zoom;
    ctx.fillStyle = 'rgba(17, 18, 20, 0.8)';
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeSize, badgeSize, 5 / zoom);
    ctx.fill();

    const cx = bx + badgeSize / 2;
    const cy = by + badgeSize / 2;
    const lw = badgeSize * 0.44;
    const lh = badgeSize * 0.34;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.arc(cx, cy - lh * 0.32, lw * 0.38, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(cx - lw / 2, cy - lh * 0.15, lw, lh * 1.05, 2 / zoom);
    ctx.fill();
  } else if (isSelected) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([5 / zoom, 4 / zoom]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);

    const hs = 8.5 / zoom;
    const handles = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height],
    ];
    if (showSideHandles) {
      handles.push([x + width, y + height / 2]);
      handles.push([x, y + height / 2]);
    }
    handles.forEach(([hx, hy]) => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.7 / zoom;
      ctx.beginPath();
      ctx.roundRect(hx - hs / 2, hy - hs / 2, hs, hs, 2.2 / zoom);
      ctx.fill();
      ctx.stroke();
    });
  }
  ctx.restore();
}

/* ==========================================================================
   1. Text Box Elements
   ========================================================================== */

export function getTextMetrics(ctx, txt) {
  const fontSize = txt.fontSize || 18;
  const lineHeight = fontSize * 1.38;
  const width = Math.max(80, txt.width || 240);
  const padX = 8;
  const padY = 6;

  ctx.save();
  ctx.font = getFontString(txt);
  const lines = wrapTextLines(ctx, txt.text || '', width - padX * 2);
  ctx.restore();

  const height = Math.max(fontSize * 1.4 + padY * 2, lines.length * lineHeight + padY * 2);
  return { width, height, lines, lineHeight, padX, padY };
}

export function renderTextElement(ctx, txt, { darkMode, isSelected, zoom, isEditing, resolveColor }) {
  const metrics = getTextMetrics(ctx, txt);
  const color = resolveColor ? resolveColor(txt.color, darkMode, 'pen') : txt.color;

  ctx.save();
  if (!isEditing) {
    ctx.font = getFontString(txt);
    ctx.fillStyle = color || (darkMode ? '#f8fafc' : '#1e1e1e');
    ctx.textBaseline = 'top';
    const align = txt.textAlign || 'left';
    ctx.textAlign = align;

    const textX =
      align === 'center'
        ? txt.x + metrics.width / 2
        : align === 'right'
        ? txt.x + metrics.width - metrics.padX
        : txt.x + metrics.padX;

    metrics.lines.forEach((line, idx) => {
      ctx.fillText(line, textX, txt.y + metrics.padY + idx * metrics.lineHeight);
    });
  }

  renderSelectionBox(ctx, txt.x, txt.y, metrics.width, metrics.height, {
    isSelected: isSelected && !isEditing,
    locked: txt.locked,
    zoom,
    showSideHandles: true,
  });
  ctx.restore();
}

/* ==========================================================================
   2. Table Elements
   ========================================================================== */

export function getTableMetrics(ctx, table) {
  const colWidths = Array.isArray(table.colWidths) && table.colWidths.length > 0
    ? table.colWidths
    : [130, 130, 130];
  const rows = Array.isArray(table.rows) && table.rows.length > 0
    ? table.rows
    : [['Column 1', 'Column 2', 'Column 3']];

  const baseRowH = table.rowHeight || 34;
  const fontSize = table.fontSize || 13.5;
  const lineHeight = fontSize * 1.32;
  const padX = 10;
  const padY = 8;

  ctx.save();
  const rowHeights = rows.map((row, rIdx) => {
    const isHeader = table.headerRow && rIdx === 0;
    ctx.font = getFontString({
      fontSize,
      fontFamily: 'sans',
      fontWeight: isHeader ? 'bold' : 'normal',
    });
    let maxLines = 1;
    colWidths.forEach((cw, cIdx) => {
      const cellText = row[cIdx] ?? '';
      if (cellText) {
        const lines = wrapTextLines(ctx, cellText, Math.max(24, cw - padX * 2));
        if (lines.length > maxLines) maxLines = lines.length;
      }
    });
    return Math.max(baseRowH, maxLines * lineHeight + padY * 2);
  });
  ctx.restore();

  const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);
  const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0);

  return { colWidths, rowHeights, totalWidth, totalHeight, fontSize, lineHeight, padX, padY };
}

export function hitTestTableCell(ctx, table, worldX, worldY) {
  const m = getTableMetrics(ctx, table);
  if (
    worldX < table.x ||
    worldX > table.x + m.totalWidth ||
    worldY < table.y ||
    worldY > table.y + m.totalHeight
  ) {
    return null;
  }

  let curY = table.y;
  let foundRow = -1;
  let cellY = table.y;
  let cellH = m.rowHeights[0];

  for (let r = 0; r < m.rowHeights.length; r++) {
    const rh = m.rowHeights[r];
    if (worldY >= curY && worldY <= curY + rh) {
      foundRow = r;
      cellY = curY;
      cellH = rh;
      break;
    }
    curY += rh;
  }

  let curX = table.x;
  let foundCol = -1;
  let cellX = table.x;
  let cellW = m.colWidths[0];

  for (let c = 0; c < m.colWidths.length; c++) {
    const cw = m.colWidths[c];
    if (worldX >= curX && worldX <= curX + cw) {
      foundCol = c;
      cellX = curX;
      cellW = cw;
      break;
    }
    curX += cw;
  }

  if (foundRow === -1 || foundCol === -1) return null;
  return { row: foundRow, col: foundCol, rect: { x: cellX, y: cellY, width: cellW, height: cellH } };
}

export function renderTableElement(ctx, table, { darkMode, isSelected, zoom, editingCell, resolveColor }) {
  const m = getTableMetrics(ctx, table);
  const accent = resolveColor ? resolveColor(table.color || '#3b82f6', darkMode, 'pen') : (table.color || '#3b82f6');
  const surfaceBg = darkMode ? '#15181e' : '#ffffff';
  const headerBg = darkMode ? 'rgba(59, 130, 246, 0.16)' : 'rgba(37, 99, 235, 0.08)';
  const borderCol = darkMode ? 'rgba(255, 255, 255, 0.16)' : 'rgba(15, 23, 42, 0.16)';
  const textCol = darkMode ? '#f8fafc' : '#0f172a';
  const radius = 8;

  ctx.save();
  // Card background
  ctx.fillStyle = surfaceBg;
  ctx.beginPath();
  ctx.roundRect(table.x, table.y, m.totalWidth, m.totalHeight, radius);
  ctx.fill();

  // Clip interior for header shading & grid lines
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(table.x, table.y, m.totalWidth, m.totalHeight, radius);
  ctx.clip();

  if (table.headerRow && m.rowHeights.length > 0) {
    ctx.fillStyle = table.color ? `${accent}22` : headerBg;
    ctx.fillRect(table.x, table.y, m.totalWidth, m.rowHeights[0]);
  }

  // Grid lines
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1;

  let curY = table.y;
  for (let r = 0; r < m.rowHeights.length - 1; r++) {
    curY += m.rowHeights[r];
    ctx.beginPath();
    ctx.moveTo(table.x, curY);
    ctx.lineTo(table.x + m.totalWidth, curY);
    ctx.stroke();
  }

  let curX = table.x;
  for (let c = 0; c < m.colWidths.length - 1; c++) {
    curX += m.colWidths[c];
    ctx.beginPath();
    ctx.moveTo(curX, table.y);
    ctx.lineTo(curX, table.y + m.totalHeight);
    ctx.stroke();
  }

  // Cell texts
  let cellY = table.y;
  const rows = table.rows || [];
  for (let r = 0; r < rows.length; r++) {
    const rh = m.rowHeights[r];
    const isHeader = table.headerRow && r === 0;
    ctx.font = getFontString({
      fontSize: m.fontSize,
      fontFamily: 'sans',
      fontWeight: isHeader ? 'bold' : 'normal',
    });
    ctx.fillStyle = textCol;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let cellX = table.x;
    for (let c = 0; c < m.colWidths.length; c++) {
      const cw = m.colWidths[c];
      const isEditingThis = editingCell && editingCell.tableId === table.id && editingCell.row === r && editingCell.col === c;
      if (!isEditingThis) {
        const val = rows[r]?.[c] ?? '';
        if (val) {
          const lines = wrapTextLines(ctx, val, Math.max(24, cw - m.padX * 2));
          lines.forEach((line, lIdx) => {
            ctx.fillText(line, cellX + m.padX, cellY + m.padY + lIdx * m.lineHeight);
          });
        }
      }
      cellX += cw;
    }
    cellY += rh;
  }

  ctx.restore();

  // Outer border
  ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.2)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.roundRect(table.x, table.y, m.totalWidth, m.totalHeight, radius);
  ctx.stroke();

  renderSelectionBox(ctx, table.x, table.y, m.totalWidth, m.totalHeight, {
    isSelected,
    locked: table.locked,
    zoom,
  });

  ctx.restore();
}

/* ==========================================================================
   3. Schema / ER Entity Nodes
   ========================================================================== */

export function getSchemaMetrics(schema) {
  const width = Math.max(210, schema.width || 256);
  const headerHeight = 36;
  const rowHeight = 28;
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const rowCount = Math.max(1, fields.length);
  const bottomPad = 6;
  const height = headerHeight + rowCount * rowHeight + bottomPad;

  const anchors = {
    top: { x: schema.x + width / 2, y: schema.y },
    right: { x: schema.x + width, y: schema.y + height / 2 },
    bottom: { x: schema.x + width / 2, y: schema.y + height },
    left: { x: schema.x, y: schema.y + height / 2 },
  };

  return { width, height, headerHeight, rowHeight, bottomPad, anchors };
}

export function renderSchemaElement(ctx, schema, { darkMode, isSelected, zoom, showAnchors = false, resolveColor }) {
  const m = getSchemaMetrics(schema);
  const accent = resolveColor ? resolveColor(schema.color || '#3b82f6', darkMode, 'pen') : (schema.color || '#3b82f6');
  const cardBg = darkMode ? '#15181e' : '#ffffff';
  const dividerCol = darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
  const outerBorder = darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 23, 42, 0.18)';
  const textCol = darkMode ? '#f8fafc' : '#0f172a';
  const mutedCol = darkMode ? '#94a3b8' : '#64748b';
  const radius = 10;

  ctx.save();
  // Subtle elevation shadow
  ctx.shadowColor = darkMode ? 'rgba(0,0,0,0.45)' : 'rgba(15,23,42,0.1)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  ctx.fillStyle = cardBg;
  ctx.beginPath();
  ctx.roundRect(schema.x, schema.y, m.width, m.height, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Clip interior
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(schema.x, schema.y, m.width, m.height, radius);
  ctx.clip();

  // Header tint
  ctx.fillStyle = `${accent}24`;
  ctx.fillRect(schema.x, schema.y, m.width, m.headerHeight);

  // Top accent strip
  ctx.fillStyle = accent;
  ctx.fillRect(schema.x, schema.y, m.width, 3);

  // Header divider
  ctx.strokeStyle = dividerCol;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(schema.x, schema.y + m.headerHeight);
  ctx.lineTo(schema.x + m.width, schema.y + m.headerHeight);
  ctx.stroke();

  // Entity name
  ctx.font = getFontString({ fontSize: 13.5, fontFamily: 'sans', fontWeight: 'bold' });
  ctx.fillStyle = textCol;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(schema.name || 'untitled_table', schema.x + 12, schema.y + m.headerHeight / 2 + 1, m.width - 66);

  // Subtle ENTITY pill on right of header
  ctx.font = getFontString({ fontSize: 9.5, fontFamily: 'mono', fontWeight: 'bold' });
  ctx.fillStyle = accent;
  ctx.textAlign = 'right';
  ctx.fillText('TABLE', schema.x + m.width - 10, schema.y + m.headerHeight / 2 + 1);

  // Fields
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  if (fields.length === 0) {
    ctx.font = getFontString({ fontSize: 12, fontFamily: 'sans', fontStyle: 'italic' });
    ctx.fillStyle = mutedCol;
    ctx.textAlign = 'left';
    ctx.fillText('Double-click to add fields', schema.x + 12, schema.y + m.headerHeight + m.rowHeight / 2);
  } else {
    fields.forEach((field, idx) => {
      const ry = schema.y + m.headerHeight + idx * m.rowHeight;
      const midY = ry + m.rowHeight / 2;

      if (idx > 0) {
        ctx.strokeStyle = dividerCol;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(schema.x + 10, ry);
        ctx.lineTo(schema.x + m.width - 10, ry);
        ctx.stroke();
      }

      let leftOffset = schema.x + 12;

      // PK / FK badge
      if (field.isPK || field.isFK) {
        const badgeText = field.isPK ? 'PK' : 'FK';
        const badgeColor = field.isPK ? '#f59e0b' : '#38bdf8';
        ctx.fillStyle = `${badgeColor}26`;
        ctx.beginPath();
        ctx.roundRect(leftOffset, midY - 8, 22, 16, 4);
        ctx.fill();

        ctx.font = getFontString({ fontSize: 9.5, fontFamily: 'mono', fontWeight: 'bold' });
        ctx.fillStyle = badgeColor;
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, leftOffset + 11, midY + 0.5);
        leftOffset += 28;
      }

      // Field type on right
      const flags = [];
      if (field.isUnique) flags.push('UQ');
      if (field.isNullable) flags.push('?');
      const typeLabel = `${field.type || 'text'}${flags.length ? ` ${flags.join(' ')}` : ''}`;

      ctx.font = getFontString({ fontSize: 11.5, fontFamily: 'mono' });
      ctx.fillStyle = mutedCol;
      ctx.textAlign = 'right';
      const typeW = Math.min(96, ctx.measureText(typeLabel).width + 4);
      ctx.fillText(typeLabel, schema.x + m.width - 12, midY + 0.5, 96);

      // Field name on left
      const maxNameW = Math.max(40, schema.x + m.width - 16 - typeW - leftOffset);
      ctx.font = getFontString({
        fontSize: 12.5,
        fontFamily: 'sans',
        fontWeight: field.isPK ? 'bold' : 'normal',
      });
      ctx.fillStyle = textCol;
      ctx.textAlign = 'left';
      ctx.fillText(field.name || 'column', leftOffset, midY + 0.5, maxNameW);
    });
  }

  ctx.restore();

  // Outer card border
  ctx.strokeStyle = isSelected ? '#3b82f6' : outerBorder;
  ctx.lineWidth = isSelected ? 2 / zoom : 1.25;
  ctx.beginPath();
  ctx.roundRect(schema.x, schema.y, m.width, m.height, radius);
  ctx.stroke();

  if (schema.locked) {
    renderSelectionBox(ctx, schema.x, schema.y, m.width, m.height, {
      isSelected: false,
      locked: true,
      zoom,
    });
  } else if (isSelected || showAnchors) {
    // Draw connector anchor ports on top, right, bottom, left
    const portR = 5.5 / zoom;
    Object.values(m.anchors).forEach((pt) => {
      ctx.fillStyle = '#3b82f6';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6 / zoom;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, portR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  ctx.restore();
}

/* ==========================================================================
   4. Schema Relationship Connectors (1:1, 1:N, N:1, N:M)
   ========================================================================== */

function pickAutoSides(fromSchema, toSchema) {
  const fm = getSchemaMetrics(fromSchema);
  const tm = getSchemaMetrics(toSchema);
  const fcx = fromSchema.x + fm.width / 2;
  const fcy = fromSchema.y + fm.height / 2;
  const tcx = toSchema.x + tm.width / 2;
  const tcy = toSchema.y + tm.height / 2;

  const dx = tcx - fcx;
  const dy = tcy - fcy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' };
  }
  return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' };
}

function sideNormal(side) {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    default:
      return { x: 1, y: 0 };
  }
}

export function getRelationGeometry(relation, schemas) {
  const fromSchema = schemas.find((s) => s.id === relation.fromId);
  const toSchema = schemas.find((s) => s.id === relation.toId);
  if (!fromSchema || !toSchema) return null;

  const fm = getSchemaMetrics(fromSchema);
  const tm = getSchemaMetrics(toSchema);

  const auto = pickAutoSides(fromSchema, toSchema);
  const fromSide = relation.fromSide && relation.fromSide !== 'auto' ? relation.fromSide : auto.fromSide;
  const toSide = relation.toSide && relation.toSide !== 'auto' ? relation.toSide : auto.toSide;

  const p1 = fm.anchors[fromSide] || fm.anchors.right;
  const p2 = tm.anchors[toSide] || tm.anchors.left;

  const n1 = sideNormal(fromSide);
  const n2 = sideNormal(toSide);
  const stub = 24;

  const s1 = { x: p1.x + n1.x * stub, y: p1.y + n1.y * stub };
  const s2 = { x: p2.x + n2.x * stub, y: p2.y + n2.y * stub };

  const points = [p1, s1];
  if (fromSide === 'left' || fromSide === 'right') {
    if (toSide === 'left' || toSide === 'right') {
      const midX = (s1.x + s2.x) / 2;
      points.push({ x: midX, y: s1.y }, { x: midX, y: s2.y });
    } else {
      points.push({ x: s2.x, y: s1.y });
    }
  } else {
    if (toSide === 'top' || toSide === 'bottom') {
      const midY = (s1.y + s2.y) / 2;
      points.push({ x: s1.x, y: midY }, { x: s2.x, y: midY });
    } else {
      points.push({ x: s1.x, y: s2.y });
    }
  }
  points.push(s2, p2);

  // Midpoint for label pill
  const midIdx = Math.floor(points.length / 2);
  const a = points[midIdx - 1];
  const b = points[midIdx];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  return { points, mid, fromSide, toSide, p1, p2, n1, n2 };
}

function drawCrowsFootEndpoint(ctx, pt, normal, isMany) {
  // normal points outward from entity
  const perpX = -normal.y;
  const perpY = normal.x;
  const tipX = pt.x;
  const tipY = pt.y;
  const backX = pt.x + normal.x * 12;
  const backY = pt.y + normal.y * 12;

  ctx.beginPath();
  if (isMany) {
    // Three-prong crow's foot
    ctx.moveTo(backX, backY);
    ctx.lineTo(tipX + perpX * 6, tipY + perpY * 6);
    ctx.moveTo(backX, backY);
    ctx.lineTo(tipX, tipY);
    ctx.moveTo(backX, backY);
    ctx.lineTo(tipX - perpX * 6, tipY - perpY * 6);
  } else {
    // Single perpendicular bar for '1'
    const barX = pt.x + normal.x * 8;
    const barY = pt.y + normal.y * 8;
    ctx.moveTo(barX + perpX * 6, barY + perpY * 6);
    ctx.lineTo(barX - perpX * 6, barY - perpY * 6);
  }
  ctx.stroke();
}

export function renderRelationElement(ctx, relation, schemas, { darkMode, isSelected, zoom, resolveColor }) {
  const geom = getRelationGeometry(relation, schemas);
  if (!geom) return;

  const color = isSelected
    ? '#3b82f6'
    : resolveColor
    ? resolveColor(relation.color || '#3b82f6', darkMode, 'pen')
    : relation.color || '#3b82f6';

  const card = relation.cardinality || '1:N';
  const [leftCard, rightCard] = card.split(':');
  const fromMany = leftCard === 'N' || leftCard === 'M';
  const toMany = rightCard === 'N' || rightCard === 'M';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = isSelected ? 2.4 : 1.75;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(geom.points[0].x, geom.points[0].y);
  for (let i = 1; i < geom.points.length; i++) {
    ctx.lineTo(geom.points[i].x, geom.points[i].y);
  }
  ctx.stroke();

  drawCrowsFootEndpoint(ctx, geom.p1, geom.n1, fromMany);
  drawCrowsFootEndpoint(ctx, geom.p2, geom.n2, toMany);

  // Label / cardinality pill at midpoint
  const badgeText = relation.label ? `${card} · ${relation.label}` : card;
  ctx.font = getFontString({ fontSize: 11, fontFamily: 'mono', fontWeight: 'bold' });
  const textW = ctx.measureText(badgeText).width;
  const pillW = textW + 14;
  const pillH = 20;

  ctx.fillStyle = darkMode ? '#15181e' : '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = isSelected ? 1.8 : 1.2;
  ctx.beginPath();
  ctx.roundRect(geom.mid.x - pillW / 2, geom.mid.y - pillH / 2, pillW, pillH, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, geom.mid.x, geom.mid.y + 0.5);

  if (isSelected) {
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(geom.p1.x, geom.p1.y, 4 / zoom, 0, Math.PI * 2);
    ctx.arc(geom.p2.x, geom.p2.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function hitTestRelation(relation, schemas, worldX, worldY, tolerance = 10) {
  const geom = getRelationGeometry(relation, schemas);
  if (!geom) return false;
  if (Math.hypot(worldX - geom.mid.x, worldY - geom.mid.y) <= Math.max(tolerance, 18)) {
    return true;
  }
  const pts = geom.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq > 0) {
      const t = Math.max(0, Math.min(1, ((worldX - a.x) * dx + (worldY - a.y) * dy) / lenSq));
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      if (Math.hypot(worldX - px, worldY - py) <= tolerance) {
        return true;
      }
    }
  }
  return false;
}

/* ==========================================================================
   5. SVG Export Helpers
   ========================================================================== */

export function structuredElementsToSvg(page, darkMode, resolveColor) {
  const parts = [];
  const tempCanvas = document.createElement('canvas');
  const ctx = tempCanvas.getContext('2d');

  // Relations
  (page.relations || []).forEach((rel) => {
    const geom = getRelationGeometry(rel, page.schemas || []);
    if (!geom) return;
    const color = resolveColor(rel.color || '#3b82f6', darkMode, 'pen');
    const d = geom.points
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" />`);
    const badgeText = rel.label ? `${rel.cardinality || '1:N'} · ${rel.label}` : (rel.cardinality || '1:N');
    parts.push(
      `<text x="${geom.mid.x.toFixed(1)}" y="${geom.mid.y.toFixed(1)}" fill="${color}" font-size="11" font-family="monospace" font-weight="600" text-anchor="middle" dominant-baseline="central">${escapeXml(badgeText)}</text>`
    );
  });

  // Tables
  (page.tables || []).forEach((table) => {
    const m = getTableMetrics(ctx, table);
    const accent = resolveColor(table.color || '#3b82f6', darkMode, 'pen');
    const bg = darkMode ? '#15181e' : '#ffffff';
    const border = darkMode ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.2)';
    const textCol = darkMode ? '#f8fafc' : '#0f172a';
    parts.push(
      `<rect x="${table.x}" y="${table.y}" width="${m.totalWidth}" height="${m.totalHeight}" rx="8" fill="${bg}" stroke="${border}" stroke-width="1.25" />`
    );
    if (table.headerRow && m.rowHeights.length > 0) {
      parts.push(
        `<rect x="${table.x}" y="${table.y}" width="${m.totalWidth}" height="${m.rowHeights[0]}" rx="4" fill="${accent}" fill-opacity="0.14" />`
      );
    }
    let cy = table.y;
    (table.rows || []).forEach((row, r) => {
      const rh = m.rowHeights[r];
      if (r > 0) {
        parts.push(`<line x1="${table.x}" y1="${cy}" x2="${table.x + m.totalWidth}" y2="${cy}" stroke="${border}" />`);
      }
      let cx = table.x;
      m.colWidths.forEach((cw, c) => {
        if (r === 0 && c > 0) {
          parts.push(`<line x1="${cx}" y1="${table.y}" x2="${cx}" y2="${table.y + m.totalHeight}" stroke="${border}" />`);
        }
        const val = row[c] ?? '';
        if (val) {
          const weight = table.headerRow && r === 0 ? '600' : '400';
          parts.push(
            `<text x="${cx + m.padX}" y="${cy + m.padY + m.fontSize * 0.85}" fill="${textCol}" font-size="${m.fontSize}" font-family="sans-serif" font-weight="${weight}">${escapeXml(val)}</text>`
          );
        }
        cx += cw;
      });
      cy += rh;
    });
  });

  // Schemas
  (page.schemas || []).forEach((schema) => {
    const m = getSchemaMetrics(schema);
    const accent = resolveColor(schema.color || '#3b82f6', darkMode, 'pen');
    const bg = darkMode ? '#15181e' : '#ffffff';
    const border = darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.18)';
    const textCol = darkMode ? '#f8fafc' : '#0f172a';
    const mutedCol = darkMode ? '#94a3b8' : '#64748b';
    parts.push(
      `<rect x="${schema.x}" y="${schema.y}" width="${m.width}" height="${m.height}" rx="10" fill="${bg}" stroke="${border}" stroke-width="1.25" />`
    );
    parts.push(
      `<rect x="${schema.x}" y="${schema.y}" width="${m.width}" height="${m.headerHeight}" rx="6" fill="${accent}" fill-opacity="0.16" />`
    );
    parts.push(
      `<text x="${schema.x + 12}" y="${schema.y + m.headerHeight / 2 + 4}" fill="${textCol}" font-size="13.5" font-family="sans-serif" font-weight="600">${escapeXml(schema.name || 'untitled_table')}</text>`
    );
    (schema.fields || []).forEach((f, idx) => {
      const fy = schema.y + m.headerHeight + idx * m.rowHeight + m.rowHeight / 2 + 4;
      const prefix = f.isPK ? '[PK] ' : f.isFK ? '[FK] ' : '';
      parts.push(
        `<text x="${schema.x + 12}" y="${fy}" fill="${textCol}" font-size="12" font-family="sans-serif">${escapeXml(prefix + (f.name || 'column'))}</text>`
      );
      parts.push(
        `<text x="${schema.x + m.width - 12}" y="${fy}" fill="${mutedCol}" font-size="11" font-family="monospace" text-anchor="end">${escapeXml(f.type || 'text')}</text>`
      );
    });
  });

  // Texts
  (page.texts || []).forEach((txt) => {
    const metrics = getTextMetrics(ctx, txt);
    const color = resolveColor(txt.color, darkMode, 'pen') || (darkMode ? '#f8fafc' : '#1e1e1e');
    const align = txt.textAlign || 'left';
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const tx =
      align === 'center'
        ? txt.x + metrics.width / 2
        : align === 'right'
        ? txt.x + metrics.width - metrics.padX
        : txt.x + metrics.padX;
    const family = FONT_FAMILIES[txt.fontFamily] || FONT_FAMILIES.sans;
    metrics.lines.forEach((line, idx) => {
      const ty = txt.y + metrics.padY + idx * metrics.lineHeight + (txt.fontSize || 18) * 0.85;
      parts.push(
        `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="${color}" font-size="${txt.fontSize || 18}" font-family="${escapeXml(family)}" font-weight="${txt.fontWeight === 'bold' ? '600' : '400'}" font-style="${txt.fontStyle === 'italic' ? 'italic' : 'normal'}" text-anchor="${anchor}">${escapeXml(line)}</text>`
      );
    });
  });

  return parts;
}

/* ==========================================================================
   6. Offline SQL DDL Generator
   ========================================================================== */

function sanitizeSqlIdent(name, fallback = 'untitled') {
  const clean = String(name || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || fallback;
}

export function generateSchemaSql(schema, allSchemas = [], relations = []) {
  const tableName = sanitizeSqlIdent(schema.name, 'table_name');
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const lines = fields.map((f) => {
    const colName = sanitizeSqlIdent(f.name, 'col');
    const colType = (f.type || 'text').toUpperCase();
    const constraints = [];
    if (f.isPK) constraints.push('PRIMARY KEY');
    if (!f.isNullable && !f.isPK) constraints.push('NOT NULL');
    if (f.isUnique && !f.isPK) constraints.push('UNIQUE');
    return `  ${colName} ${colType}${constraints.length ? ' ' + constraints.join(' ') : ''}`;
  });

  // Add foreign key comments/hints from connected relations
  relations
    .filter((r) => r.fromId === schema.id || r.toId === schema.id)
    .forEach((r) => {
      const otherId = r.fromId === schema.id ? r.toId : r.fromId;
      const other = allSchemas.find((s) => s.id === otherId);
      if (other) {
        lines.push(`  -- Relation (${r.cardinality || '1:N'}) -> ${sanitizeSqlIdent(other.name)}${r.label ? `: ${r.label}` : ''}`);
      }
    });

  return `CREATE TABLE ${tableName} (\n${lines.join(',\n')}\n);`;
}

export function generateAllSchemasSql(schemas = [], relations = []) {
  if (!schemas.length) return '';
  return schemas.map((s) => generateSchemaSql(s, schemas, relations)).join('\n\n');
}
