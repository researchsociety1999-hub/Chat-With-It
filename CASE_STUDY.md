# Chat-With-It: Browser-Direct Multi-Model AI Chat

Live demo: https://chat-with-it.vercel.app  
Source code: https://github.com/researchsociety1999-hub/Chat-With-It  
Role: Solo builder — design, implementation, and deployment

## Overview

Chat-With-It is a static, framework-free Progressive Web App for interacting with models through OpenRouter or Hugging Face using user-supplied API credentials.

The application is designed around browser-direct provider requests rather than an application-operated intermediary backend. It combines model discovery, streaming chat, file attachments, local preferences, and conversation export in a single interface.

The project demonstrates front-end application architecture, third-party AI integration, and explicit trade-offs between user control, onboarding convenience, and browser-local data storage.

It is a multi-model chat application, not an autonomous agent-orchestration platform.

## The problem

An AI chat interface can introduce another application server between the user and the model provider. That adds an additional party to the request path and creates backend infrastructure to operate.

Chat-With-It explores a different approach:

- Let users choose a supported provider and supply their own credentials.
- Send provider requests directly from the browser.
- Keep application preferences and optional saved data in the browser.
- Avoid an application-operated backend for chat processing.

This approach removes an application-controlled intermediary, not every external dependency. The selected model provider still receives the requests sent to it, including the credentials and conversation content needed to process them.

## What I built

The application includes:

- OpenRouter and Hugging Face provider integration.
- Free-model discovery using model identifiers and pricing information.
- Streaming responses with a stop control.
- Five personas: Assistant, Tutor, Creative Writer, Code Reviewer, and Debate Coach.
- Text-file attachments, including `.txt`, `.md`, `.json`, `.csv`, and code files.
- Token and context-usage displays.
- Conversation export to Markdown, JSON, TXT, PDF, or clipboard.
- Local chat history with a documented seven-day expiration policy (currently always saved; there is no setting to turn it off).
- Named credential profiles for explicitly saving and switching provider keys.
- Six named themes, system-theme preference, high-contrast mode, reduced-motion support, and a mobile drawer.

Feature availability should be distinguished from measured reliability. This case study does not claim that every provider, model, or browser combination has been independently validated.

## Stack and architecture

| Layer | Implementation |
|---|---|
| Interface | Plain HTML, CSS, and vanilla JavaScript modules |
| Shared state | `AppState` in `js/state.js` |
| Provider requests | `js/api.js` |
| Application coordination | `js/app.js` |
| Credential profiles | `js/profiles.js` |
| Build | esbuild, producing `dist/app.js` |
| PWA support | Service worker and web-app manifest |
| Tests | Vitest |
| CI | GitHub Actions |
| Hosting | Vercel |

### Request flow

    User
      |
      v
    Browser application
      |
      | Provider request using the user's credential
      v
    OpenRouter or Hugging Face
      |
      | Model response
      v
    Browser chat interface

The application does not operate an intermediary backend for these provider requests. Hosting infrastructure serves the application assets; the selected provider handles model requests.

### Browser-local storage

    Browser application
      |
      +-- Application memory
      |     Active state and credentials during use
      |
      +-- localStorage
            Preferences
            Local chat history (always saved today)
            Explicitly saved credential profiles

Saved credential profiles are a separate persistence path from ordinary in-memory credential use.

## Model and API integration

Users select OpenRouter or Hugging Face and provide their own API key.

The application handles provider requests in the browser. This avoids an application-operated proxy but makes compatibility dependent on provider interfaces, browser access policies, model availability, and rate limits.

Temperature and maximum-token controls can be disabled. When disabled, those parameters are omitted so that provider defaults apply.

## Privacy and credential handling

The privacy model is based on a limited application data path and explicit browser-local storage choices—not a guarantee that credentials and conversations never leave the device.

### In-memory credentials

Outside the saved-profile feature, credentials are intended to remain in application memory.

Memory-only handling must not be confused with the behavior of explicitly saved profiles.

### Optional saved credential profiles

Users can choose “Save current key” to create a named provider profile.

The implementation in `js/profiles.js`:

- Saves profiles under the localStorage key `cwiProfiles`.
- Stores the provider and raw API token.
- Does not encrypt the saved token.
- Allows users to activate and delete profiles.
- Displays an explicit storage warning.

The interface states:

> Saving stores this key unencrypted in this browser until you delete the profile.

A page reload does not remove these saved profiles. The application must therefore not be described as storing all credentials exclusively in memory.

Saved profiles are a convenience feature with a persistent-credential trade-off, not a secure credential vault.

### Provider visibility

Direct browser requests still transmit information to the selected provider. “No application-operated intermediary backend” does not mean “no server sees the data.”

Users should evaluate their selected provider's data-handling policies separately.

### Local conversation history

The application saves chat history in the browser (localStorage) with a documented seven-day expiration policy. There is currently no setting to turn this off.

This is a convenience mechanism, not a claim of encrypted storage or independently verified secure erasure.

## Engineering trade-offs

