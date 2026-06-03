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

const getPathVariant = (value: string): "md" | "html" | null => {
  const parsed = new URL(normalizeRelativePath(value), "http://local.invalid");
  if (/\.md$/i.test(parsed.pathname)) {
    return "md";
  }

  if (/\.html$/i.test(parsed.pathname)) {
    return "html";
  }

  return null;
};

const switchPathVariant = (value: string): string | null => {
  const parsed = new URL(normalizeRelativePath(value), "http://local.invalid");

  if (/\.md$/i.test(parsed.pathname)) {
    parsed.pathname = parsed.pathname.replace(/\.md$/i, ".html");
    return normalizeRelativePath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  }

  if (/\.html$/i.test(parsed.pathname)) {
    parsed.pathname = parsed.pathname.replace(/\.html$/i, ".md");
    return normalizeRelativePath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  }

  return null;
};

const ensureDiffStyles = (doc: Document): void => {
  if (doc.getElementById("compare-diff-style")) {
    return;
  }

  const style = doc.createElement("style");
  style.id = "compare-diff-style";
  style.textContent = `
    .compare-diff-marker {
      border-radius: 0.18em;
      padding: 0.02em 0.16em;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }

    .compare-diff-marker--left-changed {
      color: #b42318 !important;
      background: #fde8e8 !important;
    }

    .compare-diff-marker--right-changed {
      color: #2b8a3e !important;
      background: #e9f7ef !important;
    }
  `;
  doc.head.appendChild(style);
};

