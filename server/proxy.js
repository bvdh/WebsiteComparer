import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diffArrays, diffWordsWithSpace } from "diff";
import { marked } from "marked";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const distPath = path.resolve(__dirname, "..", "dist");

const bridgeScriptPath = path.join(__dirname, "inject", "clientBridge.js");
const bridgeScript = fs.readFileSync(bridgeScriptPath, "utf8");

marked.setOptions({
  breaks: true,
  gfm: true,
});

app.use(cors());

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const normalizePath = (value) => {
  if (!value || typeof value !== "string") {
    return "/";
  }

  if (value.startsWith("/")) {
    return value;
  }

  return `/${value}`;
};

const baseDirectoryPath = (baseUrl) =>
  baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;

const splitLogicalPath = (logicalPath) => {
  const parsed = new URL(normalizePath(logicalPath), "http://local.invalid");
  return {
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
  };
};

const joinPath = (baseDir, logicalPathname) => {
  const suffix = logicalPathname.replace(/^\/+/, "");
  if (!suffix) {
    return baseDir;
  }
  return `${baseDir}${suffix}`.replace(/\/+/g, "/");
};

const resolveTargetUrl = (baseUrl, logicalPath) => {
  const baseDir = baseDirectoryPath(baseUrl);
  const logical = splitLogicalPath(logicalPath);
  const resolved = new URL(baseUrl.href);
  resolved.pathname = joinPath(baseDir, logical.pathname);
  resolved.search = logical.search;
  resolved.hash = logical.hash;
  return resolved;
};

const HTTP_URL_IN_TEXT = /https?:\/\/[^\s<>"]+/g;

const normalizeAbsoluteUrlForBase = (urlValue, baseUrl) => {
  try {
    const parsed = new URL(urlValue);
    if (parsed.origin !== baseUrl.origin) {
      return urlValue;
    }

    const baseDir = baseDirectoryPath(baseUrl);
    if (!parsed.pathname.startsWith(baseDir)) {
      return urlValue;
    }

    const suffix = parsed.pathname.slice(baseDir.length);
    const normalizedPath = suffix ? `/${suffix}` : "/";
    return `${normalizedPath}${parsed.search}${parsed.hash}`;
  } catch {
    return urlValue;
  }
};

const normalizeMarkdownUrlsForBase = (markdown, baseUrl) =>
  markdown.replace(HTTP_URL_IN_TEXT, (match) => normalizeAbsoluteUrlForBase(match, baseUrl));

const removeCspMeta = (html) =>
  html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const injectBridge = (html, side, targetUrl) => {
  const sanitized = removeCspMeta(html);
  const sideValue = encodeURIComponent(side || "unknown");
  const bridgeTag = `<script src="/api/bridge.js?side=${sideValue}" defer></script>`;
  const baseTag = `<base href="${targetUrl.href}">`;

  if (/<head[^>]*>/i.test(sanitized)) {
    // Keep bridge first so /api/bridge.js resolves against the local document URL
    // before the page <base> rewrites URL resolution to the upstream site.
    return sanitized.replace(/<head[^>]*>/i, (match) => `${match}\n${bridgeTag}\n${baseTag}`);
  }

  return `${bridgeTag}\n${baseTag}\n${sanitized}`;
};

const renderMarkdownDocument = (markdown, side, targetUrl) => {
  const title = escapeHtml(path.posix.basename(targetUrl.pathname) || "Markdown");
  const body = marked.parse(markdown);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light;
    }

    body {
      margin: 0;
      padding: 32px 28px 48px;
      background: #fff;
      color: #1c1a14;
      font: 16px/1.6 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .markdown-page {
      max-width: 920px;
      margin: 0 auto;
    }

    .markdown-page > :first-child {
      margin-top: 0;
    }

    .markdown-page > :last-child {
      margin-bottom: 0;
    }

    .markdown-page h1,
    .markdown-page h2,
    .markdown-page h3,
    .markdown-page h4,
    .markdown-page h5,
    .markdown-page h6 {
      line-height: 1.2;
      margin: 1.4em 0 0.6em;
    }

    .markdown-page h1 { font-size: 2.2rem; }
    .markdown-page h2 { font-size: 1.75rem; }
    .markdown-page h3 { font-size: 1.35rem; }

    .markdown-page p,
    .markdown-page ul,
    .markdown-page ol,
    .markdown-page blockquote,
    .markdown-page pre,
    .markdown-page table {
      margin: 0 0 0.6rem;
    }

    .markdown-page a {
      color: #1f6f78;
      text-decoration-thickness: 2px;
      text-underline-offset: 0.15em;
    }

    .markdown-page blockquote {
      border-left: 4px solid #c8c0ad;
      padding: 0.2rem 0 0.2rem 1rem;
      color: #5a5447;
    }

    .markdown-page pre {
      overflow: auto;
      padding: 1rem 1.1rem;
      border-radius: 12px;
      background: #f6f4ee;
    }

    .markdown-page code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.95em;
      background: #f6f4ee;
      padding: 0.1rem 0.28rem;
      border-radius: 6px;
    }

    .markdown-page pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
    }

    .markdown-page table {
      width: 100%;
      border-collapse: collapse;
    }

    .markdown-page th,
    .markdown-page td {
      border: 1px solid #c8c0ad;
      padding: 0.5rem 0.7rem;
      vertical-align: top;
    }

    .markdown-page img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <main class="markdown-page">${body}</main>
