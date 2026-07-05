<div align="center">

# 💬 ChatWithIt

### The most private way to chat with frontier AI models.

**100+ models. Zero backend. Your keys never leave your browser.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/researchsociety1999-hub/Chat-With-It)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![No Backend](https://img.shields.io/badge/backend-none-brightgreen.svg)]()
[![Privacy First](https://img.shields.io/badge/tracking-none-red.svg)]()
[![PWA Ready](https://img.shields.io/badge/PWA-ready-purple.svg)]()

[**Live Demo →**](https://your-vercel-url.vercel.app) &nbsp;·&nbsp; [**View Source**](https://github.com/researchsociety1999-hub/Chat-With-It) &nbsp;·&nbsp; [**Deploy Your Own**](https://vercel.com/new/clone?repository-url=https://github.com/researchsociety1999-hub/Chat-With-It)

</div>

---

<!-- Add a demo GIF here once recorded -->
<!-- ![ChatWithIt Demo](./assets/demo.gif) -->

---

## Why ChatWithIt?

Most AI chat apps require you to trust their servers with your API keys, your conversations, and your data.

ChatWithIt is different.

> **Your API key is typed into your browser and used directly from your browser. It is never sent to any intermediate server — only to OpenRouter or Hugging Face.**

That's not a claim. [You can read the source.](./js/api.js)

---

## 🚀 Start in 60 Seconds

```bash
# Option 1 — Use the live deployment (no install)
# Open your Vercel URL directly

# Option 2 — Run locally
git clone https://github.com/researchsociety1999-hub/Chat-With-It.git
cd Chat-With-It
npx serve .
# open http://localhost:3000
```

**Setup:**
1. Open the app
2. Choose your provider — OpenRouter or Hugging Face
3. Paste your API key
4. Start chatting

That's it. No accounts. No email. No tracking.

---

## 🔑 Get Your API Key

| Provider | Link | Free Tier |
|----------|------|-----------|
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | $1 free credit + 50+ free models |
| Hugging Face | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | Free inference tier available |

---

## ✨ Features

### Chat
- 🔷 **OpenRouter** — 100+ models including GPT-4o, Claude 3.5, Gemini, Llama, Mistral, and more
- 🤗 **Hugging Face** — full Inference API support
- 🎭 **6 AI Personas** — Default, Engineer, Writer, Teacher, Debate, JSON
- 🎤 **Voice Input** — browser-native speech recognition
- 📎 **File Attachments** — attach `.txt`, `.md`, `.json`, `.csv`, `.py`, `.js`, `.html`
- ⌨️ **Full Keyboard Navigation** — Ctrl+F search, shortcuts throughout

### Compare & Analyze
- ⚖️ **Model Compare Mode** — side-by-side A/B testing of any two models simultaneously
- 📊 **Session Stats** — live token usage, context ring, per-turn breakdown
- 🔍 **Message Search** — find anything across all messages instantly

### Customize
- 🎨 **6 Themes** — Midnight, Nordic, Emerald, Crimson, Paper, Light
- 📚 **Prompt Library** — 10 curated developer-focused prompt templates
- 💾 **Save & Export** — save chats locally, export as Markdown / JSON / TXT

### Deploy & Extend
- ⚡ **No Build Step** — pure HTML + JavaScript
- 📱 **Mobile Responsive** — works on phones and tablets
- 🔧 **PWA Ready** — installable as a desktop or mobile app
- 🚀 **One-Click Vercel Deploy** — live in under a minute

---

## 🛡️ Why Trust ChatWithIt?

| Trust Signal | Detail |
|---|---|
| 🔒 No backend servers | Your requests go directly from browser → AI provider |
| 🔑 Keys stay in browser | `localStorage` only — never sent to any intermediate server |
| 🚫 No tracking | Zero analytics, zero cookies, zero telemetry |
| 🛡️ CSP enforced | Full Content Security Policy headers via `vercel.json` |
| 📜 MIT licensed | 100% open source — read every line |
| 🧹 Auditable architecture | 5 focused JS modules, no obfuscation |

---

## 🆚 ChatWithIt vs. Alternatives

| Feature | ChatWithIt | ChatGPT | Claude.ai | Poe |
|---|---|---|---|---|
| API key stays in browser | ✅ | ❌ | ❌ | ❌ |
| No account required | ✅ | ❌ | ❌ | ❌ |
| 100+ models | ✅ | ❌ | ❌ | ✅ |
| Side-by-side model compare | ✅ | ❌ | ❌ | ❌ |
| Self-hostable | ✅ | ❌ | ❌ | ❌ |
| MIT licensed | ✅ | ❌ | ❌ | ❌ |
| No backend required | ✅ | ❌ | ❌ | ❌ |
| Free to deploy | ✅ | ❌ | ❌ | ❌ |

---

## 🗂️ Architecture

```
ChatWithIt/
├── index.html       # Full UI — no framework, no build step
├── js/
│   ├── api.js       # OpenRouter + Hugging Face API calls (read this for trust)
│   ├── app.js       # Core logic and event handling
│   ├── ui.js        # DOM rendering and chat bubbles
│   ├── state.js     # App state management
│   ├── profiles.js  # AI personas and profile management
│   └── utils.js     # Helper functions
├── css/             # Stylesheets and theme definitions
├── sw.js            # Service Worker for PWA offline support
├── manifest.json    # PWA manifest
├── vercel.json      # Deployment config + security headers
└── package.json
```

No frameworks. No bundler. No backend. If you can read HTML and JavaScript, you can audit the entire application.

---

## 🗺️ Roadmap

- [ ] Drag-and-drop image support
- [ ] Local encrypted chat history
- [ ] Saved custom personas
- [ ] Workspace / folder management
- [ ] Richer export options (PDF, HTML)
- [ ] Extended mobile UX polish
- [ ] Documentation site

---

## ❓ FAQ

**Is my API key safe?**
Yes. Your key is stored in your browser's `localStorage` and sent directly to OpenRouter or Hugging Face. ChatWithIt has no server that ever receives it.

**Do you store my conversations?**
No. Conversations exist in your browser session only. You can export them yourself at any time.

**Can I self-host this?**
Yes. Clone the repo and serve it with any static file server. There is no backend to configure.

**Is this free?**
ChatWithIt is MIT licensed and free to use. You pay only for your own API usage directly to the provider.

**Does it work offline?**
Partially — the PWA shell loads offline, but AI responses require an internet connection.

---

## 🤝 Contributing

Contributions are welcome.

```bash
git clone https://github.com/researchsociety1999-hub/Chat-With-It.git
cd Chat-With-It
npx serve .
```

Please open an issue before submitting large changes.

---

## 📄 License

MIT — built by [Rishi](https://github.com/researchsociety1999-hub)

---

<div align="center">

**If ChatWithIt saved you time, consider giving it a ⭐ — it helps others discover it.**

</div>
