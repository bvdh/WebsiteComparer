import { toRelativePath } from "../sync/urlMapping";

const SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,td,th,pre,code,blockquote,div.callout-box";
const LOCAL_WINDOW = 24;

export type HtmlBlock = {
  element: HTMLElement;
  text: string;
  signature: string;
  heading: boolean;
  keys: string[];
};

export type Alignment =
  | { kind: "match"; left: HtmlBlock; right: HtmlBlock }
  | { kind: "remove"; left: HtmlBlock }
  | { kind: "add"; right: HtmlBlock };

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();

export const hasNestedBlocks = (element: HTMLElement): boolean =>
  !element.matches("div.callout-box") && element.querySelector(SELECTOR) !== null;

// Selected descendants own their text; callouts are deliberately atomic.
export const blockTextNodes = (element: HTMLElement): Text[] => {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (element.matches("div.callout-box") || node.parentElement?.closest(SELECTOR) === element) {
      nodes.push(node as Text);
    }
    node = walker.nextNode();
  }
  return nodes;
};

export const readHtmlBlocks = (doc: Document, siteBase: string): HtmlBlock[] =>
  Array.from(doc.querySelectorAll<HTMLElement>(SELECTOR))
    .filter((element) => !element.closest("script,style,noscript") &&
      !element.parentElement?.closest("div.callout-box"))
    .map((element): HtmlBlock => {
      const text = normalize(blockTextNodes(element).map((node) => node.data).join(""));
      const heading = /^H[1-6]$/.test(element.tagName);
      const signature = `${element.tagName}:${text}`;
      const keys: string[] = [];
      if (heading) {
        if (element.id) keys.push(`heading-id:${element.tagName}:${element.id}`);
        keys.push(`heading-text:${signature}`);
      } else if (!element.matches("div.callout-box")) {
        const links = Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]"))
          .filter((link) => link.closest(SELECTOR) === element);
        const link = links.length === 1 ? links[0] : undefined;
        if (link && normalize(link.textContent || "") === text) {
          const relative = toRelativePath(link.href, siteBase);
          if (relative) keys.push(`entry:${element.tagName}:${relative}`);
        }
        if (text) keys.push(`text:${signature}`);
      }
      return { element, text, signature, heading, keys };
    })
    .filter((block) => block.text.length > 0);

type Anchor = { left: number; right: number };

const uniqueKeys = (blocks: HtmlBlock[], start: number, end: number, headings: boolean) => {
  const keys = new Map<string, number>();
  for (let index = start; index < end; index += 1) {
    if (blocks[index].heading !== headings) continue;
    for (const key of blocks[index].keys) {
      keys.set(key, keys.has(key) ? -1 : index);
    }
  }
  return keys;
};

// A longest increasing subsequence prevents anchors from matching reordered sections.
const anchors = (
  left: HtmlBlock[], right: HtmlBlock[],
  leftStart: number, leftEnd: number, rightStart: number, rightEnd: number,
  headings: boolean, leftScopes?: string[], rightScopes?: string[]
): Anchor[] => {
  const leftKeys = uniqueKeys(left, leftStart, leftEnd, headings);
  const rightKeys = uniqueKeys(right, rightStart, rightEnd, headings);
  const candidates: Anchor[] = [];
  const usedRight = new Set<number>();
  for (let index = leftStart; index < leftEnd; index += 1) {
    if (left[index].heading !== headings) continue;
    for (const key of left[index].keys) {
      const peer = rightKeys.get(key);
      if (leftKeys.get(key) !== index || peer === undefined || peer < 0 || usedRight.has(peer)) continue;
      if (leftScopes && rightScopes && leftScopes[index] !== rightScopes[peer]) continue;
      candidates.push({ left: index, right: peer });
      usedRight.add(peer);
      break;
    }
  }
  const tails: number[] = [];
  const previous: number[] = [];
  candidates.forEach((candidate, index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (candidates[tails[middle]].right < candidate.right) low = middle + 1;
      else high = middle;
    }
    previous[index] = low > 0 ? tails[low - 1] : -1;
    tails[low] = index;
  });
  const result: Anchor[] = [];
  let cursor = tails.length ? tails[tails.length - 1] : -1;
  while (cursor >= 0) {
    result.push(candidates[cursor]);
    cursor = previous[cursor];
  }
  return result.reverse();
};

const scopes = (blocks: HtmlBlock[], matched: Map<number, string>, side: string): string[] => {
  let scope = "root";
  return blocks.map((block, index) => {
    if (block.heading) scope = matched.get(index) || `${side}:${index}`;
    return scope;
  });
};

