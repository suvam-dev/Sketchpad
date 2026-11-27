import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenTool,
  Pencil,
  Highlighter,
  Shapes,
  Type,
  Table2,
  Database,
  Eraser,
  MousePointer2,
  Hand,
  Image as ImageIcon,
  Lock,
  Unlock,
  Trash2,
  Sparkles,
  Plus,
  Minus,
  GripVertical,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowRightLeft,
  SlidersHorizontal,
  Copy,
  X,
} from 'lucide-react';

// Excalidraw & tldraw inspired crisp, high-contrast palettes
const DARK_SWATCHES = [
  '#f8fafc', // White
  '#94a3b8', // Slate
  '#ff6b6b', // Red
  '#ffa94d', // Orange
  '#ffd43b', // Yellow
  '#51cf66', // Green
  '#20c997', // Teal
  '#4dabf7', // Blue
  '#38bdf8', // Sky
  '#f06595', // Rose
];

const LIGHT_SWATCHES = [
  '#1e1e1e', // Black
  '#868e96', // Gray
  '#e03131', // Red
  '#f08c00', // Orange
  '#eab308', // Yellow
  '#2f9e44', // Green
  '#099268', // Teal
  '#1971c2', // Blue
  '#0ea5e9', // Sky
  '#e64980', // Rose
];

const HIGHLIGHTER_SWATCHES = [
  '#fef08a', // Yellow
  '#bbf7d0', // Green
  '#bae6fd', // Blue
  '#fbcfe8', // Pink
  '#fed7aa', // Orange
  '#cbd5e1', // Gray
];

const WIDTH_PRESETS = {
  pen: [1.5, 3, 5.5, 10],
  pencil: [1.2, 2.2, 3.8, 6],
  highlighter: [12, 18, 24, 34],
  eraser: [10, 20, 34, 52],
  shape: [1.5, 3, 5, 8],
};

const TOOLS = [
  { id: 'pen', label: 'Pen (P)', icon: PenTool },
  { id: 'pencil', label: 'Pencil (C)', icon: Pencil },
  { id: 'highlighter', label: 'Highlighter (H)', icon: Highlighter },
  { id: 'shape', label: 'Shapes (S)', icon: Shapes },
  { id: 'text', label: 'Text (T)', icon: Type },
  { id: 'table', label: 'Table (G)', icon: Table2 },
  { id: 'schema', label: 'Schema / ER Table (D)', icon: Database },
  { id: 'eraser', label: 'Eraser (E)', icon: Eraser },
  { id: 'select', label: 'Select & Move (V)', icon: MousePointer2 },
  { id: 'pan', label: 'Pan Infinite Canvas (Space)', icon: Hand },
];

// Uniform 18x18 geometric glyphs inspired by tldraw & Excalidraw
function ShapeGlyph({ type }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  switch (type) {
    case 'line':
      return (
        <svg {...common}>
          <line x1="3.5" y1="16.5" x2="16.5" y2="3.5" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...common}>
          <line x1="4" y1="16" x2="16" y2="4" />
          <polyline points="9.5 4 16 4 16 10.5" />
        </svg>
      );
    case 'doubleArrow':
      return (
        <svg {...common}>
          <line x1="3.5" y1="10" x2="16.5" y2="10" />
          <polyline points="7 6.5 3.5 10 7 13.5" />
          <polyline points="13 6.5 16.5 10 13 13.5" />
        </svg>
      );
    case 'axes':
      return (
        <svg {...common}>
          <polyline points="4 6 6 3.5 8 6" />
          <polyline points="14 12 16.5 14 14 16" />
          <polyline points="6 3.5 6 14 16.5 14" />
        </svg>
      );
    case 'rectangle':
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="13" height="11" />
        </svg>
      );
    case 'roundedRect':
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="13" height="11" rx="3" />
        </svg>
      );
    case 'circle':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6.5" />
        </svg>
      );
    case 'triangle':
      return (
        <svg {...common}>
          <polygon points="10 3.5 16.5 16 3.5 16" />
        </svg>
      );
    case 'curvedArrow':
      return (
        <svg {...common}>
          <path d="M4 15 Q 6 5 16 6" />
          <polyline points="12.5 3.2 16 6 12.8 9.2" />
        </svg>
      );
    case 'elbowArrow':
      return (
        <svg {...common}>
          <polyline points="4 15 10 15 10 5 16 5" />
          <polyline points="12.8 2.4 16 5 12.8 7.6" />
        </svg>
      );
    case 'diamond':
      return (
        <svg {...common}>
          <polygon points="10 3 17 10 10 17 3 10" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <polygon points="10 2.8 12.2 7.4 17.2 8.1 13.6 11.6 14.5 16.6 10 14.2 5.5 16.6 6.4 11.6 2.8 8.1 7.8 7.4" />
        </svg>
      );
    default:
      return null;
  }
}

