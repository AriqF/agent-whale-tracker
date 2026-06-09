import TelegramBot from 'node-telegram-bot-api';
import { runAgent } from '../agent';
import { parseSlashCommandArgs } from '../agent/intentParser';
import { isChatAllowed } from './access';
import { escapeMarkdown, inlineCode } from '../utils/markdown';
import type { RunAgentOptions } from '../types';

function isAllowed(chatId: number): boolean {
  return isChatAllowed(chatId);
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
  await bot.sendChatAction(chatId, 'typing').catch(() => {});

  console.log(`QUERY ${chatId}: ${query}`, options ?? {});

  const loadingMsg = await bot.sendMessage(chatId, '👁️ Mengintai pergerakan\\.\\.\\.', {
    parse_mode: 'MarkdownV2',
  });

  try {
    const result = await runAgent(query, { ...options, chatId });

    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

    try {
      await bot.sendMessage(chatId, result, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      });
    } catch (sendErr) {
      console.error('MarkdownV2 send failed, retrying plain text:', sendErr);
      await bot.sendMessage(chatId, result.replace(/\\/g, ''), {
        disable_web_page_preview: true,
      });
    }
  } catch (err) {
    console.error('Handler error:', err);
    try {
      await bot.editMessageText('❌ Gagal memproses permintaan\\. Coba lagi\\.', {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'MarkdownV2',
      });
    } catch (editErr) {
      console.error('Failed to edit loading message:', editErr);
      await bot
        .sendMessage(chatId, '❌ Gagal memproses permintaan. Coba lagi.', {
          disable_web_page_preview: true,
        })
        .catch(() => {});
    }
  }
}

async function handleSlashCommand(bot: TelegramBot, chatId: number, text: string): Promise<void> {
  const { coin, action, positionAge } = parseSlashCommandArgs(text);
  if (!coin) {
    await bot.sendMessage(
      chatId,
      escapeMarkdown('Sebutkan coin-nya. Contoh: /signal BTC, /trend PENGU 7d, /positions ETH intraday'),
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }

  await sendAgentReply(bot, chatId, text, {
    coin,
    action,
    cohortFocus: 'all',
    depth: 'full',
    positionAge,
    chatId,
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
        '/signal \\[coin\\] \\[timeframe\\] — snapshot bias whale \\(default 24h\\)\n' +
        '/positions \\[coin\\] \\[timeframe\\] — detail entry, PnL, liq cluster\n' +
        '/trend \\[coin\\] \\[timeframe\\] — trend bias \\(24h, 7d, 30d, intraday, swing\\)\n' +
        '/top — top trader leaderboard\n' +
        '/help — panduan lengkap\n\n' +
        '*Atau tanya natural:*\n' +
        '_"Brief position BTC"_ → positions \\(ringkas\\)\n' +
        '_"Momentum trend ETH gimana?"_ → trend\n' +
        '_"Trend PENGU untuk scalping"_ → trend 24 jam\n' +
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
        '• `/signal {coin} [timeframe]` — bias agregat cohort \\(default 24h\\)\n' +
        '• `/positions {coin} [timeframe]` — entry price, dominasi, top wallet\n' +
        '• `/trend {coin} [timeframe]` — momentum akumulasi/distribusi\n' +
        '• Timeframe: `24h`, `7d`, `30d`, `intraday`, `swing` \\(min granularitas API: 24 jam\\)\n\n' +
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

  bot.onText(/\/signal(?:@\w+)?(?:\s+\S+){0,2}/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await ensureAllowed(bot, chatId))) return;
    await handleSlashCommand(bot, chatId, msg.text ?? '');
  });

  bot.onText(/\/trend(?:@\w+)?(?:\s+\S+){0,2}/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await ensureAllowed(bot, chatId))) return;
    await handleSlashCommand(bot, chatId, msg.text ?? '');
  });

  bot.onText(/\/positions?(?:@\w+)?(?:\s+\S+){0,2}/i, async (msg) => {
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
      chatId,
    });
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text?.startsWith('/')) return;
    if (!msg.text) return;
    if (!(await ensureAllowed(bot, chatId))) return;

    try {
      await sendAgentReply(bot, chatId, msg.text);
    } catch (err) {
      console.error('Unhandled message handler error:', err);
    }
  });

  bot.on('polling_error', (err) => {
    console.error('Polling error:', err);
  });
}
