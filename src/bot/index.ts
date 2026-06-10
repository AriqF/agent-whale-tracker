import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { startMonitorScheduler } from '../agent/scheduler';
import { pingRedis } from '../redis/client';
import { startWebServer } from '../web/server';
import { registerHandlers } from './handlers';

startWebServer();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

const bot = new TelegramBot(token, { polling: true });

registerHandlers(bot);
startMonitorScheduler(bot);

pingRedis().then((ok) => {
  console.log(ok ? '[Redis] ping ok' : '[Redis] unavailable — stateless mode');
});

console.log('🐋 Whale Signal Bot is running...');
