import type TelegramBot from 'node-telegram-bot-api';
import { runPulse } from './monitor/runPulse';

function monitorEnabled(): boolean {
  return process.env.MONITOR_ENABLED?.trim().toLowerCase() === 'true';
}

function monitorCoin(): string {
  return (process.env.MONITOR_COIN?.trim() || 'BTC').toUpperCase();
}

function monitorIntervalMs(): number {
  const hours = Number(process.env.MONITOR_INTERVAL_HOURS ?? 4);
  const safe = Number.isFinite(hours) && hours > 0 ? hours : 4;
  return safe * 3600 * 1000;
}

function monitorStartupDelayMs(): number {
  const ms = Number(process.env.MONITOR_STARTUP_DELAY_MS ?? 300_000);
  return Number.isFinite(ms) && ms >= 0 ? ms : 300_000;
}

export function startMonitorScheduler(bot: TelegramBot): void {
  if (!monitorEnabled()) {
    console.log('[Monitor] disabled (MONITOR_ENABLED != true)');
    return;
  }

  const coin = monitorCoin();
  const intervalMs = monitorIntervalMs();
  const startupDelayMs = monitorStartupDelayMs();

  const tick = () => {
    runPulse(bot, coin).catch((err) => console.error('[Monitor] tick error:', err));
  };

  setTimeout(tick, startupDelayMs);
  setInterval(tick, intervalMs);

  console.log(
    `[Monitor] scheduled coin=${coin} interval=${intervalMs / 3600_000}h startupDelay=${startupDelayMs}ms`
  );
}
