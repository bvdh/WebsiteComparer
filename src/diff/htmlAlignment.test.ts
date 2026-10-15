// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { alignHtmlBlocks, readHtmlBlocks } from "./htmlAlignment";
import { structural, toc } from "./__fixtures__/pages";

const blocks = (html: string, base = "https://site.example/en/") =>
  readHtmlBlocks(new DOMParser().parseFromString(`<base href="${base}">${html}`, "text/html"), base);

describe("HTML alignment", () => {
  it("recovers at a surviving section anchor beyond the legacy lookahead", () => {
    const left = blocks(structural.left);
    const right = blocks(structural.right);
    const start = left.findIndex((block) => block.element.id === "eu-access-related-profiles");
    const end = left.findIndex((block) => block.element.id === "other-resource-profiles");
    expect(end - start).toBeGreaterThan(24);
    const result = alignHtmlBlocks(left, right);
    expect(result.filter((operation) => operation.kind === "remove")).toHaveLength(end - start);
    expect(result.filter((operation) => operation.kind === "add")).toHaveLength(0);
    expect(result.some((operation) => operation.kind === "match" &&
      operation.left.element.id === "other-resource-profiles" &&
      operation.right.element.id === "other-resource-profiles")).toBe(true);
  });

  it("pairs renumbered entries by mapped destination, not current index or number", () => {
    const result = alignHtmlBlocks(blocks(toc.left), blocks(toc.right, "https://peer.example/fork/en/"));
    expect(result.filter((op) => op.kind === "remove")).toHaveLength(1);
    const changed = result.filter((op) => op.kind === "match" && op.left.text !== op.right.text);
    expect(changed).toHaveLength(4);
    for (const op of changed) {
      if (op.kind === "match") expect(op.left.keys[0]).toBe(op.right.keys[0]);
    }
  });

  it.each([
    ['id="same"', 'id="same"', "Original", "Renamed"],
    ['id="old"', 'id="new"', "Same", "Same"],
    ["", "", "Same", "Same"],
  ])("uses stable heading IDs or unique heading text", (leftId, rightId, leftTitle, rightTitle) => {
    const result = alignHtmlBlocks(
      blocks(`<h3 ${leftId}>${leftTitle}</h3><p>Body</p>`),
      blocks(`<h3 ${rightId}>${rightTitle}</h3><p>Body</p>`)
    );
    expect(result.map((op) => op.kind)).toEqual(["match", "match"]);
  });

  it("does not use ambiguous heading IDs or repeated labels as distant anchors", () => {
    const duplicate = '<h3 id="duplicate">Repeated</h3><p>Name</p>';
    const result = alignHtmlBlocks(
      blocks(`${duplicate}${duplicate}<h3 id="end">End</h3><p>Tail</p>`),
      blocks(`${duplicate}<h3 id="end">End</h3><p>Tail</p>`)
    );
    expect(result.filter((op) => op.kind === "match").map((op) => op.left.text)).toEqual(["Repeated", "Name", "End", "Tail"]);
    expect(result.filter((op) => op.kind === "remove").map((op) => op.left.text)).toEqual(["Repeated", "Name"]);
  });

  it("preserves monotonic ordering rather than matching reordered headings across one another", () => {
    const left = blocks('<h3 id="a">A</h3><p>Alpha</p><h3 id="b">B</h3><p>Beta</p>');
    const right = blocks('<h3 id="b">B</h3><p>Beta</p><h3 id="a">A</h3><p>Alpha</p>');
    const matches = alignHtmlBlocks(left, right).filter((op) => op.kind === "match");
    const rightIndices = matches.map((op) => right.indexOf(op.right));
    expect(rightIndices).toEqual([...rightIndices].sort((a, b) => a - b));
    expect(matches.filter((op) => op.left.heading)).toHaveLength(1);
  });

  it("localizes insertions with repeated labels and duplicate entry links", () => {
    const rows = '<p>Name</p><p><a href="same.html">Same</a></p>'.repeat(50);
    const result = alignHtmlBlocks(blocks(`<h3 id="section">Section</h3>${rows}<p>End</p>`),
      blocks(`<h3 id="section">Section</h3><p>Inserted</p>${rows}<p>End</p>`));
    expect(result.filter((op) => op.kind === "add").map((op) => op.right.text)).toEqual(["Inserted"]);
    expect(result.filter((op) => op.kind === "remove")).toHaveLength(0);
  });

  it("keeps large repeated-content matching deterministic and ordered", () => {
    const body = '<p>Repeated reference</p>'.repeat(2000);
    const left = blocks(`<h3 id="a">References</h3>${body}<h3 id="b">End</h3>`);
    const right = blocks(`<h3 id="a">References</h3><p>Added</p>${body}<h3 id="b">End</h3>`);
    const result = alignHtmlBlocks(left, right);
    expect(result.filter((op) => op.kind === "add")).toHaveLength(1);
    expect(result.filter((op) => op.kind === "match")).toHaveLength(left.length);
    expect(alignHtmlBlocks(left, right)).toEqual(result);
  });
});
