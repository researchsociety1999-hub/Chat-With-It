# Model availability gate

Keeps chat from being sent to a model that OpenRouter no longer serves for free.

## Pieces

- `js/providers/availability.mjs`: pure gate (catalog fetch, deprecation check, error classification, negative cache, fallback pick, `dispatchWithGate`).
- `js/providers/availability.test.mjs`: vitest cases (`npm test`).
- `scripts/validate-models.mjs`: CLI that compares a curated list to the live catalog.

## Behavior

1. `GET /api/v1/models` (public) is the source of truth. A model is usable only if it is in the live free list and not deprecated (local `DEPRECATED_IDS` map or a past `expiration_date`).
2. Offline or catalog failure: curated models stay allowed (marked unverified). An empty live catalog is ignored, never trusted.
3. Before sending, `dispatchWithGate` checks the model. A model that is not in the free list is swapped for another free one, and `onFallback` reports it.
4. After a failure, the error is classified. `NO_ENDPOINTS`, `NOT_FREE`, `MODEL_MISSING` and `UPSTREAM_RATE_LIMIT` may fall back to another free model, but only if no token has streamed yet.
5. `AUTH`, `RATE_LIMIT`, `POLICY_BLOCKED` (privacy-setting 404) and aborts never fall back. A policy block means every free model is blocked, so the user must change OpenRouter privacy settings.
6. Failed models are skipped for 15 minutes.

## Wiring into `js/app.js` (not done in this change)

Replace the direct provider call in `sendMessage` with:

```js
import { createAvailabilityGate, dispatchWithGate } from './providers/availability.mjs';

const gate = createAvailabilityGate({ curated: CURATED_OPENROUTER_MODELS });

const { modelId, result } = await dispatchWithGate({
  gate,
  modelId: AppState.selectedModel,
  onFallback: ({ from, to }) => UI.toast(`${from} is unavailable. Switched to ${to}.`, 'warning'),
  send: (id, ctx) => openRouterAdapter.streamChat({
    token, modelId: id, messages, options, signal,
    onToken: (d) => { ctx.markOutput(); onToken(d); },
  }),
});
AppState.selectedModel = modelId;
```

If the model changes, update the model badge and the saved selection so the next message does not retry the dead model.

## Validator

```bash
node scripts/validate-models.mjs --curated curated.json
OPENROUTER_API_KEY=... node scripts/validate-models.mjs --curated curated.json --probe 3
```

A scheduled GitHub Actions job can run the first form daily and fail when entries go stale.

## Privacy note

A fallback sends the prompt to a different model than the one the user picked. It is free-to-free only and always announced. Set `autoFallback: false` to ask the user first instead.
