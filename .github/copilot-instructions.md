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

- Run `npm test`.
- Run `npm run build`.
- Confirm implementation matches `RENDERING_REQUIREMENTS.md`.
- Report test/build results and whether `RENDERING_REQUIREMENTS.md` was updated or explicitly confirmed unchanged.
- Do not mark a change complete with unresolved validation failures.

## Regression Testing Policy

- Add automated behavioral tests in the same change for every new feature and bug fix, across frontend, proxy/server, rendering, navigation, synchronization, and URL/history mapping.
- When modifying existing functionality, add missing coverage for its existing behavior as well as the changed behavior. Untouched functionality does not require a full-application test backfill.
- For bug fixes, add a regression test reproducing the failure; verify that it fails before the fix where feasible.
- Exercise production code with deterministic fixtures and explicit observable-output assertions, including unchanged behavior. Manual checks and snapshots alone do not replace these tests.
- Update tests, fixtures, and related requirements alongside intentional behavior changes. Preserve unrelated regression cases; never weaken assertions or remove tests just to make failures pass.
- Run focused tests during development and the complete `npm test` suite plus `npm run build` before completion.
- Keep the default suite independent of live upstream sites. Supplement automated coverage with browser checks for actual layout, scrolling, and iframe behavior that jsdom cannot verify.
- Follow the testing conventions in [README.md](../README.md) and rendering-specific obligations in [RENDERING_REQUIREMENTS.md](../RENDERING_REQUIREMENTS.md).
