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
4. Vertical bar markers must not be used for change indication.
5. Existing, unchanged content must remain visually neutral.

## Markdown Rendering Requirements

1. Markdown content must be rendered as HTML (not raw markdown/plain text output).
2. When both pane targets are markdown, markdown diff rendering must be used.
3. The left and right panes must stay synchronized for navigation and scrolling.
4. Markdown diff alignment must be paragraph-based so corresponding paragraphs are shown side-by-side.
5. Diff highlighting in markdown must be word-level only:
   - Left pane: removed/changed words highlighted red.
   - Right pane: added/changed words highlighted green.
6. In markdown fenced code blocks (including `json`), changed tokens must render with side-specific red/green text and a visible red/green background highlight.
7. In markdown fenced code blocks (including `json`), long lines must wrap to the code block width instead of causing horizontal overflow.
8. Corresponding markdown diff blocks should remain horizontally aligned across panes.
9. Placeholder rows should be minimized and appear only when one side has no corresponding paragraph.

## Cross-Cutting Requirements

1. Any generic page-level diff highlighter must not override markdown word-level highlights.
2. Any markdown-specific logic must not degrade regular HTML page rendering.
3. Behavior should be deterministic for the same left/right inputs.

## Change Checklist (Required Before Merge)

1. Verify regular HTML compare page:
   - Changed content appears red on left and green on right.
   - No vertical diff bars.
2. Verify markdown compare page:
   - Markdown is rendered (not raw source).
   - Corresponding paragraphs are presented next to each other.
   - Only changed words are highlighted.
   - Changed tokens inside fenced `json` blocks show side-specific red/green text and background highlight.
   - Fenced `json` lines wrap within the code block width.
   - No full-page/block red-green tinting.
   - Left/right corresponding sections remain aligned with minimal empty blocks.
3. Run build:
   - `npm run build`

## Notes For Future Work

- If diff algorithms are changed (`diffArrays`, `diffWordsWithSpace`, selector strategy, or block alignment logic), validate all checklist items.
- If styles are changed, keep semantic intent identical unless requirements are intentionally revised.
