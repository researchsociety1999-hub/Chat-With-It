/**
 * Trust and recovery layer for the composer and the message log. Like local-bridge.js and
 * model-gate.js it extends the app's real UI object without editing ui.js or app.js.
 *
 *  - Data source tag: keeps #dataSourceTag ("OpenRouter · Remote API", "Local WASM · On-Device", ...)
 *    in step with the selected provider: at startup, on a provider tab click, and whenever the app
 *    refreshes the auth state, the model label or the welcome hint (which model selection triggers).
 *  - Narrative error cards: model-gate.js reports each failed send through noteSendError(). When
 *    app.js then shows its error (UI.showSendError, or an error/warning toast), a card with plain
 *    words and recovery buttons is drawn in #chatBody instead, if the failure is one we can explain
 *    (see providers/error-narrative.mjs). Everything else, and user Stop, keeps its existing UI.
 *    Cards are removed when the next send starts, so streaming reset and retry are unchanged.
 *
 * Every step is defensive: a missing element or method means that piece does nothing.
 */

import * as uiModule from './ui.js';
import { AppState } from './state.js';
import { dataSourceInfo } from './providers/data-source.mjs';
import { describeSendError } from './providers/error-narrative.mjs';

// A reported failure only turns the next error toast / error panel into a card for this long.
const FRESH_MS = 5000;
// app.js shows this warning toast when Send is pressed without a key.
const AUTH_TOAST = 'Please authenticate first';

const state = { pending: null, card: null };

/** Called by gatedStream for every failed attempt. User cancellation is never recorded. */
export function noteSendError(err, provider) {
  state.pending = err && err.code !== 'ABORTED' ? { err, provider, at: Date.now(), handled: false } : null;
}

/** Called after a successful send, so an earlier failure cannot turn a later toast into a card. */
export function clearSendError() {
  state.pending = null;
}

export function __resetTrustForTests() {
  state.pending = null;
  state.card = null;
}

/** Write the data source tag for a provider id. Returns the element, or null when it is missing. */
export function renderDataSourceTag(provider = AppState.currentProvider, doc = document) {
  const tag = doc.getElementById('dataSourceTag');
  if (!tag) return null;
  const info = dataSourceInfo(provider);
  tag.textContent = info.label;
  tag.dataset.kind = info.kind;
  tag.title = info.title;
  return tag;
}

