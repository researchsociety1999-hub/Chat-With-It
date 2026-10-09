/**
 * Curated free model catalogs (offline fallback).
 * Live catalogs from providers supersede this when authenticated.
 */

export const CURATED_FREE = {
  openrouter: [
    { id:'deepseek/deepseek-r1:free', name:'DeepSeek R1 (671B · Reasoning)', ctx:65536, paramTier:'671B' },
    { id:'deepseek/deepseek-chat-v3-0324:free', name:'DeepSeek Chat v3 (671B · 64k)', ctx:65536, paramTier:'671B' },
    { id:'meta-llama/llama-3.3-70b-instruct:free', name:'Llama 3.3 70B Instruct', ctx:131072, paramTier:'70B' },
    { id:'meta-llama/llama-3.1-8b-instruct:free', name:'Llama 3.1 8B Instruct', ctx:131072, paramTier:'8B' },
    { id:'qwen/qwen3-235b-a22b:free', name:'Qwen3 235B A22B (MoE · 40k)', ctx:40960, paramTier:'236B' },
    { id:'qwen/qwen3-32b:free', name:'Qwen3 32B', ctx:40960, paramTier:'32B' },
    { id:'google/gemma-3-27b-it:free', name:'Gemma 3 27B IT', ctx:131072, paramTier:'30B' },
    { id:'google/gemini-2.0-flash-exp:free', name:'Gemini 2.0 Flash (Exp · 1M)', ctx:1048576, paramTier:'?' },
    { id:'mistralai/mistral-small-3.1-24b-instruct:free', name:'Mistral Small 3.1 24B', ctx:131072, paramTier:'24B' },
    { id:'microsoft/phi-4:free', name:'Phi-4 (14B)', ctx:16384, paramTier:'14B' },
    { id:'nousresearch/hermes-3-llama-3.1-70b:free', name:'Hermes 3 Llama 3.1 70B', ctx:131072, paramTier:'70B', uncensored:true },
    { id:'openchat/openchat-7b:free', name:'OpenChat 3.5 7B (8k)', ctx:8192, paramTier:'7B', uncensored:true },
  ],
  huggingface: [
    { id:'meta-llama/Llama-3.3-70B-Instruct', name:'Llama 3.3 70B Instruct', ctx:131072, paramTier:'70B' },
    { id:'meta-llama/Llama-3.1-8B-Instruct', name:'Llama 3.1 8B Instruct', ctx:131072, paramTier:'8B' },
    { id:'Qwen/Qwen2.5-72B-Instruct', name:'Qwen 2.5 72B Instruct', ctx:131072, paramTier:'70B' },
    { id:'Qwen/Qwen2.5-7B-Instruct', name:'Qwen 2.5 7B Instruct', ctx:131072, paramTier:'7B' },
    { id:'mistralai/Mistral-7B-Instruct-v0.3', name:'Mistral 7B Instruct v0.3', ctx:32768, paramTier:'7B' },
    { id:'google/gemma-2-9b-it', name:'Gemma 2 9B IT', ctx:8192, paramTier:'8B' },
    { id:'microsoft/Phi-3.5-mini-instruct', name:'Phi-3.5 Mini Instruct', ctx:131072, paramTier:'3B' },
    { id:'HuggingFaceTB/SmolLM2-1.7B-Instruct', name:'SmolLM2 1.7B Instruct', ctx:8192, paramTier:'1B', uncensored:true },
  ]
};
