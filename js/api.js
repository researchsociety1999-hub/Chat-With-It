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

const PROVIDERS = {
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
 * Used by App.refreshModels(paramFilter) and the UI filter <select>.
 * Each entry: { label, test(paramTier) }
 */
const PARAM_TIERS = [
  { value: 'all',   label: 'All sizes' },
  { value: 'tiny',  label: '≤ 3B params',    test: t => ['1B','2B','3B'].includes(t) },
  { value: 'small', label: '7–8B params',    test: t => ['7B','8B'].includes(t) },
  { value: 'mid',   label: '13–30B params',  test: t => ['13B','14B','20B','22B','24B','30B','32B'].includes(t) },
  { value: 'large', label: '70B params',     test: t => ['70B','72B'].includes(t) },
  { value: 'giant', label: '≥ 105B params',  test: t => ['105B','123B','180B','236B','671B','?'].includes(t) },
];

/**
 * Comprehensive curated list of permanently-free models.
 *
 * OpenRouter: every model with a ":free" suffix in the API as of June 2026.
 * HuggingFace: every model available on router.huggingface.co/v1 under the
 *   free Serverless Inference tier (no billing required).
 *
 * Fields:
 *   id        – model id sent to the API
 *   name      – human-readable label
 *   ctx       – context window in tokens
 *   paramTier – rough size bucket for the UI filter
 *   uncensored– true = known to be less restricted / fine-tuned for open use
 */
const CURATED_FREE = {
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
    // ── OpenChat / Mistral community ────────────────────────────────────────────
    { id:'openchat/openchat-7b:free',             name:'OpenChat 3.5 7B (8k)',               ctx:8192,   paramTier:'7B', uncensored:true },
    // ── 01.AI Yi ────────────────────────────────────────────────────────────────
    { id:'01-ai/yi-1.5-34b-chat:free',            name:'Yi 1.5 34B Chat',                   ctx:4096,   paramTier:'32B' },
    // ── Cohere ──────────────────────────────────────────────────────────────────
    { id:'cohere/command-r7b-12-2024:free',       name:'Cohere Command R7B (128k)',          ctx:131072, paramTier:'7B' },
    // ── NVIDIA ──────────────────────────────────────────────────────────────────
    { id:'nvidia/llama-3.1-nemotron-70b-instruct:free', name:'Nemotron 70B Instruct',        ctx:131072, paramTier:'70B' },
    { id:'nvidia/llama-3.3-nemotron-super-49b-v1:free',  name:'Nemotron Super 49B',          ctx:131072, paramTier:'?' },
    { id:'nvidia/llama-3.1-nemotron-nano-8b-v1:free',    name:'Nemotron Nano 8B',            ctx:131072, paramTier:'8B' },
    // ── TNG / Teknium ────────────────────────────────────────────────────────────
    { id:'tng-tech/llama-3.3-70b-instruct-fp8-mrl:free', name:'Llama 3.3 70B FP8 MRL',      ctx:131072, paramTier:'70B' },
    // ── Featherless / community ──────────────────────────────────────────────────
    { id:'featherless/qwerky-72b:free',           name:'Qwerky 72B (uncensored)',            ctx:32768,  paramTier:'70B', uncensored:true },
    { id:'cognitivecomputations/dolphin3.0-r1-mistral-nemo-12b:free', name:'Dolphin 3.0 R1 Mistral NeMo 12B', ctx:131072, paramTier:'13B', uncensored:true },
    { id:'cognitivecomputations/dolphin3.0-mistral-24b:free',         name:'Dolphin 3.0 Mistral 24B',         ctx:131072, paramTier:'24B', uncensored:true },
    // ── Alibaba other ────────────────────────────────────────────────────────────
    { id:'thudm/glm-4-9b-chat:free',              name:'GLM-4 9B Chat',                     ctx:131072, paramTier:'8B' },
    // ── Gemini flash free ────────────────────────────────────────────────────────
    { id:'google/gemini-2.0-flash-exp:free',      name:'Gemini 2.0 Flash (Exp · 1M)',       ctx:1048576, paramTier:'?' },
    { id:'google/gemini-2.0-flash-thinking-exp:free', name:'Gemini 2.0 Flash Thinking (Exp)', ctx:1048576, paramTier:'?' },
    { id:'google/gemma-3n-e4b-it:free',           name:'Gemma 3n E4B IT (multimodal)',      ctx:8192,   paramTier:'3B' },
    // ── Bytedance / Moonshot ─────────────────────────────────────────────────────
    { id:'moonshotai/moonlight-16a-a3b-instruct:free', name:'Moonlight 16A A3B (MoE)',       ctx:8192,   paramTier:'3B' },
    // ── Snowflake Arctic ─────────────────────────────────────────────────────────
    { id:'snowflake/snowflake-arctic-embed-l-v2.0:free', name:'Snowflake Arctic Embed L v2 (embedding)', ctx:8192, paramTier:'?' },
    // ── Sarvamai ─────────────────────────────────────────────────────────────────
    { id:'sarvamai/sarvam-m:free',                name:'Sarvam M (multilingual)',            ctx:32768,  paramTier:'?' },
    // ── SambaNova ────────────────────────────────────────────────────────────────
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
    // ── Nous Research / Hermes ────────────────────────────────────────────────────
    { id:'NousResearch/Hermes-3-Llama-3.1-8B',        name:'Hermes 3 Llama 3.1 8B',        ctx:131072, paramTier:'8B',  uncensored:true },
    { id:'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO',name:'Hermes 2 Mixtral 8x7B DPO',   ctx:32768,  paramTier:'?',   uncensored:true },
    // ── Cognitive Computations / Dolphin ──────────────────────────────────────────
    { id:'cognitivecomputations/dolphin-2.9.2-qwen2-72b', name:'Dolphin 2.9.2 Qwen2 72B',  ctx:32768,  paramTier:'70B', uncensored:true },
    // ── HuggingFaceH4 ─────────────────────────────────────────────────────────────
    { id:'HuggingFaceH4/zephyr-7b-beta',              name:'Zephyr 7B Beta',               ctx:32768,  paramTier:'7B' },
    { id:'HuggingFaceH4/zephyr-7b-alpha',             name:'Zephyr 7B Alpha',              ctx:32768,  paramTier:'7B' },
    // ── OpenChat ──────────────────────────────────────────────────────────────────
    { id:'openchat/openchat-3.6-8b-20240522',         name:'OpenChat 3.6 8B',              ctx:8192,   paramTier:'8B',  uncensored:true },
    // ── TII Falcon ────────────────────────────────────────────────────────────────
    { id:'tiiuae/Falcon3-10B-Instruct',               name:'Falcon 3 10B Instruct',        ctx:32768,  paramTier:'13B' },
    { id:'tiiuae/Falcon3-7B-Instruct',                name:'Falcon 3 7B Instruct',         ctx:32768,  paramTier:'7B' },
    { id:'tiiuae/Falcon3-3B-Instruct',                name:'Falcon 3 3B Instruct',         ctx:32768,  paramTier:'3B' },
    { id:'tiiuae/Falcon3-1B-Instruct',                name:'Falcon 3 1B Instruct',         ctx:32768,  paramTier:'1B', uncensored:true },
    // ── LGAI Exaone ────────────────────────────────────────────────────────────────
    { id:'LGAI-MEDIA/EXAONE-3.5-7.8B-Instruct',       name:'EXAONE 3.5 7.8B Instruct',    ctx:32768,  paramTier:'7B' },
    // ── Command-R ─────────────────────────────────────────────────────────────────
    { id:'CohereForAI/c4ai-command-r-plus-08-2024',   name:'Command R+ 08-2024 (104B)',    ctx:131072, paramTier:'105B' },
    { id:'CohereForAI/c4ai-command-r7b-12-2024',      name:'Command R7B 12-2024',          ctx:131072, paramTier:'7B' },
    // ── AllenAI Tulu / OLMo ───────────────────────────────────────────────────────
    { id:'allenai/OLMo-2-1124-13B-Instruct',          name:'OLMo 2 13B Instruct',          ctx:4096,   paramTier:'13B' },
    { id:'allenai/OLMo-2-1124-7B-Instruct',           name:'OLMo 2 7B Instruct',           ctx:4096,   paramTier:'7B' },
    // ── SmolLM ────────────────────────────────────────────────────────────────────
    { id:'HuggingFaceTB/SmolLM2-1.7B-Instruct',       name:'SmolLM2 1.7B Instruct',        ctx:8192,   paramTier:'1B', uncensored:true },
    { id:'HuggingFaceTB/SmolLM2-360M-Instruct',       name:'SmolLM2 360M Instruct',        ctx:8192,   paramTier:'1B', uncensored:true },
  ]
};