function node(doc, tag, className, text) {
  const n = doc.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function removeErrorCards(doc = document) {
  doc.querySelectorAll('.error-card').forEach((card) => card.remove());
  state.card = null;
}

function openSidebar(ui, doc) {
  const sidebar = doc.getElementById('sidebar');
  if (!sidebar || typeof ui.toggleSidebar !== 'function') return;
  const mobile = typeof ui._isMobile === 'function' && ui._isMobile();
  if (mobile) {
    if (!sidebar.classList.contains('open')) ui.toggleSidebar();
  } else if (doc.body.classList.contains('sidebar-collapsed')) {
    ui.toggleSidebar();
  }
}

function selectProvider(id, doc) {
  if (AppState.currentProvider === id) return;
  const tab = doc.querySelector(`.ptab[data-provider="${id}"]`);
  if (tab) tab.click();
}

// Used only when a card has no retry callback from app.js (a toast-only failure path).
async function fallbackRetry() {
  try {
    const mod = await import('./app.js');
    if (mod.App && typeof mod.App._retryLastMessage === 'function') mod.App._retryLastMessage();
  } catch (_) { /* nothing to retry with */ }
}

function runAction(id, card, ui, doc) {
  if (id === 'retry') {
    const handler = card._onRetry;
    removeErrorCards(doc);
    if (handler) handler(); else fallbackRetry();
    return;
  }
  removeErrorCards(doc);
  if (id === 'switch-local') {
    selectProvider('local', doc);
    openSidebar(ui, doc);
    setTimeout(() => { const pick = doc.getElementById('localPickBtn'); if (pick && pick.focus) pick.focus(); }, 80);
  } else if (id === 'manage-models') {
    selectProvider('local', doc);
    openSidebar(ui, doc);
    setTimeout(() => {
      const panel = doc.getElementById('localModelsPanel') || doc.getElementById('localPanel');
      if (!panel) return;
      if (panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest' });
      const first = panel.querySelector('button:not([disabled])');
      if (first && first.focus) first.focus();
    }, 80);
  } else if (id === 'open-key-settings') {
    if (AppState.currentProvider === 'local') selectProvider('openrouter', doc);
    openSidebar(ui, doc);
    setTimeout(() => { const input = doc.getElementById('apiKeyInput'); if (input && input.focus) input.focus(); }, 80);
  }
}

/**
 * Draw one narrative card at the end of #chatBody (replacing any earlier one).
 * @param {{kind: string, title: string, message: string, actions: {id: string, label: string}[]}} narrative
 * @returns {HTMLElement|null} the card, or null when there is no message log
 */
export function renderErrorCard(narrative, { onRetry = null, ui = uiModule.UI, doc = document } = {}) {
  const body = doc.getElementById('chatBody');
  if (!body || !narrative) return null;
  removeErrorCards(doc);

  const card = node(doc, 'div', 'error-card');
  card.setAttribute('role', 'alert');
  card.dataset.kind = narrative.kind;
  card._onRetry = onRetry;

  const text = node(doc, 'div', 'error-card-body');
  text.append(node(doc, 'strong', 'error-card-title', narrative.title), node(doc, 'p', 'error-card-message', narrative.message));

  const actions = node(doc, 'div', 'error-card-actions');
  for (const action of narrative.actions) {
    const button = node(doc, 'button', `btn btn-sm${action.id === 'retry' ? ' btn-primary' : ''}`, action.label);
    button.type = 'button';
    button.dataset.action = action.id;
    button.addEventListener('click', () => runAction(action.id, card, ui, doc));
    actions.append(button);
  }

  card.append(text, actions);
  body.append(card);
  state.card = card;
  if (ui && typeof ui._scrollToBottom === 'function') ui._scrollToBottom();
  return card;
}

function freshFailure() {
  const p = state.pending;
  return p && Date.now() - p.at < FRESH_MS ? p : null;
}

function wrap(ui, name, make) {
  if (typeof ui[name] !== 'function') return;
  const base = ui[name].bind(ui);
  ui[name] = make(base);
}

/** Install the tag sync and the error-card interception on a UI object. Safe to call twice. */
export function installTrustUi(uiArg, docArg) {
  try {
    const ui = uiArg === undefined ? uiModule.UI : uiArg;
    const doc = docArg === undefined ? (typeof document === 'undefined' ? null : document) : docArg;
    if (!ui || !doc || ui.__trustUi) return false;
    ui.__trustUi = true;
    const sync = () => renderDataSourceTag(AppState.currentProvider, doc);

    ui.updateDataSourceTag = sync;
    for (const name of ['updateWelcomeHint', 'updateModelLabel']) {
      wrap(ui, name, (base) => (...args) => { const out = base(...args); sync(); return out; });
    }
    wrap(ui, 'setAuthState', (base) => (ok, ...rest) => {
      const out = base(ok, ...rest);
      sync();
      if (ok) doc.querySelectorAll('.error-card[data-kind="auth"]').forEach((card) => card.remove());
      return out;
    });

    // A new send starts here: the old card goes and so does the old failure.
    wrap(ui, 'showTyping', (base) => (...args) => {
      removeErrorCards(doc);
      state.pending = null;
      return base(...args);
    });

    wrap(ui, 'toast', (base) => (message, type, ...rest) => {
      if (type === 'warning' && message === AUTH_TOAST) {
        const narrative = describeSendError({ code: 'AUTH' }, { provider: AppState.currentProvider });
        if (renderErrorCard(narrative, { ui, doc })) return undefined;
      }
      const failure = type === 'error' || type === 'warning' ? freshFailure() : null;
      const narrative = failure && describeSendError(failure.err, { provider: failure.provider });
      if (narrative) {
        if (failure.handled) return undefined;
        failure.handled = true;
        if (renderErrorCard(narrative, { ui, doc })) return undefined;
      }
      return base(message, type, ...rest);
    });

    wrap(ui, 'showSendError', (base) => (options = {}) => {
      const failure = freshFailure();
      const narrative = failure && describeSendError(failure.err, { provider: failure.provider });
      if (narrative) {
        if (failure.handled && state.card && state.card.isConnected) {
          if (options.onRetry) state.card._onRetry = options.onRetry;
          return undefined;
        }
        failure.handled = true;
        if (renderErrorCard(narrative, { onRetry: options.onRetry || null, ui, doc })) return undefined;
      }
      return base(options);
    });

    doc.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('.ptab')) sync();
    });
    if (typeof window !== 'undefined') window.addEventListener('load', sync);
    sync();
    return true;
  } catch (_) {
    return false;
  }
}

installTrustUi();
