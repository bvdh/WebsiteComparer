// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { structural, toc } from "./__fixtures__/pages";
import { clearComparisonArtifacts, compareHtmlDocuments } from "./htmlComparison";
import { collectChangeMarkersFromElements } from "./changeMarkers";

const leftBase = "https://left.example/ig/en/";
const rightBase = "https://right.example/fork/output/en/";
const documentFor = (html: string, base: string) => {
  const doc = new DOMParser().parseFromString(`<head><base href="${base}"></head><body>${html}</body>`, "text/html");
  Object.defineProperty(doc.documentElement, "scrollHeight", { value: 2000 });
  Object.defineProperty(doc.documentElement, "clientHeight", { value: 1000 });
  Array.from(doc.querySelectorAll<HTMLElement>("body *")).forEach((element, index) => {
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      top: index * 5, bottom: index * 5 + 5, left: 0, right: 100, width: 100, height: 5,
      x: 0, y: index * 5, toJSON: () => ({}),
    });
  });
  return doc;
};
const compare = (left: string, right: string) => {
  const l = documentFor(left, leftBase);
  const r = documentFor(right, rightBase);
  return { l, r, result: compareHtmlDocuments(l, r, leftBase, rightBase) };
};
const words = (root: ParentNode) =>
  Array.from(root.querySelectorAll(".compare-word-diff")).map((span) => span.textContent?.trim());
const marked = (doc: Document) => doc.querySelectorAll(".compare-word-diff,.compare-diff-marker");

