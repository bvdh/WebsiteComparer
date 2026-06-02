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
      <div className="toolbar-group toolbar-nav">
        <button type="button" onClick={props.onBack} disabled={!props.canGoBack}>
          Back
        </button>
        <button type="button" onClick={props.onForward} disabled={!props.canGoForward}>
          Forward
        </button>
        <label className="sync-toggle">
          <input type="checkbox" checked={props.syncEnabled} onChange={props.onToggleSync} />
          Sync
        </label>
        <label className="path-variant-toggle" title="Switch between .html and .md versions of the same path">
          <span>HTML</span>
          <input
            type="checkbox"
            checked={props.pathVariant === "md"}
            onChange={props.onTogglePathVariant}
            disabled={!props.canTogglePathVariant}
          />
          <span>MD</span>
        </label>
      </div>

      <div className="toolbar-group toolbar-path">
        <label htmlFor="pathInput">Path</label>
        <input
          id="pathInput"
          value={props.currentPath}
          onChange={(event) => props.onPathChange(event.target.value)}
          placeholder="/"
          spellCheck={false}
        />
      </div>

      <div className="toolbar-group toolbar-url-grid">
        <label htmlFor="leftBaseInput">Left Base URL</label>
        <input
          id="leftBaseInput"
          value={props.leftBaseUrl}
          onChange={(event) => props.onLeftBaseUrlChange(event.target.value)}
          placeholder="http://localhost:3001"
          spellCheck={false}
        />
        <label htmlFor="rightBaseInput">Right Base URL</label>
        <input
          id="rightBaseInput"
          value={props.rightBaseUrl}
          onChange={(event) => props.onRightBaseUrlChange(event.target.value)}
          placeholder="http://localhost:3002"
          spellCheck={false}
        />
      </div>

      <div className="toolbar-group toolbar-actions">
        <button type="button" className="apply-button" onClick={props.onApply}>
          Load
        </button>
      </div>
    </header>
  );
}
