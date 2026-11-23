import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';

export default function BottomBar({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetView,
  pageIndex,
  pageCount,
  onPrevPage,
  onNextPage,
  onAddPage,
  focusMode,
  onToggleFocusMode,
}) {
  return (
    <>
      {pageCount > 0 && (
        <div className="sp-bottom-left" role="navigation" aria-label="Page navigation">
          <button
            type="button"
            className="sp-icon-btn"
            style={{ width: 28, height: 28 }}
            onClick={onPrevPage}
            disabled={pageIndex <= 0}
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="sp-page-readout">
            Page {pageIndex + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="sp-icon-btn"
            style={{ width: 28, height: 28 }}
            onClick={onNextPage}
            disabled={pageIndex >= pageCount - 1}
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight size={15} />
          </button>
          <div className="sp-v-divider" />
          <button
            type="button"
            className="sp-icon-btn"
            style={{ width: 28, height: 28 }}
            onClick={onAddPage}
            title="Add new page"
            aria-label="Add new page"
          >
            <Plus size={15} />
          </button>
        </div>
      )}

      <div className="sp-bottom-right">
        <div className="sp-zoom-pill" role="group" aria-label="Zoom controls">
          <button
            type="button"
            className="sp-icon-btn"
            style={{ width: 28, height: 28 }}
            onClick={onZoomOut}
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            className="sp-zoom-readout"
            onClick={onResetView}
            title="Reset zoom & position (0)"
            aria-label="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="sp-icon-btn"
            style={{ width: 28, height: 28 }}
            onClick={onZoomIn}
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn size={15} />
          </button>
        </div>

        <div className="sp-zoom-pill">
          <button
            type="button"
            className={`sp-icon-btn ${focusMode ? 'active' : ''}`}
            style={{ width: 28, height: 28 }}
            onClick={onToggleFocusMode}
            title={focusMode ? 'Exit Focus Mode (F)' : 'Enter Focus Mode (F)'}
            aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
          >
            {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>
    </>
  );
}