const headingAnchors = (left: HtmlBlock[], right: HtmlBlock[]): Anchor[] => {
  const reliable = anchors(left, right, 0, left.length, 0, right.length, true);
  const result: Anchor[] = [];
  let ls = 0;
  let rs = 0;
  for (const boundary of [...reliable, { left: left.length, right: right.length }]) {
    const l: number[] = [];
    const r: number[] = [];
    for (let i = ls; i < boundary.left; i += 1) if (left[i].heading) l.push(i);
    for (let i = rs; i < boundary.right; i += 1) if (right[i].heading) r.push(i);
    let li = 0;
    let ri = 0;
    let leftOrigin = ls;
    let rightOrigin = rs;
    const nextHeading = (indices: number[], blocks: HtmlBlock[], start: number, signature: string) => {
      for (let i = start + 1; i < indices.length && indices[i] - indices[start] <= LOCAL_WINDOW; i += 1) {
        if (blocks[indices[i]].signature === signature) return i;
      }
      return -1;
    };
    while (li < l.length && ri < r.length) {
      const a = left[l[li]];
      const b = right[r[ri]];
      const nearby = Math.abs((l[li] - leftOrigin) - (r[ri] - rightOrigin)) <= LOCAL_WINDOW;
      if (nearby && a.signature === b.signature) {
        leftOrigin = l[li] + 1;
        rightOrigin = r[ri] + 1;
        result.push({ left: l[li++], right: r[ri++] });
        continue;
      }
      const nextLeft = nextHeading(l, left, li, b.signature);
      const nextRight = nextHeading(r, right, ri, a.signature);
      if (nextLeft >= 0 && (nextRight < 0 || nextLeft - li <= nextRight - ri)) li = nextLeft;
      else if (nextRight >= 0) ri = nextRight;
      else {
        const words = new Set(a.text.toLowerCase().split(" "));
        const peerWords = b.text.toLowerCase().split(" ");
        const overlap = peerWords.filter((word) => words.has(word)).length;
        if (nearby && l.length - li === r.length - ri && a.element.tagName === b.element.tagName &&
          (!a.element.id || !b.element.id || a.element.id === b.element.id) &&
          overlap / Math.max(words.size, peerWords.length) >= 0.5) {
          result.push({ left: l[li], right: r[ri] });
          leftOrigin = l[li] + 1;
          rightOrigin = r[ri] + 1;
          ri += 1;
        }
        li += 1;
      }
    }
    if (boundary.left < left.length) result.push(boundary);
    ls = boundary.left + 1;
    rs = boundary.right + 1;
  }
  return result;
};

export const alignHtmlBlocks = (left: HtmlBlock[], right: HtmlBlock[]): Alignment[] => {
  const headings = headingAnchors(left, right);
  const leftScopes = scopes(left, new Map(headings.map((a, i) => [a.left, `section:${i}`])), "left");
  const rightScopes = scopes(right, new Map(headings.map((a, i) => [a.right, `section:${i}`])), "right");
  const result: Alignment[] = [];

  const local = (ls: number, le: number, rs: number, re: number) => {
    let l = ls;
    let r = rs;
    const compatible = (li: number, ri: number) =>
      leftScopes[li] === rightScopes[ri] &&
      left[li].element.tagName === right[ri].element.tagName &&
      !left[li].heading && !right[ri].heading;
    const exact = (li: number, ri: number) =>
      compatible(li, ri) && left[li].signature === right[ri].signature;
    while (l < le && r < re) {
      if (exact(l, r)) {
        result.push({ kind: "match", left: left[l++], right: right[r++] });
        continue;
      }
      let nextLeft = -1;
      let nextRight = -1;
      // Moving a callout is a delete + insert, not a lookahead match.
      if (!right[r].element.matches("div.callout-box")) {
        for (let i = l + 1; i < Math.min(le, l + LOCAL_WINDOW + 1); i += 1) {
          if (exact(i, r)) { nextLeft = i; break; }
        }
      }
      if (!left[l].element.matches("div.callout-box")) {
        for (let i = r + 1; i < Math.min(re, r + LOCAL_WINDOW + 1); i += 1) {
          if (exact(l, i)) { nextRight = i; break; }
        }
      }
      if (nextLeft >= 0 && (nextRight < 0 || nextLeft - l <= nextRight - r)) {
        while (l < nextLeft) result.push({ kind: "remove", left: left[l++] });
      } else if (nextRight >= 0) {
        while (r < nextRight) result.push({ kind: "add", right: right[r++] });
      } else if (compatible(l, r) &&
        left[l].element.matches("div.callout-box") === right[r].element.matches("div.callout-box") &&
        (!left[l].keys[0]?.startsWith("entry:") || !right[r].keys[0]?.startsWith("entry:") ||
          left[l].keys[0] === right[r].keys[0])) {
        result.push({ kind: "match", left: left[l++], right: right[r++] });
      } else if (leftScopes[l].startsWith("left:")) {
        result.push({ kind: "remove", left: left[l++] });
      } else {
        result.push({ kind: "add", right: right[r++] });
      }
    }
    while (l < le) result.push({ kind: "remove", left: left[l++] });
    while (r < re) result.push({ kind: "add", right: right[r++] });
  };

  let ls = 0;
  let rs = 0;
  for (const heading of [...headings, { left: left.length, right: right.length }]) {
    const entries = anchors(left, right, ls, heading.left, rs, heading.right, false, leftScopes, rightScopes);
    for (const entry of [...entries, heading]) {
      local(ls, entry.left, rs, entry.right);
      if (entry.left < left.length && entry.right < right.length) {
        result.push({ kind: "match", left: left[entry.left], right: right[entry.right] });
      }
      ls = entry.left + 1;
      rs = entry.right + 1;
    }
  }
  return result;
};
