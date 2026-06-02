export const normalizeRelativePath = (value: string): string => {
  const trimmed = (value || "/").trim();
  if (!trimmed) {
    return "/";
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  return `/${trimmed}`;
};

const baseDirectoryPath = (baseUrl: string): string | null => {
  try {
    const base = new URL(baseUrl);
    return base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  } catch {
    return null;
  }
};

const normalizePathForBaseMatch = (pathname: string): string => {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
};

const splitLogicalPath = (relativePath: string): { pathname: string; search: string; hash: string } => {
  const parsed = new URL(normalizeRelativePath(relativePath), "http://local.invalid");
  return {
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
  };
};

const joinPath = (baseDir: string, logicalPathname: string): string => {
  const suffix = logicalPathname.replace(/^\/+/, "");
  if (!suffix) {
    return baseDir;
  }
  return `${baseDir}${suffix}`.replace(/\/+/g, "/");
};

export const toRelativePath = (absoluteUrl: string, baseUrl: string): string | null => {
  try {
    const target = new URL(absoluteUrl);
    const base = new URL(baseUrl);
    const baseDir = baseDirectoryPath(baseUrl);
    const basePath = normalizePathForBaseMatch(base.pathname);
    const targetPath = normalizePathForBaseMatch(target.pathname);

    if (target.origin !== base.origin || !baseDir) {
      return null;
    }

    // Treat links that resolve to the base root (e.g. /docs vs /docs/) as logical '/'.
    if (targetPath === basePath) {
      return normalizeRelativePath(`/${target.search}${target.hash}`);
    }

    if (!target.pathname.startsWith(baseDir)) {
      return null;
    }

    const suffix = target.pathname.slice(baseDir.length);
    const logicalPathname = suffix ? `/${suffix}` : "/";

    return normalizeRelativePath(`${logicalPathname}${target.search}${target.hash}`);
  } catch {
    return null;
  }
};

export const mapPathToPeer = (relativePath: string, peerBaseUrl: string): string => {
  const baseDir = baseDirectoryPath(peerBaseUrl);
  const logical = splitLogicalPath(relativePath);

  if (!baseDir) {
    return new URL(normalizeRelativePath(relativePath), peerBaseUrl).toString();
  }

  const resolved = new URL(peerBaseUrl);
  resolved.pathname = joinPath(baseDir, logical.pathname);
  resolved.search = logical.search;
  resolved.hash = logical.hash;
  return resolved.toString();
};
