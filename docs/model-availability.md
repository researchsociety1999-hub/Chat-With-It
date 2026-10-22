# Model availability gate

Keeps chat from being sent to a model that OpenRouter no longer serves for free.

## Pieces

- `js/providers/availability.mjs`: pure gate (catalog fetch, deprecation check, error classification, negative cache, fallback pick, `dispatchWithGate`).
- `js/model-gate.js`: bridge that puts the gate in front of `API.sendMessageStream` from `js/api.js`. It reuses `CURATED_FREE.openrouter` as the offline list.
- `js/providers/availability.test.mjs`: vitest cases (`npm test`).
- `scripts/validate-models.mjs`: CLI that compares a curated list to the live catalog.

## Behavior

1. `GET /api/v1/models` (public) is the source of truth. A model is usable only if it is in the live free list and not deprecated (local `DEPRECATED_IDS` map or a past `expiration_date`).
2. Offline or catalog failure: curated models stay allowed (marked unverified). An empty live catalog is ignored, never trusted.
3. Before sending, the gate checks the model. One that is not in the free list is swapped for another free one, and `onFallback` reports it.
4. After a failure the error is re-classified from the raw response body. `NO_ENDPOINTS`, `NOT_FREE`, `MODEL_MISSING` and `UPSTREAM_RATE_LIMIT` may fall back to another free model, but only if no token has streamed yet.
5. `AUTH`, `RATE_LIMIT`, `POLICY_BLOCKED` (privacy-setting 404) and aborts never fall back. A policy block means every free model is blocked, so the user must change OpenRouter privacy settings.
6. Failed models are skipped for 15 minutes.

## Wiring into `js/app.js` (three small edits, not yet applied)

`js/api.js` needs no change. The edits below are against the current `sendMessage`.

1. Import the bridge at the top of `js/app.js`:

```js
import { gatedStream } from './model-gate.js';
```

2. In `sendMessage`, replace the `doStream` thunk so it calls `gatedStream` instead of `API.sendMessageStream`:

```js
const doStream = () => gatedStream({
  provider: AppState.currentProvider,
  modelId: AppState.selectedModel,
  messages,
  onToken: (delta) => { /* existing token handler body, unchanged */ },
  options: AppState.generationControlsEnabled
    ? { temperature: AppState.temperature, maxTokens: AppState.maxTokens }
    : {},
  onFallback: ({ from, to }) => this._applyFallbackModel(from, to),
});
```

3. Add a helper to the `App` object, and a branch for policy blocks in the `catch` chain (before the `MODEL_NOT_FREE` branch):

```js
_applyFallbackModel(from, to) {
  AppState.selectedModel = to;
  AppState.persistState();
  const sel = UI.el('modelSelect');
  if (sel) sel.value = to;
  const m = AppState.allModels.find((x) => x.id === to);
  if (m) UI.updateModelLabel(m.name);
  UI.toast(`${from} is unavailable. Switched to ${to}.`, 'warning', 8000);
},
```

```js
} else if (error.kind === 'POLICY_BLOCKED') {
  UI.toast('OpenRouter blocked free models for your privacy settings. Review openrouter.ai/settings/privacy.', 'error', 9000);
```

Notes:
- `Utils.retryWithBackoff` wraps `doStream`, so the gate runs inside each attempt. It only retries errors without a `.code`, so gate and provider errors are not retried twice.
- If the model changes mid-send, the stored selection is updated so the next message does not retry the dead model.
- The curated list in `js/api.js` (`CURATED_FREE.openrouter`) is large and likely stale. Run the validator and prune it.

## Validator

```bash
node scripts/validate-models.mjs --curated curated.json
OPENROUTER_API_KEY=... node scripts/validate-models.mjs --curated curated.json --probe 3
```

`curated.json` is an array of `{ "id": "..." }`. Export it from `CURATED_FREE.openrouter`. A scheduled GitHub Actions job can run the first form daily and fail when entries go stale.

## Privacy note

A fallback sends the prompt to a different model than the one the user picked. It is free-to-free only and always announced. Pass `autoFallback: false` to `dispatchWithGate` to ask the user first instead.
