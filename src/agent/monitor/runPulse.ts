import type TelegramBot from 'node-telegram-bot-api';
import { getAllowedChatIds } from '../../bot/access';
import { fetchSignalData } from '../fetchSignalData';
import { loadMonitorState, saveMonitorState } from '../monitorState';
import { buildFingerprint } from './fingerprint';
import { evaluatePulse } from './evaluatePulse';
import { formatPulseAlert } from './formatAlert';

async function sendToAllowedChats(bot: TelegramBot, message: string): Promise<number> {
  const chatIds = getAllowedChatIds();
  if (!chatIds.length) {
    console.warn('[Monitor] ALLOWED_CHAT_IDS empty — skip broadcast');
    return 0;
  }

  let sent = 0;
  for (const chatId of chatIds) {
    try {
      await bot.sendMessage(chatId, message, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      });
      sent++;
    } catch (err) {
      console.error(`[Monitor] failed to send to ${chatId}:`, err);
    }
  }
  return sent;
}

export async function runPulse(bot: TelegramBot, coin: string): Promise<void> {
  const normalized = coin.toUpperCase();
  console.log(`[Monitor] tick ${normalized}`);

  const result = await fetchSignalData(normalized, 'snapshot');
  if (!result) {
    console.warn(`[Monitor] no signal data for ${normalized}`);
    return;
  }

  const next = buildFingerprint(result);
  const prev = await loadMonitorState(normalized);
  const events = evaluatePulse(prev, next);

  await saveMonitorState(normalized, next);

  if (!events.length) {
    console.log(`[Monitor] tick ${normalized} — no interesting changes`);
    return;
  }

  const message = formatPulseAlert(normalized, prev!, next, events);
  const sent = await sendToAllowedChats(bot, message);
  console.log(`[Monitor] tick ${normalized} — ${events.length} events, sent to ${sent} chats`);
}
