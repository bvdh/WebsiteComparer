import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diffLines } from "diff";
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
  const canonicalSegments = side === "left" ? diffLines(markdown, peerMarkdown) : diffLines(peerMarkdown, markdown);

  const segments = canonicalSegments.map((part) => {
    const lineCount = Math.max(1, part.value.split("\n").length);
    const isCurrentContent = part.added ? side === "right" : part.removed ? side === "left" : true;

    if (!isCurrentContent) {
      return `
      <section class="markdown-diff-block markdown-diff-block--removed markdown-diff-block--placeholder" style="--markdown-diff-lines: ${lineCount};">
        <div class="markdown-diff-placeholder" aria-hidden="true"></div>
      </section>
    `;
    }

    const blockClass = part.added
      ? "markdown-diff-block markdown-diff-block--added"
      : part.removed
        ? "markdown-diff-block markdown-diff-block--removed"
        : "markdown-diff-block markdown-diff-block--same";

    return `
      <section class="${blockClass}">
        <div class="markdown-diff-content">${marked.parse(part.value)}</div>
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
      margin: 0 0 1rem;
      padding: 0.85rem 1rem;
      border-radius: 14px;
      border-left: 6px solid transparent;
    }

    .markdown-diff-block--added {
      background: #eef8f0;
      border-left-color: #2f9e44;
    }

    .markdown-diff-block--removed {
      background: #fff5f5;
      border-left-color: #c92a2a;
      opacity: 0.9;
    }

    .markdown-diff-block--placeholder {
      min-height: calc(var(--markdown-diff-lines, 1) * 1.6rem + 1.7rem);
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
            const rendered = renderMarkdownDiffDocument(comparableMarkdown, comparablePeerMarkdown, side, targetUrl);
            res.status(upstream.status);
            res.setHeader("content-type", "text/html; charset=utf-8");
            res.send(rendered);
            return;
          }
        } catch (peerError) {
          // Fall back to the local markdown render if the peer document cannot be fetched.
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
