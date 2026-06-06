import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import { registerHandlers } from './handlers';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

const bot = new TelegramBot(token, { polling: true });

registerHandlers(bot);

console.log('🐋 Whale Signal Bot is running...');
