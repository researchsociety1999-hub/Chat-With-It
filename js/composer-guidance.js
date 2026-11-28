/**
 * Composer guidance: persona badge, context pill, window warnings and quick actions. Like
 * trust-ui.js it extends the app's real UI and AppState objects without editing ui.js or app.js.
 *
 *  - #composerPersonaBadge shows the active persona (icon + label). It follows a click on a persona
 *    card, UI.setPersonaLabel and the stored persona prompt at startup.
 *  - #contextPill shows the estimated size of the conversation against the model's context window
 *    (persona prompt + history + the unsent draft, characters / 4), e.g. "~1.2k / 8.2k tokens".
 *  - #userInput gets .context-warning (70-90%) or .context-critical (over 90%). css/trust.css draws
 *    the glow on the composer box, which owns the visible border.
 *  - #quickActions shows 3 actions chosen from the persona and the last reply. A click puts the
 *    prompt into #userInput and focuses it. It never sends.
 *
 * Every step is defensive: a missing element or method means that piece does nothing.
 */

import * as uiModule from './ui.js';
import { AppState } from './state.js';
import { estimateContext, formatContextPill } from './providers/context-estimate.mjs';
import { pickQuickActions } from './providers/quick-actions.mjs';

const RANK = { ok: 0, warning: 1, critical: 2 };
const CUSTOM_PERSONA = { icon: '✏️', label: 'Custom' };