describe("HTML comparison regression cases", () => {
  it.each([false, true])("isolates a section deletion exceeding 24 blocks (reversed: %s)", (reverse) => {
    const { l, r, result } = compare(
      reverse ? structural.right : structural.left, reverse ? structural.left : structural.right
    );
    const removed = reverse ? r : l;
    const unchanged = reverse ? l : r;
    expect(removed.querySelectorAll("#deleted .compare-diff-marker").length).toBeGreaterThan(24);
    expect(removed.querySelector("#surviving")?.querySelectorAll(".compare-word-diff,.compare-diff-marker")).toHaveLength(0);
    expect(marked(unchanged)).toHaveLength(0);
    const changed = reverse ? result.changedRightElements : result.changedLeftElements;
    const neutral = reverse ? result.changedLeftElements : result.changedRightElements;
    expect(changed.every((element) => element.closest("#deleted"))).toBe(true);
    expect(neutral).toHaveLength(0);
    expect(result.diffCount).toBe(changed.length);
    expect(collectChangeMarkersFromElements(unchanged, neutral, reverse ? "left" : "right")).toEqual([]);
    const markers = collectChangeMarkersFromElements(removed, changed, reverse ? "right" : "left");
    expect(markers).toHaveLength(changed.length);
    expect(markers.every((marker) => marker.side === (reverse ? "right" : "left"))).toBe(true);
  });

  it.each([false, true])("highlights only renumbering in surviving TOC entries (reversed: %s)", (reverse) => {
    const { l, r, result } = compare(reverse ? toc.right : toc.left, reverse ? toc.left : toc.right);
    expect(words(l)).toEqual(reverse ? ["6", "7", "10", "10"] : ["7", "8", "11", "11"]);
    expect(words(r)).toEqual(reverse ? ["7", "8", "11", "11"] : ["6", "7", "10", "10"]);
    const deleted = (reverse ? r : l).querySelector(".compare-diff-marker");
    expect(deleted?.textContent).toContain("EU Health Data API");
    expect((reverse ? l : r).querySelectorAll(".compare-diff-marker")).toHaveLength(0);
    expect(result.diffCount).toBe(9);
    expect(result.changedLeftElements).toHaveLength(reverse ? 4 : 5);
    expect(result.changedRightElements).toHaveLength(reverse ? 5 : 4);
  });

  it("keeps real title changes visible when the entry destination is stable", () => {
    const { l, r } = compare(toc.left, toc.right.replace("Patterns and Guidelines", "Patterns and Advice"));
    expect(words(l)).toContain("Guidelines");
    expect(words(r)).toContain("Advice");
    expect(words(r)).not.toContain("Patterns");
  });

  it("does not normalize away numbers in ordinary prose", () => {
    const { l, r, result } = compare("<p>6 patients attended</p>", "<p>7 patients attended</p>");
    expect(words(l)).toEqual(["6"]);
    expect(words(r)).toEqual(["7"]);
    expect(result.diffCount).toBe(2);
  });

  it("compares nested list/table text once, including parent-owned text", () => {
    const { l, r } = compare(
      "<ul><li>Old parent<ul><li>Old child</li></ul></li></ul><table><tr><td><p>Old cell</p></td></tr></table>",
      "<ul><li>New parent<ul><li>New child</li></ul></li></ul><table><tr><td><p>New cell</p></td></tr></table>"
    );
    expect(words(l)).toEqual(["Old", "Old", "Old"]);
    expect(words(r)).toEqual(["New", "New", "New"]);
    expect(l.querySelectorAll(".compare-word-diff .compare-word-diff")).toHaveLength(0);
    expect(r.querySelectorAll(".compare-word-diff .compare-word-diff")).toHaveLength(0);
  });

  it("does not tint a surviving nested child when only its parent-owned text is removed", () => {
    const { l, r, result } = compare(
      '<ul><li>Removed parent<ul><li id="child">Same child</li></ul></li></ul>',
      '<ul><li id="child">Same child</li></ul>'
    );
    expect(result.changedLeftElements).toHaveLength(1);
    expect(result.changedRightElements).toHaveLength(0);
    expect(l.querySelector("#child")?.closest(".compare-diff-marker")).toBeNull();
    expect(marked(r)).toHaveLength(0);
    expect(l.querySelector(".compare-diff-marker")?.textContent).toBe("Removed parent");
    const before = l.body.innerHTML;
    compareHtmlDocuments(l, r, leftBase, rightBase);
    expect(l.body.innerHTML).toBe(before);
  });

  it("treats a moved callout as removed and inserted", () => {
    const box = '<div class="callout-box"><p>Ongoing alignment</p></div>';
    const { l, r, result } = compare(`${box}<p>First</p><p>Last</p>`, `<p>First</p>${box}<p>Last</p>`);
    expect(result.diffCount).toBe(2);
    expect(l.querySelector(".callout-box")?.classList.contains("compare-diff-marker--left-changed")).toBe(true);
    expect(r.querySelector(".callout-box")?.classList.contains("compare-diff-marker--right-changed")).toBe(true);
    expect(words(l)).toEqual([]);
    expect(words(r)).toEqual([]);
  });

  it("word-highlights a callout edited in place as one atomic block", () => {
    const { l, r, result } = compare(
      '<p>Before</p><div class="callout-box"><p>Old notice</p></div><p>After</p>',
      '<p>Before</p><div class="callout-box"><p>New notice</p></div><p>After</p>'
    );
    expect(words(l)).toEqual(["Old"]);
    expect(words(r)).toEqual(["New"]);
    expect(result.changedLeftElements.map((element) => element.tagName)).toEqual(["DIV"]);
    expect(result.diffCount).toBe(2);
  });

  it("leaves identical and whitespace-only blocks neutral", () => {
    const { l, r, result } = compare("<p>Same   words\nhere</p>", "<p>Same words here</p>");
    expect(result.diffCount).toBe(0);
    expect(marked(l)).toHaveLength(0);
    expect(marked(r)).toHaveLength(0);
    expect(compare(structural.left, structural.left).result.diffCount).toBe(0);
  });

  it("keeps identical repeated headings neutral without using them as distant anchors", () => {
    const page = '<h3 id="duplicate">Repeated</h3><p>Name</p>'.repeat(3);
    expect(compare(page, page).result.diffCount).toBe(0);
  });

  it("word-highlights an edited heading without an ID and preserves its unchanged body", () => {
    const { l, r, result } = compare(
      "<h3>Other Resource profiles</h3><p>Unchanged body</p>",
      "<h3>Other Resource definitions</h3><p>Unchanged body</p>"
    );
    expect(words(l)).toEqual(["profiles"]);
    expect(words(r)).toEqual(["definitions"]);
    expect(result.diffCount).toBe(2);
    expect(l.querySelector("p")?.querySelectorAll(".compare-word-diff,.compare-diff-marker")).toHaveLength(0);
  });

  it("compares full block text beyond the old 320-character signature limit", () => {
    const prefix = "Same ".repeat(80);
    const { l, r } = compare(`<p>${prefix}old</p>`, `<p>${prefix}new</p>`);
    expect(words(l)).toEqual(["old"]);
    expect(words(r)).toEqual(["new"]);
  });

  it("keeps the large-block whole-highlight fallback", () => {
    const { l, r } = compare(`<p>${"a".repeat(20001)}</p>`, `<p>${"b".repeat(20001)}</p>`);
    expect(l.querySelectorAll(".compare-diff-marker--left-changed")).toHaveLength(1);
    expect(r.querySelectorAll(".compare-diff-marker--right-changed")).toHaveLength(1);
  });

  it("reports markers only on the side with changed words", () => {
    const { l, r, result } = compare("<p>Same words</p>", "<p>Same extra words</p>");
    expect(result.changedLeftElements).toHaveLength(0);
    expect(result.changedRightElements).toHaveLength(1);
    expect(words(l)).toEqual([]);
    expect(words(r)).toEqual(["extra"]);
    expect(collectChangeMarkersFromElements(r, result.changedRightElements, "right")).toEqual([{ ratio: 0, side: "right" }]);
  });

  it("clears stale artifacts and remains deterministic on repeated comparison", () => {
    const { l, r, result } = compare(toc.left, toc.right);
    const before = [l.body.innerHTML, r.body.innerHTML];
    const second = compareHtmlDocuments(l, r, leftBase, rightBase);
    expect([l.body.innerHTML, r.body.innerHTML]).toEqual(before);
    expect(second.diffCount).toBe(result.diffCount);
    expect(second.changedLeftElements).toEqual(result.changedLeftElements);
    expect(collectChangeMarkersFromElements(l, second.changedLeftElements, "left")).toEqual(
      collectChangeMarkersFromElements(l, result.changedLeftElements, "left")
    );
    const neutral = documentFor(toc.left, rightBase);
    expect(compareHtmlDocuments(l, neutral, leftBase, rightBase).diffCount).toBe(0);
    expect(marked(l)).toHaveLength(0);
  });

  it("preserves Markdown-owned highlights when clearing generic HTML artifacts", () => {
    const doc = documentFor(
      '<section class="markdown-diff-block"><span class="markdown-word-diff">Changed</span></section>' +
      '<p class="compare-diff-marker compare-diff-marker--left-changed"><span class="compare-word-diff">Old</span></p>',
      leftBase
    );
    clearComparisonArtifacts(doc);
    expect(doc.querySelectorAll(".markdown-word-diff")).toHaveLength(1);
    expect(doc.querySelector(".markdown-word-diff")?.textContent).toBe("Changed");
    expect(marked(doc)).toHaveLength(0);
    expect(doc.querySelector("p")?.textContent).toBe("Old");
  });

  it("clamps, rounds, deduplicates and orders side-specific navigator markers", () => {
    const doc = documentFor("<p>A</p><p>B</p><p>C</p><p>D</p>", leftBase);
    const elements = Array.from(doc.querySelectorAll("p"));
    const tops = [500.4, 500.49, -50, 3000];
    elements.forEach((element, i) => {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
        top: tops[i], bottom: tops[i] + 5, left: 0, right: 100, width: 100, height: 5,
        x: 0, y: tops[i], toJSON: () => ({}),
      });
    });
    expect(collectChangeMarkersFromElements(doc, elements, "left")).toEqual([
      { ratio: 0, side: "left" }, { ratio: 0.5, side: "left" }, { ratio: 1, side: "left" },
    ]);
    expect(collectChangeMarkersFromElements(doc, [], "right")).toEqual([]);
  });
});
