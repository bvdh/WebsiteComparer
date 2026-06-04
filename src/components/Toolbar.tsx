type ToolbarProps = {
  leftBaseUrl: string;
  rightBaseUrl: string;
  currentPath: string;
  pathVariant: "md" | "html" | null;
  canTogglePathVariant: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  syncEnabled: boolean;
  onLeftBaseUrlChange: (value: string) => void;
  onRightBaseUrlChange: (value: string) => void;
  onPathChange: (value: string) => void;
  onApply: () => void;
  onTogglePathVariant: () => void;
  onBack: () => void;
  onForward: () => void;
  onToggleSync: () => void;
};

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-group toolbar-toggles">
        <label className="toggle-switch" title="Synchronise scroll position between panes">
          <input type="checkbox" checked={props.syncEnabled} onChange={props.onToggleSync} />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">Sync</span>
        </label>
        <label
          className="toggle-switch"
          title="Switch between .html and .md versions of the same path"
          style={{ opacity: props.canTogglePathVariant ? undefined : 0.45 }}
        >
          <input
            type="checkbox"
            checked={props.pathVariant === "md"}
            onChange={props.onTogglePathVariant}
            disabled={!props.canTogglePathVariant}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">MD</span>
        </label>
      </div>

      <div className="toolbar-group toolbar-url-grid">
        <label htmlFor="leftBaseInput">Left Base URL</label>
        <input
          id="leftBaseInput"
          value={props.leftBaseUrl}
          onChange={(event) => props.onLeftBaseUrlChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") props.onApply(); }}
          placeholder="http://localhost:3001"
          spellCheck={false}
        />
        <label htmlFor="rightBaseInput">Right Base URL</label>
        <input
          id="rightBaseInput"
          value={props.rightBaseUrl}
          onChange={(event) => props.onRightBaseUrlChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") props.onApply(); }}
          placeholder="http://localhost:3002"
          spellCheck={false}
        />
      </div>

      <div className="toolbar-group toolbar-path">
        <label htmlFor="pathInput">Path</label>
        <input
          id="pathInput"
          value={props.currentPath}
          onChange={(event) => props.onPathChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") props.onApply(); }}
          placeholder="/"
          spellCheck={false}
        />
      </div>

      <div className="toolbar-group toolbar-actions">
        <button type="button" onClick={props.onBack} disabled={!props.canGoBack} title="Back">
          &#8592;
        </button>
        <button type="button" onClick={props.onForward} disabled={!props.canGoForward} title="Forward">
          &#8594;
        </button>
        <button type="button" className="apply-button" onClick={props.onApply}>
          Load
        </button>
      </div>
    </header>
  );
}