| Decision | Benefit | Cost or limitation |
|---|---|---|
| No application-operated intermediary backend | Removes an additional application-server hop and backend operating burden | Provider dependencies remain; the architecture does not provide server-managed synchronization or centralized application analytics |
| User-supplied provider credentials | Users choose and manage their own provider access | Credential setup adds onboarding friction |
| In-memory credential use | Avoids persisting credentials through that path | Users need to supply credentials again when the in-memory session is lost |
| Optional saved credential profiles | Convenient reuse and switching | Raw credentials persist unencrypted in localStorage until the profiles are deleted |
| Vanilla JavaScript | Avoids a front-end framework dependency | Requires manual DOM and state coordination |
| Browser-direct provider integration | Avoids an application-operated proxy | Compatibility depends on provider APIs, browser policies, and rate limits |
| Local history (always saved today) | Offers continuity without an application database | History is browser-local and is not presented as encrypted or synchronized storage |

## Validation and audit boundaries

The repository includes tests, CI configuration, and an audit document. These provide implementation evidence, but their existence alone does not establish current test coverage, production reliability, or security assurance.

The earlier case study described audit findings involving:

- Analytics and performance-monitoring scripts.
- HTML sanitization.
- Content Security Policy configuration.

Those findings should be attributed to the audit artifact and checked against current source before being presented as resolved.

In particular:

- A source-code change does not prove the same change is deployed.
- A configured security header does not prove it is present on every live response.
- A test suite does not establish a pass rate without a recorded run.
- An audit document is not an independent security certification.

This case study does not claim an independent security assessment, comprehensive browser testing, or verified production security.

## Success metric

### Proposed north-star metric: activation rate

Activation rate is the share of measured sessions in which a user:

1. Adds or activates a provider credential.
2. Selects a model.
3. Sends at least one message.

The bring-your-own-key step is a central onboarding requirement. Activation would help determine whether users can successfully move from opening the application to making their first request.

The metric is proposed, not yet reported as instrumented.

### Measurement approach

A first validation step would be a small, consent-based usability study observing completion of the activation flow.

Record:

- Whether participants complete the flow.
- Where they encounter friction.
- Whether they understand which provider receives their data.
- Whether they understand the difference between temporary credential use and saved profiles.

Any later telemetry proposal should document its consent model and data collection before implementation.

### Current results

| Metric | Verified result |
|---|---|
| Activation rate | N/A |
| Active users | N/A |
| Retention | N/A |
| Usability-study completion rate | N/A |
| Measured productivity improvement | N/A |
| Production uptime | N/A |
| Current test pass rate | N/A |

No adoption, revenue, reliability, or productivity figures are claimed without supporting measurement.

## Deployment

The project is configured for Vercel hosting, with a build step producing the application bundle.

The repository documentation also describes GitHub Actions checks for production assets.

Deployment configuration and documented checks are not substitutes for current operational evidence. Live deployment parity, recent workflow outcomes, and production reliability should be verified separately.

## Honest limitations

- Users must obtain and manage credentials for a supported provider.
- Provider availability, model behavior, and rate limits are outside the application's control.
- Explicitly saved credential profiles contain unencrypted tokens in localStorage.
- Browser-local persistence does not provide cross-device synchronization.
- Local history is not presented as encrypted storage.
- Security findings require current source and deployment verification.
- Real-user adoption and business-impact metrics are unavailable.
- The project demonstrates a multi-model chat workflow, not autonomous task execution or multi-agent orchestration.

## Next milestones

### Documentation and validation

1. Keep credential-storage descriptions consistent across the README, case study, and interface.
2. Verify audit findings against current code and the live deployment.
3. Record a reproducible build and test result.
4. Add screenshots from the current application.
5. Run a consent-based activation usability study.
6. Publish observed results with the sample size, method, and limitations.

### Technical roadmap

The following are proposed improvements, not completed outcomes:

1. A provider abstraction for adding integrations.
2. Side-by-side model comparison.
3. Passphrase-based encryption for local conversation history.
4. Cost estimation where provider pricing is available.
5. Review of persistent credential handling and safer convenience options.

## Screenshots

To be added from the current application:

- Chat interface and model picker.
- File attachment workflow.
- Token and context-usage panel.
- Credential-profile storage warning.
- Exported Markdown example.

## Evidence and scope

Primary repository references:

- `CASE_STUDY.md` — existing project narrative.
- `js/profiles.js` — credential-profile persistence and user-facing storage warning.

The credential-storage correction in this revision is grounded in the retrieved implementation of `js/profiles.js`.

Other architectural and feature descriptions are carried forward from the repository case study. They should not be interpreted as a fresh, exhaustive code audit or live-deployment certification.

## Takeaway

Chat-With-It demonstrates a browser-direct approach to multi-model AI chat with explicit choices about provider access, local persistence, and front-end complexity.

Its strongest portfolio value is the combination of a usable application, understandable architecture, and clearly disclosed engineering trade-offs. Measured user outcomes remain the next evidence gap to close.
