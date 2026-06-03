# Repository Instructions

## Rendering Change Policy

- Treat `RENDERING_REQUIREMENTS.md` as the source of truth for rendering behavior.
- When a change request affects rendering behavior, update code and `RENDERING_REQUIREMENTS.md` in the same change.
- If a rendering change does not require a requirements update, explicitly verify and state why no update is needed.

## What Counts As A Rendering Change

- Any behavioral or styling change affecting rendered output in compare panes.
- Any logic change in markdown diff, word highlighting, block/paragraph alignment, placeholders, or synchronization behavior.
- Any changes in these files (non-exhaustive):
  - `src/App.tsx`
  - `server/proxy.js`
  - rendering-related CSS used by compare panes

## Required Requirements Update

When rendering behavior changes, update `RENDERING_REQUIREMENTS.md` with:

- Updated requirement statements.
- Updated verification checklist items.
- Any new constraints introduced by the implementation.

## Validation Before Completion

- Run `npm run build`.
- Confirm implementation matches `RENDERING_REQUIREMENTS.md`.
- In the final summary, mention whether `RENDERING_REQUIREMENTS.md` was updated or explicitly confirmed unchanged.
