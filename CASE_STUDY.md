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
