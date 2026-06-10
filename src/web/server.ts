import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DEFAULT_PORT, GITHUB_REPO_URL } from './constants';

let landingTemplate: string | null = null;

function landingPath(): string {
  return join(process.cwd(), 'public', 'landing.html');
}

function loadLandingTemplate(): string {
  if (landingTemplate) return landingTemplate;

  const path = landingPath();
  if (!existsSync(path)) {
    throw new Error(`Landing page not found: ${path}`);
  }

  landingTemplate = readFileSync(path, 'utf8');
  return landingTemplate;
}

function renderLanding(): string {
  const telegramUrl = process.env.TELEGRAM_BOT_URL?.trim() ?? '';
  const hasTelegram = telegramUrl.length > 0 && telegramUrl !== '#';

  if (!hasTelegram) {
    console.warn('[Web] TELEGRAM_BOT_URL not set — CTA disabled on landing page');
  }

  return loadLandingTemplate()
    .replaceAll('__TELEGRAM_BOT_URL__', hasTelegram ? telegramUrl : '#')
    .replaceAll(
      '__TELEGRAM_CTA_CLASS__',
      hasTelegram ? '' : 'disabled'
    )
    .replaceAll('__GITHUB_REPO_URL__', GITHUB_REPO_URL);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url?.split('?')[0] ?? '/';

  if (req.method === 'GET' && url === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    try {
      const html = renderLanding();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      console.error('[Web] failed to render landing:', err);
      sendJson(res, 500, { error: 'landing_unavailable' });
    }
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

export function startWebServer(): void {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const safePort = Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT;

  const server = createServer(handleRequest);

  server.listen(safePort, '0.0.0.0', () => {
    console.log(`[Web] landing http://0.0.0.0:${safePort}`);
  });

  server.on('error', (err) => {
    console.error('[Web] server error:', err);
  });
}