</body>
</html>`;

  return injectBridge(html, side, targetUrl);
};

const renderMarkdownDiffDocument = (markdown, peerMarkdown, side, targetUrl) => {
  const title = escapeHtml(path.posix.basename(targetUrl.pathname) || "Markdown diff");
  const splitParagraphs = (source) =>
    (() => {
      const lines = source.replace(/\r\n/g, "\n").split("\n");
      const parts = [];
      let current = [];
      let insideFence = false;

      const flushCurrent = () => {
        const value = current.join("\n").trim();
        if (value.length > 0) {
          parts.push(value);
        }
        current = [];
      };

      lines.forEach((line) => {
        const isFence = /^```/.test(line.trim());

        if (!insideFence && line.trim() === "") {
          flushCurrent();
          return;
        }

        current.push(line);

        if (isFence) {
          insideFence = !insideFence;
        }
      });

      flushCurrent();
      return parts;
    })();

  const parseFencedCodeBlock = (value) => {
    const match = value.match(/^```([^`\n]*)\n([\s\S]*?)\n?```$/);
    if (!match) {
      return null;
    }

    return {
      language: (match[1] || "").trim(),
      code: match[2] || "",
    };
  };

  const buildParagraphRows = (leftMarkdown, rightMarkdown) => {
    const leftParagraphs = splitParagraphs(leftMarkdown);
    const rightParagraphs = splitParagraphs(rightMarkdown);
    const paragraphDiff = diffArrays(leftParagraphs, rightParagraphs);
    const rows = [];

    for (let index = 0; index < paragraphDiff.length; index += 1) {
      const part = paragraphDiff[index];

      if (part.removed && paragraphDiff[index + 1]?.added) {
        const removedParagraphs = part.value;
        const addedParagraphs = paragraphDiff[index + 1].value;
        const pairCount = Math.max(removedParagraphs.length, addedParagraphs.length);
        for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
          rows.push({
            left: removedParagraphs[pairIndex] || "",
            right: addedParagraphs[pairIndex] || "",
            changed: true,
          });
        }

        index += 1;
        continue;
      }

      if (part.removed) {
        part.value.forEach((paragraph) => {
          rows.push({ left: paragraph, right: "", changed: true });
        });
        continue;
      }

      if (part.added) {
        part.value.forEach((paragraph) => {
          rows.push({ left: "", right: paragraph, changed: true });
        });
        continue;
      }

      part.value.forEach((paragraph) => {
        rows.push({ left: paragraph, right: paragraph, changed: false });
      });
    }

    return rows;
  };

  const wrapWordHighlights = (value) =>
    value.replace(/([A-Za-z0-9][A-Za-z0-9_-]*)/g, '<span class="markdown-word-diff">$1</span>');

  const wrapCodeHighlights = (value) =>
    value
      .split(/(\s+)/)
      .map((token) => {
        if (!token || /^\s+$/.test(token)) {
          return escapeHtml(token || "");
        }

        return `<span class="markdown-word-diff">${escapeHtml(token)}</span>`;
      })
      .join("");

  const highlightChangedCode = (leftCode, rightCode, sideValue) => {
    const codeSegments = diffWordsWithSpace(leftCode, rightCode);
    return codeSegments
      .map((part) => {
        if (part.removed && sideValue === "left") {
          return wrapCodeHighlights(part.value);
        }

        if (part.added && sideValue === "right") {
          return wrapCodeHighlights(part.value);
        }

        if (part.removed || part.added) {
          return "";
        }

        return escapeHtml(part.value);
      })
      .join("");
  };

  const highlightChangedWords = (leftText, rightText, sideValue) => {
    const wordSegments = diffWordsWithSpace(leftText, rightText);
    return wordSegments
      .map((part) => {
        if (part.removed && sideValue === "left") {
          return wrapWordHighlights(part.value);
        }

        if (part.added && sideValue === "right") {
          return wrapWordHighlights(part.value);
        }

        if (part.removed || part.added) {
          return "";
        }

        return part.value;
      })
      .join("");
  };

  const renderRowContent = (row) => {
    const currentText = side === "left" ? row.left : row.right;
    const peerText = side === "left" ? row.right : row.left;

    if (!currentText) {
      return "";
    }

    if (!row.changed) {
      return marked.parse(currentText);
    }

    const currentCodeBlock = parseFencedCodeBlock(currentText);
    const peerCodeBlock = peerText ? parseFencedCodeBlock(peerText) : null;
    if (currentCodeBlock && (!peerText || peerCodeBlock)) {
      const leftCodeBlock = row.left ? parseFencedCodeBlock(row.left) : null;
      const rightCodeBlock = row.right ? parseFencedCodeBlock(row.right) : null;
      const languageClass = currentCodeBlock.language
        ? ` language-${escapeHtml(currentCodeBlock.language)}`
        : "";
      const codeClass =
        side === "left"
          ? "markdown-diff-code markdown-diff-code--left"
          : "markdown-diff-code markdown-diff-code--right";

      let renderedCode = "";
      if (!peerCodeBlock) {
        renderedCode = wrapCodeHighlights(currentCodeBlock.code);
      } else {
        renderedCode = highlightChangedCode(leftCodeBlock?.code || "", rightCodeBlock?.code || "", side);
      }

      return `<pre class="${codeClass}"><code class="${languageClass.trim()}">${renderedCode}</code></pre>`;
    }

    if (!peerText) {
      return marked.parse(wrapWordHighlights(currentText));
    }

    return marked.parse(highlightChangedWords(row.left, row.right, side));
  };

  const wordHighlightTextColor = side === "left" ? "#b42318" : "#2b8a3e";
  const wordHighlightBackgroundColor = side === "left" ? "#fde8e8" : "#e9f7ef";

  const paragraphRows = buildParagraphRows(markdown, peerMarkdown);

  const segments = paragraphRows.map((row) => {
    const currentText = side === "left" ? row.left : row.right;
    const peerText = side === "left" ? row.right : row.left;
    const lineCount = Math.max(1, (currentText || peerText || "").split("\n").length);

    if (!currentText) {
      return `
      <section class="markdown-diff-block markdown-diff-block--removed markdown-diff-block--placeholder" style="--markdown-diff-lines: ${lineCount};">
        <div class="markdown-diff-placeholder" aria-hidden="true"></div>
      </section>
    `;
    }

    const blockClass = !row.changed
      ? "markdown-diff-block markdown-diff-block--same"
      : side === "left"
        ? "markdown-diff-block markdown-diff-block--removed"
        : "markdown-diff-block markdown-diff-block--added";

    return `
      <section class="${blockClass}">
        <div class="markdown-diff-content">${renderRowContent(row)}</div>
      </section>
    `;
  });

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light;
    }

    body {
      margin: 0;
      padding: 32px 28px 48px;
      background: #fff;
      color: #1c1a14;
      font: 16px/1.6 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .markdown-page {
      max-width: 920px;
      margin: 0 auto;
    }

    .markdown-page > :first-child {
      margin-top: 0;
    }

    .markdown-page > :last-child {
      margin-bottom: 0;
    }

    .markdown-page h1,
    .markdown-page h2,
    .markdown-page h3,
    .markdown-page h4,
    .markdown-page h5,
    .markdown-page h6 {
      line-height: 1.2;
      margin: 1.4em 0 0.6em;
    }

    .markdown-page h1 { font-size: 2.2rem; }
    .markdown-page h2 { font-size: 1.75rem; }
    .markdown-page h3 { font-size: 1.35rem; }

    .markdown-page p,
    .markdown-page ul,
    .markdown-page ol,
    .markdown-page blockquote,
    .markdown-page pre,
    .markdown-page table {
      margin: 0 0 1rem;
    }

    .markdown-page a {
      color: #1f6f78;
      text-decoration-thickness: 2px;
      text-underline-offset: 0.15em;
    }

    .markdown-page blockquote {
      border-left: 4px solid #c8c0ad;
      padding: 0.2rem 0 0.2rem 1rem;
      color: #5a5447;
    }

    .markdown-page pre {
      overflow: auto;
      padding: 1rem 1.1rem;
      border-radius: 12px;
      background: #f6f4ee;
    }

    .markdown-page code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.95em;
      background: #f6f4ee;
      padding: 0.1rem 0.28rem;
      border-radius: 6px;
    }

    .markdown-page pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
    }

    .markdown-page table {
      width: 100%;
      border-collapse: collapse;
    }

    .markdown-page th,
    .markdown-page td {
      border: 1px solid #c8c0ad;
      padding: 0.5rem 0.7rem;
      vertical-align: top;
    }

    .markdown-page img {
      max-width: 100%;
      height: auto;
    }

    .markdown-diff-block {
      margin: 0 0 0.45rem;
      padding: 0.6rem 0.75rem;
      border-radius: 14px;
    }

    .markdown-diff-block--added {
      color: inherit;
    }

    .markdown-diff-block--removed {
      color: inherit;
    }

    .markdown-word-diff {
      color: ${wordHighlightTextColor};
      font-weight: 600;
    }

    .markdown-diff-code {
      margin: 0;
      overflow: auto;
      padding: 1rem 1.1rem;
      border-radius: 12px;
      font-size: 0.95em;
    }

    .markdown-diff-code code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: transparent;
      padding: 0;
      border-radius: 0;
      white-space: pre;
    }

    .markdown-diff-code--left {
      color: #b42318;
      background: #fde8e8;
    }

    .markdown-diff-code--right {
      color: #2b8a3e;
      background: #e9f7ef;
    }

    .markdown-diff-code .markdown-word-diff {
      background: ${wordHighlightBackgroundColor};
      border-radius: 0.18em;
      padding: 0 0.12em;
    }

    .markdown-diff-block--placeholder {
      min-height: calc(var(--markdown-diff-lines, 1) * 1.35rem + 1rem);
      display: flex;
      align-items: center;
    }

    .markdown-diff-placeholder {
      width: 100%;
      min-height: 1.6rem;
    }
  </style>
</head>
<body>
  <main class="markdown-page">
    ${segments.join("\n")}
  </main>
</body>
</html>`;

  return injectBridge(html, side, targetUrl);
};

