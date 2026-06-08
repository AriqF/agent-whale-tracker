import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { registerHandlers } from './handlers';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

const bot = new TelegramBot(token, { polling: true });

registerHandlers(bot);

console.log('🐋 Whale Signal Bot is running...');
