# Decision: chat-history persistence

**Status:** proposal. Needs the owner's decision.
**Facts as of main `191f588`.**

## Current behavior

- `AppState.addMessage()` calls `this.persistHistory()` on every message (`js/state.js`, line 288).
- `persistHistory()` (line 251) writes to `localStorage` under `cwiChatHistory` (line 93). `loadPersistedHistory()` (line 233) reads it back and drops expired data (7-day TTL).
- There is no setting, toggle or flag around this. History is always saved.
- `persistState()` excludes API keys, Hugging Face tokens and chat history from `cwiState`, so keys are not stored.
- History is stored as plain text, not encrypted.

## Documentation mismatch

README, PRIVACY and CASE_STUDY call the history "optional". There is no way to turn it off, so the word is inaccurate. PRIVACY already says history is plain `localStorage`, which is correct.

## Options

| Option | User impact | Notes |
|---|---|---|
| A. Keep always on, fix the wording | None | Smallest change. Weakest privacy stance for a project that markets local-first privacy. |
| B. Opt-in (off by default) | Existing users lose auto-saved history unless migrated | Best privacy default. Needs a clear setting and a one-time notice. |
| C. Opt-out (on by default, setting to turn off) | None until the user acts | Honest and low friction. Needs a visible setting and a "clear now" action. |
| D. Session-only (memory) | History gone on reload | Strongest privacy, weakest convenience. |

## Recommendation

Choose C or B. Whichever is chosen, add a visible setting, keep the 7-day TTL, keep "clear history", and update README, PRIVACY, SECURITY and CASE_STUDY in the same change. If the owner picks A, only the wording changes.

## Acceptance criteria

- The setting exists, persists, and is reachable by keyboard and touch.
- With history off, nothing is written to `cwiChatHistory`, and turning it off clears what exists after confirmation.
- Existing stored history is handled explicitly on first load after the change (kept, or cleared with notice).
- Docs match behavior.

## Test ideas

`addMessage` with the setting off writes nothing, with it on writes once, the TTL still expires, and the toggle clears stored data after confirmation.
