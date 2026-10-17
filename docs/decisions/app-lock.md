# Decision: the app lock

**Status:** proposal. Needs the owner's approval before any code is written.
**Facts as of main `191f588`.**

## Current state

The header has a lock button (`index.html`, `#lockBtn`, line 38). Clicking it calls `App.lockApp()` (`js/app.js`, lines 179 to 192).

- `lockApp()` only acts if `AppState.lockKey` is a function. `js/state.js` has no `lockKey`, so that branch never runs.
- It then opens `UI.confirmModal('Enter your passphrase to unlock', ...)`. The modal has no input field, and Confirm shows the toast "Unlocked" for any click.
- API keys and chat history stay readable the whole time. Nothing is encrypted and nothing is hidden.

So the control looks like a security feature and does nothing. The UI patch under review removes the button. Until that merges, the lock is cosmetic.

## What a browser-only lock can and cannot do

A lock in a static, backend-free app can:
- Encrypt stored data (history) at rest with a key derived from a passphrase, so reading `localStorage` alone is not enough.
- Clear in-memory keys on demand.

It cannot:
- Protect against someone who already controls the unlocked browser session, a malicious extension, or XSS.
- Recover a forgotten passphrase. There is no server to reset it.
- Make provider-side logging private.

Any wording must stay that narrow.

## Options

| Option | Effort | Notes |
|---|---|---|
| A. Remove the control (the UI patch already does this) | Done | Honest and simplest. No false claim remains. |
| B. Real passphrase lock for history | Medium | Derive a key with WebCrypto PBKDF2 (no dependency), encrypt `cwiChatHistory` with AES-GCM, ask for the passphrase on load. Argon2 would need a WASM dependency, which breaks the no-new-dependencies rule, so it is not recommended. |
| C. Leave the fake control | None | Not acceptable. It implies protection that does not exist. |

Option B needs a decision on migration (existing plaintext history), a forgotten-passphrase path (clear history), and a UI that clearly shows locked and unlocked states.

## Recommendation

Ship A now. Treat B as a separate, reviewed feature, and decide it together with the history-persistence note (`history-persistence.md`), because the lock only matters if history is stored.

## Acceptance criteria if B is approved

- Stored history is ciphertext. A test confirms plaintext never appears in `localStorage`.
- Wrong passphrase never reveals content and gives a clear message.
- Locking clears in-memory keys and hides history in the UI.
- Forgotten passphrase: a clearly labelled "clear history" path.
- No claim of protection beyond encryption at rest. README and PRIVACY updated in the same change.

## Test ideas

Key derivation round trip, wrong-passphrase failure, locked-state UI, migration of plaintext history, and a regression test that no lock control exists unless the lock is real.
