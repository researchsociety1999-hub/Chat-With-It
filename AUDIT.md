# Trust & Security Audit Report

**Date:** 2026-07-15  
**Auditor:** Claude Code  
**Project:** ChatWithIt (researchsociety1999-hub/Chat-With-It)

---

## Executive Summary

This audit identified several trust inconsistencies and security gaps in the ChatWithIt project. The README claims "Zero analytics, zero cookies, zero telemetry" and "Your API key stays in browser", but the deployed application loads Google Analytics and Vercel Speed Insights. Additionally, while DOMPurify is loaded, not all `innerHTML` insertions are sanitized. This report documents findings and applied fixes.

---

## Findings & Fixes

### 1. Undisclosed Analytics (CRITICAL)

**Finding:** `index.html` lines 18-30 load Google Analytics (`gtag.js`) and Vercel Speed Insights without disclosure in README.

**Fix Applied:** Removed both analytics scripts from `index.html`. The README's claim of "zero analytics" is now accurate.

**Files Changed:**
- `index.html` — removed `<script async src="https://www.googletagmanager.com/gtag/js?id=G-P06HWLQH1B">` and related gtag initialization, removed Vercel Speed Insights script

---

### 2. CSP Weakness (HIGH)

**Finding:** `vercel.json` CSP header includes `'unsafe-inline'` for `script-src`, which weakens XSS protection. The inline scripts in `index.html` require this.

**Status:** Not changed. Removing `'unsafe-inline'` would require adding nonces to all inline scripts, which is a larger refactor. The CSP already blocks external scripts except explicitly allowed CDNs.

**Recommendation:** For a future release, migrate all inline scripts to external files or implement nonce-based CSP.

---

### 3. Missing Security Headers (LOW)

**Finding:** The `vercel.json` already contains the following security headers (verified post-audit):
- `X-Frame-Options: DENY` ✅
- `Referrer-Policy: strict-origin-when-cross-origin` ✅
- `X-Content-Type-Options: nosniff` ✅
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` ✅
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` ✅
- `Cross-Origin-Opener-Policy: same-origin` ✅
- `Cross-Origin-Resource-Policy: same-site` ✅

**Status:** No changes needed. All recommended headers present.

---

### 4. Unsanitized innerHTML (MEDIUM)

**Finding:** `js/ui.js` contains several `innerHTML` assignments that are not sanitized with DOMPurify:
- Line 52: Unsaved banner dynamic HTML
- Line 366: Diagnostics update with provider/model info

**Fix Applied:** Added DOMPurify sanitization to both locations.

**Files Changed:**
- `js/ui.js` — wrapped innerHTML assignments with `DOMPurify.sanitize()`

---

### 5. API Key Validation (VERIFIED)

**Finding:** `js/utils.js` already contains `isValidApiKey()` function (lines 42-47) that validates:
- OpenRouter/OpenAI keys: `sk-xxx` or `sk-ant-xxx` (20+ chars)
- Hugging Face keys: `hf_xxx` (10+ chars)

**Status:** Already implemented and used in `app.js:authenticate()` (line 159). No changes needed.

---

### 6. Rate Limiting (VERIFIED)

**Finding:** Token bucket rate limiting already implemented in `js/state.js`:
- `canMakeRequest()` — checks if request allowed
- `recordRequest()` — records request timestamp
- `getRemainingRequests()` — returns remaining requests in current window
- Default limit: 20 requests/minute

**Status:** Already implemented and used in `app.js:sendMessage()` (lines 455-462). No changes needed.

---

### 7. API Key Storage (VERIFIED)

**Finding:** API keys are stored only in memory (`AppState._apiKey`, `AppState._hfToken`), never written to localStorage. This matches the README's privacy claim.

**Status:** Verified correct. Keys are cleared on idle timeout (30 min) and page reload.

---

### 8. Service Worker Security (VERIFIED)

**Finding:** `sw.js` correctly:
- Never caches API calls to providers (openrouter.ai, huggingface.co)
- Always serves network requests for provider endpoints
- Only caches local app shell assets

**Status:** Verified correct. No changes needed.

---

## Summary of Changes Made

| File | Change |
|------|--------|
| `index.html` | Removed Google Analytics gtag.js and Vercel Speed Insights scripts |
| `js/ui.js` | Added DOMPurify sanitization to innerHTML assignments |

---

## Remaining Considerations

1. **CSP `'unsafe-inline'`**: Consider migrating to nonce-based or hash-based CSP in a future release.
2. **Encrypted History**: Not yet implemented (Phase 1).
3. **File Attachments**: Basic support exists but drag-and-drop enhancement pending (Phase 2).

---

## Trust Verification Checklist

- [x] No undisclosed analytics
- [x] Security headers present
- [x] API keys never stored in localStorage
- [x] Rate limiting enforced
- [x] XSS protection via DOMPurify
- [x] CSP enforced
- [x] Service worker isolation correct

---

*End of Audit*