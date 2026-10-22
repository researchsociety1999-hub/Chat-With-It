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

## Wiring (done)

`js/app.js` calls `gatedStream()` from `js/model-gate.js` instead of `API.sendMessageStream`. Hugging Face passes straight through unchanged.

Defaults, chosen to keep the user in control:

- **Ask first.** The gate never switches models on its own (`autoFallback` is off). When a model is unavailable the chat shows a persistent inline error. If a replacement from the current free list exists, a "Use <model>" button appears, and only that click switches the model and resends.
- **Privacy blocks are not model problems.** A data-policy 404 is classified once, in `classifyDispatchError`, and `api.js` uses that same function. It shows a message pointing at the OpenRouter privacy settings, offers no model switch, and does not refresh the model list.
- **Never delays a send.** `awaitFresh` is off, so the catalog refreshes in the background (at most every 10 minutes). Only a deprecated model blocks before sending (`strictPreflight: false`). The app's own free-list guard in `App.sendMessage` remains the authority for "free and listed", and an explicit Retry is never refused.
- **One free-model predicate.** `api.js` and the provider adapter both use `isFreeModel` from `availability.mjs`.
- **Retry after a failure** resends the same message without duplicating it in history or in the request.

A silent free-to-free fallback is still available as `autoFallback: true`, but it is off by default and is an owner decision.

## Validator

```bash
node scripts/validate-models.mjs --curated curated.json
OPENROUTER_API_KEY=... node scripts/validate-models.mjs --curated curated.json --probe 3
```

`curated.json` is an array of `{ "id": "..." }`. Export it from `CURATED_FREE.openrouter`. A scheduled GitHub Actions job can run the first form daily and fail when entries go stale.

## Privacy note

A fallback sends the prompt to a different model than the one the user picked. It is free-to-free only and always announced. Pass `autoFallback: false` to `dispatchWithGate` to ask the user first instead.
