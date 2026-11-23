import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Image as ImageIcon,
  FileCode2,
  FileText,
  Download,
  Upload,
} from 'lucide-react';

export default function ExportModal({
  open,
  onClose,
  hasActivePage,
  hasActiveNotebook,
  onExportPng,
  onExportSvg,
  onExportPdf,
  onExportJson,
  onImportJson,
}) {
  const [includePaper, setIncludePaper] = useState(true);

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
            aria-labelledby="export-modal-title"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sp-modal-header">
              <h3 id="export-modal-title">Export &amp; Backup</h3>
              <button
                type="button"
                className="sp-icon-btn"
                onClick={onClose}
                aria-label="Close export dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="sp-modal-body">
              <div className="sp-toggle-row">
                <div className="sp-toggle-info">
                  <span className="sp-toggle-label">Include paper background</span>
                  <span className="sp-toggle-desc">
                    Export with current theme color and paper pattern
                  </span>
                </div>
                <label className="sp-switch">
                  <input
                    type="checkbox"
                    checked={includePaper}
                    onChange={(e) => setIncludePaper(e.target.checked)}
                  />
                  <span className="sp-switch-track" />
                </label>
              </div>

              <div className="sp-setting-group">
                <span className="sp-setting-group-title">Current Page &amp; Notebook</span>

                <button
                  type="button"
                  className="sp-export-card"
                  disabled={!hasActivePage}
                  onClick={() => {
                    onExportPng(includePaper);
                    onClose();
                  }}
                >
                  <div className="sp-export-card-left">
                    <div className="sp-export-icon">
                      <ImageIcon size={17} />
                    </div>
                    <div className="sp-toggle-info">
                      <span className="sp-toggle-label">Export Page as PNG</span>
                      <span className="sp-toggle-desc">High-resolution Retina raster image</span>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="sp-export-card"
                  disabled={!hasActivePage}
                  onClick={() => {
                    onExportSvg(includePaper);
                    onClose();
                  }}
                >
                  <div className="sp-export-card-left">
                    <div className="sp-export-icon">
                      <FileCode2 size={17} />
                    </div>
                    <div className="sp-toggle-info">
                      <span className="sp-toggle-label">Export Page as SVG</span>
                      <span className="sp-toggle-desc">Crisp infinite-resolution vector paths</span>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="sp-export-card"
                  disabled={!hasActiveNotebook}
                  onClick={() => {
                    onExportPdf(includePaper);
                    onClose();
                  }}
                >
                  <div className="sp-export-card-left">
                    <div className="sp-export-icon">
                      <FileText size={17} />
                    </div>
                    <div className="sp-toggle-info">
                      <span className="sp-toggle-label">Export Notebook as PDF</span>
                      <span className="sp-toggle-desc">All pages combined into one multi-page PDF</span>
                    </div>
                  </div>
                </button>
              </div>

              <div className="sp-setting-group">
                <span className="sp-setting-group-title">Offline Backup (JSON)</span>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    className="sp-btn"
                    style={{ height: 38 }}
                    onClick={() => {
                      onExportJson();
                      onClose();
                    }}
                  >
                    <Download size={15} />
                    Export Backup
                  </button>

                  <label className="sp-btn" style={{ height: 38, cursor: 'pointer' }}>
                    <Upload size={15} />
                    Import Backup
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        onImportJson(e);
                        onClose();
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
