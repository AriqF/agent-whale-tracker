import * as kv from '../redis/kv';
import type { AgentIntent, ChatContext } from '../types';

const KEY_PREFIX = 'ocean-eyes:chat:';

function chatKey(chatId: number): string {
  return `${KEY_PREFIX}${chatId}`;
}

function contextTtlSeconds(): number {
  const hours = Number(process.env.CHAT_CONTEXT_TTL_HOURS ?? 72);
  return Number.isFinite(hours) && hours > 0 ? Math.floor(hours * 3600) : 72 * 3600;
}

export async function loadChatContext(chatId: number): Promise<ChatContext | null> {
  return kv.getJson<ChatContext>(chatKey(chatId));
}

export async function saveChatContext(chatId: number, ctx: ChatContext): Promise<void> {
  await kv.setJson(chatKey(chatId), ctx, contextTtlSeconds());
}

export async function clearChatContext(chatId: number): Promise<void> {
  await kv.del(chatKey(chatId));
}

export async function saveFromIntent(chatId: number, intent: AgentIntent): Promise<void> {
  if (!intent.coin || intent.action === 'clarify') return;

  await saveChatContext(chatId, {
    lastCoin: intent.coin,
    lastAction: intent.action,
    lastDepth: intent.depth,
    lastPositionAge: intent.positionAge,
    updatedAt: new Date().toISOString(),
  });
}
