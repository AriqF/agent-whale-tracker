/** 9router LLM provider (OpenAI-compatible API) */
import {
  logApiError,
  logApiNetworkError,
  logApiRequest,
  logApiSuccess,
} from '../utils/apiLogger';
import type { ChatCompletionFn } from './types';

const LOG_SERVICE = '9Router';

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
  error?: { message: string };
}

function getChatCompletionsUrl(): string {
  const raw = process.env['9ROUTER_BASE_URL']?.trim();
  if (!raw) throw new Error('9ROUTER_BASE_URL is not set');
  const base = raw.replace(/\/+$/, '').replace(/\/v1$/, '');
  return `${base}/v1/chat/completions`;
}

/** Server may append SSE suffix `data: [DONE]` even when stream: false */
async function parseJsonResponse(res: Response): Promise<ChatCompletionResponse> {
  const text = (await res.text()).trim();
  const cleaned = text.replace(/\n?data:\s*\[DONE\]\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned) as ChatCompletionResponse;
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
  }
}

export const chatCompletion: ChatCompletionFn = async (
  system,
  user,
  maxTokens,
  jsonMode = false
) => {
  const apiKey = process.env['9ROUTER_API_KEY'];
  if (!apiKey) throw new Error('9ROUTER_API_KEY is not set');

  const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    stream: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const url = getChatCompletionsUrl();
  const label = `chat-completions model=${model}`;
  const startedAt = Date.now();

  logApiRequest(LOG_SERVICE, 'POST', url, { model, maxTokens, jsonMode });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const ms = Date.now() - startedAt;

    if (!res.ok) {
      const errText = (await res.text()).trim();
      const message = errText || `HTTP ${res.status}`;
      logApiError(LOG_SERVICE, label, res.status, url, message, { ms });
      throw new Error(`HTTP ${res.status}: ${message}`);
    }

    const data = await parseJsonResponse(res);
    const text = data.choices[0]?.message?.content?.trim();
    if (!text) {
      logApiError(LOG_SERVICE, label, res.status, url, 'empty response', { ms });
      throw new Error('LLM returned empty response');
    }

    logApiSuccess(LOG_SERVICE, label, res.status, { ms });
    return text;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith('HTTP ') ||
        error.message === 'LLM returned empty response' ||
        error.message.startsWith('Invalid JSON response'))
    ) {
      throw error;
    }
    logApiNetworkError(LOG_SERVICE, label, url, error);
    throw error;
  }
};
