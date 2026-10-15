// Synthetic reductions of the reported page structures, not upstream snapshots.
const row = (name: string) =>
  `<tr><td>${name}</td><td><div>${name} title</div></td><td><div>${name} description</div></td></tr>`;
const table = (rows: string) =>
  `<table><tr><th>Name</th><th>Title</th><th>Description</th></tr>${rows}</table>`;
const main = `<h3 id="main">Main Resource profiles</h3><p>Main report</p>`;
const surviving = `<section id="surviving"><h3 id="other-resource-profiles">Other Resource profiles</h3>
  ${table(row("Accession Number") + row("Imaging Device"))}
  <h3 id="codes">Code systems</h3><p>Unchanged codes</p></section>`;
const deleted = `<section id="deleted"><h3 id="eu-access-related-profiles">EU Access Related Profiles</h3>
  <h4 id="document-reference">DocumentReference</h4>${table(row("Document Reference"))}
  <h3 id="capabilities">CapabilityStatements</h3>
  ${table(Array.from({ length: 10 }, (_, i) => row(`Capability ${i}`)).join(""))}</section>`;

export const structural = { left: main + deleted + surviving, right: main + surviving };

const entry = (number: string, title: string, href: string) =>
  `<tr><td class="hierarchy"><img alt="" src="spacer.png"><a href="${href}"> ${number} ${title}</a></td></tr>`;
const tocStart = entry("5", "Examples", "examples.html");
export const toc = {
  left: `<h2 id="toc">Contents</h2><table>${tocStart}
    ${entry("6", "EU Health Data API for Imaging Reports", "api.html")}
    ${entry("7", "Mapping to EHDS Logical Model profiles", "mapping.html")}
    ${entry("8", "Patterns and Guidelines", "patterns.html")}
    ${entry("11", "Artifacts", "artifacts.html")}
    ${entry("11.1", "Structural artifacts", "artifacts-structural.html")}</table>`,
  right: `<h2 id="toc">Contents</h2><table>${tocStart}
    ${entry("6", "Mapping to EHDS Logical Model profiles", "mapping.html")}
    ${entry("7", "Patterns and Guidelines", "patterns.html")}
    ${entry("10", "Artifacts", "artifacts.html")}
    ${entry("10.1", "Structural artifacts", "artifacts-structural.html")}</table>`,
};
