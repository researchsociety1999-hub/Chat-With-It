# Privacy

ChatWithIt is designed to keep as much data as possible under your control.

## What ChatWithIt does

- **No ChatWithIt backend** — this app has no server that receives your messages or API keys.
- **API keys stay in memory** — keys are held only in JavaScript memory for the current browser session. They are never written to `localStorage`, IndexedDB, or cookies. Keys are cleared after 30 minutes of inactivity.
- **Direct provider calls** — when you chat, your browser talks directly to OpenRouter or Hugging Face over HTTPS.
- **No ChatWithIt telemetry** — the app itself does not run analytics, tracking pixels, or third-party identity services.

## What is stored on your device

| Data | Where | Retention |
|------|-------|-----------|
| API keys | Browser memory only | Cleared on idle timeout or tab close |
| Theme, generation settings, selected model | `localStorage` (`cwiState`) | Until you clear site data |
| Chat history (optional) | `localStorage` (`cwiChatHistory`) | 7-day TTL; you can clear anytime |

## What providers receive

When you send a message, the content of that message (and any attached text files) is sent to the provider you selected (OpenRouter or Hugging Face). Those providers may forward requests to underlying model hosts.

ChatWithIt does **not** control provider retention, logging, or training policies. Review:

- [OpenRouter privacy](https://openrouter.ai/privacy)
- [Hugging Face privacy](https://huggingface.co/privacy)

## Honest limitations

- “Private” here means *ChatWithIt does not store or intermediate your data*. It does **not** mean providers never see your prompts.
- Local chat history is stored in plain `localStorage` (not encrypted). Do not use it for highly sensitive material if others share the device.
- CSP and security headers reduce XSS and clickjacking risk; they do not replace careful use of API keys.

## Future SaaS mode (planned, not implemented)

A future server-backed mode would introduce account data, server-side conversation storage, and different retention rules. That mode is **not** present in the current browser-only app. When it is added, this document will be updated to distinguish personal mode from SaaS mode clearly.