const SHAPE_OPTIONS = [
  { id: 'line', label: 'Line' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'doubleArrow', label: 'Double Arrow' },
  { id: 'curvedArrow', label: 'Curved Arrow' },
  { id: 'elbowArrow', label: 'Elbow Arrow' },
  { id: 'axes', label: 'XY Axes' },
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'roundedRect', label: 'Rounded Box' },
  { id: 'circle', label: 'Ellipse / Circle' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'star', label: 'Star' },
];

const STROKE_STYLES = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

const FONT_OPTIONS = [
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Mono' },
  { id: 'hand', label: 'Hand' },
];

const TEXT_SIZES = [14, 18, 24, 32];

const TABLE_PRESETS = [
  { label: '2×2', rows: 2, cols: 2 },
  { label: '3×3', rows: 3, cols: 3 },
  { label: '4×3', rows: 4, cols: 3 },
  { label: '4×4', rows: 4, cols: 4 },
  { label: '5×4', rows: 5, cols: 4 },
];

const SCHEMA_TEMPLATES = [
  { id: 'blank', label: 'Blank Entity' },
  { id: 'users', label: 'Users' },
  { id: 'orders', label: 'Orders' },
  { id: 'posts', label: 'Posts' },
];

const CARDINALITIES = ['1:1', '1:N', 'N:1', 'N:M'];

