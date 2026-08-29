# 💬 ChatWithIt

### Private, browser-based chat with 100+ AI models.

**100+ models. Zero backend. Your keys go straight to the provider you choose.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/researchsociety1999-hub/Chat-With-It)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/researchsociety1999-hub/Chat-With-It/actions/workflows/ci.yml/badge.svg)](https://github.com/researchsociety1999-hub/Chat-With-It/actions/workflows/ci.yml)
[![Deploy status](https://github.com/researchsociety1999-hub/Chat-With-It/actions/workflows/deploy-status.yml/badge.svg)](https://github.com/researchsociety1999-hub/Chat-With-It/actions/workflows/deploy-status.yml)
[![No Backend](https://img.shields.io/badge/backend-none-brightgreen.svg)]()
[![Privacy First](https://img.shields.io/badge/tracking-none-red.svg)]()
[![PWA Ready](https://img.shields.io/badge/PWA-ready-purple.svg)]()

[**Live Demo →**](https://chat-with-it.vercel.app) · [**View Source**](https://github.com/researchsociety1999-hub/Chat-With-It)

---

## Why ChatWithIt?

Most AI chat apps require you to trust their servers with your API keys and conversations.

ChatWithIt is different.

> **Your API key lives only in browser memory for this session (or in optional local named credential profiles you explicitly create). Requests go directly from your browser to the provider you choose — OpenRouter, Hugging Face, or your own local OpenAI-compatible endpoint (Ollama, LM Studio, vLLM). No intermediate server ever receives your key.**

That is not a claim. [You can read the source.](./js/api.js)

The app is **framework-free modular JavaScript** (no React, no TypeScript, no component library). State lives in a single `AppState` object; the UI is plain DOM + CSS.

---

## Start in 60 seconds

```bash
git clone https://github.com/researchsociety1999-hub/Chat-With-It.git
cd Chat-With-It
npm install
npm run build
npm start
# open http://localhost:3000
```

Or use the live site: https://chat-with-it.vercel.app (`npm run build` runs on Vercel via `vercel.json`.)

### Setup

1. Open the app
2. Choose your provider — OpenRouter, Hugging Face, or a local OpenAI-compatible endpoint
3. Paste your API key (not required for local endpoints that need none)
4. Pick a model and start chatting

That's it. No accounts. No email. No tracking.

---

## Deployment status

Production is checked automatically after every push to `main` (and once daily):

| Check | Endpoint |
|---|---|
| Health JSON | https://chat-with-it.vercel.app/health.json |
| App shell | https://chat-with-it.vercel.app/ |
| Bundle | https://chat-with-it.vercel.app/dist/app.js |
| Styles | https://chat-with-it.vercel.app/css/app.css |

Workflow: [Deploy status](https://github.com/researchsociety1999-hub/Chat-With-It/actions/workflows/deploy-status.yml)

---

## Features (current)

### Chat
- 🔷 **OpenRouter** — 100+ models. Free-model discovery (`:free` suffix and zero pricing) and full live catalog.
- 🤗 **Hugging Face** — curated and live models served via HF Inference-compatible endpoints.
- 🖥️ **Local / custom endpoint** — any OpenAI-compatible server (Ollama, LM Studio, vLLM).
- 🎭 **5 Personas** — Assistant, Tutor, Creative Writer, Code Reviewer, Debate Coach.
- 📎 **File attachments** — text and code files, small images, and basic PDF extraction (limits: 5 files, 500 KB each, 2 MB total).
- 🔄 **Mid-conversation model switching** — switch models without losing context; each message records its producing model.
- 💬 **Named conversations** — create, rename, delete, and search conversations by title and message content.
- ⌨️ **Keyboard shortcuts** — `Enter` to send, `Shift+Enter` for new line, `Cmd/Ctrl+N` for new chat, `Cmd/Ctrl+/` to focus composer, `Cmd/Ctrl+K` for model search, `Esc` to dismiss.
- 📜 **UI Reliability** — sticky auto-scroll during streaming with manual scroll-up preservation, "↓ Latest" jump button, and code block overflow containment with one-click copy.

### Generation controls
- On/off toggle for temperature and max-tokens (omitted from request when off to let provider defaults apply).
- Persisted in localStorage (`cwiState`); API keys never written to general state.

### Session tools
- Live token / context usage, context bar, and session turn statistics.
- Export Markdown / JSON / TXT / PDF / clipboard.
- Optional local chat history (7-day inactivity TTL).

### Customize & accessibility
- Themes: Dark, Light, Violet, Ember, Forest, Aurora + system preference.
- High-contrast mode & reduced-motion support.
- Collapsible desktop sidebar & mobile drawer.
- PWA safe-area styles for iOS / notched displays.

### Deploy
- Static PWA (`manifest.json` + `sw.js` cache `chatwithit-v21`).
- esbuild bundle (`npm run build` → `dist/app.js`).
- Security headers via `vercel.json`.
- Production health checks via GitHub Actions.

---

## Architecture

```
ChatWithIt/
├── index.html              # App shell
├── health.json             # Production probe
├── css/
│   ├── app.css             # Layout, themes, tokens, gen-toggle
│   ├── profiles.css
│   └── pwa-safe-area.css
├── js/
│   ├── app.js              # Orchestration, event wiring, streaming, shortcuts
│   ├── api.js              # Provider requests (OpenRouter, HF, Local)
│   ├── state.js            # AppState (conversations, generation controls)
│   ├── ui.js               # DOM rendering, code blocks, scroll management
│   ├── profiles.js         # Optional saved API key profiles
│   └── utils.js            # Markdown parse, clipboard, formatting helpers
├── dist/app.js             # Bundled output (npm run build)
├── sw.js                   # Service worker (cache: chatwithit-v21)
├── manifest.json           # PWA manifest
├── vercel.json             # Vercel deployment & security headers
└── package.json
```

---

## Development & merge policy

- Prefer source commits over one-off CI patch workflows.
- CI (`ci.yml`) and the deploy-status check must pass before merge.
- Avoid introducing new framework dependencies; keep the surface area vanilla JS + CSS.
- When changing cached assets, bump the service-worker cache version in the same PR (`CACHE_NAME`).

Tests: `npm test` (vitest). Bundle: `npm run build`.

---

## License

MIT — built by [Rishi](https://github.com/researchsociety1999)
