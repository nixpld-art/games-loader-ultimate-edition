const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/upload-game') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const filename = data.filename.replace(/[^a-zA-Z0-9_\- \(\)\.]/g, '');
        const content = data.content;
        const title = data.title || filename.replace(/\.html$/i, '');
        const category = data.category || 'Sideloaded';

        const filePath = path.join(ROOT, filename);
        fs.writeFileSync(filePath, content, 'utf8');

        const gamesJsonPath = path.join(ROOT, 'games-data.json');
        let games = [];
        try { games = JSON.parse(fs.readFileSync(gamesJsonPath, 'utf8')); } catch(e) { games = []; }

        const newEntry = {
          f: filename,
          t: title,
          s: 1000,
          z: Buffer.byteLength(content, 'utf8'),
          c: category
        };
        games.push(newEntry);
        fs.writeFileSync(gamesJsonPath, JSON.stringify(games), 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, url: filename }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  const filePath = path.join(ROOT, url);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});