import TelegramBot from 'node-telegram-bot-api';
import { runAgent } from '../agent';
import { escapeMarkdown, inlineCode } from '../utils/markdown';
import type { AgentAction, RunAgentOptions } from '../types';

/** Matches /signal eth, /signal@BotName eth, /positions eth, /position eth */
const SLASH_COIN_REGEX = /^\/(signal|trend|positions?)(?:@\w+)?(?:\s+([A-Za-z0-9_]+))?$/i;

function getAllowedChatIds(): number[] {
  const raw = process.env.ALLOWED_CHAT_IDS?.trim();
  if (!raw) return [];
  return raw.split(',').map((id) => Number(id.trim())).filter(Boolean);
}

function parseSlashCommand(text: string): { coin?: string; action?: AgentAction } {
  const match = text.trim().match(SLASH_COIN_REGEX);
  if (!match) return {};

  const cmd = match[1].toLowerCase();
  const coin = match[2]?.toUpperCase();
  const action: AgentAction =
    cmd === 'trend'
      ? 'signal_trend'
      : cmd === 'signal'
        ? 'signal_snapshot'
        : 'positions';

  return { coin, action };
}

function isAllowed(chatId: number): boolean {
  const allowed = getAllowedChatIds();
  if (allowed.length === 0) return true;
  return allowed.includes(chatId);
}

function buildWhitelistDenyMessage(chatId: number): string {
  const contact = process.env.WHITELIST_DEV_CONTACT?.trim();
  const contactLine = contact
    ? `Hubungi developer \\(${escapeMarkdown(contact)}\\) dan kirim chat ID di bawah\\.`
    : 'Hubungi developer dan kirim chat ID di bawah agar ditambahkan ke whitelist\\.';

  return [
    '⛔ *Forbidden Access*',
    '',
    'Chat ID belum whitelisted\\.',
    contactLine,
    '',
    inlineCode(String(chatId)),
  ].join('\n');
}

async function ensureAllowed(bot: TelegramBot, chatId: number): Promise<boolean> {
  if (isAllowed(chatId)) return true;
  await bot.sendMessage(chatId, buildWhitelistDenyMessage(chatId), {
    parse_mode: 'MarkdownV2',
  });
  return false;
}

async function sendAgentReply(
  bot: TelegramBot,
  chatId: number,
  query: string,
  options?: RunAgentOptions
): Promise<void> {
  bot.sendChatAction(chatId, 'typing');
  console.log(`QUERY ${chatId}: ${query}`, options ?? {});

  const loadingMsg = await bot.sendMessage(chatId, '👁️ Mengintai pergerakan\\.\\.\\.', {
    parse_mode: 'MarkdownV2',
  });

  try {
    const result = await runAgent(query, options);
    await bot.deleteMessage(chatId, loadingMsg.message_id);
    await bot.sendMessage(chatId, result, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('Handler error:', err);
    await bot.editMessageText('❌ Gagal memproses permintaan\\. Coba lagi\\.', {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'MarkdownV2',
    });
  }
}

async function handleSlashCommand(bot: TelegramBot, chatId: number, text: string): Promise<void> {
  const { coin, action } = parseSlashCommand(text);
  if (!coin) {
    await bot.sendMessage(
      chatId,
      escapeMarkdown('Sebutkan coin-nya. Contoh: /signal BTC atau /positions ETH'),
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }

  await sendAgentReply(bot, chatId, text, {
    coin,
    action,
    cohortFocus: 'all',
    depth: 'full',
  });
}

export function registerHandlers(bot: TelegramBot): void {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await ensureAllowed(bot, chatId))) return;

    bot.sendMessage(
      chatId,
      '🐋 *Whale Signal Agent*\n\n' +
        'Monitor posisi whale di Hyperliquid secara real\\-time\\.\n\n' +
        '*Perintah:*\n' +
        '/signal \\[coin\\] — snapshot bias whale\n' +
        '/positions \\[coin\\] — detail entry, PnL, liq cluster\n' +
        '/trend \\[coin\\] — trend bias 7 hari\n' +
        '/top — top trader leaderboard\n' +
        '/help — panduan lengkap\n\n' +
        '*Atau tanya natural:*\n' +
        '_"Brief position BTC"_ → positions \\(ringkas\\)\n' +
        '_"Momentum trend ETH gimana?"_ → trend\n' +
        '_"Overview BTC: bias \\+ entry whale"_ → composite briefing',
      { parse_mode: 'MarkdownV2' }
    );
  });

  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await ensureAllowed(bot, chatId))) return;

    bot.sendMessage(
      chatId,
      '*Panduan Whale Signal Agent*\n\n' +
        '*Slash commands:*\n' +
        '• `/signal {coin}` — bias agregat cohort\n' +
        '• `/positions {coin}` — entry price, dominasi, top wallet\n' +
        '• `/trend {coin}` — momentum akumulasi/distribusi\n\n' +
        '*Natural language \\(agent router\\):*\n' +
        '• _"Berikan brief position BTC"_ → positions ringkas\n' +
        '• _"Whale masuk dari harga berapa?"_ → positions\n' +
        '• _"Gimana posisi whale ETH sekarang?"_ → signal\n' +
        '• _"Momentum dan arah trend BTC"_ → trend\n' +
        '• _"Whale accumulate ETH? entry di berapa?"_ → composite briefing\n\n' +
        '⚠️ Bukan financial advice\\. DYOR\\.',
      { parse_mode: 'MarkdownV2' }
    );
  });

  bot.onText(/\/signal(?:@\w+)?(?:\s+\S+)?/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await ensureAllowed(bot, chatId))) return;
    await handleSlashCommand(bot, chatId, msg.text ?? '');
  });

  bot.onText(/\/trend(?:@\w+)?(?:\s+\S+)?/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await ensureAllowed(bot, chatId))) return;
    await handleSlashCommand(bot, chatId, msg.text ?? '');
  });

  bot.onText(/\/positions?(?:@\w+)?(?:\s+\S+)?/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await ensureAllowed(bot, chatId))) return;
    await handleSlashCommand(bot, chatId, msg.text ?? '');
  });

  bot.onText(/\/top/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await ensureAllowed(bot, chatId))) return;

    await sendAgentReply(bot, chatId, 'top trader leaderboard', {
      coin: 'BTC',
      action: 'leaderboard',
    });
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text?.startsWith('/')) return;
    if (!msg.text) return;
    if (!(await ensureAllowed(bot, chatId))) return;

    await sendAgentReply(bot, chatId, msg.text);
  });

  bot.on('polling_error', (err) => {
    console.error('Polling error:', err);
  });
}
