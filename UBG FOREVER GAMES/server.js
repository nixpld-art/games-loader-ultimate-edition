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

const https = require('https');

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/game-proxy?url=')) {
    const targetUrl = decodeURIComponent(req.url.replace('/game-proxy?url=', ''));
    if (!targetUrl.startsWith('http')) { res.writeHead(400); res.end('Bad request'); return; }
    https.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (proxyRes) => {
      let data = '';
      proxyRes.on('data', c => data += c);
      proxyRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
        res.end(data);
      });
    }).on('error', () => { res.writeHead(502); res.end('Proxy error'); });
    return;
  }

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

  if (req.method === 'POST' && req.url === '/broadcast') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            fs.writeFileSync(path.join(ROOT, 'broadcast.json'), JSON.stringify({
                text: data.text,
                admin: data.admin,
                timestamp: Date.now()
            }), 'utf8');
            res.writeHead(200); res.end('OK');
        } catch (e) { res.writeHead(400); res.end(e.message); }
    });
    return;
  }
  
  if (req.method === 'POST' && req.url === '/delete-game') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            const gamesJsonPath = path.join(ROOT, 'games-data.json');
            let games = JSON.parse(fs.readFileSync(gamesJsonPath, 'utf8'));
            games = games.filter(g => g.f !== data.filename);
            fs.writeFileSync(gamesJsonPath, JSON.stringify(games), 'utf8');
            
            const filePath = path.join(ROOT, data.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            
            res.writeHead(200); res.end(JSON.stringify({success: true}));
        } catch (e) { res.writeHead(400); res.end(e.message); }
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