import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const distPath = path.resolve(__dirname, "..", "dist");

const bridgeScriptPath = path.join(__dirname, "inject", "clientBridge.js");
const bridgeScript = fs.readFileSync(bridgeScriptPath, "utf8");

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

const removeCspMeta = (html) =>
  html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");

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

app.get("/api/bridge.js", (req, res) => {
  const side = typeof req.query.side === "string" ? req.query.side : "unknown";

  res.setHeader("content-type", "application/javascript; charset=utf-8");
  res.send(`window.__COMPARE_SIDE__=${JSON.stringify(side)};\n${bridgeScript}`);
});

app.get("/api/render", async (req, res) => {
  const base = typeof req.query.base === "string" ? req.query.base : "";
  const side = typeof req.query.side === "string" ? req.query.side : "unknown";
  const pagePath = normalizePath(typeof req.query.path === "string" ? req.query.path : "/");

  if (!isHttpUrl(base)) {
    res.status(400).send("Invalid base URL");
    return;
  }

  const targetBase = new URL(base);
  const targetUrl = resolveTargetUrl(targetBase, pagePath);

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "user-agent": "comparesites-proxy/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    const contentType = upstream.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      const html = await upstream.text();
      const instrumented = injectBridge(html, side, targetUrl);
      res.status(upstream.status);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(instrumented);
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