const clearComparisonArtifacts = (doc: Document): void => {
  doc.querySelectorAll(".compare-diff-marker").forEach((node) => {
    node.classList.remove(
      "compare-diff-marker",
      "compare-diff-marker--left-changed",
      "compare-diff-marker--right-changed"
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

const getElementText = (element: HTMLElement | undefined): string =>
  normalizeText(element?.innerText || element?.textContent);

const countElementTexts = (elements: HTMLElement[]): Map<string, number> => {
  const counts = new Map<string, number>();

  elements.forEach((element) => {
    const text = getElementText(element);
    if (!text) {
      return;
    }

    counts.set(text, (counts.get(text) || 0) + 1);
  });

  return counts;
};

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
    (side: PaneSide, absoluteUrl: string, messageType: "bridge:navigate" | "bridge:location") => {
      if (messageType !== "bridge:navigate") {
        return;
      }

      const sourceBase = side === "left" ? leftBase : rightBase;
      const peerBase = side === "left" ? rightBase : leftBase;

      const relative = toRelativePath(absoluteUrl, sourceBase);
      if (!relative) {
        if (DEBUG_SYNC) {
          // eslint-disable-next-line no-console
          console.debug("[compare-app] ignored navigate; URL is outside mapped base", {
            side,
            absoluteUrl,
            sourceBase,
          });
        }
        return;
      }

      // Validate peer mapping but do not block same-base navigation if peer base is temporarily invalid.
      try {
        mapPathToPeer(relative, peerBase);
      } catch (error) {
        if (DEBUG_SYNC) {
          // eslint-disable-next-line no-console
          console.debug("[compare-app] peer mapping failed; continuing with path navigation", {
            side,
            relative,
            peerBase,
            error,
          });
        }
      }

      if (DEBUG_SYNC) {
        // eslint-disable-next-line no-console
        console.debug("[compare-app] calling navigateTo", {
          side,
          absoluteUrl,
          relative,
        });
      }

      navigateTo(relative, "push");

      if (DEBUG_SYNC) {
        // eslint-disable-next-line no-console
        console.debug("[compare-app] navigated comparer path for mapped link", {
          side,
          absoluteUrl,
          relative,
        });
      }
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
    () =>
      `/api/render?side=left&base=${encodeURIComponent(leftBase)}&peerBase=${encodeURIComponent(rightBase)}&path=${encodeURIComponent(relativePath)}`,
    [leftBase, relativePath, rightBase]
  );

  const rightSrc = useMemo(
    () =>
      `/api/render?side=right&base=${encodeURIComponent(rightBase)}&peerBase=${encodeURIComponent(leftBase)}&path=${encodeURIComponent(relativePath)}`,
    [leftBase, relativePath, rightBase]
  );

  const leftResolvedUrl = useMemo(() => mapPathToPeer(relativePath, leftBase), [leftBase, relativePath]);
  const rightResolvedUrl = useMemo(() => mapPathToPeer(relativePath, rightBase), [relativePath, rightBase]);

  const applyBaseUrls = useCallback(() => {
    urlWriteModeRef.current = "replace";
    setLeftBase(leftBaseDraft.trim());
    setRightBase(rightBaseDraft.trim());
    navigateTo(relativePathDraft, "replace");
  }, [leftBaseDraft, navigateTo, relativePathDraft, rightBaseDraft]);

  const pathVariant = useMemo(() => getPathVariant(relativePath), [relativePath]);
  const canTogglePathVariant = pathVariant !== null;

  const togglePathVariant = useCallback(() => {
    const nextPath = switchPathVariant(relativePath);
    if (!nextPath) {
      return;
    }

    navigateTo(nextPath, "push");
  }, [navigateTo, relativePath]);

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
      const isMarkdownDiffView =
        leftDoc.querySelector(".markdown-diff-block") !== null &&
        rightDoc.querySelector(".markdown-diff-block") !== null;

      if (isMarkdownDiffView) {
        clearComparisonArtifacts(rightDoc);
        clearComparisonArtifacts(leftDoc);
        const markdownDiffCount =
          leftDoc.querySelectorAll(".markdown-word-diff").length +
          rightDoc.querySelectorAll(".markdown-word-diff").length;
        setDiffCount(markdownDiffCount);
        return;
      }

      ensureDiffStyles(leftDoc);
      ensureDiffStyles(rightDoc);
      clearComparisonArtifacts(rightDoc);
      clearComparisonArtifacts(leftDoc);

      const leftElements = getComparableElements(leftDoc);
      const rightElements = getComparableElements(rightDoc);
      const leftTextPool = countElementTexts(leftElements);
      const rightTextPool = countElementTexts(rightElements);

      let nextDiffCount = 0;
      for (let index = 0; index < leftElements.length; index += 1) {
        const leftElement = leftElements[index];
        const leftText = getElementText(leftElement);

        if (!leftText) {
          continue;
        }

        const remainingMatches = rightTextPool.get(leftText) || 0;
        if (remainingMatches > 0) {
          rightTextPool.set(leftText, remainingMatches - 1);
        } else {
          leftElement.classList.add("compare-diff-marker", "compare-diff-marker--left-changed");
          nextDiffCount += 1;
        }
      }

      for (let index = 0; index < rightElements.length; index += 1) {
        const rightElement = rightElements[index];
        const rightText = getElementText(rightElement);

        if (!rightText) {
          continue;
        }

        const remainingMatches = leftTextPool.get(rightText) || 0;
        if (remainingMatches > 0) {
          leftTextPool.set(rightText, remainingMatches - 1);
        } else {
          rightElement.classList.add("compare-diff-marker", "compare-diff-marker--right-changed");
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

  const alignMarkdownBlocksAcrossPanes = useCallback(() => {
    const leftDoc = leftRef.current?.contentDocument;
    const rightDoc = rightRef.current?.contentDocument;

    if (!leftDoc || !rightDoc) {
      return;
    }

    const leftBlocks = Array.from(leftDoc.querySelectorAll<HTMLElement>(".markdown-diff-block"));
    const rightBlocks = Array.from(rightDoc.querySelectorAll<HTMLElement>(".markdown-diff-block"));

    if (leftBlocks.length === 0 || rightBlocks.length === 0) {
      return;
    }

    leftBlocks.forEach((block) => {
      block.style.minHeight = "";
    });
    rightBlocks.forEach((block) => {
      block.style.minHeight = "";
    });

    const pairCount = Math.min(leftBlocks.length, rightBlocks.length);
    for (let index = 0; index < pairCount; index += 1) {
      const leftBlock = leftBlocks[index];
      const rightBlock = rightBlocks[index];
      const alignedHeight = Math.max(leftBlock.offsetHeight, rightBlock.offsetHeight);
      leftBlock.style.minHeight = `${alignedHeight}px`;
      rightBlock.style.minHeight = `${alignedHeight}px`;
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
        window.requestAnimationFrame(() => {
          alignMarkdownBlocksAcrossPanes();
        });
      }, 180);
    };

    leftIframe.addEventListener("load", scheduleDiffUpdate);
    rightIframe.addEventListener("load", scheduleDiffUpdate);
    window.addEventListener("resize", scheduleDiffUpdate);
    scheduleDiffUpdate();

    return () => {
      leftIframe.removeEventListener("load", scheduleDiffUpdate);
      rightIframe.removeEventListener("load", scheduleDiffUpdate);
      window.removeEventListener("resize", scheduleDiffUpdate);
    };
  }, [alignMarkdownBlocksAcrossPanes, highlightDiffsInRightPane, leftSrc, rightSrc]);

  return (
    <div className="app-shell">
      <Toolbar
        leftBaseUrl={leftBaseDraft}
        rightBaseUrl={rightBaseDraft}
        currentPath={relativePathDraft}
        pathVariant={pathVariant}
        canTogglePathVariant={canTogglePathVariant}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        syncEnabled={syncEnabled}
        onLeftBaseUrlChange={setLeftBaseDraft}
        onRightBaseUrlChange={setRightBaseDraft}
        onPathChange={setRelativePathDraft}
        onApply={applyBaseUrls}
        onTogglePathVariant={togglePathVariant}
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
          <strong>Diffs:</strong> {diffCount}
        </div>
      </footer>
    </div>
  );
}

export default App;