app.get("/api/bridge.js", (req, res) => {
  const side = typeof req.query.side === "string" ? req.query.side : "unknown";

  res.setHeader("content-type", "application/javascript; charset=utf-8");
  res.send(`window.__COMPARE_SIDE__=${JSON.stringify(side)};\n${bridgeScript}`);
});

app.get("/api/render", async (req, res) => {
  const base = typeof req.query.base === "string" ? req.query.base : "";
  const peerBase = typeof req.query.peerBase === "string" ? req.query.peerBase : "";
  const side = typeof req.query.side === "string" ? req.query.side : "unknown";
  const pagePath = normalizePath(typeof req.query.path === "string" ? req.query.path : "/");

  if (!isHttpUrl(base)) {
    res.status(400).send("Invalid base URL");
    return;
  }

  const targetBase = new URL(base);
  const peerBaseUrl = isHttpUrl(peerBase) ? new URL(peerBase) : null;
  const targetUrl = resolveTargetUrl(targetBase, pagePath);
  const peerUrl = peerBaseUrl ? resolveTargetUrl(peerBaseUrl, pagePath) : null;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "user-agent": "comparesites-proxy/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    const contentType = upstream.headers.get("content-type") || "";
    const isMarkdown = targetUrl.pathname.toLowerCase().endsWith(".md") || contentType.includes("markdown");

    if (contentType.includes("text/html")) {
      const html = await upstream.text();
      const instrumented = injectBridge(html, side, targetUrl);
      res.status(upstream.status);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(instrumented);
      return;
    }

    if (isMarkdown) {
      const markdown = await upstream.text();
      if (peerUrl) {
        try {
          const peerUpstream = await fetch(peerUrl, {
            headers: {
              "user-agent": "comparesites-proxy/1.0",
              accept: "text/markdown,text/plain,application/octet-stream;q=0.8,*/*;q=0.5",
            },
            redirect: "follow",
          });

          const peerContentType = peerUpstream.headers.get("content-type") || "";
          const peerIsMarkdown = peerUrl.pathname.toLowerCase().endsWith(".md") || peerContentType.includes("markdown");

          if (peerIsMarkdown && peerBaseUrl) {
            const peerMarkdown = await peerUpstream.text();
            const comparableMarkdown = normalizeMarkdownUrlsForBase(markdown, targetBase);
            const comparablePeerMarkdown = normalizeMarkdownUrlsForBase(peerMarkdown, peerBaseUrl);
            const canonicalLeftMarkdown = side === "left" ? comparableMarkdown : comparablePeerMarkdown;
            const canonicalRightMarkdown = side === "left" ? comparablePeerMarkdown : comparableMarkdown;
            const rendered = renderMarkdownDiffDocument(canonicalLeftMarkdown, canonicalRightMarkdown, side, targetUrl);
            res.status(upstream.status);
            res.setHeader("content-type", "text/html; charset=utf-8");
            res.send(rendered);
            return;
          }
        } catch (peerError) {
          // Fall back to local markdown render if peer fetch fails.
          console.warn("[compare-sites] markdown peer fetch failed; rendering single document", peerError);
        }
      }

      const rendered = renderMarkdownDocument(markdown, side, targetUrl);
      res.status(upstream.status);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(rendered);
      return;
    }

    const body = await upstream.arrayBuffer();
    res.status(upstream.status);
    if (contentType) {
      res.setHeader("content-type", contentType);
    }
    res.send(Buffer.from(body));
  } catch (error) {
    res.status(502).send(`Proxy error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`CompareSites proxy running at http://${HOST}:${PORT}`);
});
