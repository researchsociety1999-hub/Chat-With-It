/**
 * API Handler
 * Manages all API requests with error handling, retry logic, and request cancellation.
 *
 * DATA FLOW & PRIVACY NOTE (shown in UI privacy panel):
 *  - Your API key is held ONLY in JavaScript memory (AppState) for this session.
 *  - It is NEVER written to localStorage, IndexedDB, cookies, or any server.
 *  - Every chat message travels directly from your browser to the provider
 *    (openrouter.ai or router.huggingface.co) over HTTPS/TLS 1.3.
 *  - This app has NO backend server — there is no middleman that logs, stores,
 *    or forwards your conversations.
 *  - Provider privacy: OpenRouter forwards requests to underlying model providers.
 *    Hugging Face Inference API routes to hosted model endpoints.
 *    Review each provider's privacy policy for their data-retention terms.
 */

import { AppState } from './state.js';

export const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    authKey: 'cwi_or_key',
    modelEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    authHeader: 'Authorization',
    extraHeaders: { 'HTTP-Referer': location.href, 'X-Title': 'ChatWithIt' },
    badgeClass: 'or',
    badgeLabel: 'OR',
  },
  huggingface: {
    name: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    authKey: 'cwi_hf_token',
    modelEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    authHeader: 'Authorization',
    extraHeaders: { 'HTTP-Referer': location.href, 'X-Title': 'ChatWithIt' },
    badgeClass: 'hf',
    badgeLabel: 'HF',
  }
};

/**
 * Parameter-size tier buckets.
 */
export const PARAM_TIERS = [
  { value: 'all',   label: 'All sizes' },
  { value: 'tiny',  label: '≤ 3B params',    test: t => ['1B','2B','3B'].includes(t) },
  { value: 'small', label: '7–8B params',    test: t => ['7B','8B'].includes(t) },
  { value: 'mid',   label: '13–30B params',  test: t => ['13B','14B','20B','22B','24B','30B','32B'].includes(t) },
  { value: 'large', label: '70B params',     test: t => ['70B','72B'].includes(t) },
  { value: 'giant', label: '≥ 105B params',  test: t => ['105B','123B','180B','236B','671B'].includes(t) },
];

/**
 * Detect free OpenRouter models by :free suffix or zero pricing.
 */
function isOpenRouterFreeModel(model) {
  if (!model?.id) return false;
  if (model.id.endsWith(':free')) return true;
  const prompt = Number(model.pricing?.prompt);
  const completion = Number(model.pricing?.completion);
  return Number.isFinite(prompt) &&
         Number.isFinite(completion) &&
         prompt === 0 &&
         completion === 0;
}

function isEmbeddingModel(model) {
  const modality = String(model?.architecture?.modality || '').toLowerCase();
  return model?.type === 'embedding' || modality.includes('embedding') || String(model?.id || '').toLowerCase().includes('embed');
}

/**
 * Comprehensive curated list of permanently-free models.
 * FIX Q: models with type:'embedding' are filtered out of the chat UI.
 */
