# Security Policy

## Our Security Model

ChatWithIt is designed with privacy and security as core principles:

- **No backend** — there is no ChatWithIt server that receives your data
- **Keys in browser only** — API keys are stored in `localStorage` and sent directly to OpenRouter or Hugging Face
- **No telemetry** — zero analytics, tracking, or cookies
- **CSP enforced** — Content Security Policy headers are set in `vercel.json`
- **MIT licensed** — the entire codebase is auditable

---

## Supported Versions

| Version | Supported |
|---------|----------|
| Latest (`main`) | ✅ |
| Older forks | ❌ (please update) |

---

## Reporting a Vulnerability

Please **do not** report security vulnerabilities in public GitHub Issues.

Instead, use one of the following:

1. **GitHub Private Advisory** — [Report a vulnerability](https://github.com/researchsociety1999-hub/Chat-With-It/security/advisories/new) *(preferred)*
2. **Email** — contact the maintainer directly via the GitHub profile

Please include:
- A description of the vulnerability
- Steps to reproduce it
- Potential impact
- A suggested fix if you have one

You will receive a response within **72 hours**.

---

## Scope

In scope:
- XSS or injection vulnerabilities in the UI
- CSP bypass techniques
- API key leakage vectors
- Any mechanism that could expose user data to a third party

Out of scope:
- Issues with OpenRouter or Hugging Face's own security
- Self-hosted deployments where the user has modified the code
- Social engineering attacks
