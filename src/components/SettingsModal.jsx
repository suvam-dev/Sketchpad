import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const PAPER_STYLES = [
  { id: 'blank', label: 'Blank' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'grid', label: 'Grid' },
  { id: 'ruled', label: 'Ruled' },
];

const SHORTCUTS = [
  { label: 'Pen tool', keys: 'P' },
  { label: 'Pencil tool', keys: 'C' },
  { label: 'Highlighter', keys: 'H' },
  { label: 'Shapes tool', keys: 'S' },
  { label: 'Text tool', keys: 'T' },
  { label: 'Table tool', keys: 'G' },
  { label: 'Schema / ER tool', keys: 'D' },
  { label: 'Eraser', keys: 'E' },
  { label: 'Select tool', keys: 'V' },
  { label: 'Hold to Pan', keys: 'Space' },
  { label: 'Undo / Redo', keys: '⌘Z / ⇧⌘Z' },
  { label: 'Zoom in / out', keys: '+ / -' },
  { label: 'Reset zoom', keys: '0' },
  { label: 'Focus mode', keys: 'F' },
  { label: 'Toggle sidebar', keys: '⌘\\' },
];

export default function SettingsModal({
  open,
  onClose,
  paperStyle,
  onChangePaperStyle,
  pressureEnabled,
  onTogglePressure,
  shapeDetectionEnabled,
  onToggleShapeDetection,
  stylusOnly,
  onToggleStylusOnly,
  smoothingEnabled,
  onToggleSmoothing,
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sp-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
        >
          <motion.div
            className="sp-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sp-modal-header">
              <h3 id="settings-modal-title">Canvas &amp; Stylus Settings</h3>
              <button
                type="button"
                className="sp-icon-btn"
                onClick={onClose}
                aria-label="Close settings dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="sp-modal-body">
              <div className="sp-setting-group">
                <span className="sp-setting-group-title">Paper Background</span>
                <div className="sp-paper-grid">
                  {PAPER_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      className={`sp-paper-option ${paperStyle === style.id ? 'active' : ''}`}
                      onClick={() => onChangePaperStyle(style.id)}
                    >
                      <span className={`sp-paper-preview ${style.id}`} />
                      <span>{style.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="sp-setting-group">
                <span className="sp-setting-group-title">Stylus &amp; Ink Engine</span>

                <div className="sp-toggle-row">
                  <div className="sp-toggle-info">
                    <span className="sp-toggle-label">Pressure sensitivity</span>
                    <span className="sp-toggle-desc">
                      Vary stroke width dynamically from stylus pressure
                    </span>
                  </div>
                  <label className="sp-switch">
                    <input
                      type="checkbox"
                      checked={pressureEnabled}
                      onChange={onTogglePressure}
                    />
                    <span className="sp-switch-track" />
                  </label>
                </div>

                <div className="sp-toggle-row">
                  <div className="sp-toggle-info">
                    <span className="sp-toggle-label">Stroke smoothing</span>
                    <span className="sp-toggle-desc">
                      Stabilize micro-jitter for cleaner handwriting
                    </span>
                  </div>
                  <label className="sp-switch">
                    <input
                      type="checkbox"
                      checked={smoothingEnabled}
                      onChange={onToggleSmoothing}
                    />
                    <span className="sp-switch-track" />
                  </label>
                </div>

                <div className="sp-toggle-row">
                  <div className="sp-toggle-info">
                    <span className="sp-toggle-label">Auto-shape snapping</span>
                    <span className="sp-toggle-desc">
                      Automatically straighten freehand lines, circles, and boxes
                    </span>
                  </div>
                  <label className="sp-switch">
                    <input
                      type="checkbox"
                      checked={shapeDetectionEnabled}
                      onChange={onToggleShapeDetection}
                    />
                    <span className="sp-switch-track" />
                  </label>
                </div>

                <div className="sp-toggle-row">
                  <div className="sp-toggle-info">
                    <span className="sp-toggle-label">Stylus-only drawing (Palm rejection)</span>
                    <span className="sp-toggle-desc">
                      Draw with Apple Pencil / stylus; finger touch pans instead
                    </span>
                  </div>
                  <label className="sp-switch">
                    <input
                      type="checkbox"
                      checked={stylusOnly}
                      onChange={onToggleStylusOnly}
                    />
                    <span className="sp-switch-track" />
                  </label>
                </div>
              </div>

              <div className="sp-setting-group">
                <span className="sp-setting-group-title">Keyboard Shortcuts</span>
                <div className="sp-shortcut-list">
                  {SHORTCUTS.map((item) => (
                    <div key={item.label} className="sp-shortcut-row">
                      <span>{item.label}</span>
                      <kbd className="sp-kbd">{item.keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
