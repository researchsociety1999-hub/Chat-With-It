import 'dotenv/config';

const OPENROUTER_KEYS = [
  process.env.OPENROUTER_KEY_1,
  process.env.OPENROUTER_KEY_2,
  process.env.OPENROUTER_KEY_3,
].filter(Boolean);

const PRIMARY_MODEL = process.env.PRIMARY_MODEL;
const FALLBACK_MODEL = process.env.FALLBACK_MODEL;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:latest';

async function callOpenRouter(model, messages, key) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://chatwithit.app', // optional but recommended
      'X-Title': 'ChatWithIt',
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const error = new Error(`OpenRouter error ${res.status}: ${text}`);
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callOllama(messages) {
  const prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = await res.json();
  // Ollama returns { response, done, ... }
  return data.response || '';
}

export async function callChat(messages) {
  // Try OpenRouter keys with primary model
  for (const key of OPENROUTER_KEYS) {
    try {
      return await callOpenRouter(PRIMARY_MODEL, messages, key);
    } catch (err) {
      const status = err.status;
      // On 402/429/5xx, try next key
      if (status === 402 || status === 429 || (status >= 500 && status < 600)) {
        continue;
      }
      // Other errors: break and use Ollama
      break;
    }
  }

  // Try fallback model once (first key only)
  if (OPENROUTER_KEYS[0] && FALLBACK_MODEL) {
    try {
      return await callOpenRouter(FALLBACK_MODEL, messages, OPENROUTER_KEYS[0]);
    } catch (_) {
      // ignore, fallback to Ollama
    }
  }

  // Final fallback: Ollama
  return await callOllama(messages);
}