import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComparisonPane } from "./components/ComparisonPane";
import { Toolbar } from "./components/Toolbar";
import { initialHistoryState, pushHistory, stepHistory, type HistoryState } from "./sync/historySync";
import { SyncController } from "./sync/SyncController";
import { mapPathToPeer, normalizeRelativePath, toRelativePath } from "./sync/urlMapping";
import type { PaneSide } from "./types/sync";
import "./App.css";

const DEFAULT_LEFT_BASE = "http://localhost:3001";
const DEFAULT_RIGHT_BASE = "http://localhost:3002";
const DEFAULT_PATH = "/";
const DEBUG_SYNC = true;
const DIFF_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,td,th,pre,code,blockquote";

const readInitialStateFromQuery = () => {
  if (typeof window === "undefined") {
    return {
      leftBase: DEFAULT_LEFT_BASE,
      rightBase: DEFAULT_RIGHT_BASE,
      path: DEFAULT_PATH,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const url1 = params.get("url1")?.trim() || DEFAULT_LEFT_BASE;
  const url2 = params.get("url2")?.trim() || DEFAULT_RIGHT_BASE;
  const path = normalizeRelativePath(params.get("path") || DEFAULT_PATH);

  return {
    leftBase: url1,
    rightBase: url2,
    path,
  };
};

const writeQueryState = (mode: "push" | "replace", leftBase: string, rightBase: string, path: string) => {
  const next = new URL(window.location.href);
  next.searchParams.set("url1", leftBase);
  next.searchParams.set("url2", rightBase);
  next.searchParams.set("path", path);
  const nextUrl = `${next.pathname}?${next.searchParams.toString()}${next.hash}`;

  if (mode === "push") {
    window.history.pushState(null, "", nextUrl);
    return;
  }

  window.history.replaceState(null, "", nextUrl);
};

const normalizeText = (value: string | null | undefined): string =>
  (value || "").replace(/\s+/g, " ").trim();

const ensureDiffStyles = (doc: Document): void => {
  if (doc.getElementById("compare-diff-style")) {
    return;
  }

  const style = doc.createElement("style");
  style.id = "compare-diff-style";
  style.textContent = `
    .compare-diff-marker {
      position: relative;
      border-left: 6px solid transparent;
      padding-left: 10px !important;
      margin-left: 2px !important;
    }

    .compare-diff-marker--added {
      border-left-color: #2f9e44 !important;
    }

    .compare-diff-marker--removed {
      border-left-color: #c92a2a !important;
    }

    .compare-diff-marker--changed {
      border-left-color: #e67700 !important;
    }

    .compare-diff-removed-note {
      margin: 6px 0;
      padding: 8px 10px;
      font-size: 12px;
      color: #842029;
      background: #fff5f5;
      border-radius: 4px;
      border-left: 6px solid #c92a2a;
    }
  `;
  doc.head.appendChild(style);
};

const clearComparisonArtifacts = (doc: Document): void => {
  doc.querySelectorAll(".compare-diff-removed-note").forEach((node) => {
    node.remove();
  });

  doc.querySelectorAll(".compare-diff-marker").forEach((node) => {
    node.classList.remove(
      "compare-diff-marker",
      "compare-diff-marker--added",
      "compare-diff-marker--removed",
      "compare-diff-marker--changed"
    );
  });
};

const getComparableElements = (doc: Document): HTMLElement[] =>
  Array.from(doc.querySelectorAll<HTMLElement>(DIFF_SELECTOR)).filter((element) => {
    if (element.closest("script, style, noscript")) {
      return false;
    }

    return normalizeText(element.innerText || element.textContent).length > 0;
  });

function App() {
  const initialState = useMemo(() => readInitialStateFromQuery(), []);

  const [leftBaseDraft, setLeftBaseDraft] = useState(initialState.leftBase);
  const [rightBaseDraft, setRightBaseDraft] = useState(initialState.rightBase);
  const [leftBase, setLeftBase] = useState(initialState.leftBase);
  const [rightBase, setRightBase] = useState(initialState.rightBase);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [relativePathDraft, setRelativePathDraft] = useState(initialState.path);
  const [relativePath, setRelativePath] = useState(initialState.path);
  const [diffCount, setDiffCount] = useState(0);
  const [historyState, setHistoryState] = useState<HistoryState>(() => ({
    ...initialHistoryState(),
    entries: [initialState.path],
  }));

  const leftRef = useRef<HTMLIFrameElement>(null);
  const rightRef = useRef<HTMLIFrameElement>(null);
  const syncController = useRef(new SyncController());
  const urlWriteModeRef = useRef<"push" | "replace">("replace");

  const navigateTo = useCallback((nextPath: string, historyMode: "push" | "replace" = "push") => {
    const normalized = normalizeRelativePath(nextPath);
    urlWriteModeRef.current = historyMode;
    setRelativePath(normalized);
    setRelativePathDraft(normalized);

    if (historyMode === "push") {
      setHistoryState((current) => pushHistory(current, normalized));
      return;
    }

    setHistoryState((current) => ({
      ...current,
      entries: current.entries.map((entry, index) => (index === current.index ? normalized : entry)),
    }));
  }, []);

  const handleBridgeNavigate = useCallback(
    (side: PaneSide, absoluteUrl: string) => {
      const sourceBase = side === "left" ? leftBase : rightBase;
      const peerBase = side === "left" ? rightBase : leftBase;

      const relative = toRelativePath(absoluteUrl, sourceBase);
      if (!relative) {
        return;
      }

      // Only sync pages that can map onto the peer base.
      mapPathToPeer(relative, peerBase);
      navigateTo(relative, "push");
    },
    [leftBase, navigateTo, rightBase]
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (DEBUG_SYNC && event.data?.source === "compare-bridge") {
        // eslint-disable-next-line no-console
        console.debug("[compare-app] message received", event.data);
      }

      syncController.current.handleMessage(event, {
        leftIframe: leftRef.current,
        rightIframe: rightRef.current,
        enabled: syncEnabled,
        onNavigate: handleBridgeNavigate,
      });
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [handleBridgeNavigate, syncEnabled]);

  useEffect(() => {
    writeQueryState(urlWriteModeRef.current, leftBase, rightBase, relativePath);
    urlWriteModeRef.current = "replace";
  }, [leftBase, relativePath, rightBase]);

  const leftSrc = useMemo(
    () => `/api/render?side=left&base=${encodeURIComponent(leftBase)}&path=${encodeURIComponent(relativePath)}`,
    [leftBase, relativePath]
  );

  const rightSrc = useMemo(
    () => `/api/render?side=right&base=${encodeURIComponent(rightBase)}&path=${encodeURIComponent(relativePath)}`,
    [relativePath, rightBase]
  );

  const leftResolvedUrl = useMemo(() => mapPathToPeer(relativePath, leftBase), [leftBase, relativePath]);
  const rightResolvedUrl = useMemo(() => mapPathToPeer(relativePath, rightBase), [relativePath, rightBase]);

  const applyBaseUrls = useCallback(() => {
    urlWriteModeRef.current = "replace";
    setLeftBase(leftBaseDraft.trim());
    setRightBase(rightBaseDraft.trim());
    navigateTo(relativePathDraft, "replace");
  }, [leftBaseDraft, navigateTo, relativePathDraft, rightBaseDraft]);

  const canGoBack = historyState.index > 0;
  const canGoForward = historyState.index < historyState.entries.length - 1;

  const goHistory = useCallback((direction: "back" | "forward") => {
    urlWriteModeRef.current = "replace";
    setHistoryState((current) => {
      const next = stepHistory(current, direction);
      setRelativePath(next.entries[next.index]);
      setRelativePathDraft(next.entries[next.index]);
      return next;
    });
  }, []);

  const highlightDiffsInRightPane = useCallback(() => {
    const leftDoc = leftRef.current?.contentDocument;
    const rightDoc = rightRef.current?.contentDocument;

    if (!leftDoc || !rightDoc) {
      return;
    }

    if (leftDoc.readyState === "loading" || rightDoc.readyState === "loading") {
      return;
    }

    try {
      ensureDiffStyles(rightDoc);
      clearComparisonArtifacts(rightDoc);
      clearComparisonArtifacts(leftDoc);

      const leftElements = getComparableElements(leftDoc);
      const rightElements = getComparableElements(rightDoc);

      let nextDiffCount = 0;
      for (let index = 0; index < rightElements.length; index += 1) {
        const rightElement = rightElements[index];
        const leftElement = leftElements[index];
        const rightText = normalizeText(rightElement.innerText || rightElement.textContent);
        const leftText = normalizeText(leftElement?.innerText || leftElement?.textContent);

        if (!rightText) {
          continue;
        }

        if (!leftText) {
          rightElement.classList.add("compare-diff-marker", "compare-diff-marker--added");
          nextDiffCount += 1;
          continue;
        }

        if (rightText !== leftText) {
          rightElement.classList.add("compare-diff-marker", "compare-diff-marker--changed");
          nextDiffCount += 1;
        }
      }

      if (leftElements.length > rightElements.length) {
        for (let index = rightElements.length; index < leftElements.length; index += 1) {
          const leftOnlyText = normalizeText(leftElements[index]?.innerText || leftElements[index]?.textContent);
          if (!leftOnlyText) {
            continue;
          }

          const marker = rightDoc.createElement("div");
          marker.className = "compare-diff-removed-note";
          marker.textContent = `Removed from right: ${leftOnlyText.slice(0, 220)}`;
          rightDoc.body.appendChild(marker);
          nextDiffCount += 1;
        }
      }

      setDiffCount(nextDiffCount);
      if (DEBUG_SYNC) {
        // eslint-disable-next-line no-console
        console.debug("[compare-diff] updated", {
          leftCount: leftElements.length,
          rightCount: rightElements.length,
          diffCount: nextDiffCount,
        });
      }
    } catch (error) {
      if (DEBUG_SYNC) {
        // eslint-disable-next-line no-console
        console.debug("[compare-diff] failed", error);
      }
    }
  }, []);

  useEffect(() => {
    const leftIframe = leftRef.current;
    const rightIframe = rightRef.current;
    if (!leftIframe || !rightIframe) {
      return;
    }

    const scheduleDiffUpdate = () => {
      window.setTimeout(() => {
        highlightDiffsInRightPane();
      }, 180);
    };

    leftIframe.addEventListener("load", scheduleDiffUpdate);
    rightIframe.addEventListener("load", scheduleDiffUpdate);
    scheduleDiffUpdate();

    return () => {
      leftIframe.removeEventListener("load", scheduleDiffUpdate);
      rightIframe.removeEventListener("load", scheduleDiffUpdate);
    };
  }, [highlightDiffsInRightPane, leftSrc, rightSrc]);

  return (
    <div className="app-shell">
      <Toolbar
        leftBaseUrl={leftBaseDraft}
        rightBaseUrl={rightBaseDraft}
        currentPath={relativePathDraft}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        syncEnabled={syncEnabled}
        onLeftBaseUrlChange={setLeftBaseDraft}
        onRightBaseUrlChange={setRightBaseDraft}
        onPathChange={setRelativePathDraft}
        onApply={applyBaseUrls}
        onBack={() => goHistory("back")}
        onForward={() => goHistory("forward")}
        onToggleSync={() => setSyncEnabled((current) => !current)}
      />

      <main className="comparison-grid">
        <ComparisonPane side="left" title={`Left: ${leftBase}`} src={leftSrc} iframeRef={leftRef} />
        <ComparisonPane side="right" title={`Right: ${rightBase}`} src={rightSrc} iframeRef={rightRef} />
      </main>

      <footer className="status-bar">
        <div>
          <strong>Current path:</strong> {relativePath}
        </div>
        <div>
          <strong>Left target:</strong> {leftResolvedUrl}
        </div>
        <div>
          <strong>Right target:</strong> {rightResolvedUrl}
        </div>
        <div>
          <strong>History:</strong> {historyState.index + 1}/{historyState.entries.length}
        </div>
        <div>
          <strong>Right diffs:</strong> {diffCount}
        </div>
      </footer>
    </div>
  );
}

export default App;
