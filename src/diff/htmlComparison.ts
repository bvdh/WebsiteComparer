import { diffWords, type Change } from "diff";
import type { PaneSide } from "../types/sync";
import { alignHtmlBlocks, blockTextNodes, hasNestedBlocks, readHtmlBlocks, type HtmlBlock } from "./htmlAlignment";

const CHANGED_WORD_MAX_CHARS = 20000;
type WordChangeRange = [number, number];

export const clearComparisonArtifacts = (doc: Document): void => {
  doc.querySelectorAll(".compare-word-diff,.compare-diff-owned").forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  });
  doc.querySelectorAll(".compare-diff-marker").forEach((node) => {
    node.classList.remove(
      "compare-diff-marker", "compare-diff-marker--left-changed", "compare-diff-marker--right-changed"
    );
  });
};

const changedRanges = (parts: Change[], side: PaneSide): WordChangeRange[] => {
  const ranges: WordChangeRange[] = [];
  let position = 0;
  parts.forEach((part) => {
    if (side === "right" ? part.removed : part.added) return;
    const length = part.value.length;
    if ((side === "right" ? part.added : part.removed) && length > 0) {
      ranges.push([position, position + length]);
    }
    position += length;
  });
  return ranges;
};

const wrapRanges = (element: HTMLElement, ranges: WordChangeRange[], side: PaneSide): void => {
  const doc = element.ownerDocument;
  let offset = 0;
  blockTextNodes(element).forEach((node) => {
    const text = node.data;
    const start = offset;
    const end = start + text.length;
    offset = end;
    const overlaps = ranges
      .map(([a, b]): WordChangeRange => [Math.max(a, start), Math.min(b, end)])
      .filter(([a, b]) => b > a);
    if (!overlaps.length) return;
    const fragment = doc.createDocumentFragment();
    let cursor = start;
    overlaps.forEach(([a, b]) => {
      if (a > cursor) fragment.appendChild(doc.createTextNode(text.slice(cursor - start, a - start)));
      const span = doc.createElement("span");
      span.className = `compare-word-diff compare-word-diff--${side}-changed`;
      span.textContent = text.slice(a - start, b - start);
      fragment.appendChild(span);
      cursor = b;
    });
    if (cursor < end) fragment.appendChild(doc.createTextNode(text.slice(cursor - start)));
    node.parentNode?.replaceChild(fragment, node);
  });
};

const wordDiff = (left: HtmlBlock, right: HtmlBlock): { left: boolean; right: boolean } | null => {
  const leftText = blockTextNodes(left.element).map((node) => node.data).join("");
  const rightText = blockTextNodes(right.element).map((node) => node.data).join("");
  if (leftText.length > CHANGED_WORD_MAX_CHARS || rightText.length > CHANGED_WORD_MAX_CHARS) return null;
  const parts = diffWords(leftText, rightText);
  const removed = changedRanges(parts, "left");
  const added = changedRanges(parts, "right");
  wrapRanges(left.element, removed, "left");
  wrapRanges(right.element, added, "right");
  return { left: removed.length > 0, right: added.length > 0 };
};

export const compareHtmlDocuments = (
  leftDoc: Document, rightDoc: Document, leftBase: string, rightBase: string
) => {
  clearComparisonArtifacts(leftDoc);
  clearComparisonArtifacts(rightDoc);
  const left = readHtmlBlocks(leftDoc, leftBase);
  const right = readHtmlBlocks(rightDoc, rightBase);
  const changedLeftElements: HTMLElement[] = [];
  const changedRightElements: HTMLElement[] = [];
  const mark = (element: HTMLElement, side: PaneSide, wholeBlock: boolean) => {
    if (wholeBlock) {
      const className = `compare-diff-marker compare-diff-marker--${side}-changed`;
      if (hasNestedBlocks(element)) {
        // A removed parent label must not tint surviving comparable descendants.
        blockTextNodes(element).forEach((node) => {
          if (!node.data.trim()) return;
          const span = element.ownerDocument.createElement("span");
          span.className = `${className} compare-diff-owned`;
          node.parentNode?.replaceChild(span, node);
          span.appendChild(node);
        });
      } else {
        element.classList.add("compare-diff-marker", `compare-diff-marker--${side}-changed`);
      }
    }
    (side === "left" ? changedLeftElements : changedRightElements).push(element);
  };
  alignHtmlBlocks(left, right).forEach((operation) => {
    if (operation.kind === "remove") mark(operation.left.element, "left", true);
    else if (operation.kind === "add") mark(operation.right.element, "right", true);
    else if (operation.left.signature !== operation.right.signature) {
      const changes = wordDiff(operation.left, operation.right);
      if (!changes || changes.left) mark(operation.left.element, "left", !changes);
      if (!changes || changes.right) mark(operation.right.element, "right", !changes);
    }
  });
  return {
    changedLeftElements, changedRightElements,
    diffCount: changedLeftElements.length + changedRightElements.length,
    leftCount: left.length, rightCount: right.length,
  };
};
