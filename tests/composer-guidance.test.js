import { afterEach, describe, expect, it, vi } from 'vitest';
import { installComposerGuidance } from '../js/composer-guidance.js';

const ASSISTANT = 'A'.repeat(40); // 10 tokens
const REVIEWER = 'R'.repeat(80); // 20 tokens

const $ = (id) => document.getElementById(id);
const badgeText = () => $('composerPersonaBadge').textContent.replace(/\s+/g, ' ').trim();
const pillText = () => $('contextPill').textContent;
const actionLabels = () => Array.from(document.querySelectorAll('#quickActions .quick-action')).map((b) => b.textContent);
const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

// The persona prompt is 10 tokens, so a draft of (n - 10) tokens makes the estimate n.
const typeTokens = (n) => typeDraft('x'.repeat((n - 10) * 4));
function typeDraft(text) {
  const input = $('userInput');
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

let guidance = null;

function setup({ limit = 1000, history = [], prompt = ASSISTANT, empty = false } = {}) {
  document.body.innerHTML = empty ? '' : `
    <div id="quickActions" hidden></div>
    <div class="composer-box">
      <textarea id="userInput"></textarea>
      <span id="composerPersonaBadge"></span>
      <span id="contextPill"></span>
      <button id="stopBtn" type="button"></button>
      <button id="sendBtn" type="button"></button>
    </div>
    <button class="persona-card" data-prompt="${ASSISTANT}"><span class="persona-icon">🤖</span><span class="persona-info"><strong>Assistant</strong></span></button>
    <button class="persona-card" data-prompt="${REVIEWER}"><span class="persona-icon">🔍</span><span class="persona-info"><strong>Code Reviewer</strong></span></button>`;
  const state = {
    chatHistory: history.slice(),
    currentPersonaPrompt: prompt,
    isTyping: false,
    getContextLimit: () => limit,
    addMessage(role, content) { this.chatHistory.push({ role, content }); return true; },
    clearChat() { this.chatHistory = []; },
  };
  const ui = {
    announce: vi.fn(),
    setPersonaLabel: vi.fn(),
    updateContextBar: vi.fn(),
    updateModelLabel: vi.fn(),
    setSendButtonState: vi.fn(),
    clearChat: vi.fn(),
    showTyping: vi.fn(),
    removeTyping: vi.fn(),
  };
  guidance = installComposerGuidance(ui, document, state);
  return { state, ui };
}

afterEach(() => {
  if (guidance) guidance.dispose();
  guidance = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('persona badge', () => {
  it('shows the active persona icon and label at startup', () => {
    setup();
    expect(badgeText()).toBe('🤖 Assistant');
    expect($('composerPersonaBadge').title).toBe('Active persona: Assistant');
  });

  it('follows a click on a persona card', () => {
    setup();
    document.querySelectorAll('.persona-card')[1].click();
    expect(badgeText()).toBe('🔍 Code Reviewer');
  });

  it('follows UI.setPersonaLabel by name', () => {
    const { ui } = setup();
    ui.setPersonaLabel('Code Reviewer');
    expect(badgeText()).toBe('🔍 Code Reviewer');
  });

  it('matches a restored persona prompt at startup', () => {
    setup({ prompt: REVIEWER });
    expect(badgeText()).toBe('🔍 Code Reviewer');
  });

  it('shows Custom when no persona card matches the prompt', () => {
    setup({ prompt: 'Answer only in haiku.' });
    expect(badgeText()).toBe('✏️ Custom');
  });
});

describe('context pill', () => {
  it('counts the persona prompt at startup', () => {
    setup();
    expect(pillText()).toBe('~10 / 1k tokens');
    expect($('contextPill').dataset.level).toBe('ok');
  });

  it('adds history and the unsent draft', () => {
    setup({ history: [{ role: 'user', content: 'a'.repeat(400) }] });
    expect(pillText()).toBe('~110 / 1k tokens');
    typeDraft('b'.repeat(200));
    expect(pillText()).toBe('~160 / 1k tokens');
    expect($('contextPill').title).toContain('16%');
  });

  it('grows when a message is added and resets when the chat is cleared', () => {
    const { state } = setup();
    state.addMessage('user', 'a'.repeat(400));
    expect(pillText()).toBe('~110 / 1k tokens');
    state.clearChat();
    expect(pillText()).toBe('~10 / 1k tokens');
  });

  it('uses the selected model\'s context window', () => {
    const { state, ui } = setup();
    state.getContextLimit = () => 2000;
    ui.updateModelLabel('Another model');
    expect(pillText()).toBe('~10 / 2k tokens');
  });

  it('survives missing elements', () => {
    const { state } = setup({ empty: true });
    expect(() => state.addMessage('user', 'hi')).not.toThrow();
  });

  it('installs once per UI object', () => {
    const { ui } = setup();
    expect(installComposerGuidance(ui, document, {})).toBeNull();
  });
});

describe('window warning classes on #userInput', () => {
  const state = () => ({
    warning: $('userInput').classList.contains('context-warning'),
    critical: $('userInput').classList.contains('context-critical'),
  });

  it('has neither class below 70%', () => {
    setup();
    typeTokens(690);
    expect(state()).toEqual({ warning: false, critical: false });
  });

  it('turns on context-warning at exactly 70%', () => {
    setup();
    typeTokens(700);
    expect(state()).toEqual({ warning: true, critical: false });
    expect($('contextPill').dataset.level).toBe('warning');
  });

  it('keeps context-warning at exactly 90%', () => {
    setup();
    typeTokens(900);
    expect(state()).toEqual({ warning: true, critical: false });
  });

  it('switches to context-critical above 90%', () => {
    setup();
    typeTokens(901);
    expect(state()).toEqual({ warning: false, critical: true });
    expect($('contextPill').dataset.level).toBe('critical');
  });

  it('clears the class again when the draft shrinks', () => {
    setup();
    typeTokens(950);
    typeDraft('');
    expect(state()).toEqual({ warning: false, critical: false });
  });

  it('counts history toward the window, not just the draft', () => {
    setup({ history: [{ role: 'user', content: 'a'.repeat(2800) }] });
    expect(state()).toEqual({ warning: true, critical: false });
  });

  it('announces only when the level rises', () => {
    const { ui } = setup();
    expect(ui.announce).not.toHaveBeenCalled();
    typeTokens(700);
    expect(ui.announce).toHaveBeenCalledTimes(1);
    expect(ui.announce.mock.calls[0][0]).toMatch(/70%/);
    typeTokens(710);
    expect(ui.announce).toHaveBeenCalledTimes(1);
    typeTokens(901);
    expect(ui.announce).toHaveBeenCalledTimes(2);
    expect(ui.announce.mock.calls[1][0]).toMatch(/nearly full/);
    typeDraft('');
    expect(ui.announce).toHaveBeenCalledTimes(2);
  });
});

describe('quick actions', () => {
  it('shows 3 persona starters in an empty chat', () => {
    setup();
    expect($('quickActions').hidden).toBe(false);
    expect(actionLabels()).toEqual(['Explain simply', 'Summarize', 'Brainstorm']);
  });

  it('follows the persona', () => {
    setup();
    document.querySelectorAll('.persona-card')[1].click();
    expect(actionLabels()).toEqual(['Review my code', 'Find bugs', 'Suggest tests']);
  });

  it('offers Refactor, Add Tests and Explain after a reply with code', () => {
    const { state } = setup();
    state.addMessage('user', 'write it');
    state.addMessage('assistant', 'Here:\n```js\nconst a = 1;\n```');
    expect(actionLabels()).toEqual(['Refactor', 'Add Tests', 'Explain']);
  });

  it('offers follow-ups after a plain reply', () => {
    const { state } = setup();
    state.addMessage('assistant', 'A plain answer.');
    expect(actionLabels()).toEqual(['Explain more', 'Summarize', 'Shorter']);
  });

  it('goes back to starters when the chat is cleared', () => {
    const { state } = setup();
    state.addMessage('assistant', 'A plain answer.');
    state.clearChat();
    expect(actionLabels()).toEqual(['Explain simply', 'Summarize', 'Brainstorm']);
  });

  it('hides while a reply is streaming and returns afterwards', () => {
    const { state, ui } = setup();
    state.isTyping = true;
    ui.setSendButtonState(false);
    expect($('quickActions').hidden).toBe(true);
    state.isTyping = false;
    ui.setSendButtonState(true);
    expect($('quickActions').hidden).toBe(false);
  });

  it('puts the prompt into the message box and focuses it, without sending', () => {
    const { state } = setup();
    state.addMessage('assistant', '```js\nx\n```');
    const sent = vi.fn();
    $('sendBtn').addEventListener('click', sent);
    const refactor = document.querySelector('#quickActions .quick-action');
    expect(refactor.textContent).toBe('Refactor');
    refactor.click();
    expect($('userInput').value).toMatch(/^Refactor the code above/);
    expect(document.activeElement).toBe($('userInput'));
    expect(sent).not.toHaveBeenCalled();
    expect(state.chatHistory).toHaveLength(1);
  });

  it('keeps what the user already typed', () => {
    setup();
    typeDraft('my notes');
    document.querySelector('#quickActions .quick-action').click();
    expect($('userInput').value).toBe('my notes\n\nExplain this in simple terms: ');
  });

  it('fires the input event so the pill counts the new text', () => {
    setup();
    const before = pillText();
    document.querySelectorAll('#quickActions .quick-action')[1].click();
    expect(pillText()).not.toBe(before);
  });
});
