// apply-docs-fixes.mjs - run from the repo root:  node apply-docs-fixes.mjs
// All-or-nothing: if any expected text is not found exactly once, nothing is changed.
import fs from 'node:fs';

const EDITS = [
 [
  "SECURITY.md",
  "- **Keys in browser memory only** — API keys are held in JavaScript memory for the current session only. They are **never** written to `localStorage`, IndexedDB, cookies, or any server. Keys are cleared after 30 minutes of inactivity.",
  "- **Keys in browser memory by default** — API keys are held in JavaScript memory for the current session and are cleared after 30 minutes of inactivity. The exception is the optional Profiles feature: if you tap \"Save current key\", that key is stored **unencrypted** in this browser's `localStorage` (`cwiProfiles`) until you delete the profile. Keys are never written to IndexedDB, cookies, or any server."
 ],
 [
  "SECURITY.md",
  "| API keys | Memory only | Cleared on idle timeout or page unload |",
  "| API keys | Memory (plus `localStorage` only if you save a Profile) | Memory: cleared on idle timeout or page unload. Saved profiles: until you delete them |"
 ],
 [
  "CASE_STUDY.md",
  "- Optional local chat history with a 7-day TTL",
  "- Local chat history with a 7-day TTL (currently always saved)"
 ],
 [
  "CASE_STUDY.md",
  "- API keys live only in browser memory (`AppState`), are never written to localStorage or cookies, and are cleared on a 30-minute idle timeout or page reload.",
  "- API keys live in browser memory (`AppState`) by default and are cleared on a 30-minute idle timeout or page reload. The optional Profiles feature can save a key unencrypted in localStorage if the user opts in."
 ],
 [
  "CASE_STUDY.md",
  "- Only non-sensitive preferences are persisted (localStorage key `cwiState`).",
  "- App preferences are stored in localStorage (`cwiState`). Chat history (`cwiChatHistory`, 7-day TTL) and opt-in saved Profiles (`cwiProfiles`) are also stored locally."
 ],
 [
  "CASE_STUDY.md",
  "| Keys in memory only | No persistent credential exposure | Users re-enter their key each session and after the 30-minute idle timeout |",
  "| Keys in memory by default | Limited persistent credential exposure | Users re-enter their key each session unless they save a Profile (stored unencrypted, opt-in) |"
 ],
 [
  "CASE_STUDY.md",
  "| Optional local history (7-day TTL) |",
  "| Local history (7-day TTL, always saved today) |"
 ],
 [
  "AUDIT.md",
  "**Status:** Verified correct. Keys are cleared on idle timeout (30 min) and page reload.",
  "**Status:** Verified correct. Keys are cleared on idle timeout (30 min) and page reload.\n\n> **Update (2026-10-24):** this finding predates the Profiles feature. If a user taps \"Save current key\", that key is stored unencrypted in `localStorage` (`cwiProfiles`); see PRIVACY.md. Chat history is also persisted unconditionally (7-day TTL)."
 ],
 [
  "AUDIT.md",
  "- [x] API keys never stored in localStorage",
  "- [x] API keys never stored in localStorage (except opt-in saved Profiles, added later; see the update note above)"
 ]
];