const API = {
  getProvider(providerName = AppState.currentProvider) {
    return PROVIDERS[providerName] || PROVIDERS.openrouter;
  },

  /**
   * Parse a raw provider error response into a user-friendly object.
   * Returns { code, userMessage, raw }.
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
    if (status === 429 || normalized.includes('rate limit')) {
      return { code: 'RATE_LIMIT', userMessage: 'Rate limited — please wait a moment and try again.', raw: providerMsg };
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

  /**
   * Fetch available models.
   * @param {string} [providerName]
   * @param {string} [paramFilter]  – one of PARAM_TIERS[].value, or 'all'
   * @returns {Promise<Array>}
   */
  async fetchModels(providerName = AppState.currentProvider, paramFilter = 'all') {
    const provider = this.getProvider(providerName);
    const token = providerName === 'openrouter' ? AppState.apiKey : AppState.hfToken;

    let models;

    if (!token) {
      // No auth yet — return curated list so the UI is never empty
      models = CURATED_FREE[providerName] || [];
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
          throw new Error(err.userMessage);
        }

        const data = await response.json();
        models = this.processModels(data, providerName);
      } catch (err) {
        console.warn('Model fetch failed, using curated list:', err.message);
        models = CURATED_FREE[providerName] || [];
      }
    }

    // Apply parameter-size filter
    if (paramFilter && paramFilter !== 'all') {
      const tier = PARAM_TIERS.find(t => t.value === paramFilter);
      if (tier) models = models.filter(m => tier.test(m.paramTier || '?'));
    }

    return models;
  },

  /**
   * Process and normalise models from a live API response.
   * Merges with CURATED_FREE so paramTier + uncensored metadata is preserved.
   */
  processModels(data, providerName) {
    const curatedMap = {};
    (CURATED_FREE[providerName] || []).forEach(m => { curatedMap[m.id] = m; });
    let models = [];

    if (providerName === 'openrouter') {
      models = (data.data || [])
        .filter(m => m.id && m.id.endsWith(':free'))
        .map(m => {
          const curated = curatedMap[m.id];
          return {
            id:         m.id,
            name:       curated?.name || `${m.name || m.id} (${Math.round((m.context_length || 8192) / 1000)}k)`,
            ctx:        m.context_length || curated?.ctx || 8192,
            paramTier:  curated?.paramTier || '?',
            uncensored: curated?.uncensored || false,
          };
        });
    } else {
      // HuggingFace: live endpoint may return different shapes; merge with curated
      const liveIds = new Set((data.data || []).map(m => m.id));
      // Always include every curated HF model (live endpoint is unreliable for listing)
      models = CURATED_FREE.huggingface.map(m => ({
        ...m,
        live: liveIds.has(m.id), // tag whether currently warm
      }));
      // Also add any live models not in our curated list
      (data.data || []).forEach(lm => {
        if (!curatedMap[lm.id]) {
          models.push({
            id:        lm.id,
            name:      lm.id.split('/').pop().replace(/-/g, ' '),
            ctx:       8192,
            paramTier: '?',
            uncensored:false,
            live:      true,
          });
        }
      });
    }

    // De-duplicate by id, sort alphabetically
    const seen = new Set();
    models = models.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    models.sort((a, b) => a.name.localeCompare(b.name));

    return models.length > 0 ? models : (CURATED_FREE[providerName] || []);
  },

  /** @deprecated — kept for backward compat; internally calls sendMessageStream */
  async sendMessage(messages, modelId, options = {}) {
    return this.sendMessageStream(messages, modelId, null, options);
  },

  /**
   * Send message with real-time token streaming.
   * All traffic goes directly from the browser to the provider over HTTPS.
   * No intermediate server sees the content.
   */
  async sendMessageStream(messages, modelId, onToken, options = {}) {
    const rateCheck = AppState.canMakeRequest();
    if (!rateCheck.allowed) {
      throw Object.assign(
        new Error(`Rate limited. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s.`),
        { retryAfterMs: rateCheck.retryAfterMs, code: 'RATE_LIMIT' }
      );
    }

    AppState.recordRequest();
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
    };

    const headers = {
      'Content-Type':            'application/json',
      [provider.authHeader]:     `Bearer ${token}`,
      ...provider.extraHeaders
    };

    try {
      // FIX: use the app-level abort signal when present; fetchWithTimeout's
      // internal controller acts only as a timeout fallback so both signals work.
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

      // FIX: always provide a non-zero prompt token estimate — never return 0
      // when the provider omits usage (common on free-tier streaming endpoints).
      const estimatedPrompt     = Math.max(1, Math.ceil(messages.reduce((s, m) => s + (m.content?.length || 0), 0) / 4));
      const estimatedCompletion = Math.max(1, Math.ceil(content.length / 4));
      const promptTokens        = usage?.prompt_tokens     || estimatedPrompt;
      const completionTokens    = usage?.completion_tokens || estimatedCompletion;

      return {
        choices: [{ message: { content } }],
        usage:   { prompt_tokens: promptTokens, completion_tokens: completionTokens }
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

  /**
   * Fetch with a hard timeout.
   * If the caller already has an abort signal (options.signal), that signal is
   * honoured — the local timeout controller only fires if it expires first.
   * This prevents the signal-conflict bug where a new AbortController was
   * silently overwriting the app-level one.
   */
  async fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const timeoutCtrl = new AbortController();
    const timeoutId   = setTimeout(() => timeoutCtrl.abort(), timeoutMs);

    // Compose signals: caller signal + timeout signal
    const signals = [timeoutCtrl.signal];
    if (options.signal) signals.push(options.signal);

    // AbortSignal.any() is well-supported (Chrome 116+, FF 124+, Safari 17.4+)
    const composedSignal = typeof AbortSignal.any === 'function'
      ? AbortSignal.any(signals)
      : options.signal || timeoutCtrl.signal; // graceful fallback

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
    if (usage) return { promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0 };
    const content = response?.choices?.[0]?.message?.content || '';
    // FIX: return a non-zero prompt estimate instead of 0 so the context bar
    // is always meaningful even when the provider omits usage data.
    return {
      promptTokens:     Math.max(1, Math.ceil(content.length / 4)),
      completionTokens: Math.max(1, Math.ceil(content.length / 4)),
    };
  },

  /** Expose tiers so App can build the filter <select> */
  getParamTiers() { return PARAM_TIERS; },
};
