<div align="center">

# 💬 ChatWithIt

### The most private way to chat with frontier AI models.

**100+ free models. Zero backend. Your keys never leave your browser.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/researchsociety1999-hub/Chat-With-It)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/researchsociety1999-hub/Chat-With-It/actions/workflows/ci.yml/badge.svg)](https://github.com/researchsociety1999-hub/Chat-With-It/actions/workflows/ci.yml)
[![Deploy status](https://github.com/researchsociety1999-hub/Chat-With-It/actions/workflows/deploy-status.yml/badge.svg)](https://github.com/researchsociety1999-hub/Chat-With-It/actions/workflows/deploy-status.yml)
[![No Backend](https://img.shields.io/badge/backend-none-brightgreen.svg)]()
[![Privacy First](https://img.shields.io/badge/tracking-none-red.svg)]()
[![PWA Ready](https://img.shields.io/badge/PWA-ready-purple.svg)]()

[**Live Demo →**](https://chat-with-it.vercel.app) · [**View Source**](https://github.com/researchsociety1999-hub/Chat-With-It)

</div>

---

## Why ChatWithIt?

Most AI chat apps require you to trust their servers with your API keys and conversations.

ChatWithIt is different.

> **Your API key lives only in browser memory for this session. It is never written to localStorage, cookies, or any intermediate server — only sent directly to OpenRouter or Hugging Face over HTTPS.**

That is not a claim. [You can read the source.](./js/api.js)

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

Or use the live site: **https://chat-with-it.vercel.app**  
(`npm run build` runs on Vercel via `vercel.json`.)

**Setup**
1. Open the app
2. Choose OpenRouter or Hugging Face
3. Paste your API key (session memory only)
4. Pick a free model and chat

---

## Deployment status

Production is checked automatically after every push to `main` (and once daily):

| Check | Endpoint |
|-------|----------|
| Health JSON | https://chat-with-it.vercel.app/health.json |
| App shell | https://chat-with-it.vercel.app/ |
| Bundle | https://chat-with-it.vercel.app/dist/app.js |
| Styles | https://chat-with-it.vercel.app/css/app.css |

Workflow: [Deploy status](https://github.com/researchsociety1999-hub/Chat-With-It/actions/workflows/deploy-status.yml)

---

## Features (current)

### Chat
- OpenRouter + Hugging Face providers
- Free-model discovery (`:free` suffix and zero pricing)
- Streaming responses with stop control
- Personas: Assistant, Tutor, Creative Writer, Code Reviewer, Debate Coach
- Text file attachments (`.txt`, `.md`, `.json`, `.csv`, code files)
- Keyboard shortcuts (Enter send, Shift+Enter newline, Ctrl/Cmd+K model search)

### Session tools
- Live token / context usage and session stats
- Export Markdown / JSON / TXT / PDF / clipboard
- Optional local chat history (7-day TTL); API keys never persisted

### Customize
- Themes: Dark, Light, Violet, Ember, Forest, Aurora + system
- High-contrast mode
- Temperature and max-tokens controls
- Collapsible desktop sidebar; mobile drawer

### Deploy
- Static PWA (`manifest.json` + `sw.js`)
- esbuild bundle (`npm run build` → `dist/app.js`)
- Security headers via `vercel.json`
- Production health checks via GitHub Actions

---

## Architecture

```
ChatWithIt/
├── index.html
├── health.json          # Production probe (/health.json)
├── css/app.css          # Main layout + themes
├── css/profiles.css
├── js/{app,api,ui,state,profiles,utils}.js
├── dist/app.js
├── sw.js / manifest.json
└── vercel.json
```

---

## Roadmap

- [ ] Image / drag-and-drop multimodal attach
- [ ] Encrypted local history passphrase
- [ ] Custom saved personas
- [ ] Side-by-side model compare
- [ ] Message search across history

---

## License

MIT — built by [Rishi](https://github.com/researchsociety1999-hub)
