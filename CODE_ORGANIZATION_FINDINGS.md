## Code Organization Findings (Offline Cash)

**Context:** Feedback highlighted oversized components, mixed concerns, inline helpers, and scattered magic numbers. Current codebase state still reflects these issues.

### Severity: High
- **Monolithic main view** — `src/App.tsx` is ~800 lines and mixes NFC I/O, file import/parsing, state orchestration, and full UI. Hard to test and reason about.  
  **Remedy:** Split into a container (state, NFC/file flows, mutations) plus presentational components (layout, hardware panel, voucher list, status feed). Move I/O into dedicated hooks/services; keep UI props-only.
- **PrivateAssetsGrid does logic + view** — `src/components/PrivateAssetsGrid.tsx` includes drag-and-drop controller state and rendering in one 300+ line file.  
  **Remedy:** Isolate drag controller logic (could be a hook) from the pure grid renderer; keep the card grid presentational.

### Severity: Medium
- **Magic numbers scattered** — Debounce (500 ms), init delays (800 ms), mock time offsets, etc., were inline.  
  **Progress:** Added `src/lib/constants.ts` and replaced usage in `App.tsx` and `PrivateAssetsGrid.tsx` for debounce, init delays, and drag threshold.  
  **Remaining:** Move additional time offsets/mock timing into constants when the mock data is revisited.
- **Inline helpers** — Helpers sat inside components.  
  **Progress:** Moved `prettyJson` to `src/lib/utils.ts` and `buildVoucher` plus mock voucher seed data to `src/lib/voucher.ts`.  
  **Remaining:** Add more shared formatters (date/amount) as they surface.
- **Limited documentation on complex flows** — File import pipeline, overwrite confirmation, and write-to-tag flow lack JSDoc.  
  **Remedy:** Add concise JSDoc for non-trivial functions (import handlers, voucher builders, write/overwrite flow) to clarify intent and edge cases.

### Severity: Low
- **No established container/presentational pattern** — Patterns are implicit rather than codified, making future screens likely to repeat the same mixing of concerns.  
  **Remedy:** Document a lightweight convention (container handles data/side effects; presentational handles UI and callbacks) and apply to Offline Cash as the reference implementation.

### Recommended Next Steps
- Extract container/presentational split for `App.tsx` (container with NFC/file/NDEF flows; UI-only children for layout, hardware panel, voucher panel, status log, overwrite prompt).
- Move drag controller logic in `PrivateAssetsGrid.tsx` into a hook or wrapper component; keep the grid renderer pure.
- Add JSDoc to the import/read/write/overwrite flows to clarify side effects and edge cases.
- Expand shared helpers (formatters) and centralize any remaining magic numbers from mocks/tests into `src/lib/constants.ts`.

