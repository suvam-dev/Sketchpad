import {
  PanelLeft,
  Undo2,
  Redo2,
  Download,
  Settings,
  Sun,
  Moon,
  Check,
  Loader2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import BrandLogo from './BrandLogo';

export default function TopBar({
  sidebarOpen,
  onToggleSidebar,
  notebookTitle,
  pageTitle,
  hasActiveNotebook,
  hasActivePage,
  onNotebookTitleChange,
  onPageTitleChange,
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenExport,
  onOpenSettings,
  darkMode,
  onToggleTheme,
}) {
  return (
    <header className="sp-topbar" role="banner">
      <div className="sp-topbar-left">
        <button
          type="button"
          className={`sp-icon-btn ${sidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Hide sidebar (⌘\\)' : 'Show sidebar (⌘\\)'}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          <PanelLeft size={17} />
        </button>

        <div className="sp-brand-mark" aria-label="Scratchpad">
          <BrandLogo size={26} />
          <span className="sp-brand-name">Scratchpad</span>
        </div>

        {hasActiveNotebook && (
          <div className="sp-breadcrumbs">
            <ChevronRight size={13} className="sp-crumb-sep" />
            <input
              type="text"
              className="sp-inline-title"
              value={notebookTitle}
              onChange={(e) => onNotebookTitleChange(e.target.value)}
              placeholder="Untitled Notebook"
              aria-label="Notebook title"
              spellCheck={false}
            />
            {hasActivePage && (
              <>
                <ChevronRight size={13} className="sp-crumb-sep" />
                <input
                  type="text"
                  className="sp-inline-title secondary"
                  value={pageTitle}
                  onChange={(e) => onPageTitleChange(e.target.value)}
                  placeholder="Untitled Page"
                  aria-label="Page title"
                  spellCheck={false}
                />
              </>
            )}
          </div>
        )}

        <div
          className={`sp-save-status ${saveStatus}`}
          role="status"
          aria-live="polite"
          title={
            saveStatus === 'saving'
              ? 'Saving changes locally'
              : saveStatus === 'error'
              ? 'Failed to save locally'
              : 'All changes saved offline'
          }
        >
          {saveStatus === 'saving' && (
            <>
              <Loader2 size={12} className="sp-spin" />
              <span>Saving…</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Check size={12} />
              <span>Saved</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <AlertCircle size={12} />
              <span>Save error</span>
            </>
          )}
        </div>
      </div>

      <div className="sp-topbar-right">
        <button
          type="button"
          className="sp-icon-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          aria-label="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          className="sp-icon-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
        >
          <Redo2 size={16} />
        </button>

        <div className="sp-v-divider" />

        <button
          type="button"
          className="sp-icon-btn"
          onClick={onOpenExport}
          title="Export & Backup"
          aria-label="Export and backup"
        >
          <Download size={16} />
        </button>
        <button
          type="button"
          className="sp-icon-btn"
          onClick={onOpenSettings}
          title="Canvas & Stylus Settings"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
        <button
          type="button"
          className="sp-icon-btn"
          onClick={onToggleTheme}
          title={darkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label="Toggle color theme"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