export const CURATED_FREE = {
  openrouter: [
    // ── DeepSeek ────────────────────────────────────────────────────────────────
    { id:'deepseek/deepseek-r1:free',             name:'DeepSeek R1 (671B · Reasoning)',    ctx:65536,  paramTier:'671B' },
    { id:'deepseek/deepseek-r1-0528:free',        name:'DeepSeek R1 0528 (671B)',           ctx:65536,  paramTier:'671B' },
    { id:'deepseek/deepseek-chat-v3-0324:free',   name:'DeepSeek Chat v3 (671B · 64k)',     ctx:65536,  paramTier:'671B' },
    { id:'deepseek/deepseek-r1-distill-llama-70b:free',  name:'DeepSeek R1 Distill Llama 70B', ctx:65536, paramTier:'70B' },
    { id:'deepseek/deepseek-r1-distill-qwen-32b:free',   name:'DeepSeek R1 Distill Qwen 32B',  ctx:32768, paramTier:'32B' },
    { id:'deepseek/deepseek-r1-distill-qwen-14b:free',   name:'DeepSeek R1 Distill Qwen 14B',  ctx:65536, paramTier:'14B' },
    { id:'deepseek/deepseek-r1-distill-qwen-7b:free',    name:'DeepSeek R1 Distill Qwen 7B',   ctx:32768, paramTier:'7B'  },
    { id:'deepseek/deepseek-r1-distill-qwen-1.5b:free',  name:'DeepSeek R1 Distill Qwen 1.5B', ctx:32768, paramTier:'1B', uncensored:true },
    { id:'deepseek/deepseek-prover-v2:free',      name:'DeepSeek Prover V2 (671B · Math)',  ctx:65536,  paramTier:'671B' },
    // ── Meta Llama ──────────────────────────────────────────────────────────────
    { id:'meta-llama/llama-4-maverick:free',      name:'Llama 4 Maverick (1M ctx)',         ctx:1048576, paramTier:'?' },
    { id:'meta-llama/llama-4-scout:free',         name:'Llama 4 Scout (512k ctx)',           ctx:524288,  paramTier:'?' },
    { id:'meta-llama/llama-3.3-70b-instruct:free',name:'Llama 3.3 70B Instruct',            ctx:131072,  paramTier:'70B' },
    { id:'meta-llama/llama-3.1-70b-instruct:free',name:'Llama 3.1 70B Instruct',            ctx:131072,  paramTier:'70B' },
    { id:'meta-llama/llama-3.1-8b-instruct:free', name:'Llama 3.1 8B Instruct',             ctx:131072,  paramTier:'8B' },
    { id:'meta-llama/llama-3-70b-instruct:free',  name:'Llama 3 70B Instruct',              ctx:8192,    paramTier:'70B' },
    { id:'meta-llama/llama-3-8b-instruct:free',   name:'Llama 3 8B Instruct',               ctx:8192,    paramTier:'8B' },
    // ── Qwen ────────────────────────────────────────────────────────────────────
    { id:'qwen/qwen3-235b-a22b:free',             name:'Qwen3 235B A22B (MoE · 40k)',       ctx:40960,  paramTier:'236B' },
    { id:'qwen/qwen3-30b-a3b:free',               name:'Qwen3 30B A3B (MoE · 128k)',        ctx:131072, paramTier:'30B' },
    { id:'qwen/qwen3-14b:free',                   name:'Qwen3 14B (128k)',                   ctx:131072, paramTier:'14B' },
    { id:'qwen/qwen3-8b:free',                    name:'Qwen3 8B (128k)',                    ctx:131072, paramTier:'8B' },
    { id:'qwen/qwen3-4b:free',                    name:'Qwen3 4B (128k)',                    ctx:131072, paramTier:'3B' },
    { id:'qwen/qwen3-1.7b:free',                  name:'Qwen3 1.7B (128k)',                  ctx:131072, paramTier:'1B', uncensored:true },
    { id:'qwen/qwen3-0.6b:free',                  name:'Qwen3 0.6B (128k)',                  ctx:131072, paramTier:'1B', uncensored:true },
    { id:'qwen/qwen-2.5-72b-instruct:free',       name:'Qwen 2.5 72B Instruct',             ctx:131072, paramTier:'70B' },
    { id:'qwen/qwen-2.5-7b-instruct:free',        name:'Qwen 2.5 7B Instruct',              ctx:131072, paramTier:'7B' },
    { id:'qwen/qwen-2.5-coder-32b-instruct:free', name:'Qwen 2.5 Coder 32B Instruct',       ctx:32768,  paramTier:'32B' },
    { id:'qwen/qwen2-7b-instruct:free',           name:'Qwen2 7B Instruct',                 ctx:32768,  paramTier:'7B' },
    { id:'qwen/qwq-32b:free',                     name:'QwQ 32B (Reasoning)',                ctx:131072, paramTier:'32B' },
    // ── Google Gemma ────────────────────────────────────────────────────────────
    { id:'google/gemma-3-27b-it:free',            name:'Gemma 3 27B IT',                    ctx:131072, paramTier:'30B' },
    { id:'google/gemma-3-12b-it:free',            name:'Gemma 3 12B IT',                    ctx:131072, paramTier:'13B' },
    { id:'google/gemma-3-4b-it:free',             name:'Gemma 3 4B IT',                     ctx:131072, paramTier:'3B' },
    { id:'google/gemma-3-1b-it:free',             name:'Gemma 3 1B IT',                     ctx:32768,  paramTier:'1B', uncensored:true },
    { id:'google/gemma-2-9b-it:free',             name:'Gemma 2 9B IT',                     ctx:8192,   paramTier:'8B' },
    // ── Mistral ─────────────────────────────────────────────────────────────────
    { id:'mistralai/mistral-7b-instruct:free',    name:'Mistral 7B Instruct v0.3',          ctx:32768,  paramTier:'7B' },
    { id:'mistralai/devstral-small:free',         name:'Devstral Small (Code · 32k)',        ctx:32768,  paramTier:'22B' },
    { id:'mistralai/mistral-small-3.1-24b-instruct:free', name:'Mistral Small 3.1 24B',     ctx:131072, paramTier:'24B' },
    { id:'mistralai/mistral-nemo:free',           name:'Mistral NeMo 12B (128k)',            ctx:131072, paramTier:'13B' },
    // ── Microsoft Phi ───────────────────────────────────────────────────────────
    { id:'microsoft/phi-4-reasoning-plus:free',   name:'Phi-4 Reasoning Plus (14B)',         ctx:16384,  paramTier:'14B' },
    { id:'microsoft/phi-4-reasoning:free',        name:'Phi-4 Reasoning (14B)',              ctx:16384,  paramTier:'14B' },
    { id:'microsoft/phi-4-multimodal-instruct:free', name:'Phi-4 Multimodal 14B',           ctx:131072, paramTier:'14B' },
    { id:'microsoft/phi-4:free',                  name:'Phi-4 (14B)',                        ctx:16384,  paramTier:'14B' },
    { id:'microsoft/phi-3-medium-128k-instruct:free', name:'Phi-3 Medium 14B (128k)',        ctx:131072, paramTier:'14B' },
    { id:'microsoft/phi-3-mini-128k-instruct:free',   name:'Phi-3 Mini 3.8B (128k)',         ctx:131072, paramTier:'3B' },
    // ── Nous Research ───────────────────────────────────────────────────────────
    { id:'nousresearch/hermes-3-llama-3.1-70b:free',  name:'Hermes 3 Llama 3.1 70B',        ctx:131072, paramTier:'70B', uncensored:true },
    { id:'nousresearch/hermes-3-llama-3.1-405b:free', name:'Hermes 3 Llama 3.1 405B',       ctx:131072, paramTier:'?',   uncensored:true },
    { id:'nousresearch/hermes-2-pro-llama-3-8b:free', name:'Hermes 2 Pro Llama 3 8B',       ctx:8192,   paramTier:'8B',  uncensored:true },
    { id:'nousresearch/nous-hermes-2-mixtral-8x7b-dpo:free', name:'Nous Hermes 2 Mixtral 8x7B DPO', ctx:32768, paramTier:'?', uncensored:true },
    { id:'nousresearch/nous-capybara-7b:free',    name:'Nous Capybara 7B',                   ctx:4096,   paramTier:'7B',  uncensored:true },
    // ── OpenChat ────────────────────────────────────────────────────────────────
    { id:'openchat/openchat-7b:free',             name:'OpenChat 3.5 7B (8k)',               ctx:8192,   paramTier:'7B', uncensored:true },
    // ── 01.AI Yi ────────────────────────────────────────────────────────────────
    { id:'01-ai/yi-1.5-34b-chat:free',            name:'Yi 1.5 34B Chat',                   ctx:4096,   paramTier:'32B' },
    // ── Cohere ──────────────────────────────────────────────────────────────────
    { id:'cohere/command-r7b-12-2024:free',       name:'Cohere Command R7B (128k)',          ctx:131072, paramTier:'7B' },
    // ── NVIDIA ──────────────────────────────────────────────────────────────────
    { id:'nvidia/llama-3.1-nemotron-70b-instruct:free', name:'Nemotron 70B Instruct',        ctx:131072, paramTier:'70B' },
    { id:'nvidia/llama-3.3-nemotron-super-49b-v1:free',  name:'Nemotron Super 49B',          ctx:131072, paramTier:'?' },
    { id:'nvidia/llama-3.1-nemotron-nano-8b-v1:free',    name:'Nemotron Nano 8B',            ctx:131072, paramTier:'8B' },
    // ── TNG ─────────────────────────────────────────────────────────────────────
    { id:'tng-tech/llama-3.3-70b-instruct-fp8-mrl:free', name:'Llama 3.3 70B FP8 MRL',      ctx:131072, paramTier:'70B' },
    // ── Featherless / community ──────────────────────────────────────────────────
    { id:'featherless/qwerky-72b:free',           name:'Qwerky 72B (uncensored)',            ctx:32768,  paramTier:'70B', uncensored:true },
    { id:'cognitivecomputations/dolphin3.0-r1-mistral-nemo-12b:free', name:'Dolphin 3.0 R1 Mistral NeMo 12B', ctx:131072, paramTier:'13B', uncensored:true },
    { id:'cognitivecomputations/dolphin3.0-mistral-24b:free',         name:'Dolphin 3.0 Mistral 24B',         ctx:131072, paramTier:'24B', uncensored:true },
    // ── Alibaba ──────────────────────────────────────────────────────────────────
    { id:'thudm/glm-4-9b-chat:free',              name:'GLM-4 9B Chat',                     ctx:131072, paramTier:'8B' },
    // ── Gemini flash free ────────────────────────────────────────────────────────
    { id:'google/gemini-2.0-flash-exp:free',      name:'Gemini 2.0 Flash (Exp · 1M)',       ctx:1048576, paramTier:'?' },
    { id:'google/gemini-2.0-flash-thinking-exp:free', name:'Gemini 2.0 Flash Thinking (Exp)', ctx:1048576, paramTier:'?' },
    { id:'google/gemma-3n-e4b-it:free',           name:'Gemma 3n E4B IT (multimodal)',      ctx:8192,   paramTier:'3B' },
    // ── Moonshot ─────────────────────────────────────────────────────────────────
    { id:'moonshotai/moonlight-16a-a3b-instruct:free', name:'Moonlight 16A A3B (MoE)',       ctx:8192,   paramTier:'3B' },
    // ── Snowflake ────────────────────────────────────────────────────────────────
    // FIX Q: marked type:'embedding' so it is excluded from the chat model list
    { id:'snowflake/snowflake-arctic-embed-l-v2.0:free', name:'Snowflake Arctic Embed L v2', ctx:8192, paramTier:'?', type:'embedding' },
    // ── Sarvamai ─────────────────────────────────────────────────────────────────
    { id:'sarvamai/sarvam-m:free',                name:'Sarvam M (multilingual)',            ctx:32768,  paramTier:'?' },
    // ── Creative / RP ─────────────────────────────────────────────────────────────
    { id:'sao10k/l3.3-euryale-70b:free',          name:'Euryale 70B (creative/RP)',          ctx:131072, paramTier:'70B', uncensored:true },
    { id:'sao10k/l3.1-euryale-70b:free',          name:'Euryale 3.1 70B (creative/RP)',      ctx:131072, paramTier:'70B', uncensored:true },
    // ── Reka ─────────────────────────────────────────────────────────────────────
    { id:'rekaai/reka-flash-3:free',              name:'Reka Flash 3 (21B)',                 ctx:32768,  paramTier:'22B' },
    // ── Inflection ───────────────────────────────────────────────────────────────
    { id:'inflection/inflection-3-productivity:free', name:'Inflection 3 Productivity',     ctx:8192,   paramTier:'?' },
    { id:'inflection/inflection-3-pi:free',       name:'Inflection 3 Pi',                   ctx:8192,   paramTier:'?' },
  ],

  huggingface: [
    // ── Meta Llama ──────────────────────────────────────────────────────────────
    { id:'meta-llama/Llama-3.3-70B-Instruct',         name:'Llama 3.3 70B Instruct',       ctx:131072, paramTier:'70B' },
    { id:'meta-llama/Llama-3.1-70B-Instruct',         name:'Llama 3.1 70B Instruct',       ctx:131072, paramTier:'70B' },
    { id:'meta-llama/Llama-3.1-8B-Instruct',          name:'Llama 3.1 8B Instruct',        ctx:131072, paramTier:'8B' },
    { id:'meta-llama/Llama-3.2-3B-Instruct',          name:'Llama 3.2 3B Instruct',        ctx:131072, paramTier:'3B' },
    { id:'meta-llama/Llama-3.2-1B-Instruct',          name:'Llama 3.2 1B Instruct',        ctx:131072, paramTier:'1B', uncensored:true },
    { id:'meta-llama/Llama-3.2-11B-Vision-Instruct',  name:'Llama 3.2 11B Vision',         ctx:131072, paramTier:'13B' },
    { id:'meta-llama/Llama-3.2-90B-Vision-Instruct',  name:'Llama 3.2 90B Vision',         ctx:131072, paramTier:'?' },
    { id:'meta-llama/Meta-Llama-3-8B-Instruct',       name:'Llama 3 8B Instruct',          ctx:8192,   paramTier:'8B' },
    { id:'meta-llama/Meta-Llama-3-70B-Instruct',      name:'Llama 3 70B Instruct',         ctx:8192,   paramTier:'70B' },
    // ── Mistral ──────────────────────────────────────────────────────────────────
    { id:'mistralai/Mistral-7B-Instruct-v0.3',        name:'Mistral 7B Instruct v0.3',     ctx:32768,  paramTier:'7B' },
    { id:'mistralai/Mistral-Nemo-Instruct-2407',      name:'Mistral NeMo 12B Instruct',    ctx:131072, paramTier:'13B' },
    { id:'mistralai/Mixtral-8x7B-Instruct-v0.1',      name:'Mixtral 8x7B Instruct',        ctx:32768,  paramTier:'?' },
    { id:'mistralai/Mixtral-8x22B-Instruct-v0.1',     name:'Mixtral 8x22B Instruct',       ctx:65536,  paramTier:'?' },
    { id:'mistralai/Mistral-Small-3.1-24B-Instruct-2503', name:'Mistral Small 3.1 24B',    ctx:131072, paramTier:'24B' },
    // ── Qwen ─────────────────────────────────────────────────────────────────────
    { id:'Qwen/Qwen2.5-72B-Instruct',                 name:'Qwen 2.5 72B Instruct',        ctx:131072, paramTier:'70B' },
    { id:'Qwen/Qwen2.5-7B-Instruct',                  name:'Qwen 2.5 7B Instruct',         ctx:131072, paramTier:'7B' },
    { id:'Qwen/Qwen2.5-3B-Instruct',                  name:'Qwen 2.5 3B Instruct',         ctx:131072, paramTier:'3B' },
    { id:'Qwen/Qwen2.5-1.5B-Instruct',                name:'Qwen 2.5 1.5B Instruct',       ctx:131072, paramTier:'1B', uncensored:true },
    { id:'Qwen/Qwen2.5-Coder-32B-Instruct',           name:'Qwen 2.5 Coder 32B',           ctx:131072, paramTier:'32B' },
    { id:'Qwen/Qwen2.5-VL-7B-Instruct',               name:'Qwen 2.5 VL 7B (Vision)',      ctx:32768,  paramTier:'7B' },
    { id:'Qwen/Qwen2.5-VL-72B-Instruct',              name:'Qwen 2.5 VL 72B (Vision)',     ctx:32768,  paramTier:'70B' },
    { id:'Qwen/QwQ-32B',                              name:'QwQ 32B (Reasoning)',           ctx:131072, paramTier:'32B' },
    { id:'Qwen/Qwen3-30B-A3B',                        name:'Qwen3 30B A3B (MoE)',           ctx:131072, paramTier:'30B' },
    // ── DeepSeek ─────────────────────────────────────────────────────────────────
    { id:'deepseek-ai/DeepSeek-V3',                   name:'DeepSeek V3 (671B)',            ctx:131072, paramTier:'671B' },
    { id:'deepseek-ai/DeepSeek-R1',                   name:'DeepSeek R1 (671B · Reasoning)',ctx:131072, paramTier:'671B' },
    { id:'deepseek-ai/DeepSeek-R1-Distill-Llama-70B', name:'DeepSeek R1 Distill Llama 70B',ctx:65536,  paramTier:'70B' },
    { id:'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',  name:'DeepSeek R1 Distill Qwen 32B', ctx:65536,  paramTier:'32B' },
    // ── Microsoft Phi ─────────────────────────────────────────────────────────────
    { id:'microsoft/Phi-3.5-mini-instruct',           name:'Phi-3.5 Mini 3.8B Instruct',   ctx:131072, paramTier:'3B' },
    { id:'microsoft/Phi-3-mini-4k-instruct',          name:'Phi-3 Mini 3.8B (4k)',          ctx:4096,   paramTier:'3B' },
    { id:'microsoft/Phi-3-medium-4k-instruct',        name:'Phi-3 Medium 14B (4k)',         ctx:4096,   paramTier:'14B' },
    // ── Google Gemma ──────────────────────────────────────────────────────────────
    { id:'google/gemma-2-2b-it',                      name:'Gemma 2 2B IT',                 ctx:8192,   paramTier:'1B' },
    { id:'google/gemma-2-9b-it',                      name:'Gemma 2 9B IT',                 ctx:8192,   paramTier:'8B' },
    { id:'google/gemma-2-27b-it',                     name:'Gemma 2 27B IT',                ctx:8192,   paramTier:'30B' },
    { id:'google/gemma-7b-it',                        name:'Gemma 7B IT',                   ctx:8192,   paramTier:'7B' },
    // ── Nous Research ────────────────────────────────────────────────────────────
    { id:'NousResearch/Hermes-3-Llama-3.1-8B',        name:'Hermes 3 Llama 3.1 8B',        ctx:131072, paramTier:'8B',  uncensored:true },
    { id:'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO',name:'Hermes 2 Mixtral 8x7B DPO',   ctx:32768,  paramTier:'?',   uncensored:true },
    // ── Dolphin ───────────────────────────────────────────────────────────────────
    { id:'cognitivecomputations/dolphin-2.9.2-qwen2-72b', name:'Dolphin 2.9.2 Qwen2 72B',  ctx:32768,  paramTier:'70B', uncensored:true },
    // ── HuggingFaceH4 ─────────────────────────────────────────────────────────────
    { id:'HuggingFaceH4/zephyr-7b-beta',              name:'Zephyr 7B Beta',               ctx:32768,  paramTier:'7B' },
    { id:'HuggingFaceH4/zephyr-7b-alpha',             name:'Zephyr 7B Alpha',              ctx:32768,  paramTier:'7B' },
    // ── OpenChat ──────────────────────────────────────────────────────────────────
    { id:'openchat/openchat-3.6-8b-20240522',         name:'OpenChat 3.6 8B',              ctx:8192,   paramTier:'8B',  uncensored:true },
    // ── Falcon ────────────────────────────────────────────────────────────────────
    { id:'tiiuae/Falcon3-10B-Instruct',               name:'Falcon 3 10B Instruct',        ctx:32768,  paramTier:'13B' },
    { id:'tiiuae/Falcon3-7B-Instruct',                name:'Falcon 3 7B Instruct',         ctx:32768,  paramTier:'7B' },
    { id:'tiiuae/Falcon3-3B-Instruct',                name:'Falcon 3 3B Instruct',         ctx:32768,  paramTier:'3B' },
    { id:'tiiuae/Falcon3-1B-Instruct',                name:'Falcon 3 1B Instruct',         ctx:32768,  paramTier:'1B', uncensored:true },
    // ── EXAONE ────────────────────────────────────────────────────────────────────
    { id:'LGAI-MEDIA/EXAONE-3.5-7.8B-Instruct',       name:'EXAONE 3.5 7.8B Instruct',    ctx:32768,  paramTier:'7B' },
    // ── Cohere ────────────────────────────────────────────────────────────────────
    { id:'CohereForAI/c4ai-command-r-plus-08-2024',   name:'Command R+ 08-2024 (104B)',    ctx:131072, paramTier:'105B' },
    { id:'CohereForAI/c4ai-command-r7b-12-2024',      name:'Command R7B 12-2024',          ctx:131072, paramTier:'7B' },
    // ── AllenAI ───────────────────────────────────────────────────────────────────
    { id:'allenai/OLMo-2-1124-13B-Instruct',          name:'OLMo 2 13B Instruct',          ctx:4096,   paramTier:'13B' },
    { id:'allenai/OLMo-2-1124-7B-Instruct',           name:'OLMo 2 7B Instruct',           ctx:4096,   paramTier:'7B' },
    // ── SmolLM ───────────────────────────────────────────────────────────────────
    { id:'HuggingFaceTB/SmolLM2-1.7B-Instruct',       name:'SmolLM2 1.7B Instruct',        ctx:8192,   paramTier:'1B', uncensored:true },
    { id:'HuggingFaceTB/SmolLM2-360M-Instruct',       name:'SmolLM2 360M Instruct',        ctx:8192,   paramTier:'1B', uncensored:true },
  ]
};

