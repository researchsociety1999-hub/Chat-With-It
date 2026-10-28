# Engineering report — free-models + main-screen initiative

**Baseline commit before work:** `44413c0` (main, after docs fast-forward)  
**Constraint:** OpenRouter free models only. No commit/push/PR in this pass.

## 1. Executive summary

Hardened free-model reliability (gate sync, clearer rate-limit UX, ask-first free alternatives, success-only local throttle accounting), collapsed secondary sidebar sections so chat stays primary, added honest cost reporting, theme `--on-accent` coverage, and documented IMPLEMENTED vs PLANNED.

## 2. Baseline

- Stack: vanilla ES modules, esbuild bundle, Vitest, no TypeScript.
- Loaded CSS: `profiles`, `variables`, `themes`, `layout`, `components`, `modals`, `pwa-safe-area`.
- Orphan: `css/app.css` (not linked).
- Pre-existing: availability gate, free filter, confirm `<dialog>`, toast styles, iOS 16px inputs, touch message actions, lock control already removed.

## 3. Defect register (selected)

| Issue | Severity | Evidence | Status |
|---|---|---|---|
| Free models feel one-shot | P0 | OpenRouter free-tier + weak second-send UX | Mitigated (messaging, alts, gate sync, retry clears block) |
| Local bucket counted failed sends | P1 | `app.js` `recordRequest` before stream | Fixed — record on success only |
| Gate not synced from app model list | P1 | Separate catalog fetches | Fixed — `syncGateFromModels` |
| Sidebar settings always expanded | P1 | `index.html` Generation/Persona cards | Fixed — `<details>` collapsed by default |
| Cost invented or missing | P2 | No cost UI | Fixed — honest “Cost unavailable” / free label |
| `--on-accent` missing on dark themes | P2 | `themes.css` | Fixed per theme |
| Deploy health checked unlinked `app.css` | P3 | `README.md` | Fixed → `components.css` |
| Fake app lock | P1 | `docs/decisions/app-lock.md` | Already removed from UI |

## 4. Changes made

**Created:** `js/providers/routing.mjs`, `tests/routing.test.mjs`, `tests/estimate-cost.test.js`, `docs/ROADMAP.md`, `docs/ENGINEERING_REPORT.md`  
**Modified:** `js/app.js`, `js/api.js`, `js/model-gate.js`, `js/providers/availability.mjs`, `js/providers/availability.test.mjs`, `js/ui.js`, `index.html`, `css/components.css`, `css/layout.css`, `css/themes.css`, `README.md`, `docs/model-availability.md`  
**Removed:** none

## 5. Experience improvements

- Composer shows free-tier rate hint; stats show cost honesty.
- Failed free-model sends suggest another free model (click to switch).
- Generation + Persona tucked away until opened.
- Stop announces discard of partial output.

## 6. Accessibility / themes

- Checked token presence for `--on-accent` on all six themes + high-contrast.
- Message actions remain focus-visible and touch-visible.
- Streaming still uses `aria-live="off"` on the log + announcer on completion/stop.
- Visual multi-viewport browser pass not automated in this environment — treat as remaining manual QA.

## 7. Validation matrix

| Check | Result |
|---|---|
| `npm test` | **149 passed** (17 files) |
| `npm run build` | **OK** — `dist/app.js` ~929.5kb |
| Browser visual / SR | Not fully run here |
| Real OpenRouter second-send | Needs live key |

## 8. Regression analysis

Tests added for routing, cost honesty, gate ingest/clear. Existing free-guard / send-failure suites retained.

## 9. Diff review

Scope stays browser-first and free-only. No SaaS backend. No new runtime dependencies.

## 10. Remaining work

1. Manual QA across themes at 320 / 375 / 1280.
2. Live OpenRouter probe of free models that fail after one call.
3. Optional: prune stale curated IDs via CI `validate-models.mjs`.
4. SaaS / extra providers remain PLANNED.

## 11. Next recommendation

Run a live free-model soak (three sequential sends on the same `:free` id) and capture whether failures are account `RATE_LIMIT` vs upstream overload — then tune cooldown copy if needed.
