import {
  logApiError,
  logApiNetworkError,
  logApiRequest,
  logApiSuccess,
} from '../utils/apiLogger';

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
  error?: { message: string };
}

export async function chatCompletion(
  system: string,
  user: string,
  maxTokens: number,
  jsonMode = false
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const url = 'https://api.openai.com/v1/chat/completions';
  const label = `chat-completions model=${model}`;
  const startedAt = Date.now();

  logApiRequest('OpenAI', 'POST', url, { model, maxTokens, jsonMode });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as ChatCompletionResponse;
    const ms = Date.now() - startedAt;

    if (!res.ok) {
      const message = data.error?.message ?? `HTTP ${res.status}`;
      logApiError('OpenAI', label, res.status, url, message, { ms });
      throw new Error(message);
    }

    const text = data.choices[0]?.message?.content?.trim();
    if (!text) {
      logApiError('OpenAI', label, res.status, url, 'empty response', { ms });
      throw new Error('OpenAI returned empty response');
    }

    logApiSuccess('OpenAI', label, res.status, { ms });
    return text;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('HTTP') || error.message === 'OpenAI returned empty response')) {
      throw error;
    }
    logApiNetworkError('OpenAI', label, url, error);
    throw error;
  }
}