export const API = {
  getProvider(providerName = AppState.currentProvider) {
    return PROVIDERS[providerName] || PROVIDERS.openrouter;
  },

  /**
   * Parse a raw provider error response into a user-friendly object.
   */
  parseProviderError(status, rawText = '') {
    let parsed = null;
    try { parsed = JSON.parse(rawText); } catch (_) {}

    const providerMsg =
      parsed?.error?.message ||
      parsed?.message ||
      rawText ||
      `HTTP ${status}`;

    const normalized = String(providerMsg).toLowerCase();

    if (status === 401 || normalized.includes('invalid api key') || normalized.includes('unauthorized')) {
      return { code: 'AUTH', userMessage: 'Authentication failed — please check your API key.', raw: providerMsg };
    }

    if (status === 429) {
      const isUpstream =
        normalized.includes('upstream') ||
        normalized.includes('provider') ||
        normalized.includes('overloaded') ||
        normalized.includes('try another') ||
        normalized.includes('too many requests to');

      if (isUpstream) {
        return {
          code: 'UPSTREAM_RATE_LIMIT',
          userMessage: 'This model is temporarily overloaded — try another model or wait 60 s.',
          raw: providerMsg,
        };
      }

      return {
        code: 'RATE_LIMIT',
        userMessage: 'Rate limited — OpenRouter free-tier allows 20 req/min and 50 req/day. Please wait or add credits.',
        raw: providerMsg,
      };
    }

    if (
      status === 404 &&
      (normalized.includes('unavailable for free') ||
       normalized.includes('paid version is available now') ||
       normalized.includes('use this slug instead'))
    ) {
      return {
        code: 'MODEL_NOT_FREE',
        userMessage: 'This model is no longer free. Refreshing models — please choose another one.',
        raw: providerMsg,
      };
    }
    if (status === 404 || (normalized.includes('model') && normalized.includes('not found'))) {
      return {
        code: 'MODEL_MISSING',
        userMessage: 'This model is no longer available. Refreshing models — please choose another one.',
        raw: providerMsg,
      };
    }
    return { code: 'API_ERROR', userMessage: `Request failed (${status}) — please try again.`, raw: providerMsg };
  },

  async fetchModels(providerName = AppState.currentProvider, paramFilter = 'all') {
    const provider = this.getProvider(providerName);
    const token = providerName === 'openrouter' ? AppState.apiKey : AppState.hfToken;

    let models;

    if (!token) {
      // FIX Q: filter out embedding-only models from the curated fallback
      models = (CURATED_FREE[providerName] || []).filter(m => m.type !== 'embedding');
    } else {
      try {
        const headers = {
          [provider.authHeader]: `Bearer ${token}`,
          ...provider.extraHeaders
        };

        const response = await this.fetchWithTimeout(
          `${provider.baseUrl}${provider.modelEndpoint}`,
          { headers },
          12000
        );

        if (!response.ok) {
          const raw = await response.text();
          const err = this.parseProviderError(response.status, raw);
          throw Object.assign(new Error(err.userMessage), err);
        }

        const data = await response.json();
        models = this.processModels(data, providerName);
      } catch (err) {
        console.warn('Model fetch failed:', err.message);
        throw err;
      }
    }

    if (paramFilter && paramFilter !== 'all') {
      const tier = PARAM_TIERS.find(t => t.value === paramFilter);
      if (tier) models = models.filter(m => tier.test(m.paramTier || '?'));
    }

    return models;
  },

  processModels(data, providerName) {
    const curatedMap = {};
    (CURATED_FREE[providerName] || []).forEach(m => { curatedMap[m.id] = m; });
    let models = [];

    if (providerName === 'openrouter') {
      models = (data.data || [])
        .filter(model => isOpenRouterFreeModel(model) && !isEmbeddingModel(model))
        .map(m => {
          const curated = curatedMap[m.id];
          return {
            id:         m.id,
            name:       curated?.name || `${m.name || m.id} (${Math.round((m.context_length || 8192) / 1000)}k)`,
            ctx:        m.context_length || curated?.ctx || 8192,
            paramTier:  curated?.paramTier || '?',
            uncensored: curated?.uncensored || false,
            type:       curated?.type || 'chat',
          };
        })
        // FIX Q: exclude embedding models from live-fetched list too
        .filter(m => m.type !== 'embedding');
    } else {
      const liveIds = new Set((data.data || []).map(m => m.id));
      models = CURATED_FREE.huggingface
        .filter(m => m.type !== 'embedding')
        .filter(m => liveIds.has(m.id))
        .map(m => ({ ...m, live: true }));
    }

    const seen = new Set();
    models = models.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    models.sort((a, b) => a.name.localeCompare(b.name));
    return models;
  },

  /** @deprecated — kept for backward compat; calls sendMessageStream */
  async sendMessage(messages, modelId, options = {}) {
    return this.sendMessageStream(messages, modelId, null, options);
  },

  /**
   * FIX M: Removed duplicate canMakeRequest() + recordRequest() that previously
   * lived here alongside the identical check in app.js:sendMessage(). Rate-limit
   * enforcement now lives exclusively in app.js so every send costs exactly one
   * bucket slot.
   */
  async sendMessageStream(messages, modelId, onToken, options = {}) {
    const provider = this.getProvider();
    const token = AppState.getAuthToken();

    if (!token) {
      throw Object.assign(
        new Error('Not authenticated. Please provide API credentials.'),
        { code: 'AUTH' }
      );
    }

    const payload = {
      model:       modelId,
      messages:    messages,
      temperature: options.temperature ?? AppState.temperature,
      max_tokens:  options.maxTokens ?? AppState.maxTokens,
      top_p:       options.topP ?? 0.95,
      stream:      true,
      stream_options: { include_usage: true },
    };

    const headers = {
      'Content-Type':        'application/json',
      [provider.authHeader]: `Bearer ${token}`,
      ...provider.extraHeaders
    };

    try {
      const appSignal = AppState.abortController?.signal;
      const response = await this.fetchWithTimeout(
        `${provider.baseUrl}${provider.chatEndpoint}`,
        { method: 'POST', headers, body: JSON.stringify(payload), signal: appSignal },
        60000
      );

      if (!response.ok) {
        const raw = await response.text();
        const parsed = this.parseProviderError(response.status, raw);
        const err = new Error(parsed.userMessage);
        err.code = parsed.code;
        err.raw  = parsed.raw;
        err.status = response.status;
        throw err;
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let content = '', buffer = '', usage = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // FIX W: safety valve — if buffer grows unbounded (no newlines from server)
        // discard excess to prevent memory exhaustion.
        if (buffer.length > 1_000_000) {
          console.warn('[ChatWithIt] SSE buffer overflow — truncating.');
          buffer = '';
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            if (chunk.usage) usage = chunk.usage;
            const delta = chunk.choices?.[0]?.delta?.content || '';
            content += delta;
            if (delta && onToken) onToken(delta);
          } catch (_) { /* skip malformed */ }
        }
      }

      const estimatedCompletion = Math.max(1, Math.ceil(content.length / 4));
      // FIX N: prompt tokens are unknown without server-sent usage metadata;
      // use 0 rather than fabricating a value from content length (which would
      // double-count and fill the context bar at 2× speed).
      const promptTokens     = usage?.prompt_tokens     || 0;
      const completionTokens = usage?.completion_tokens || estimatedCompletion;

      return {
        choices: [{ message: { content } }],
        usage:   { prompt_tokens: promptTokens, completion_tokens: completionTokens },
        usageEstimated: !usage?.completion_tokens,
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        const err = new Error('Request cancelled by user');
        err.code = 'ABORTED';
        throw err;
      }
      throw error;
    }
  },

  async fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const timeoutCtrl = new AbortController();
    const timeoutId   = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
    const signals = [timeoutCtrl.signal];
    if (options.signal) signals.push(options.signal);
    const composedSignal = typeof AbortSignal.any === 'function'
      ? AbortSignal.any(signals)
      : options.signal || timeoutCtrl.signal;
    try {
      return await fetch(url, { ...options, signal: composedSignal });
    } finally {
      clearTimeout(timeoutId);
    }
  },

  cancelRequest() {
    if (AppState.abortController) { AppState.abortController.abort(); AppState.abortController = null; }
  },

  createAbortController() {
    AppState.abortController = new AbortController();
    return AppState.abortController;
  },

  extractTokenUsage(response) {
    const usage = response?.usage;
    if (usage) return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      estimated: Boolean(response?.usageEstimated),
    };
    // FIX N: when server usage metadata is absent only estimate completion;
    // prompt token count is unknown so default to 0 to avoid double-counting.
    const content = response?.choices?.[0]?.message?.content || '';
    return {
      promptTokens:     0,
      completionTokens: Math.max(1, Math.ceil(content.length / 4)),
      estimated:        true,
    };
  },

  getParamTiers() { return PARAM_TIERS; },
};

export default API;
