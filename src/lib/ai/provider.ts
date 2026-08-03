import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

/**
 * The LLM gateway.
 *
 * Everything downstream talks to this and nothing else, so the model is a
 * deployment decision rather than a code decision. The default points at our
 * own vLLM container serving Qwen3 — Apache 2.0, strong Persian, running on
 * hardware we control, at zero marginal cost per token.
 *
 * Because vLLM speaks the OpenAI wire protocol, pointing AI_BASE_URL at any
 * other OpenAI-compatible endpoint (llama.cpp, Ollama, or a hosted provider)
 * swaps the model with no code change at all.
 */

const baseURL = process.env.AI_BASE_URL ?? 'http://localhost:8000/v1'
const modelId = process.env.AI_MODEL ?? 'Qwen/Qwen3-14B-AWQ'

const provider = createOpenAICompatible({
  name: 'neurai-llm',
  baseURL,
  // vLLM ignores the key, but the SDK requires the header to be present and a
  // hosted endpoint would need a real one.
  apiKey: process.env.AI_API_KEY ?? 'not-needed-for-local-vllm',
})

export const languageModel = provider.chatModel(modelId)

export const generationSettings = {
  temperature: Number(process.env.AI_TEMPERATURE ?? 0.6),
  maxOutputTokens: Number(process.env.AI_MAX_TOKENS ?? 1024),
} as const

/**
 * Whether the model server is reachable.
 *
 * The site must stay fully usable when the GPU box is down or the `ai` compose
 * profile simply isn't running — the assistant degrades to an honest "I'm
 * unavailable" message instead of the route throwing a 500.
 */
export async function llmAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL}/models`, {
      headers: { authorization: `Bearer ${process.env.AI_API_KEY ?? 'x'}` },
      signal: AbortSignal.timeout(2500),
    })
    return response.ok
  } catch {
    return false
  }
}

export const modelInfo = { baseURL, modelId }
