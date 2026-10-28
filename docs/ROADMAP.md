# ChatWithIt roadmap — IMPLEMENTED vs PLANNED

Constraint: **OpenRouter remains free-models-only** (`:free` or zero pricing). No paid catalog in the UI.

## IMPLEMENTED

| Area | Status |
|---|---|
| Browser-only personal mode | Yes |
| OpenRouter + Hugging Face providers | Yes |
| Free-model discovery + send-time free guard | Yes |
| Availability gate (`availability.mjs` / `model-gate.js`) | Yes |
| Ask-first free-model suggestion on failure | Yes |
| Rule-based free routing helpers (`routing.mjs`) | Yes |
| Local token/context tracking | Yes |
| Honest cost label (never invents $ for free) | Yes |
| Streaming + Stop (discards partial) | Yes |
| Progressive sidebar (Generation / Persona collapsed) | Yes |
| Six themes + high-contrast + reduced motion | Yes |
| PWA / service worker | Yes |
| Local history (7-day TTL) | Yes |
| Vitest suite | Yes |
| Privacy / security docs | Yes |

## PLANNED (not claimed as shipped)

| Area | Notes |
|---|---|
| SaaS auth, multi-tenant API, billing | Requires a backend; personal mode stays |
| Additional providers (Anthropic, Google, Ollama, …) | After free-OR reliability stays solid |
| Learned / ML model routing | Interface ready via `pickFreeModel` |
| RAG / vector store | Foundation only — not fake |
| TypeScript strict migration | Optional; current stack is vanilla ES modules |
| Real passphrase app lock | See `docs/decisions/app-lock.md` (cosmetic lock removed) |
| SSO / RBAC / audit logs | Enterprise phase |
| Daily/monthly cost totals from provider invoices | Needs SaaS or provider billing API |

## Known limitations (honest)

- OpenRouter free-tier account limits (~20/min, ~50/day without credits) are **provider-enforced**; the app can only explain them and suggest other free models.
- Client-side rate bucket is UX protection, not security.
- Keys saved as Profiles are stored unencrypted in `localStorage` (documented).
- `css/app.css` is legacy and **not** loaded; live styles are the split CSS files linked from `index.html`.
