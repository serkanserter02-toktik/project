// Yerel geliştirme / test sunucusu: Vercel'deki api/ fonksiyonlarını aynen çalıştırır ve dist/ dosyalarını sunar.
// Üretimde kullanılmaz (Vercel statik dosyaları CDN'den, api/ fonksiyonlarını kendi çalıştırır).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  const m = pathname.match(/^\/api\/([a-z]+)$/);
  if (m) {
    const file = path.join(ROOT, 'api', `${m[1]}.js`);
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    try {
      await (await import(pathToFileURL(file).href)).default(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500).end();
    }
    return;
  }
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(DIST, path.normalize(rel));
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use — a dev server may already be running. Stop it, or use another port: PORT=3001 npm run dev:server (and API_PORT=3001 npm run dev).`);
  else console.error(err);
  process.exit(1);
});
server.listen(PORT, () => console.log(`Brick Marathon dev server: http://localhost:${PORT}`));