export default function FloatingToolbar({
  currentTool,
  onSelectTool,
  currentColor,
  onChangeColor,
  currentWidth,
  onChangeWidth,
  currentGlow,
  onToggleGlow,
  shapeType,
  onChangeShapeType,
  strokeStyle,
  onChangeStrokeStyle,
  shapeFill,
  onToggleShapeFill,
  textStyle,
  onChangeTextStyle,
  tablePreset,
  onChangeTablePreset,
  schemaTemplate,
  onChangeSchemaTemplate,
  onCopyAllSql,
  darkMode,
  onUploadImage,
  onClearPage,
  selectedImage,
  selectedText,
  selectedTable,
  selectedSchema,
  selectedRelation,
  selectedStrokeIndex,
  onToggleImageLock,
  onDeleteSelectedImage,
  onDeleteSelectedStroke,
  onUpdateSelectedText,
  onToggleTextLock,
  onDeleteSelectedText,
  onTableAction,
  onOpenSchemaEditor,
  onStartConnectSchema,
  onToggleSchemaLock,
  onDeleteSelectedSchema,
  onUpdateRelation,
  onDeleteSelectedRelation,
  connectingFromId,
  onCancelConnect,
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef(null);
  const anchorRef = useRef(null);

  const isInkTool = ['pen', 'pencil', 'highlighter', 'shape'].includes(currentTool);
  const isStructuredTool = ['text', 'table', 'schema'].includes(currentTool);
  const hasProperties = isInkTool || isStructuredTool || currentTool === 'eraser';
  const swatches =
    currentTool === 'highlighter'
      ? HIGHLIGHTER_SWATCHES
      : darkMode
      ? DARK_SWATCHES
      : LIGHT_SWATCHES;
  const presets = WIDTH_PRESETS[currentTool] || WIDTH_PRESETS.pen;

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target)) {
        setPopoverOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  const handleGripPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    };

    const onMove = (ev) => {
      if (!dragStateRef.current) return;
      const dx = ev.clientX - dragStateRef.current.startX;
      const dy = ev.clientY - dragStateRef.current.startY;
      setDragOffset({
        x: dragStateRef.current.originX + dx,
        y: dragStateRef.current.originY + dy,
      });
    };

    const onUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleToolClick = (toolId) => {
    if (
      toolId === currentTool &&
      ['pen', 'pencil', 'highlighter', 'shape', 'text', 'table', 'schema', 'eraser'].includes(toolId)
    ) {
      setPopoverOpen((prev) => !prev);
    } else {
      onSelectTool(toolId);
      if (['shape', 'table', 'schema'].includes(toolId)) {
        setPopoverOpen(true);
      } else {
        setPopoverOpen(false);
      }
    }
  };

  const triggerBadgeText =
    currentTool === 'text'
      ? `${textStyle?.fontSize || 18}px`
      : currentTool === 'table'
      ? `${tablePreset?.rows || 3}×${tablePreset?.cols || 3}`
      : currentTool === 'schema'
      ? 'ER'
      : `${currentWidth}px`;

  return (
    <div
      className="sp-floating-toolbar-anchor"
      ref={anchorRef}
      style={{
        transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)`,
      }}
    >
      <div className="sp-pill-bar" role="toolbar" aria-label="Drawing tools">
        <button
          type="button"
          className="sp-drag-grip"
          onPointerDown={handleGripPointerDown}
          onDoubleClick={() => setDragOffset({ x: 0, y: 0 })}
          title="Drag to move toolbar (double-click to recenter)"
          aria-label="Drag to reposition toolbar"
        >
          <GripVertical size={14} />
        </button>

        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = currentTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              className={`sp-tool-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleToolClick(tool.id)}
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={isActive}
            >
              {isActive && (
                <motion.span
                  layoutId="activeToolPill"
                  className="sp-tool-active-bg"
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                />
              )}
              <Icon size={17} />
            </button>
          );
        })}

        <div className="sp-v-divider" />

        <label className="sp-tool-btn" title="Insert Image" aria-label="Insert image">
          <ImageIcon size={17} />
          <input
            type="file"
            accept="image/*"
            onChange={onUploadImage}
            style={{ display: 'none' }}
          />
        </label>

        {hasProperties && (
          <>
            <div className="sp-v-divider" />
            <button
              type="button"
              className="sp-color-trigger"
              onClick={() => setPopoverOpen((prev) => !prev)}
              title="Tool properties & style"
              aria-label="Tool properties and style"
              aria-expanded={popoverOpen}
            >
              {(isInkTool || isStructuredTool) && (
                <span className="sp-color-dot" style={{ backgroundColor: currentColor }} />
              )}
              <span className="sp-width-label">{triggerBadgeText}</span>
            </button>
          </>
        )}
      </div>

      {/* Contextual Tool Properties Popover */}
      <AnimatePresence>
        {popoverOpen && hasProperties && (
          <motion.div
            className="sp-popover"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            {currentTool === 'shape' && (
              <div className="sp-popover-row">
                <div className="sp-popover-head">
                  <span>Shape</span>
                  <span style={{ color: 'var(--text-muted)' }}>Hold Shift to constrain</span>
                </div>
                <div className="sp-shape-grid-compact">
                  {SHAPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`sp-shape-tile ${shapeType === opt.id ? 'active' : ''}`}
                      onClick={() => onChangeShapeType(opt.id)}
                      title={opt.label}
                      aria-label={opt.label}
                      aria-pressed={shapeType === opt.id}
                    >
                      <ShapeGlyph type={opt.id} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentTool === 'text' && (
              <>
                <div className="sp-popover-row">
                  <div className="sp-popover-head">
                    <span>Font Family</span>
                    <span style={{ color: 'var(--text-muted)' }}>Click canvas to type</span>
                  </div>
                  <div className="sp-segmented">
                    {FONT_OPTIONS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`sp-seg-btn ${textStyle.fontFamily === f.id ? 'active' : ''}`}
                        onClick={() => onChangeTextStyle({ ...textStyle, fontFamily: f.id })}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sp-popover-row">
                  <div className="sp-popover-head">
                    <span>Size &amp; Formatting</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{textStyle.fontSize}px</span>
                  </div>
                  <div className="sp-size-presets">
                    {TEXT_SIZES.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        className={`sp-size-dot-btn ${textStyle.fontSize === sz ? 'active' : ''}`}
                        onClick={() => onChangeTextStyle({ ...textStyle, fontSize: sz })}
                      >
                        <span style={{ fontSize: 11.5 }}>{sz}</span>
                      </button>
                    ))}
                  </div>
                  <div className="sp-style-row">
                    <div className="sp-segmented">
                      <button
                        type="button"
                        className={`sp-seg-btn ${textStyle.fontWeight === 'bold' ? 'active' : ''}`}
                        onClick={() =>
                          onChangeTextStyle({
                            ...textStyle,
                            fontWeight: textStyle.fontWeight === 'bold' ? 'normal' : 'bold',
                          })
                        }
                        title="Bold"
                      >
                        <Bold size={13} />
                      </button>
                      <button
                        type="button"
                        className={`sp-seg-btn ${textStyle.fontStyle === 'italic' ? 'active' : ''}`}
                        onClick={() =>
                          onChangeTextStyle({
                            ...textStyle,
                            fontStyle: textStyle.fontStyle === 'italic' ? 'normal' : 'italic',
                          })
                        }
                        title="Italic"
                      >
                        <Italic size={13} />
                      </button>
                    </div>
                    <div className="sp-segmented">
                      {[
                        { id: 'left', icon: AlignLeft },
                        { id: 'center', icon: AlignCenter },
                        { id: 'right', icon: AlignRight },
                      ].map((a) => {
                        const AIcon = a.icon;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            className={`sp-seg-btn ${textStyle.textAlign === a.id ? 'active' : ''}`}
                            onClick={() => onChangeTextStyle({ ...textStyle, textAlign: a.id })}
                            title={`Align ${a.id}`}
                          >
                            <AIcon size={13} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {currentTool === 'table' && (
              <div className="sp-popover-row">
                <div className="sp-popover-head">
                  <span>Table Dimensions</span>
                  <span style={{ color: 'var(--text-muted)' }}>Click canvas to place</span>
                </div>
                <div className="sp-segmented">
                  {TABLE_PRESETS.map((tp) => {
                    const isAct =
                      tablePreset.rows === tp.rows && tablePreset.cols === tp.cols;
                    return (
                      <button
                        key={tp.label}
                        type="button"
                        className={`sp-seg-btn ${isAct ? 'active' : ''}`}
                        onClick={() =>
                          onChangeTablePreset({
                            ...tablePreset,
                            rows: tp.rows,
                            cols: tp.cols,
                          })
                        }
                      >
                        {tp.label}
                      </button>
                    );
                  })}
                </div>
                <div className="sp-style-row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Header row</span>
                  <button
                    type="button"
                    className={`sp-seg-btn fill-btn ${tablePreset.headerRow ? 'active' : ''}`}
                    style={{ height: 28 }}
                    onClick={() =>
                      onChangeTablePreset({
                        ...tablePreset,
                        headerRow: !tablePreset.headerRow,
                      })
                    }
                  >
                    {tablePreset.headerRow ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            )}

            {currentTool === 'schema' && (
              <div className="sp-popover-row">
                <div className="sp-popover-head">
                  <span>Schema Entity Template</span>
                  <span style={{ color: 'var(--text-muted)' }}>Click canvas to place</span>
                </div>
                <div className="sp-schema-template-grid">
                  {SCHEMA_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`sp-seg-btn ${schemaTemplate === tpl.id ? 'active' : ''}`}
                      style={{
                        height: 30,
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                      onClick={() => onChangeSchemaTemplate(tpl.id)}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="sp-btn"
                  style={{ height: 28, fontSize: 12, marginTop: 2 }}
                  onClick={() => {
                    onCopyAllSql?.();
                    setPopoverOpen(false);
                  }}
                >
                  <Copy size={13} />
                  Copy Page SQL DDL
                </button>
              </div>
            )}

            {(isInkTool || isStructuredTool) && (
              <div className="sp-popover-row">
                <div className="sp-popover-head">
                  <span>{isStructuredTool ? 'Accent / Text Color' : 'Color'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{currentColor}</span>
                </div>
                <div className="sp-swatches-grid">
                  {swatches.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className={`sp-swatch ${currentColor.toLowerCase() === hex.toLowerCase() ? 'active' : ''}`}
                      style={{ backgroundColor: hex }}
                      onClick={() => onChangeColor(hex)}
                      aria-label={`Color ${hex}`}
                    />
                  ))}
                  <label className="sp-custom-color" title="Custom color">
                    <Plus size={13} />
                    <input
                      type="color"
                      value={currentColor}
                      onChange={(e) => onChangeColor(e.target.value)}
                      aria-label="Custom color picker"
                    />
                  </label>
                </div>
              </div>
            )}

            {(isInkTool || currentTool === 'eraser') && (
              <div className="sp-popover-row">
                <div className="sp-popover-head">
                  <span>{currentTool === 'eraser' ? 'Eraser Size' : 'Stroke Width'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{currentWidth}px</span>
                </div>
                <div className="sp-size-presets">
                  {presets.map((size, idx) => (
                    <button
                      key={size}
                      type="button"
                      className={`sp-size-dot-btn ${currentWidth === size ? 'active' : ''}`}
                      onClick={() => onChangeWidth(size)}
                      title={`${size}px`}
                      aria-label={`Set width to ${size}px`}
                    >
                      <span
                        style={{
                          width: 22,
                          height: Math.min(9, 1.5 + idx * 2.1),
                          borderRadius: '9999px',
                          backgroundColor: isInkTool ? currentColor : 'var(--text-primary)',
                        }}
                      />
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  className="sp-range"
                  min={currentTool === 'eraser' ? 6 : currentTool === 'highlighter' ? 8 : 1}
                  max={currentTool === 'eraser' ? 64 : currentTool === 'highlighter' ? 40 : 24}
                  step={currentTool === 'eraser' || currentTool === 'highlighter' ? 1 : 0.5}
                  value={currentWidth}
                  onChange={(e) => onChangeWidth(parseFloat(e.target.value))}
                  aria-label="Adjust stroke width"
                />
              </div>
            )}

            {currentTool === 'shape' && (
              <div className="sp-popover-row">
                <div className="sp-popover-head">
                  <span>Style &amp; Fill</span>
                </div>
                <div className="sp-style-row">
                  <div className="sp-segmented">
                    {STROKE_STYLES.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        className={`sp-seg-btn ${strokeStyle === st.id ? 'active' : ''}`}
                        onClick={() => onChangeStrokeStyle(st.id)}
                        title={st.label}
                        aria-label={st.label}
                      >
                        <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
                          <line
                            x1="2"
                            y1="5"
                            x2="18"
                            y2="5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeDasharray={
                              st.id === 'dashed'
                                ? '4 3'
                                : st.id === 'dotted'
                                ? '1 3.5'
                                : undefined
                            }
                          />
                        </svg>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={`sp-seg-btn fill-btn ${shapeFill ? 'active' : ''}`}
                    onClick={onToggleShapeFill}
                    title="Toggle tinted shape fill"
                    aria-pressed={shapeFill}
                  >
                    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                      <rect
                        x="3"
                        y="3"
                        width="12"
                        height="12"
                        rx="2.5"
                        fill={shapeFill ? 'currentColor' : 'none'}
                        fillOpacity={shapeFill ? 0.25 : 0}
                        stroke="currentColor"
                        strokeWidth="1.75"
                      />
                    </svg>
                    <span>Fill</span>
                  </button>
                </div>
              </div>
            )}

            {currentTool === 'pen' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 4,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  className={`sp-btn ${currentGlow ? 'sp-btn-primary' : ''}`}
                  onClick={onToggleGlow}
                  style={{ height: 28, fontSize: 12 }}
                >
                  <Sparkles size={13} />
                  Glow Ink
                </button>
                <button
                  type="button"
                  className="sp-btn sp-btn-danger"
                  onClick={() => {
                    onClearPage();
                    setPopoverOpen(false);
                  }}
                  style={{ height: 28, fontSize: 12 }}
                >
                  <Trash2 size={13} />
                  Clear Page
                </button>
              </div>
            )}

            {currentTool === 'eraser' && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  paddingTop: 4,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  className="sp-btn sp-btn-danger"
                  onClick={() => {
                    onClearPage();
                    setPopoverOpen(false);
                  }}
                  style={{ height: 28, fontSize: 12 }}
                >
                  <Trash2 size={13} />
                  Clear Entire Page
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connecting Mode Banner */}
      <AnimatePresence>
        {connectingFromId && (
          <motion.div
            className="sp-selection-pill"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
              Click target schema table to connect
            </span>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={onCancelConnect}
              title="Cancel connection (Esc)"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contextual Selection Pills */}
      <AnimatePresence>
        {!connectingFromId && currentTool === 'select' && selectedImage && (
          <motion.div
            className="sp-selection-pill"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <span>Image selected</span>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={onToggleImageLock}
              title={selectedImage.locked ? 'Unlock Image' : 'Lock Image'}
              style={selectedImage.locked ? { color: 'var(--warning)' } : undefined}
            >
              {selectedImage.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <button
              type="button"
              className="sp-mini-btn danger"
              onClick={onDeleteSelectedImage}
              disabled={selectedImage.locked}
              title={selectedImage.locked ? 'Unlock image before deleting' : 'Delete Image (Del)'}
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        )}

        {!connectingFromId && currentTool === 'select' && selectedText && (
          <motion.div
            className="sp-selection-pill"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <span>Text</span>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() =>
                onUpdateSelectedText({
                  ...selectedText,
                  fontWeight: selectedText.fontWeight === 'bold' ? 'normal' : 'bold',
                })
              }
              style={selectedText.fontWeight === 'bold' ? { color: 'var(--accent)' } : undefined}
              title="Bold"
            >
              <Bold size={13} />
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() =>
                onUpdateSelectedText({
                  ...selectedText,
                  fontStyle: selectedText.fontStyle === 'italic' ? 'normal' : 'italic',
                })
              }
              style={selectedText.fontStyle === 'italic' ? { color: 'var(--accent)' } : undefined}
              title="Italic"
            >
              <Italic size={13} />
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() =>
                onUpdateSelectedText({
                  ...selectedText,
                  fontSize: Math.max(11, (selectedText.fontSize || 18) - 2),
                })
              }
              title="Decrease font size"
            >
              <Minus size={13} />
            </button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {selectedText.fontSize || 18}px
            </span>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() =>
                onUpdateSelectedText({
                  ...selectedText,
                  fontSize: Math.min(64, (selectedText.fontSize || 18) + 2),
                })
              }
              title="Increase font size"
            >
              <Plus size={13} />
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={onToggleTextLock}
              title={selectedText.locked ? 'Unlock Text' : 'Lock Text'}
              style={selectedText.locked ? { color: 'var(--warning)' } : undefined}
            >
              {selectedText.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <button
              type="button"
              className="sp-mini-btn danger"
              onClick={onDeleteSelectedText}
              disabled={selectedText.locked}
              title="Delete Text (Del)"
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        )}

        {!connectingFromId && currentTool === 'select' && selectedTable && (
          <motion.div
            className="sp-selection-pill"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <span>Table · Double-click cell to edit</span>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() => onTableAction('addRow')}
              title="Add Row"
            >
              +R
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() => onTableAction('removeRow')}
              title="Remove Last Row"
            >
              -R
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() => onTableAction('addCol')}
              title="Add Column"
            >
              +C
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() => onTableAction('removeCol')}
              title="Remove Last Column"
            >
              -C
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() => onTableAction('toggleHeader')}
              title="Toggle Header Row"
              style={selectedTable.headerRow ? { color: 'var(--accent)' } : undefined}
            >
              H
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() => onTableAction('toggleLock')}
              title={selectedTable.locked ? 'Unlock Table' : 'Lock Table'}
              style={selectedTable.locked ? { color: 'var(--warning)' } : undefined}
            >
              {selectedTable.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <button
              type="button"
              className="sp-mini-btn danger"
              onClick={() => onTableAction('delete')}
              disabled={selectedTable.locked}
              title="Delete Table (Del)"
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        )}

        {!connectingFromId && currentTool === 'select' && selectedSchema && (
          <motion.div
            className="sp-selection-pill"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <span>{selectedSchema.name || 'Schema'}</span>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={onOpenSchemaEditor}
              title="Edit Columns & Types"
            >
              <SlidersHorizontal size={14} />
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={() => onStartConnectSchema(selectedSchema.id)}
              title="Connect to another table"
            >
              <ArrowRightLeft size={14} />
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={onToggleSchemaLock}
              title={selectedSchema.locked ? 'Unlock Schema' : 'Lock Schema'}
              style={selectedSchema.locked ? { color: 'var(--warning)' } : undefined}
            >
              {selectedSchema.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <button
              type="button"
              className="sp-mini-btn danger"
              onClick={onDeleteSelectedSchema}
              disabled={selectedSchema.locked}
              title="Delete Schema Table (Del)"
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        )}

        {!connectingFromId && currentTool === 'select' && selectedRelation && (
          <motion.div
            className="sp-selection-pill"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <span>Relation</span>
            {CARDINALITIES.map((c) => (
              <button
                key={c}
                type="button"
                className="sp-mini-btn"
                style={
                  selectedRelation.cardinality === c
                    ? { color: 'var(--accent)', fontWeight: 700, fontSize: 11 }
                    : { fontSize: 11 }
                }
                onClick={() => onUpdateRelation({ ...selectedRelation, cardinality: c })}
                title={`Set cardinality to ${c}`}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              className="sp-mini-btn danger"
              onClick={onDeleteSelectedRelation}
              title="Delete Relation (Del)"
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        )}

        {!connectingFromId &&
          currentTool === 'select' &&
          !selectedImage &&
          !selectedText &&
          !selectedTable &&
          !selectedSchema &&
          !selectedRelation &&
          selectedStrokeIndex !== null && (
            <motion.div
              className="sp-selection-pill"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              <span>Stroke selected · Drag to move</span>
              <button
                type="button"
                className="sp-mini-btn danger"
                onClick={onDeleteSelectedStroke}
                title="Delete Stroke (Del)"
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
}
