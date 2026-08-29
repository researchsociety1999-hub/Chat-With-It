<div align="center">

# 💬 ChatWithIt

### Private, browser-based chat with 100+ AI models.

**100+ models. Zero backend. Your keys go straight to the provider you choose.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/researchsociety1999-hub/Chat-With-It)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![No Backend](https://img.shields.io/badge/backend-none-brightgreen.svg)]()
[![Privacy First](https://img.shields.io/badge/tracking-none-red.svg)]()
[![PWA Ready](https://img.shields.io/badge/PWA-ready-purple.svg)]()

[**Live Demo →**](https://your-vercel-url.vercel.app) &nbsp;·&nbsp; [**View Source**](https://github.com/researchsociety1999-hub/Chat-With-It) &nbsp;·&nbsp; [**Deploy Your Own**](https://vercel.com/new/clone?repository-url=https://github.com/researchsociety1999-hub/Chat-With-It)

</div>

---

## Why ChatWithIt?

Most AI chat apps require you to trust their servers with your API keys, your conversations, and your data.

ChatWithIt is different.

> **Your API key is typed into your browser and requests go directly from your browser to the provider you choose — OpenRouter, Hugging Face, or your own OpenAI-compatible endpoint (Ollama, LM Studio, vLLM). No intermediate server ever receives your key.**

That's not a claim. [You can read the source.](./js/api.js)

---

## 🚀 Start in 60 Seconds

```bash
# Option 1 — Use the live deployment (no install)
# Open your Vercel URL directly

# Option 2 — Run locally
git clone https://github.com/researchsociety1999-hub/Chat-With-It.git
cd Chat-With-It
npm install
npm run build
npx serve .
# open http://localhost:3000
```

**Setup:**
1. Open the app
2. Choose your provider — OpenRouter, Hugging Face, or a local OpenAI-compatible endpoint
3. Paste your API key (not required for local endpoints that need none)
4. Start chatting

That's it. No accounts. No email. No tracking.

---

## 🔑 API Keys

| Provider | Key needed? | Where to get it |
|----------|-------------|-----------------|
| OpenRouter | Yes | [openrouter.ai/keys](https://openrouter.ai/keys) |
| Hugging Face | Yes | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| Local (Ollama / LM Studio / vLLM) | Usually no | Runs locally — set a base URL, e.g. `http://localhost:11434/v1` |

---

## ✨ Features

### Chat
- 🔷 **OpenRouter** — 100+ models. Curated free list by default; the full live list loads once you paste a key.
- 🤗 **Hugging Face** — curated 50+ models served via the HF Inference-compatible endpoint.
- 🖥️ **Local / custom endpoint** — any OpenAI-compatible server (Ollama, LM Studio, vLLM). Falls back to a sensible default if the server is unreachable.
- 🎭 **5 Personas** — Assistant, Tutor, Creative Writer, Code Reviewer, Debate Coach.
- 📎 **File attachments** — text and code files, small images (sent as metadata — text-only endpoints can't "see" images), and basic PDF text extraction (client-side, up to 10 pages). Limits: 5 files, 500 KB each, 2 MB total.
- 🔄 **Mid-conversation model switching** — switch models during or after a reply without losing context; each assistant message records the model that produced it.
- 🧾 **Model role/cost badges** — free/low/mid/high cost tier (from real provider pricing) and role tags (reasoning / code / creative), inferred from model names and listing data only. No fake benchmarks, nothing shown when data is missing.
- 💬 **Named conversations** — create, rename, delete, and **search** conversations by title and message content; jump straight to the matching message.
- ⌨️ **Keyboard-friendly** — Ctrl+Enter to send, Ctrl+K to search models, Esc to dismiss, visible focus styles, ARIA labels.

### Analyze

- 📊 **Session stats** — prompt/completion tokens, context ring, per-turn breakdown.
- 🔍 **Conversation search** — instant search across saved chats, with snippets and jump-to-message.

### Customize

- 🎨 **Themes** — Dark, Light, and System, plus a high-contrast toggle.
- 📚 **Persona presets** — switch tone/instructions in one click.
- 💾 **Save & Export** — named conversations persist locally; export as Markdown, JSON, TXT, or PDF.

### Deploy

- ⚡ **Vanilla JS, esbuild** — no framework. `npm run build` produces `dist/app.js`.
- 📱 **PWA** — installable on desktop and mobile, shell works offline, mobile safe-area aware.
- 🚀 **One-click Vercel deploy** — live in under a minute.

---

## 🛡️ Why Trust ChatWithIt?

| Trust Signal | Detail |
|---|---|
| 🔒 No backend | Requests go directly from your browser to the AI provider. You can host this on any static server. |
| 🔑 Keys stay in memory | By default, API keys live only in memory and are cleared after 30 min of inactivity or on page reload. They are never written to `localStorage` unless you explicitly save a named profile (deliberate, deletable opt-in, same trust boundary as a password manager). |
| 🚫 No tracking | The app ships zero analytics, zero cookies, zero telemetry. |
| 🛡️ CSP enforced | Content-Security-Policy headers via `vercel.json` |
| 📜 MIT licensed | 100% open source — read every line. |
| 🧹 Auditable | 6 focused JS modules, no obfuscation (plus one esbuild output). |

---

## 🆚 ChatWithIt vs. Alternatives

| Feature | ChatWithIt | ChatGPT | Claude.ai | Poe |
|---|---|---|---|---|
| API key stays in browser | ✅ | ❌ | ❌ | ❌ |
| No account required | ✅ | ❌ | ❌ | ❌ |
| 100+ models | ✅ | ❌ | ❌ | ✅ |
| Model role/cost badges | ✅ | ❌ | ❌ | ❌ |
| Self-hostable | ✅ | ❌ | ❌ | ❌ |
| MIT licensed | ✅ | ❌ | ❌ | ❌ |
| No backend required | ✅ | ❌ | ❌ | ❌ |
| Free to deploy | ✅ | ❌ | ❌ | ❌ |

---

## 🗂️ Architecture

```
ChatWithIt/
├── index.html       # Full UI — no framework (esbuild bundles the JS)
├── js/
│   ├── api.js       # Provider calls — OpenRouter / HF / local (read this for trust)
│   ├── app.js       # Core logic and event handling
│   ├── ui.js        # DOM rendering, chat bubbles, modals
│   ├── state.js     # App state, conversations, history caps
│   ├── profiles.js  # Optional saved API-key profiles
│   └── utils.js     # Helpers
├── dist/app.js      # esbuild output (npm run build)
├── css/             # Stylesheets
├── sw.js            # Service Worker (PWA shell)
├── manifest.json    # PWA manifest
├── vercel.json      # Deployment config + security headers
└── package.json
```

No frontend framework. The only build step is `esbuild` for a single bundle. If you can read HTML and JavaScript, you can audit the whole app.

---

## 🗺️ Roadmap

- [ ] Richer export options (HTML)
- [ ] Workspace / folder management
- [ ] Documentation site
- [ ] Chat-level encryption at rest

---

## ❓ FAQ

**Is my API key safe?**
By default, yes — it lives only in memory and is cleared after 30 minutes of inactivity or when you reload the page. It is sent directly to OpenRouter, Hugging Face, or your local endpoint; there is no ChatWithIt server. The only exception is if you explicitly save a named credential profile — that's an opt-in and those profiles are deletable at any time (they live in your browser's `localStorage` only).

**Do you store my conversations?**
Chat history is stored in your browser's `localStorage` (key `cwiConversations`; the active conversation is mirrored to legacy `cwiChatHistory`). Caps: 200 messages per conversation, 30 conversations, 7-day inactivity TTL, oldest evicted when full. Nothing is ever sent to a backend.

**Can I self-host this?**
Yes. Clone the repo and serve the static files (needs `npm run build` first). There is no backend to configure.

**Is this free?**
The app is MIT licensed and free to use. You pay only for your own API usage, directly to the provider.

**Does it work offline?**
Partially — the app shell loads from the service worker cache, but AI responses require an internet connection (or your local endpoint).

---

## 🤝 Contributing

Contributions are welcome.

```bash
git clone https://github.com/researchsociety1999-hub/Chat-With-It.git
cd Chat-With-It
npm install
npm run build
npx serve .
```

Please open an issue before submitting large changes.

---

## 📄 License

MIT — built by [Rishi](https://github.com/researchsociety1999)

---

<div align="center">

**If ChatWithIt saved you time, consider giving it a ⭐ — it helps others discover it.**

</div>