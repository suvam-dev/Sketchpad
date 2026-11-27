import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Plus,
  Trash2,
  Copy,
  Pencil,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { renderPageToContext } from '../utils/drawingEngine';

function PageThumbnail({ page, darkMode, imageCache }) {
  const thumbRef = useRef(null);

  useEffect(() => {
    const canvas = thumbRef.current;
    if (!canvas) return;
    const width = 220;
    const height = 138;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');

    // Compute a smart fit transform so strokes/images appear centered in the thumbnail
    const strokes = page.strokes || [];
    const images = page.images || [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    strokes.forEach((s) => {
      if (s.tool === 'eraser' || !s.points) return;
      s.points.forEach((pt) => {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      });
    });

    images.forEach((img) => {
      if (img.x < minX) minX = img.x;
      if (img.y < minY) minY = img.y;
      if (img.x + img.width > maxX) maxX = img.x + img.width;
      if (img.y + img.height > maxY) maxY = img.y + img.height;
    });

    (page.texts || []).forEach((txt) => {
      if (txt.x < minX) minX = txt.x;
      if (txt.y < minY) minY = txt.y;
      if (txt.x + (txt.width || 220) > maxX) maxX = txt.x + (txt.width || 220);
      if (txt.y + 60 > maxY) maxY = txt.y + 60;
    });

    (page.tables || []).forEach((tbl) => {
      const tw = (tbl.colWidths || [130, 130]).reduce((a, b) => a + b, 0);
      const th = (tbl.rows || []).length * (tbl.rowHeight || 34);
      if (tbl.x < minX) minX = tbl.x;
      if (tbl.y < minY) minY = tbl.y;
      if (tbl.x + tw > maxX) maxX = tbl.x + tw;
      if (tbl.y + th > maxY) maxY = tbl.y + th;
    });

    (page.schemas || []).forEach((sch) => {
      const sw = sch.width || 256;
      const sh = 36 + Math.max(1, (sch.fields || []).length) * 28 + 6;
      if (sch.x < minX) minX = sch.x;
      if (sch.y < minY) minY = sch.y;
      if (sch.x + sw > maxX) maxX = sch.x + sw;
      if (sch.y + sh > maxY) maxY = sch.y + sh;
    });

    let zoom = 0.22;
    let panX = 0;
    let panY = 0;

    if (Number.isFinite(minX) && Number.isFinite(maxX)) {
      const contentW = Math.max(120, maxX - minX + 80);
      const contentH = Math.max(80, maxY - minY + 80);
      zoom = Math.min(0.45, Math.min(width / contentW, height / contentH));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      panX = width / (2 * zoom) - cx;
      panY = height / (2 * zoom) - cy;
    }

    renderPageToContext(ctx, page, width, height, {
      panX,
      panY,
      zoom,
      dpr,
      darkMode,
      includePaper: true,
      imageCache,
    });
  }, [page, page.strokes, page.images, page.texts, page.tables, page.schemas, page.relations, page.paperStyle, darkMode, imageCache]);

  return <canvas ref={thumbRef} className="sp-thumb-canvas" aria-hidden="true" />;
}

export default function Sidebar({
  open,
  onClose,
  notebooks,
  activeNotebookId,
  activePageId,
  trash,
  darkMode,
  imageCache,
  onCreateNotebook,
  onSelectNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onCreatePage,
  onSelectPage,
  onRenamePage,
  onDuplicatePage,
  onDeletePage,
  onRestoreTrashItem,
  onEmptyTrash,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [trashExpanded, setTrashExpanded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(268);

  const activeNotebook = notebooks.find((nb) => nb.id === activeNotebookId);

  const handleResizeStart = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev) => {
      const next = Math.min(440, Math.max(220, startWidth + (ev.clientX - startX)));
      setSidebarWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startRename = (id, currentTitle, e) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingValue(currentTitle);
  };

  const commitRename = (type, id) => {
    const trimmed = editingValue.trim();
    if (trimmed) {
      if (type === 'notebook') onRenameNotebook(id, trimmed);
      else onRenamePage(id, trimmed);
    }
    setEditingId(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sp-sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            className="sp-sidebar"
            aria-label="Notebooks and pages"
            style={{ position: 'relative' }}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: sidebarWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div
              className="sp-sidebar-resizer"
              onPointerDown={handleResizeStart}
              title="Drag to resize sidebar"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
            />
            {/* Notebooks Section */}
            <div className="sp-sidebar-section">
              <div className="sp-section-head">
                <span className="sp-section-title">Notebooks</span>
                <button
                  type="button"
                  className="sp-mini-btn"
                  onClick={() => onCreateNotebook()}
                  title="New Notebook"
                  aria-label="Create new notebook"
                >
                  <Plus size={15} />
                </button>
              </div>

              <div className="sp-notebooks-list">
                {notebooks.map((nb) => {
                  const isActive = nb.id === activeNotebookId;
                  const isEditing = editingId === `nb-${nb.id}`;
                  return (
                    <div
                      key={nb.id}
                      className={`sp-nb-row ${isActive ? 'active' : ''}`}
                      onClick={() => onSelectNotebook(nb.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && onSelectNotebook(nb.id)}
                    >
                      <div className="sp-nb-row-main">
                        <BookOpen size={14} style={{ flexShrink: 0 }} />
                        {isEditing ? (
                          <input
                            className="sp-rename-input"
                            value={editingValue}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => commitRename('notebook', nb.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename('notebook', nb.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                        ) : (
                          <span className="sp-nb-name">{nb.title}</span>
                        )}
                      </div>

                      {!isEditing && (
                        <>
                          <span className="sp-nb-count">{nb.pages?.length || 0}</span>
                          <div className="sp-nb-actions">
                            <button
                              type="button"
                              className="sp-mini-btn"
                              onClick={(e) => startRename(`nb-${nb.id}`, nb.title, e)}
                              title="Rename notebook"
                              aria-label={`Rename ${nb.title}`}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              className="sp-mini-btn danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteNotebook(nb.id);
                              }}
                              title="Move notebook to Trash"
                              aria-label={`Delete ${nb.title}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pages Section with Live Thumbnails */}
            <div className="sp-sidebar-section grow">
              <div className="sp-section-head">
                <span className="sp-section-title">
                  Pages {activeNotebook ? `(${activeNotebook.pages.length})` : ''}
                </span>
                {activeNotebook && (
                  <button
                    type="button"
                    className="sp-mini-btn"
                    onClick={() => onCreatePage(activeNotebook.id)}
                    title="Add Page"
                    aria-label="Add new page"
                  >
                    <Plus size={15} />
                  </button>
                )}
              </div>

              {activeNotebook && (
                <div className="sp-pages-list">
                  {activeNotebook.pages.map((page, index) => {
                    const isActive = page.id === activePageId;
                    const isEditing = editingId === `pg-${page.id}`;
                    return (
                      <div
                        key={page.id}
                        className={`sp-page-card ${isActive ? 'active' : ''}`}
                        onClick={() => onSelectPage(page.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && onSelectPage(page.id)}
                      >
                        <div className="sp-thumb-frame">
                          <PageThumbnail page={page} darkMode={darkMode} imageCache={imageCache} />
                          <span className="sp-page-num">{index + 1}</span>
                        </div>
                        <div className="sp-page-meta">
                          <div className="sp-page-meta-text">
                            {isEditing ? (
                              <input
                                className="sp-rename-input"
                                value={editingValue}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={() => commitRename('page', page.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRename('page', page.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                              />
                            ) : (
                              <>
                                <span className="sp-page-title">{page.title}</span>
                                <span className="sp-page-date">{page.date}</span>
                              </>
                            )}
                          </div>
                          {!isEditing && (
                            <div className="sp-page-actions">
                              <button
                                type="button"
                                className="sp-mini-btn"
                                onClick={(e) => startRename(`pg-${page.id}`, page.title, e)}
                                title="Rename page"
                                aria-label={`Rename ${page.title}`}
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                className="sp-mini-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDuplicatePage(page.id);
                                }}
                                title="Duplicate page"
                                aria-label={`Duplicate ${page.title}`}
                              >
                                <Copy size={12} />
                              </button>
                              <button
                                type="button"
                                className="sp-mini-btn danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeletePage(page.id);
                                }}
                                title="Move page to Trash"
                                aria-label={`Delete ${page.title}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recently Deleted / Safe Recovery */}
            {trash && trash.length > 0 && (
              <div className="sp-trash-panel">
                <button
                  type="button"
                  className="sp-trash-toggle"
                  onClick={() => setTrashExpanded((prev) => !prev)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {trashExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    Recently Deleted ({trash.length})
                  </span>
                  {trashExpanded && (
                    <span
                      role="button"
                      tabIndex={0}
                      style={{ fontSize: 11, color: 'var(--danger)' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEmptyTrash();
                      }}
                    >
                      Empty
                    </span>
                  )}
                </button>

                {trashExpanded && (
                  <div className="sp-trash-list">
                    {trash.map((item) => (
                      <div key={item.trashId} className="sp-trash-item">
                        <span className="sp-trash-item-name">
                          {item.type === 'notebook' ? item.data.title : item.data.title}
                        </span>
                        <button
                          type="button"
                          className="sp-mini-btn"
                          onClick={() => onRestoreTrashItem(item.trashId)}
                          title="Restore"
                          aria-label={`Restore ${item.data.title}`}
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
