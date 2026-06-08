# Rendering Requirements

This document defines the required behavior for HTML and Markdown rendering in WebsiteComparer.

Use this as a guardrail for future changes. If behavior here changes, update this file in the same PR with rationale.

## Scope

- Files primarily involved:
  - `src/App.tsx`
  - `server/proxy.js`

## HTML Rendering Requirements

1. HTML pages must be fetched through `/api/render` and instrumented with the compare bridge script.
2. The left and right panes must stay synchronized for navigation and scrolling.
3. Visual diff marking for regular HTML pages must be side-specific:
   - Left pane changed-only content: red styling.
   - Right pane changed-only content: green styling.
4. A center vertical change navigator bar must be shown between panes with orange markers for positions where the right pane has changed sections.
5. Clicking any point in the center change navigator bar must jump to the corresponding vertical position in the right pane.
6. Existing, unchanged content must remain visually neutral.

## Markdown Rendering Requirements

1. Markdown content must be rendered as HTML (not raw markdown/plain text output).
2. When both pane targets are markdown, markdown diff rendering must be used.
3. The left and right panes must stay synchronized for navigation and scrolling.
4. Markdown diff alignment must be paragraph-based so corresponding paragraphs are shown side-by-side.
5. Diff highlighting in markdown must be word-level only:
   - Left pane: removed/changed words highlighted red.
   - Right pane: added/changed words highlighted green.
   - Markdown highlights must use the same red/green text and background style settings as HTML page highlights.
6. In markdown fenced code blocks (including `json`), changed tokens must render with side-specific red/green text and a visible red/green background highlight.
7. In markdown fenced code blocks (including `json`), long lines must wrap to the code block width instead of causing horizontal overflow.
8. Corresponding markdown diff blocks should remain horizontally aligned across panes.
9. Placeholder rows should be minimized and appear only when one side has no corresponding paragraph.
10. Paragraph spacing in markdown rendering should remain compact in both single markdown view and markdown diff view.

## Cross-Cutting Requirements

1. Any generic page-level diff highlighter must not override markdown word-level highlights.
2. Any markdown-specific logic must not degrade regular HTML page rendering.
3. Behavior should be deterministic for the same left/right inputs.
4. Compared pages rendered in iframe panes must allow user-initiated downloads (sandbox must include `allow-downloads`).
5. Rendering fetches should tolerate stale deep-link patterns by retrying fallback URL variants (for example `/index.html` and legacy `/en/` segments) before failing.
6. Executable upstream page scripts must be stripped from rendered compare iframes to avoid repeated runtime script errors and unstable client-side reinitialization loops.
7. Inline script execution hooks in upstream HTML (for example `onload`, `onclick`, and `javascript:` links) must be stripped or neutralized in rendered compare iframes.
6. For long documents with repeated section text, page-level diff matching should use bounded local alignment to avoid overmatching distant repeated content and to keep rendering responsive.

## Change Checklist (Required Before Merge)

1. Verify regular HTML compare page:
   - Changed content appears red on left and green on right.
   - Center change navigator bar is visible with orange markers for right-pane changed sections.
   - Clicking the center change navigator bar jumps to the matching vertical position in the right pane.
   - Browser console should not report sandbox download blocking for user-initiated downloads.
   - Browser console should not show repeated upstream script re-execution errors (for example duplicate declaration or undefined global errors from page scripts).
   - Browser console should not show runtime errors caused by inline event attributes calling missing script globals (for example `Uncaught ReferenceError: fhirTableInit is not defined`).
   - Legacy deep links using `/index.html` or old `/en/` segment still resolve to a rendered page when an upstream fallback exists.
2. Verify markdown compare page:
   - Markdown is rendered (not raw source).
   - Corresponding paragraphs are presented next to each other.
   - Paragraph spacing is compact in both markdown and markdown diff views.
   - Only changed words are highlighted.
   - Markdown highlight colors/backgrounds match the HTML page highlight settings.
   - Changed tokens inside fenced `json` blocks show side-specific red/green text and background highlight.
   - Fenced `json` lines wrap within the code block width.
   - No full-page/block red-green tinting.
   - Left/right corresponding sections remain aligned with minimal empty blocks.
3. Verify large HTML page compare (for example `references.html` with many repeated list entries):
   - Diff rendering completes without excessive delay.
   - Highlighted differences remain localized instead of jumping to distant repeated sections.
4. Run build:
   - `npm run build`

## Notes For Future Work

- If diff algorithms are changed (`diffArrays`, `diffWordsWithSpace`, selector strategy, or block alignment logic), validate all checklist items.
- If styles are changed, keep semantic intent identical unless requirements are intentionally revised.
