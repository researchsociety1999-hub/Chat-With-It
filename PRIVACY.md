# Privacy

ChatWithIt is designed to keep as much data as possible under your control.

## What ChatWithIt does

- **No ChatWithIt backend** — this app has no server that receives your messages or API keys.
- **API keys stay in memory by default** — keys are held only in JavaScript memory for the current browser session and are cleared after 30 minutes of inactivity. The one exception is the optional Profiles feature: if you tap "Save current key", that key is stored **unencrypted** in this browser's `localStorage` (`cwiProfiles`) until you delete the profile. Nothing else writes keys to `localStorage`, IndexedDB, or cookies.
- **Direct provider calls** — when you chat with OpenRouter or Hugging Face, your browser sends the request straight to that provider over HTTPS. Your key and your prompt go from the browser to the provider's endpoint without passing through any ChatWithIt server.
- **On-device Local mode** — when you choose the Local tab, the model runs inside your browser tab and your messages are not sent to any provider (details below).
- **No ChatWithIt telemetry** — the app itself does not run analytics, tracking pixels, or third-party identity services.

## Local (on-device) mode

The Local tab runs a GGUF model on your own device. The inference engine (wllama, a WebAssembly build of llama.cpp) executes in your browser tab, so your prompts and the model's replies are processed in browser memory and are not sent to OpenRouter, Hugging Face, or any ChatWithIt server. Local mode needs no API key.

Local mode still makes network requests, and the hosts that answer them can see your IP address and browser details:

| When | Host | What is requested |
|------|------|-------------------|
| The engine loads (browsers may reuse a cached copy) | `cdn.jsdelivr.net` (jsDelivr) | The wllama engine files (JavaScript and WebAssembly) |
| You search for models or open a repository's file list | `huggingface.co` | The words you typed in the search box and the repository name |
| You download a model | `huggingface.co` and its download hosts | The model file |

ChatWithIt does not control those hosts' logging. It does not attach an API key or any chat content to these requests. Choosing a `.gguf` file from your own disk makes no model download request, although the engine still loads from jsDelivr.

Downloaded model files are kept by the engine in this browser's storage for this site. A small list of the models you downloaded (repository, file name, size and dates) is kept in IndexedDB (`cwi-local-models`); it holds no chat content and no keys. "Delete" in the Downloaded models panel removes the list entry and asks the engine to remove the file, and clearing this site's data removes both.

## What is stored on your device

| Data | Where | Retention |
|------|-------|-----------|
| API keys | Browser memory (plus `localStorage` only if you save a Profile) | Memory: cleared on idle timeout or tab close. Saved profiles: until you delete them |
| Theme, generation settings, selected model | `localStorage` (`cwiState`) | Until you clear site data |
| Chat history (always saved in this version; includes Local-mode chats) | `localStorage` (`cwiChatHistory`) | 7-day TTL; you can clear anytime |
| List of downloaded Local models | IndexedDB (`cwi-local-models`) | Until you delete the model or clear site data |
| Downloaded model files | The engine's browser cache for this site | Until you delete the model or clear site data |

## What providers receive

When you send a message with OpenRouter or Hugging Face selected, the content of that message (and any attached text files) is sent to that provider. Those providers may forward requests to underlying model hosts. In Local mode no provider receives your messages.

ChatWithIt does **not** control provider retention, logging, or training policies. Review:

- [OpenRouter privacy](https://openrouter.ai/privacy)
- [Hugging Face privacy](https://huggingface.co/privacy)

## Third-party requests

When the page loads, the browser requests the Satoshi typeface stylesheet from Fontshare (`api.fontshare.com`). Fontshare therefore receives the visitor's IP address and browser details, and ChatWithIt does not control its logging. No other third-party request is made by `index.html`. Self-hosting the font would remove this request.

Requests to jsDelivr and Hugging Face for Local mode happen only after you use the Local tab, as listed above.

## Honest limitations

- “Private” here means *ChatWithIt does not store or intermediate your data*. It does **not** mean providers never see your prompts.
- Local mode keeps conversation content on your device, but it does not hide the fact that your IP address contacted jsDelivr or Hugging Face.
- Chat history, including Local-mode chats, is stored in plain `localStorage` (not encrypted). Do not use it for highly sensitive material if others share the device.
- Model files come from the repositories you choose on Hugging Face. Check each model's source and license there.
- CSP and security headers reduce XSS and clickjacking risk; they do not replace careful use of API keys.

## Future SaaS mode (planned, not implemented)

A future server-backed mode would introduce account data, server-side conversation storage, and different retention rules. That mode is **not** present in the current browser-only app. When it is added, this document will be updated to distinguish personal mode from SaaS mode clearly.
