# ChatWithIt: Privacy-First Multi-Model AI Chat

**Live demo:** https://chat-with-it.vercel.app | **Code:** https://github.com/researchsociety1999-hub/Chat-With-It | **Role:** Solo builder (design, build, deploy)

## The problem

Most AI chat apps ask users to trust a server with their API keys and conversations. ChatWithIt removes that trust requirement: the app has no backend, and the browser talks directly to the model provider.

## What I built

A static, framework-free Progressive Web App for chatting with models through OpenRouter or Hugging Face.

- Free-model discovery (`:free` suffix and zero pricing)
- Streaming responses with a stop control
- Five personas: Assistant, Tutor, Creative Writer, Code Reviewer, Debate Coach
- Text file attachments (.txt, .md, .json, .csv, code files)
- Live token and context usage
- Export to Markdown, JSON, TXT, PDF, or clipboard
- Optional local chat history with a 7-day TTL
- Six named themes plus system preference, high-contrast mode, reduced-motion support, and a mobile drawer

## Stack and architecture

- Vanilla JavaScript modules (no React, no TypeScript, no component library) and plain CSS
- A single `AppState` object in `js/state.js` is the source of truth
- `js/api.js` handles provider requests; `js/app.js` handles orchestration and event wiring
- esbuild bundles to `dist/app.js`
- Service worker (`sw.js`) precaches the app shell; PWA manifest included
- Tests run with Vitest; CI runs on GitHub Actions

## Model/API integration

- The user chooses OpenRouter or Hugging Face and pastes their own API key.
- Requests go from the browser straight to the provider over HTTPS. There is no intermediate server.
- Temperature and max-tokens can be toggled off. When off, those parameters are omitted so provider defaults apply.

## Privacy and security decisions

- API keys live only in browser memory (`AppState`), are never written to localStorage or cookies, and are cleared on a 30-minute idle timeout or page reload.
- Only non-sensitive preferences are persisted (localStorage key `cwiState`).
- The service worker never caches provider API calls.
- `vercel.json` sets security headers: X-Frame-Options, Referrer-Policy, X-Content-Type-Options, Permissions-Policy, HSTS, COOP, and CORP.
- A client-side token-bucket rate limit (default 20 requests per minute) and API-key format validation are in place.

## Key trade-offs

| Decision | Benefit | Cost |
|---|---|---|
| No backend | No server ever sees keys or chats | No cross-device sync, no server-side usage data |
| Keys in memory only | No persistent credential exposure | Users re-enter their key each session and after the 30-minute idle timeout |
| Vanilla JS, no framework | Small, auditable surface area | More manual DOM and state handling |
| Browser-direct provider calls | No intermediary to trust | Provider CORS and rate limits apply, so the app depends on them |
| Optional local history (7-day TTL) | Convenience without a database | Data is device-bound and expires |

## Success metric

**North-star metric (proposed, not yet instrumented): activation rate** — the share of sessions where a user adds a key, picks a model, and sends at least one message.

Why this metric: the app's main friction is the bring-your-own-key step, so activation shows whether the privacy model is usable.

How to measure without breaking the privacy promise: a manual usability test with 5 users, or an opt-in, content-free counter. Current value: N/A.

## Self-audit (AUDIT.md, 2026-07-15)

I audited my own project against its README claims. The audit found Google Analytics and Vercel Speed Insights scripts in `index.html` that contradicted the "no telemetry" claim, and I removed them. It also found unsanitized `innerHTML` assignments in `js/ui.js`, which I wrapped with DOMPurify. One known gap remains open: the CSP still allows `'unsafe-inline'` scripts, and the fix is nonce-based CSP.

## Deployment

- Hosted on Vercel; `npm run build` runs through `vercel.json`.
- GitHub Actions checks production after every push to `main` and once daily: `health.json`, the app shell, the bundle, and the stylesheet.

## Honest limitations

- No backend, so there is no cross-device sync and no server-side usage data.
- Real-user adoption metrics: N/A. I do not claim a user count.
- CSP `'unsafe-inline'` remains until scripts are externalized or nonced.

## Next technical improvements (from the roadmap)

1. Provider interface abstraction to add more providers
2. Side-by-side model comparison
3. Encrypted local history with a passphrase
4. Cost estimation when provider pricing is available

## Screenshots

TODO: add chat with model picker, file attachment, token usage panel, and exported Markdown.
