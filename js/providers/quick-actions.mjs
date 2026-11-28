/**
 * Three context-sensitive quick actions for the composer. Pure: no DOM, no AppState.
 * Each action is { id, label, prompt }. js/composer-guidance.js puts the prompt into the message
 * box; it never sends it.
 */

const CODE_ACTIONS = [
  { id: 'refactor', label: 'Refactor', prompt: 'Refactor the code above for readability and maintainability. Explain what you changed.' },
  { id: 'add-tests', label: 'Add Tests', prompt: 'Write unit tests for the code above, including edge cases.' },
  { id: 'explain', label: 'Explain', prompt: 'Explain how the code above works, step by step.' },
];

const FOLLOW_UP_ACTIONS = [
  { id: 'explain-more', label: 'Explain more', prompt: 'Explain that in more detail, with an example.' },
  { id: 'summarize', label: 'Summarize', prompt: 'Summarize your last answer in 3 bullet points.' },
  { id: 'shorter', label: 'Shorter', prompt: 'Rewrite your last answer more concisely.' },
];

const STARTERS = {
  assistant: [
    { id: 'explain-simply', label: 'Explain simply', prompt: 'Explain this in simple terms: ' },
    { id: 'summarize-text', label: 'Summarize', prompt: 'Summarize the following in 3 bullet points:\n\n' },
    { id: 'brainstorm', label: 'Brainstorm', prompt: 'Brainstorm ideas for: ' },
  ],
  tutor: [
    { id: 'teach-me', label: 'Teach me', prompt: 'Teach me step by step: ' },
    { id: 'quiz-me', label: 'Quiz me', prompt: 'Quiz me with 5 questions about: ' },
    { id: 'check-answer', label: 'Check my answer', prompt: 'Check my answer and guide me if it is wrong:\n\n' },
  ],
  writer: [
    { id: 'story-ideas', label: 'Story ideas', prompt: 'Give me 5 story ideas about: ' },
    { id: 'change-tone', label: 'Change tone', prompt: 'Rewrite the following in a different tone:\n\n' },
    { id: 'write-dialogue', label: 'Write dialogue', prompt: 'Write a short dialogue between: ' },
  ],
  reviewer: [
    { id: 'review-code', label: 'Review my code', prompt: 'Review this code for bugs, edge cases and maintainability:\n\n' },
    { id: 'find-bugs', label: 'Find bugs', prompt: 'Find the bugs in this code:\n\n' },
    { id: 'suggest-tests', label: 'Suggest tests', prompt: 'Suggest tests for this code:\n\n' },
  ],
  debate: [
    { id: 'steelman', label: 'Steelman', prompt: 'Steelman the opposing view on: ' },
    { id: 'counterarguments', label: 'Counterarguments', prompt: 'Give the strongest counterarguments to: ' },
    { id: 'draft-rebuttal', label: 'Draft rebuttal', prompt: 'Draft a rebuttal to this argument:\n\n' },
  ],
};

/** Map a persona label ("Code Reviewer") to a starter set; unknown or custom personas use the assistant set. */
export function personaKey(label) {
  const name = String(label || '').toLowerCase();
  if (name.includes('tutor')) return 'tutor';
  if (name.includes('writer') || name.includes('creative')) return 'writer';
  if (name.includes('review')) return 'reviewer';
  if (name.includes('debate')) return 'debate';
  return 'assistant';
}

export function hasCodeBlock(text) {
  return typeof text === 'string' && text.includes('```');
}

const copy = (list) => list.map((action) => ({ ...action }));

/**
 * @param {{persona?: string, lastAssistant?: string, hasHistory?: boolean}} input
 * @returns {{id: string, label: string, prompt: string}[]} always 3 actions
 */
export function pickQuickActions({ persona = '', lastAssistant = '', hasHistory = false } = {}) {
  if (hasCodeBlock(lastAssistant)) return copy(CODE_ACTIONS);
  if (hasHistory) return copy(FOLLOW_UP_ACTIONS);
  return copy(STARTERS[personaKey(persona)]);
}