function make(doc, tag, className, text) {
  const n = doc.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Icon and name of a .persona-card button. */
export function personaFromCard(card) {
  const icon = card.querySelector('.persona-icon');
  const name = card.querySelector('strong');
  return {
    icon: (icon && icon.textContent.trim()) || '🤖',
    label: (name && name.textContent.trim()) || 'Persona',
  };
}

/** The persona card matching a label or, failing that, a prompt; "Custom" when none does; null without cards. */
export function findPersona(doc, { label = '', prompt = '' } = {}) {
  const cards = Array.from(doc.querySelectorAll('.persona-card'));
  if (!cards.length) return null;
  const byLabel = label ? cards.find((card) => personaFromCard(card).label === label) : null;
  const byPrompt = prompt ? cards.find((card) => card.dataset.prompt === prompt) : null;
  const card = byLabel || byPrompt;
  return card ? personaFromCard(card) : CUSTOM_PERSONA;
}

/** Install the composer guidance on a UI object. Returns a controller, or null when already installed. */
export function installComposerGuidance(uiArg, docArg, stateArg) {
  try {
    const ui = uiArg === undefined ? uiModule.UI : uiArg;
    const doc = docArg === undefined ? (typeof document === 'undefined' ? null : document) : docArg;
    const state = stateArg === undefined ? AppState : stateArg;
    if (!ui || !doc || !state || ui.__composerGuidance) return null;
    ui.__composerGuidance = true;

    const $ = (id) => doc.getElementById(id);
    let persona = null;
    let level = null;
    let signature = '';

    const safe = (fn) => (...args) => { try { return fn(...args); } catch (_) { return undefined; } };

    const renderPersona = safe((next) => {
      persona = next === undefined ? findPersona(doc, { prompt: state.currentPersonaPrompt }) : next;
      const badge = $('composerPersonaBadge');
      if (!badge || !persona) return;
      badge.replaceChildren(
        make(doc, 'span', 'persona-badge-icon', persona.icon),
        doc.createTextNode(' '),
        make(doc, 'span', 'persona-badge-label', persona.label),
      );
      badge.title = `Active persona: ${persona.label}`;
    });

    const renderContext = safe(() => {
      const input = $('userInput');
      const est = estimateContext({
        persona: state.currentPersonaPrompt,
        history: state.chatHistory,
        draft: input ? input.value : '',
        limit: typeof state.getContextLimit === 'function' ? state.getContextLimit() : undefined,
      });
      const pill = $('contextPill');
      if (pill) {
        pill.textContent = formatContextPill(est);
        pill.dataset.level = est.level;
        pill.title = `About ${est.percent}% of this model's context window (estimated at 4 characters per token).`;
      }
      if (input) {
        input.classList.toggle('context-warning', est.level === 'warning');
        input.classList.toggle('context-critical', est.level === 'critical');
      }
      if (level !== null && RANK[est.level] > RANK[level] && typeof ui.announce === 'function') {
        ui.announce(est.level === 'critical'
          ? `Context nearly full, ${est.percent}%. Older messages may be dropped.`
          : `Context about ${est.percent}% full.`);
      }
      level = est.level;
    });

    const busy = () => {
      const stop = $('stopBtn');
      return Boolean(state.isTyping || (stop && stop.classList.contains('streaming-visible')));
    };

    const fill = safe((text) => {
      const input = $('userInput');
      if (!input) return;
      const current = input.value || '';
      input.value = current.trim() ? `${current.replace(/\s+$/, '')}\n\n${text}` : text;
      const EventCtor = (doc.defaultView && doc.defaultView.Event) || Event;
      input.dispatchEvent(new EventCtor('input', { bubbles: true }));
      input.focus();
      if (typeof input.setSelectionRange === 'function') input.setSelectionRange(input.value.length, input.value.length);
    });

    const renderQuickActions = safe(() => {
      const box = $('quickActions');
      if (!box) return;
      if (busy()) { box.hidden = true; return; }
      const history = Array.isArray(state.chatHistory) ? state.chatHistory : [];
      const lastReply = [...history].reverse().find((m) => m && m.role === 'assistant');
      const actions = pickQuickActions({
        persona: persona ? persona.label : '',
        lastAssistant: lastReply ? lastReply.content : '',
        hasHistory: history.length > 0,
      });
      const next = actions.map((a) => a.id).join('|');
      if (next !== signature || !box.childElementCount) {
        signature = next;
        box.replaceChildren(...actions.map((action) => {
          const button = make(doc, 'button', 'quick-action', action.label);
          button.type = 'button';
          button.dataset.actionId = action.id;
          button.title = action.prompt.trim();
          button.addEventListener('click', () => fill(action.prompt));
          return button;
        }));
      }
      box.hidden = false;
    });

    const refresh = () => { renderContext(); renderQuickActions(); };

    const after = (obj, name, hook) => {
      if (!obj || typeof obj[name] !== 'function') return;
      const base = obj[name].bind(obj);
      obj[name] = (...args) => {
        const out = base(...args);
        safe(hook)(...args);
        return out;
      };
    };

    after(ui, 'setPersonaLabel', (name) => {
      renderPersona(name ? findPersona(doc, { label: name, prompt: state.currentPersonaPrompt }) : undefined);
      refresh();
    });
    for (const name of ['updateContextBar', 'updateModelLabel', 'clearChat', 'setSendButtonState', 'showTyping', 'removeTyping']) {
      after(ui, name, refresh);
    }
    for (const name of ['addMessage', 'clearChat', 'reset']) after(state, name, refresh);

    const onInput = (event) => { if (event.target && event.target.id === 'userInput') renderContext(); };
    const onClick = (event) => {
      const card = event.target && event.target.closest ? event.target.closest('.persona-card') : null;
      if (!card) return;
      renderPersona(personaFromCard(card));
      refresh();
      // app.js stores the new persona prompt around the same click; count it once it has.
      setTimeout(refresh, 0);
    };
    const onTrimmed = () => renderContext();
    const onLoad = () => { renderPersona(); refresh(); };
    const win = doc.defaultView || (typeof window === 'undefined' ? null : window);

    doc.addEventListener('input', onInput);
    doc.addEventListener('click', onClick);
    doc.addEventListener('cwi:context-trimmed', onTrimmed);
    if (win) win.addEventListener('load', onLoad);

    renderPersona();
    refresh();

    return {
      refresh,
      renderPersona,
      renderContext,
      renderQuickActions,
      dispose() {
        doc.removeEventListener('input', onInput);
        doc.removeEventListener('click', onClick);
        doc.removeEventListener('cwi:context-trimmed', onTrimmed);
        if (win) win.removeEventListener('load', onLoad);
      },
    };
  } catch (_) {
    return null;
  }
}

installComposerGuidance();
