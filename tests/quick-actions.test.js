import { describe, expect, it } from 'vitest';
import { pickQuickActions, personaKey, hasCodeBlock } from '../js/providers/quick-actions.mjs';

const labels = (actions) => actions.map((a) => a.label);

describe('pickQuickActions', () => {
  it('offers Refactor, Add Tests and Explain after a reply with code', () => {
    const actions = pickQuickActions({ persona: 'Assistant', lastAssistant: 'Here:\n```js\nconst a = 1;\n```', hasHistory: true });
    expect(labels(actions)).toEqual(['Refactor', 'Add Tests', 'Explain']);
  });

  it('uses the code actions for any persona', () => {
    for (const persona of ['Assistant', 'Tutor', 'Creative Writer', 'Code Reviewer', 'Debate Coach', 'Custom']) {
      expect(labels(pickQuickActions({ persona, lastAssistant: '```x```', hasHistory: true }))).toEqual(['Refactor', 'Add Tests', 'Explain']);
    }
  });

  it('offers follow-ups after a reply without code', () => {
    const actions = pickQuickActions({ persona: 'Tutor', lastAssistant: 'Plain answer.', hasHistory: true });
    expect(labels(actions)).toEqual(['Explain more', 'Summarize', 'Shorter']);
  });

  it('offers persona starters in an empty chat', () => {
    expect(labels(pickQuickActions({ persona: 'Assistant' }))).toEqual(['Explain simply', 'Summarize', 'Brainstorm']);
    expect(labels(pickQuickActions({ persona: 'Tutor' }))).toEqual(['Teach me', 'Quiz me', 'Check my answer']);
    expect(labels(pickQuickActions({ persona: 'Creative Writer' }))).toEqual(['Story ideas', 'Change tone', 'Write dialogue']);
    expect(labels(pickQuickActions({ persona: 'Code Reviewer' }))).toEqual(['Review my code', 'Find bugs', 'Suggest tests']);
    expect(labels(pickQuickActions({ persona: 'Debate Coach' }))).toEqual(['Steelman', 'Counterarguments', 'Draft rebuttal']);
  });

  it('falls back to the assistant starters for a custom or unknown persona', () => {
    expect(labels(pickQuickActions({ persona: 'Custom' }))).toEqual(['Explain simply', 'Summarize', 'Brainstorm']);
    expect(labels(pickQuickActions({}))).toEqual(['Explain simply', 'Summarize', 'Brainstorm']);
  });

  it('always returns exactly 3 actions with a unique id, a label and a prompt', () => {
    for (const persona of ['', 'Assistant', 'Tutor', 'Creative Writer', 'Code Reviewer', 'Debate Coach', 'zzz']) {
      for (const lastAssistant of ['', 'text', '```code```']) {
        for (const hasHistory of [false, true]) {
          const actions = pickQuickActions({ persona, lastAssistant, hasHistory });
          expect(actions).toHaveLength(3);
          expect(new Set(actions.map((a) => a.id)).size).toBe(3);
          for (const a of actions) {
            expect(a.label.length).toBeGreaterThan(0);
            expect(a.prompt.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('returns copies, so callers cannot change the defaults', () => {
    const first = pickQuickActions({ persona: 'Assistant' });
    first[0].label = 'Changed';
    expect(pickQuickActions({ persona: 'Assistant' })[0].label).toBe('Explain simply');
  });
});

describe('personaKey', () => {
  it('maps persona labels case-insensitively', () => {
    expect(personaKey('TUTOR')).toBe('tutor');
    expect(personaKey('Creative Writer')).toBe('writer');
    expect(personaKey('code reviewer')).toBe('reviewer');
    expect(personaKey('Debate Coach')).toBe('debate');
    expect(personaKey('Assistant')).toBe('assistant');
    expect(personaKey(undefined)).toBe('assistant');
  });
});

describe('hasCodeBlock', () => {
  it('detects a fenced block', () => {
    expect(hasCodeBlock('```js\nx\n```')).toBe(true);
    expect(hasCodeBlock('inline `x` only')).toBe(false);
    expect(hasCodeBlock(null)).toBe(false);
  });
});
