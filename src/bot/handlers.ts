import TelegramBot from 'node-telegram-bot-api';
import { runWhaleSignalAgent } from '../agent';
import { runPositionsReport } from '../agent/runPositionsReport';
import { escapeMarkdown } from '../utils/markdown';
import type { RunAgentOptions } from '../types';

const ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_IDS
  ? process.env.ALLOWED_CHAT_IDS.split(',').map((id) => Number(id.trim())).filter(Boolean)
  : [];

/** Matches /signal eth, /signal@BotName eth, /positions eth, /position eth */
const SLASH_COIN_REGEX = /^\/(signal|trend|positions?)(?:@\w+)?(?:\s+([A-Za-z0-9_]+))?$/i;

function parseSlashCoin(text: string): string | undefined {
  const match = text.trim().match(SLASH_COIN_REGEX);
  return match?.[2]?.toUpperCase();
}

function isAllowed(chatId: number): boolean {
  if (ALLOWED_CHAT_IDS.length === 0) return true;
  return ALLOWED_CHAT_IDS.includes(chatId);
}

async function sendAgentReply(
  bot: TelegramBot,
  chatId: number,
  query: string,
  options?: RunAgentOptions
): Promise<void> {
  bot.sendChatAction(chatId, 'typing');
  console.log(`QUERY ${chatId}: ${query}`);

  const loadingMsg = await bot.sendMessage(chatId, '🔍 Mencari para whales\\.\\.\\.', {
    parse_mode: 'MarkdownV2',
  });

  try {
    const result = await runWhaleSignalAgent(query, options);
    await bot.deleteMessage(chatId, loadingMsg.message_id);
    await bot.sendMessage(chatId, result, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('Handler error:', err);
    await bot.editMessageText('❌ Gagal mengambil data\\. Coba lagi\\.', {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'MarkdownV2',
    });
  }
}

async function sendPositionsReply(bot: TelegramBot, chatId: number, coin: string): Promise<void> {
  bot.sendChatAction(chatId, 'typing');
  console.log(`POSITIONS ${chatId}: ${coin}`);

  const loadingMsg = await bot.sendMessage(chatId, '🔍 Mencari posisi whales\\.\\.\\.', {
    parse_mode: 'MarkdownV2',
  });

  try {
    const result = await runPositionsReport(coin);
    await bot.deleteMessage(chatId, loadingMsg.message_id);
    await bot.sendMessage(chatId, result, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('Positions handler error:', err);
    await bot.editMessageText('❌ Gagal mengambil data posisi\\. Coba lagi\\.', {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'MarkdownV2',
    });
  }
}

async function sendCoinNotFoundReply(bot: TelegramBot, chatId: number): Promise<void>{
  bot.sendChatAction(chatId, 'typing');
  try {
    await bot.sendMessage(chatId, `Coin cannot be found. Is it correct ticker?`, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('Coin not found handler error:', err);
  }
}

export function registerHandlers(bot: TelegramBot): void {
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId,
      '🐋 *Whale Signal Agent*\n\n' +
        'Monitor posisi whale di Hyperliquid secara real\\-time\\.\n\n' +
        '*Perintah:*\n' +
        '/signal \\[coin\\] — snapshot posisi whale sekarang\n' +
        '/positions \\[coin\\] — detail entry, PnL, dan liq cluster\n' +
        '/trend \\[coin\\] — trend bias 7 hari terakhir\n' +
        '/top — top trader leaderboard\n' +
        '/help — panduan lengkap\n\n' +
        'Atau langsung tanya dalam bahasa natural:\n' +
        '_"Gimana posisi whale BTC sekarang?"_',
      { parse_mode: 'MarkdownV2' }
    );
  });

  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId,
      '*Panduan Whale Signal Agent*\n\n' +
        '*Perintah:*\n' +
        '• `/signal {coin}` — posisi whale {coin} sekarang\n' +
        '• `/positions {coin}` — posisi terbuka Leviathan \\+ Smart Money\n' +
        '• `/signal {coin}` — posisi whale {coin}\n' +
        '• `/trend {coin}` — trend akumulasi/distribusi\n' +
        '• `/top` — top trader by all\\-time PnL\n\n' +
        '*`/positions` vs `/signal`:* positions menampilkan entry price, PnL per wallet, dan liquidation cluster\\. Signal menampilkan bias agregat cohort\\.\n\n' +
        '*Natural language juga bisa:*\n' +
        '• _"Smart money lagi long atau short ETH?"_\n' +
        '• _"Ada divergence di BTC ga?"_\n' +
        '• _"Whale udah dari harga berapa masuk?"_\n\n' +
        '⚠️ Bukan financial advice\\. DYOR\\.',
      { parse_mode: 'MarkdownV2' }
    );
  });

  bot.onText(/\/signal(?:@\w+)?(?:\s+\S+)?/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    const coin = parseSlashCoin(msg.text ?? '');
    if (!coin) return await sendCoinNotFoundReply(bot, chatId);

    await sendAgentReply(bot, chatId, `signal ${coin}`, {
      coin,
      cohortFocus: 'all',
      mode: 'snapshot',
    });
  });

  bot.onText(/\/trend(?:@\w+)?(?:\s+\S+)?/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    const coin = parseSlashCoin(msg.text ?? '');
    if (!coin) return await sendCoinNotFoundReply(bot, chatId);

    await sendAgentReply(bot, chatId, `trend ${coin}`, {
      coin,
      cohortFocus: 'all',
      mode: 'trend',
    });
  });

  bot.onText(/\/positions?(?:@\w+)?(?:\s+\S+)?/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    const coin = parseSlashCoin(msg.text ?? '');
    if (!coin) return await sendCoinNotFoundReply(bot, chatId);

    await sendPositionsReply(bot, chatId, coin);
  });

  bot.onText(/\/top/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    bot.sendMessage(chatId, escapeMarkdown('Coming soon 🔜'), {
      parse_mode: 'MarkdownV2',
    });
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;
    if (msg.text?.startsWith('/')) return;
    if (!msg.text) return;

    await sendAgentReply(bot, chatId, msg.text);
  });

  bot.on('polling_error', (err) => {
    console.error('Polling error:', err);
  });
}