const TEST_FILE_B64 = `
aW1wb3J0IHsgZGVzY3JpYmUsIGV4cGVjdCwgaXQgfSBmcm9tICd2aXRlc3QnOwppbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9t
ICdub2RlOmZzJzsKCmNvbnN0IHJlYWQgPSAocCkgPT4gcmVhZEZpbGVTeW5jKHAsICd1dGY4Jyk7CmNvbnN0IGRvY3MgPSBbJ1JF
QURNRS5tZCcsICdQUklWQUNZLm1kJywgJ1NFQ1VSSVRZLm1kJywgJ0NBU0VfU1RVRFkubWQnXTsKCmRlc2NyaWJlKCdzZWN1cml0
eSBhbmQgcHJpdmFjeSBkb2N1bWVudHMgYWdyZWUgd2l0aCB0aGUgY29kZScsICgpID0+IHsKICBpdCgnc2F2ZWQgUHJvZmlsZXMg
cmVhbGx5IHN0b3JlIHRva2VucyBpbiBsb2NhbFN0b3JhZ2UnLCAoKSA9PiB7CiAgICBleHBlY3QocmVhZCgnanMvcHJvZmlsZXMu
anMnKSkudG9NYXRjaCgvbG9jYWxTdG9yYWdlXC5zZXRJdGVtLyk7CiAgfSk7CiAgZm9yIChjb25zdCBmIG9mIGRvY3MpIHsKICAg
IGl0KGAke2Z9IGhhcyBubyBhYnNvbHV0ZSAibmV2ZXIgaW4gbG9jYWxTdG9yYWdlIC8gbWVtb3J5IG9ubHkiIGtleSBjbGFpbWAs
ICgpID0+IHsKICAgICAgY29uc3QgdCA9IHJlYWQoZik7CiAgICAgIGV4cGVjdCh0KS5ub3QudG9NYXRjaCgvbmV2ZXJcV3swLDR9
d3JpdHRlbiB0b1xXezAsM31gP2xvY2FsU3RvcmFnZS9pKTsKICAgICAgZXhwZWN0KHQpLm5vdC50b01hdGNoKC9LZXlzIGluIChi
cm93c2VyICk/bWVtb3J5IG9ubHkvaSk7CiAgICAgIGV4cGVjdCh0KS5ub3QudG9NYXRjaCgvXHxccypBUEkga2V5c1xzKlx8XHMq
TWVtb3J5IG9ubHlccypcfC8pOwogICAgfSk7CiAgfQogIGZvciAoY29uc3QgZiBvZiBbJ1BSSVZBQ1kubWQnLCAnU0VDVVJJVFku
bWQnXSkgewogICAgaXQoYCR7Zn0gZGlzY2xvc2VzIHRoZSBzYXZlZC1wcm9maWxlIGV4Y2VwdGlvbmAsICgpID0+IHsKICAgICAg
ZXhwZWN0KHJlYWQoZikpLnRvTWF0Y2goL1NhdmUgY3VycmVudCBrZXlbXHNcU10qdW5lbmNyeXB0ZWQvKTsKICAgIH0pOwogIH0K
ICBpdCgnQ0FTRV9TVFVEWS5tZCBtZW50aW9ucyBzYXZlZCBQcm9maWxlcyBhbmQgZG9lcyBub3QgY2FsbCBoaXN0b3J5IG9wdGlv
bmFsJywgKCkgPT4gewogICAgY29uc3QgdCA9IHJlYWQoJ0NBU0VfU1RVRFkubWQnKTsKICAgIGV4cGVjdCh0KS50b01hdGNoKC9Q
cm9maWxlcy8pOwogICAgZXhwZWN0KHQpLm5vdC50b01hdGNoKC9PcHRpb25hbCBsb2NhbCAoY2hhdCApP2hpc3RvcnkvaSk7CiAg
fSk7Cn0pOwo=
`;

const files = {};
for (const [f, find, repl] of EDITS) {
  if (!files[f]) { const raw = fs.readFileSync(f, 'utf8'); files[f] = { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') }; }
  const parts = files[f].text.split(find);
  if (parts.length !== 2) { console.error(`STOPPED: expected exactly one match in ${f} for:\n  ${find.slice(0, 80)}\nFound ${parts.length - 1}. Nothing was changed.`); process.exit(1); }
  files[f].text = parts[0] + repl + parts[1];
}
for (const [f, { text, crlf }] of Object.entries(files)) fs.writeFileSync(f, crlf ? text.replace(/\n/g, '\r\n') : text);
fs.writeFileSync('tests/docs-claims.test.js', Buffer.from(TEST_FILE_B64.replace(/\s+/g, ''), 'base64'));
console.log('OK: applied ' + EDITS.length + ' edits + added tests/docs-claims.test.js');
