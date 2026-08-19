import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppState } from '../js/state.js';

describe('application state behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    AppState.clearChat();
    AppState._apiKey = '';
    AppState._hfToken = '';
    AppState._modelCooldowns = {};
    AppState._requestBucket = [];
    AppState.temperature = 0.7;
    AppState.maxTokens = 1024;
    AppState.selectedModel = 'none';
    AppState.MAX_HISTORY = 200;
    AppState.requestLimitPerMinute = 20;
    vi.restoreAllMocks();
  });

  it('persists settings without persisting API credentials', () => {
    AppState.currentProvider = 'huggingface';
    AppState.temperature = 1.2;
    AppState.maxTokens = 2048;
    AppState.selectedModel = 'model-a';
    AppState._apiKey = 'sk-secret';
    AppState._hfToken = 'hf-secret';

    AppState.persistState();
    const saved = JSON.parse(localStorage.getItem('cwiState'));

    expect(saved).toMatchObject({ currentProvider: 'huggingface', temperature: 1.2, maxTokens: 2048, selectedModel: 'model-a' });
    expect(saved).not.toHaveProperty('apiKey');
    expect(saved).not.toHaveProperty('hfToken');
  });

  it('rejects invalid messages and caps history at MAX_HISTORY', () => {
    expect(AppState.addMessage('user', '')).toBe(false);
    expect(AppState.addMessage('user', 'first')).toBe(true);
    AppState.MAX_HISTORY = 2;
    AppState.addMessage('assistant', 'second');
    AppState.addMessage('user', 'third');

    expect(AppState.chatHistory.map(message => message.content)).toEqual(['second', 'third']);
    expect(AppState.sessionStats.messageCount).toBe(2);
    expect(AppState.sessionStats.turnCount).toBe(1);
  });

  it('enforces the request limit and reports remaining capacity', () => {
    AppState.requestLimitPerMinute = 2;
    AppState.recordRequest();
    AppState.recordRequest();

    expect(AppState.canMakeRequest().allowed).toBe(false);
    expect(AppState.getRemainingRequests()).toBe(0);
  });

  it('tracks model cooldowns and removes expired entries', () => {
    vi.useFakeTimers();
    AppState.setModelCooldown('model-a', 1000);

    expect(AppState.isModelOnCooldown('model-a')).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(AppState.isModelOnCooldown('model-a')).toBe(false);
    expect(AppState.modelCooldownSecondsLeft('model-a')).toBe(0);
    vi.useRealTimers();
  });

  it('clears chat data while preserving the session start time', () => {
    const startTime = Date.now() - 5000;
    AppState.sessionStats.startTime = startTime;
    AppState.addMessage('user', 'hello');
    AppState.updateTokens(10, 20);

    AppState.clearChat();

    expect(AppState.chatHistory).toEqual([]);
    expect(AppState.totalPromptTokens).toBe(0);
    expect(AppState.totalCompletionTokens).toBe(0);
    expect(AppState.sessionStats.startTime).toBe(startTime);
  });
});
