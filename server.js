const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

let GAMES_DATA = [];
try {
  const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'games-data.json'), 'utf8'));
  const pg = JSON.parse(fs.readFileSync(path.join(ROOT, 'pizza-games.json'), 'utf8'));
  GAMES_DATA = gd.map(function(g,i){return {id:'local_'+i,title:g.t||g.f,cat:g.c||'Other',url:g.f.replace(/ /g,'%20'),local:true};});
  pg.forEach(function(g,i){GAMES_DATA.push({id:'pizza_'+i,title:g.n,cat:g.c||'Web',url:g.u,external:true});});
} catch(e) { console.error('Failed to load game data:', e.message); }

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
  '.mjs': 'application/javascript',
  '.m3u8': 'application/x-mpegURL',
  '.ts': 'video/MP2T',
};

let ytSearch = null;
try { ytSearch = require('yt-search'); } catch (e) { console.log('yt-search not available, music search disabled'); }

function sanitizeUrl(raw) {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) return null;
    return parsed.href;
  } catch { return null; }
}

function proxyFetch(url, redirects) {
  redirects = redirects || 0;
  if (redirects > 5) return Promise.reject(new Error('Too many redirects'));
  const sanitized = sanitizeUrl(url);
  if (!sanitized) return Promise.reject(new Error('Invalid URL'));
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(sanitized);
    const opts = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 30000,
    };
    if (targetUrl.protocol === 'https:' || targetUrl.port === '443') opts.port = 443;
    const lib = targetUrl.protocol === 'https:' ? https : http;
    const req = lib.request(opts, (proxyRes) => {
      var status = proxyRes.statusCode;
      if (status >= 300 && status < 400 && proxyRes.headers.location) {
        var redirectUrl = proxyRes.headers.location;
        try { redirectUrl = new URL(redirectUrl, sanitized).href; } catch(e) {}
        proxyFetch(redirectUrl, redirects + 1).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = proxyRes.headers['content-type'] || '';
        resolve({
          status: status,
          headers: proxyRes.headers,
          contentType,
          buffer,
          text: buffer.toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function rewriteHtml(html, targetUrl, proxyBase) {
  const proxyUrl = (u) => {
    try { return proxyBase + encodeURIComponent(new URL(u, targetUrl).href); } catch { return u; }
  };

  html = html.replace(
    /(<(?:a|img|script|link|iframe|source|video|audio|form)\s[^>]*?)(href|src|action)=("|')((?![a-zA-Z]*:|\/\/|#|data:|javascript:|mailto:|tel:|blob:)[^"']+)("|')/gi,
    (match, before, attr, q, url, q2) => before + attr + '=' + q + proxyUrl(url) + q2
  );

  html = html.replace(
    /(<(?:a|img|script|link|iframe|source|video|audio|form)\s[^>]*?)(href|src|action)=("|')(\/\/[^"']+)("|')/gi,
    (match, before, attr, q, url, q2) => before + attr + '=' + q + proxyUrl('https:' + url) + q2
  );

  html = html.replace(/url\(("|')((?:[^"']+))("|')\)/gi, (m, q1, url, q2) => {
    if (url.startsWith('data:') || url.startsWith('#')) return m;
    return 'url(' + q1 + proxyUrl(url) + q2 + ')';
  });

  const baseHref = targetUrl.replace(/[^/]*$/, '');
  html = html.replace('</head>',
    '<base href="' + baseHref + '">' +
    '<script>var PB=' + JSON.stringify(proxyBase) + ';function p(u){return PB+encodeURIComponent(u)};function a(u){try{return new URL(u,document.baseURI).href}catch(e){return u}};function n(u){if(!u||typeof u!="string")return false;if(u.indexOf("data:")===0||u.indexOf("javascript:")===0)return false;var f=a(u);if(f.indexOf(PB)===0)return false;try{var v=new URL(f);if(v.origin===location.origin)return false;if(v.protocol!=="http:"&&v.protocol!=="https:")return false}catch(e){return false};return true};var nf=window.fetch;window.fetch=function(i,init){var r=(i instanceof Request)?i:new Request(i,init);if(!r.url||!n(r.url))return nf.call(window,r);return nf.call(window,new Request(p(r.url),r))};var XHR=window.XMLHttpRequest;var _o=XHR.prototype.open;XHR.prototype.open=function(m,u){if(n(u))u=p(u);return _o.call(this,m,u)};document.addEventListener("click",function(e){var a=e.target.closest("a");if(a&&a.href&&n(a.href)&&!a.hasAttribute("download")&&!e.ctrlKey&&!e.metaKey){e.preventDefault();location.href=p(a.href)}},true);(function(){var _loc=window.location;try{var _lp=Object.getPrototypeOf?Object.getPrototypeOf(_loc):Location.prototype;var _hd=Object.getOwnPropertyDescriptor(_lp,"href");if(_hd&&_hd.set){var _osh=_hd.set;Object.defineProperty(window,"location",{get:function(){return _loc},set:function(u){if(typeof u==="string"&&n(u)){_osh.call(_loc,p(u))}else{_osh.call(_loc,u)}},configurable:true})}}catch(e){}})();try{var _ps=history.pushState;var _rs=history.replaceState;history.pushState=function(d,un,u){if(u&&n(u))u=p(u);return _ps.call(this,d,un,u)};history.replaceState=function(d,un,u){if(u&&n(u))u=p(u);return _rs.call(this,d,un,u)}}catch(e){}<\/script>' +
    '</head>'
  );

  return html;
}

function rewriteJs(js, targetUrl, proxyBase) {
  const targetOrigin = (() => { try { return new URL(targetUrl).origin; } catch { return ''; } })();
  if (!targetOrigin) return js;
  const escaped = targetOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp("(['\"])(" + escaped + "[^'\"]*)(['\"])", 'gi');
  js = js.replace(re, (m, q1, url, q2) => {
    try {
      const u = new URL(url);
      if (u.origin === targetOrigin) return q1 + proxyBase + encodeURIComponent(url) + q2;
    } catch {}
    return m;
  });
  return js;
}

function cssRewriteUrls(css, proxyBase, targetUrl) {
  const cssProxyUrl = (url) => {
    try { return proxyBase + encodeURIComponent(new URL(url, targetUrl).href); } catch { return url; }
  };
  css = css.replace(/url\(("|')((?:[^"']+))("|')\)/gi, (m, q1, url, q2) => {
    if (url.startsWith('data:') || url.startsWith('#')) return m;
    return 'url(' + q1 + cssProxyUrl(url) + q2 + ')';
  });
  css = css.replace(/url\(([^"'(][^"'\s)]*)\)/gi, (m, url) => {
    if (url.startsWith('data:') || url.startsWith('#')) return m;
    return 'url(' + cssProxyUrl(url) + ')';
  });
  css = css.replace(/@import\s+(?:url\(["']?([^"')]+)["']?\)|["']([^"']+)["'])/g, (m, url1, url2) => {
    const url = url1 || url2;
    if (url.startsWith('data:') || url.startsWith('#')) return m;
    return '@import "' + cssProxyUrl(url) + '"';
  });
  return css;
}

/* ===== Local Jarvis AI ===== */
var _jarvisAdded = {}; /* track games added this session */

/* Pre-built collection of games for suggested additions */
var KNOWN_GAMES = [
  {title:"Slope",url:"https://slope-game.com"}, {title:"Run 3",url:"https://run-3.io"}, {title:"1v1.LOL",url:"https://1v1.lol"}, {title:"Shell Shockers",url:"https://shellshock.io"}, {title:"Among Us Online",url:"https://among.us"}, {title:"Papa's Pizzeria",url:"https://papaspizzeria.com"}, {title:"Temple Run",url:"https://templerun.com"}, {title:"Subway Surfers",url:"https://subwaysurfers.com"}, {title:"Retro Bowl",url:"https://retrobowl.me"}, {title:"Moto X3M",url:"https://motox3m.com"}, {title:"Fireboy and Watergirl",url:"https://fireboywatergirl.com"}, {title:"Geometry Dash",url:"https://geometry-dash.io"}, {title:"Drift Boss",url:"https://driftboss.io"}, {title:"Crossy Road",url:"https://crossyroad.com"}, {title:"Happy Wheels",url:"https://happywheels.com"}, {title:"Basketball Stars",url:"https://basketballstars.io"}, {title:"Bottle Flip",url:"https://bottleflip.com"}, {title:"Doodle Jump",url:"https://doodlejump.io"}, {title:"Cookie Clicker",url:"https://cookieclicker.com"}, {title:"Cut the Rope",url:"https://cuttherope.net"}, {title:"World's Hardest Game",url:"https://worldshardestgame.com"}, {title:"Snake",url:"https://snake.io"}, {title:"Agar.io",url:"https://agar.io"}, {title:"Slither.io",url:"https://slither.io"}, {title:"Diep.io",url:"https://diep.io"}, {title:"2048",url:"https://2048game.com"}, {title:"Flappy Bird",url:"https://flappybird.io"}, {title:"Color Switch",url:"https://colorswitch.com"}, {title:"Stack",url:"https://stackgame.io"}, {title:"Helix Jump",url:"https://helixjump.io"}
];

function jarvisProcess(text, gameCount) {
  var lower = text.toLowerCase().trim();
  var actions = [];
  var response = '';

  /* Helper: extract quoted text */
  function extractQuoted(str) {
    var m = str.match(/(?:"|')([^"']+)(?:"|')/);
    return m ? m[1] : null;
  }

  /* ===== ADD GAMES ===== */
  if ((lower.indexOf('add') >= 0 && lower.indexOf('game') >= 0) || lower.indexOf('new game') >= 0 || lower === 'more games') {
    var num = 5;
    var numMatch = lower.match(/(\d+)/);
    if (numMatch) num = parseInt(numMatch[1]);
    num = Math.min(Math.max(num, 1), 50);
    var added = 0, addedNames = [];
    for (var i = 0; i < KNOWN_GAMES.length && added < num; i++) {
      var g = KNOWN_GAMES[i];
      var already = _jarvisAdded[g.title.toLowerCase()];
      for (var j = 0; j < GAMES_DATA.length && !already; j++) {
        if ((GAMES_DATA[j].title || '').toLowerCase().indexOf(g.title.toLowerCase()) >= 0) already = true;
      }
      if (!already) {
        _jarvisAdded[g.title.toLowerCase()] = true;
        actions.push('ADD_GAME: {"title":"' + g.title + '","url":"' + g.url + '"}');
        added++; addedNames.push(g.title);
      }
    }
    if (added > 0) response = 'Added ' + added + ' new game' + (added > 1 ? 's' : '') + '. ' + addedNames.join(', ') + '. ' + (num > added ? 'Only ' + added + ' were new in catalog. ' : '') + 'They proxy through the site.';
    else response = 'All games from my catalog are already on the site. Try asking for something specific.';
  }

  /* ===== REMOVE/DELETE GAME ===== */
  else if (lower.indexOf('remove') >= 0 || lower.indexOf('delete') >= 0) {
    var target = extractQuoted(text);
    if (!target) {
      var m = lower.match(/(?:remove|delete)\s+(\w+(?:\s+\w+){0,4})/);
      if (m) target = m[1].trim();
    }
    if (target) { actions.push('REMOVE_GAME: ' + target); response = 'Removing games matching "' + target + '".'; }
    else response = 'Tell me what to remove. Example: "remove slope" or "delete game X".';
  }

  /* ===== BROADCAST ===== */
  else if (lower.indexOf('broadcast') >= 0 || (lower.indexOf('send') >= 0 && (lower.indexOf('message') >= 0 || lower.indexOf('alert') >= 0))) {
    var msg = extractQuoted(text);
    if (!msg) { var m = lower.match(/(?:broadcast|send\s*(?:a\s*)?(?:message|alert))(?:\s*:\s*|\s+)(.+)/); if (m) msg = m[1].trim(); }
    if (msg) { actions.push('BROADCAST: ' + msg); response = 'Broadcasting: "' + msg + '"'; }
    else response = 'What should I broadcast? Example: broadcast: "Site back online" or send alert "maintenance done".';
  }

  /* ===== SETTINGS / APPEARANCE ===== */
  else if (lower.indexOf('color') >= 0 || lower.indexOf('theme') >= 0 || lower.indexOf('accent') >= 0 || lower.indexOf('appearance') >= 0) {
    var colorMap = {red:'#ef4444',blue:'#2563eb',cyan:'#06b6d4',green:'#10b981',yellow:'#f59e0b',purple:'#8b5cf6',pink:'#ec4899',indigo:'#6366f1',orange:'#f97316',teal:'#14b8a6'};
    var found = null;
    for (var c in colorMap) { if (lower.indexOf(c) >= 0) { found = colorMap[c]; break; } }
    if (lower.indexOf('stealth') >= 0) { actions.push('SETTINGS: {"stealth":true}'); response = 'Stealth mode activated. Tab disguised as Google Drive.'; }
    else if (lower.indexOf('compact') >= 0) { actions.push('SETTINGS: {"compactGrid":true}'); response = 'Compact grid enabled.'; }
    else if (found) { actions.push('SETTINGS: {"accent":"' + found + '"}'); response = 'Accent color changed to ' + c + '.'; }
    else response = 'Available colors: blue, cyan, green, yellow, purple, pink, red, indigo, orange, teal. Also try "stealth mode" or "compact grid".';
  }

  /* ===== PROXY ===== */
  else if (lower.indexOf('proxy') >= 0 && (lower.indexOf('mode') >= 0 || lower.indexOf('switch') >= 0 || lower.indexOf('change') >= 0)) {
    var pm = lower.indexOf('server') >= 0 ? 'server' : (lower.indexOf('direct') >= 0 ? 'direct' : null);
    if (pm) { actions.push('SETTINGS: {"proxy":"' + pm + '"}'); response = 'Proxy switched to ' + pm + ' mode.'; }
    else response = 'Proxy modes: "server" (rewrites pages) or "direct" (no rewrite). Default is server.';
  }

  /* ===== USERS / ROLES ===== */
  else if (lower.indexOf('make') >= 0 && (lower.indexOf('admin') >= 0 || lower.indexOf('mod') >= 0)) {
    var targetUser = extractQuoted(text);
    if (!targetUser) { var m = lower.match(/(?:make|set)\s+(\w+)\s+(admin|mod)/); if (m) targetUser = m[1]; }
    var role = lower.indexOf('admin') >= 0 ? 'admin' : 'mod';
    if (targetUser) { actions.push('SET_ROLE: {"user":"' + targetUser.toLowerCase() + '","role":"' + role + '"}'); response = 'Set ' + targetUser + ' as ' + role + '.'; }
    else response = 'Who should I promote? Example: "make john admin" or "set jane as mod".';
  }

  else if (lower.indexOf('ban') >= 0 || lower.indexOf('kick') >= 0 || lower.indexOf('remove') >= 0) {
    var banTarget = extractQuoted(text);
    if (!banTarget) { var m = lower.match(/(?:ban|kick|remove)\s+(\w+)/); if (m) banTarget = m[1]; }
    if (banTarget) response = 'Banning requires manual confirmation. Go to Admin > Users to manage ' + banTarget + '.';
    else response = 'Who do you want to manage? Example: "ban baduser".';
  }

  /* ===== MUSIC ===== */
  else if (lower.indexOf('music') >= 0 || lower.indexOf('song') >= 0 || lower.indexOf('play') >= 0) {
    if (lower.indexOf('stop') >= 0 || lower.indexOf('pause') >= 0) { response = 'Music paused. Use the music player in the navbar to control playback.'; }
    else if (lower.indexOf('volume') >= 0) { var vm = lower.match(/volume\s*(\d+)/); if (vm) response = 'Set volume to ' + vm[1] + '%. Use the music player in the navbar.'; else response = 'Use the music player in the navbar to adjust volume.'; }
    else response = 'Use the music player in the navbar to search and play songs. I can\'t play audio directly.';
  }

  /* ===== PANIC ===== */
  else if (lower.indexOf('panic') >= 0) {
    response = 'Panic mode triggers when you press the backslash key (\\\\) — it redirects to Google Classroom. You can toggle this in Settings.';
  }

  /* ===== ANALYTICS / STATS ===== */
  else if (lower.indexOf('analytics') >= 0 || lower.indexOf('stats') >= 0 || lower.indexOf('statistics') >= 0) {
    response = 'Analytics: ' + gameCount + ' games. Sessions tracked. Open Admin > Analytics for full stats.';
  }

  /* ===== SESSIONS ===== */
  else if (lower.indexOf('session') >= 0 || lower.indexOf('who') >= 0 || lower.indexOf('online') >= 0) {
    response = 'Active users are tracked in Admin > Sessions. I can\'t see live data from here.';
  }

  /* ===== DEBUG / DIAGNOSE ===== */
  else if (lower.indexOf('debug') >= 0 || lower.indexOf('diagnose') >= 0 || lower.indexOf('fix') >= 0 || lower.indexOf('issue') >= 0 || lower.indexOf('broken') >= 0) {
    response = 'Diagnostics: Server online. ' + gameCount + ' games loaded. Proxy active. Broadcast system ready. Core files OK. No errors detected. If something is broken, describe the problem.';
  }

  /* ===== STATUS ===== */
  else if (lower.indexOf('status') >= 0 || lower.indexOf('health') >= 0 || lower.indexOf('how many') >= 0 || lower.indexOf('running') >= 0) {
    response = 'Cache is healthy. ' + gameCount + ' games loaded. Proxy online. Admin panel accessible. All systems operational.';
  }

  /* ===== HELP ===== */
  else if (lower === 'help' || lower.indexOf('commands') >= 0 || lower.indexOf('what can') >= 0 || lower.indexOf('capabilities') >= 0 || lower.indexOf('what do') >= 0) {
    response = 'I can manage the website. Try:\n- "add 10 games" — add new games\n- "remove [name]" — delete games\n- "broadcast: message" — send alerts\n- "make john admin" — set roles\n- "blue theme" — change colors\n- "stealth mode" — disguise tab\n- "proxy server" — switch proxy\n- "debug" — check health\n- "status" — site info\n- "panic" — about panic mode';
  }

  /* ===== GREETINGS ===== */
  else if (lower.indexOf('hi') === 0 || lower.indexOf('hello') === 0 || lower.indexOf('hey') === 0 || lower.indexOf('yo') === 0 || lower.indexOf('sup') === 0 || lower.indexOf('good') >= 0 || lower.indexOf('morning') >= 0 || lower.indexOf('evening') >= 0 || lower.indexOf('afternoon') >= 0) {
    response = 'Hey admin. ' + gameCount + ' games loaded, all systems green. What do you need?';
  }

  /* ===== THANKS ===== */
  else if (lower.indexOf('thanks') >= 0 || lower.indexOf('thank') >= 0 || lower.indexOf('good job') >= 0 || lower.indexOf('nice') >= 0) {
    response = 'You\'re welcome. Anything else for the site?';
  }

  /* ===== WHO ARE YOU ===== */
  else if (lower.indexOf('who are you') >= 0 || lower.indexOf('what are you') >= 0 || lower.indexOf('your name') >= 0) {
    response = 'I\'m Jarvis, the admin AI for this Cache website. I handle game management, user roles, settings, broadcasts, and site diagnostics.';
  }

  /* ===== RANDOM / FUN ===== */
  else if (lower.indexOf('joke') >= 0 || lower.indexOf('funny') >= 0) {
    var jokes = ['Why did the admin clear the cache? Because it was full of cookies!', 'What do you call a website that never loads? A procrastination station.', 'Why did the game developer go broke? Because he used up all his cache!', 'How many admins does it take to change a light bulb? None, the proxy rewrites the light!'];
    response = jokes[Math.floor(Math.random() * jokes.length)];
  }

  /* ===== PRAISE / COMPLIMENT ===== */
  else if (lower.indexOf('good') >= 0 || lower.indexOf('great') >= 0 || lower.indexOf('awesome') >= 0 || lower.indexOf('amazing') >= 0) {
    response = 'Thanks! The site has ' + gameCount + ' games and a solid proxy. Let me know what you want to do.';
  }

  /* ===== FAREWELL ===== */
  else if (lower.indexOf('bye') >= 0 || lower.indexOf('goodbye') >= 0 || lower.indexOf('see you') >= 0 || lower.indexOf('later') >= 0) {
    response = 'Goodbye. Site is running smoothly with ' + gameCount + ' games.';
  }

  /* ===== YES / NO / CONFIRM ===== */
  else if (lower === 'yes' || lower === 'yeah' || lower === 'yep' || lower === 'sure' || lower === 'ok' || lower === 'okay') {
    response = 'What should I do? Give me a command like "add 5 games" or "status".';
  }
  else if (lower === 'no' || lower === 'nope' || lower === 'nah') {
    response = 'Alright. Let me know if you need anything.';
  }

  /* ===== WHAT / WHY / HOW ===== */
  else if (lower.indexOf('what') >= 0 && lower.indexOf('this') >= 0) {
    response = 'This is the Cache admin panel. I\'m Jarvis, your site AI. Try "help" to see what I can do.';
  }

  /* ===== UNKNOWN ===== */
  else {
    var fallbacks = [
      'Not sure what you mean. Try "help" for commands, or just tell me what you want to do with the site.',
      'I don\'t understand that. Available commands: add/remove games, broadcast, change settings, debug, status. Say "help" for details.',
      'Hmm, I can\'t do that directly. Try: add games, broadcast a message, change colors, manage users, or check status.',
      'I\'m not sure how to handle that. Try something like "add 5 games" or "broadcast: hello everyone".'
    ];
    response = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  var result = response;
  if (actions.length > 0) result += '\n' + actions.join('\n');
  return result;
}

function loadApiKey() {
  try {
    var raw = fs.readFileSync(path.join(ROOT, 'api-key.txt'), 'utf8').trim();
    if (raw.indexOf('[ENC]') === 0) return Buffer.from(raw.slice(5), 'base64').toString('utf8');
    return raw;
  } catch(e) { return ''; }
}

function saveApiKey(key) {
  try { fs.writeFileSync(path.join(ROOT, 'api-key.txt'), '[ENC]' + Buffer.from(key, 'utf8').toString('base64'), 'utf8'); } catch(e) {}
}

var _lastWorkingModel = null;

function delay(ms) { return new Promise(function(r){setTimeout(r, ms)}); }

async function callOpenRouter(messages, apiKey, origin) {
  var paidModels = apiKey ? ['openai/gpt-4o-mini'] : [];
  var freeModels = [
    'tencent/hy3:free', 'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen3-coder:free',
    'liquid/lfm-2.5-1.2b-instruct:free', 'nousresearch/hermes-3-llama-3.1-405b:free',
    'nvidia/nemotron-3-nano-30b-a3b:free', 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free'
  ];
  var models = paidModels.concat(freeModels);
  if (_lastWorkingModel) {
    var idx = models.indexOf(_lastWorkingModel);
    if (idx > 0) { models.splice(idx, 1); models.unshift(_lastWorkingModel); }
  }
  for (var mi = 0; mi < models.length; mi++) {
    try {
      if (mi > 0) await delay(1500);
      const ac = new AbortController();
      setTimeout(function(){try{ac.abort()}catch(e){}}, 30000);
      var headers = { 'Content-Type': 'application/json', 'HTTP-Referer': 'http://localhost:8080', 'X-Title': 'Cache' };
      if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: headers,
        body: JSON.stringify({ model: models[mi], messages: messages, max_tokens: 512, temperature: 0.7 }),
        signal: ac.signal,
      });
      if (res.ok) {
        const d = await res.json();
        var r = d.choices?.[0]?.message?.content?.trim() || null;
        if (r) { _lastWorkingModel = models[mi]; return r; }
      } else if (res.status === 429) { continue; }
    } catch(e) { continue; }
  }
  return null;
}

async function askAI(messages, origin) {
  var apiKey = loadApiKey();
  var reply = await callOpenRouter(messages, apiKey, origin);
  if (reply) return reply;

  /* Fall back to local Jarvis */
  var userMsg = messages.filter(function(m) { return m.role === 'user'; }).pop();
  if (!userMsg || !userMsg.content) return null;
  return jarvisProcess(userMsg.content, GAMES_DATA ? GAMES_DATA.length : 0);
}

console.log('Starting from:', ROOT);

function siteOrigin(req) {
  var proto = req.headers['x-forwarded-proto'] || 'http';
  var host = req.headers.host || ('localhost:' + ACTUAL_PORT);
  return proto + '://' + host;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const fullUrl = req.url;
  var origin = siteOrigin(req);

  /* ── API: Version ── */
  if (url === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: '4.1.0', build: Date.now().toString(36).toUpperCase(), app: 'Cache' }));
    return;
  }

  /* ── API: Music Search ── */
  if (url.startsWith('/api/music/search') && ytSearch) {
    const q = new URL(fullUrl, origin).searchParams.get('q');
    if (!q || q.trim().length === 0) { res.writeHead(400); res.end(JSON.stringify({ error: 'Query required' })); return; }
    try {
      const results = await ytSearch(q.trim());
      const videos = (results.videos || []).slice(0, 12).map(v => ({
        id: v.videoId,
        title: v.title,
        thumbnail: v.thumbnail || 'https://i.ytimg.com/vi/' + v.videoId + '/mqdefault.jpg',
        duration: v.timestamp || '0:00',
        author: v.author?.name || 'Unknown',
        url: v.url,
        views: v.views
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: videos }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
    return;
  }

  /* ── API: Cache AI (public chat, no commands) ── */
  if (req.method === 'POST' && url === '/api/ai/cache') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const messages = data.messages || [];
        var apiKey = loadApiKey();
        var cacheModels = [
          'tencent/hy3:free', 'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free',
          'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen3-coder:free',
          'liquid/lfm-2.5-1.2b-instruct:free', 'nousresearch/hermes-3-llama-3.1-405b:free',
          'nvidia/nemotron-3-nano-30b-a3b:free'
        ];
        if (apiKey) cacheModels.unshift('openai/gpt-4o-mini');
        if (_lastWorkingModel && _lastWorkingModel !== cacheModels[0]) {
          var ci = cacheModels.indexOf(_lastWorkingModel);
          if (ci > 0) { cacheModels.splice(ci, 1); cacheModels.unshift(_lastWorkingModel); }
        }
        var reply = null;
        for (var mi = 0; mi < cacheModels.length; mi++) {
          var model = cacheModels[mi];
          try {
            if (mi > 0) await delay(1500);
            const ac = new AbortController();
            setTimeout(function(){try{ac.abort()}catch(e){}}, 30000);
      var headers = { 'Content-Type': 'application/json', 'HTTP-Referer': origin || 'http://localhost:8080', 'X-Title': 'Cache' };
            if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
            const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST', headers: headers,
              body: JSON.stringify({ model: model, messages: messages, max_tokens: 512, temperature: 0.7 }),
              signal: ac.signal,
            });
            if (orRes.ok) {
              const d = await orRes.json();
              var r = d.choices?.[0]?.message?.content?.trim() || null;
              if (r) { _lastWorkingModel = model; reply = r; break; }
            } else if (orRes.status === 429) { continue; }
          } catch(e) { continue; }
        }
        if (reply) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply } }] })); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Cache AI is unavailable — no free models responded. Try again later or set an OpenRouter API key in Admin > Appearance.' } }] }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  /* ── API: Jarvis AI (admin, with commands) ── */
  if (req.method === 'POST' && url === '/api/ai/chat') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const messages = data.messages || [];
        const reply = await askAI(messages, origin);
        if (reply) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply } }] }));
        } else {
          res.writeHead(503);
          res.end(JSON.stringify({ error: 'AI backend unavailable' }));
        }
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  /* ── Enhanced Proxy (GET) ── */
  if (url.startsWith('/api/proxy/')) {
    const encoded = url.replace('/api/proxy/', '');
    if (!encoded) { res.writeHead(400); res.end('Missing URL'); return; }
    try {
      const targetUrl = decodeURIComponent(encoded);
      const sanitized = sanitizeUrl(targetUrl);
      if (!sanitized) { res.writeHead(400); res.end('Invalid URL'); return; }

      const proxyBase = origin + '/api/proxy/';
      const result = await proxyFetch(sanitized);
      const ct = result.contentType;

      if (ct.includes('text/html')) {
        let html = result.text;
        html = rewriteHtml(html, sanitized, proxyBase);
        res.writeHead(result.status, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      if (ct.includes('text/css')) {
        let css = result.text;
        css = cssRewriteUrls(css, proxyBase, sanitized);
        res.writeHead(result.status, { 'Content-Type': ct });
        res.end(css);
        return;
      }

      if (ct.includes('javascript') || ct.includes('ecmascript')) {
        let js = result.text;
        js = rewriteJs(js, sanitized, proxyBase);
        res.writeHead(result.status, { 'Content-Type': ct });
        res.end(js);
        return;
      }

      const passHeaders = {};
      ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified', 'accept-ranges', 'content-range'].forEach(h => {
        const v = result.headers[h];
        if (v) passHeaders[h] = v;
      });
      res.writeHead(result.status, passHeaders);
      res.end(result.buffer);
    } catch (err) {
      res.writeHead(502);
      res.end('Proxy error: ' + err.message);
    }
    return;
  }

  /* ── Game proxy (legacy) ── */
  if (url.startsWith('/game-proxy?url=')) {
    const targetUrl = decodeURIComponent(url.replace('/game-proxy?url=', ''));
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

  /* ── Upload game ── */
  if (req.method === 'POST' && url === '/upload-game') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const filename = data.filename.replace(/[^a-zA-Z0-9_\- \(\)\.]/g, '');
        const content = data.content;
        const title = data.title || filename.replace(/\.html$/i, '');
        const category = data.category || 'Sideloaded';
        const filePath = path.join(ROOT, 'games', filename);
        fs.writeFileSync(filePath, content, 'utf8');
        const gamesJsonPath = path.join(ROOT, 'games-data.json');
        let games = [];
        try { games = JSON.parse(fs.readFileSync(gamesJsonPath, 'utf8')); } catch(e) { games = []; }
        games.push({ f: filename, t: title, s: 1000, z: Buffer.byteLength(content, 'utf8'), c: category });
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

  /* ── Broadcast ── */
  if (req.method === 'POST' && url === '/broadcast') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        fs.writeFileSync(path.join(ROOT, 'broadcast.json'), JSON.stringify({
          text: data.text, admin: data.admin, timestamp: Date.now()
        }), 'utf8');
        res.writeHead(200); res.end('OK');
      } catch (e) { res.writeHead(400); res.end(e.message); }
    });
    return;
  }

  /* ── Delete game ── */
  if (req.method === 'POST' && url === '/delete-game') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const gamesJsonPath = path.join(ROOT, 'games-data.json');
        let games = JSON.parse(fs.readFileSync(gamesJsonPath, 'utf8'));
        games = games.filter(g => g.f !== data.filename);
        fs.writeFileSync(gamesJsonPath, JSON.stringify(games), 'utf8');
        const filePath = path.join(ROOT, 'games', data.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.writeHead(200); res.end(JSON.stringify({success: true}));
      } catch (e) { res.writeHead(400); res.end(e.message); }
    });
    return;
  }

  /* ── API: AI Key ── */
  if (req.method === 'POST' && url === '/api/ai/key') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.key) { saveApiKey(data.key); res.writeHead(200); res.end(JSON.stringify({ok:true})); }
        else { res.writeHead(400); res.end(JSON.stringify({error:'key required'})); }
      } catch(e) { res.writeHead(400); res.end(JSON.stringify({error:e.message})); }
    });
    return;
  }
  if (req.method === 'GET' && url === '/api/ai/key') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    var k = loadApiKey(); res.end(JSON.stringify({ hasKey: !!k }));
    return;
  }

  /* ── Deploy to GitHub ── */
  if (req.method === 'POST' && url === '/api/deploy') {
    exec('git add -A', { cwd: ROOT }, function(err) {
      if (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'git add failed: ' + err.message })); return; }
      exec('git commit -m "Jarvis auto-deploy" --allow-empty', { cwd: ROOT }, function(err2) {
        if (err2) { res.writeHead(500); res.end(JSON.stringify({ error: 'git commit failed: ' + err2.message })); return; }
        exec('git push', { cwd: ROOT }, function(err3, stdout3) {
          if (err3) { res.writeHead(500); res.end(JSON.stringify({ error: 'git push failed' })); return; }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Deployed to GitHub' }));
        });
      });
    });
    return;
  }

  /* ── Jarvis file read ── */
  if (req.method === 'GET' && url === '/api/jarvis/read') {
    var targetPath = new URL(fullUrl, origin).searchParams.get('path') || '';
    targetPath = targetPath.replace(/\.\.\//g, '').replace(/\.\./g, '');
    var absPath = path.join(ROOT, targetPath);
    if (!absPath.startsWith(ROOT)) { res.writeHead(403); res.end(JSON.stringify({error:'Forbidden'})); return; }
    try {
      var content = fs.readFileSync(absPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: targetPath, content: content }));
    } catch(e) { res.writeHead(404); res.end(JSON.stringify({error:'File not found'})); }
    return;
  }

  /* ── Jarvis file edit (find/replace) ── */
  if (req.method === 'POST' && url === '/api/jarvis/edit') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        var data = JSON.parse(body);
        var filePath = (data.path || '').replace(/\.\.\//g, '').replace(/\.\./g, '');
        var absPath = path.join(ROOT, filePath);
        if (!absPath.startsWith(ROOT)) { res.writeHead(403); res.end(JSON.stringify({error:'Forbidden'})); return; }
        var content = fs.readFileSync(absPath, 'utf8');
        if (content.indexOf(data.find) === -1) { res.writeHead(400); res.end(JSON.stringify({error:'Text not found in file'})); return; }
        content = content.split(data.find).join(data.replace);
        fs.writeFileSync(absPath, content, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, path: filePath, info: 'Replaced "' + data.find.substring(0, 50) + '..."' }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({error:e.message})); }
    });
    return;
  }

  /* ── Play route (same-domain fullscreen game) ── */
  if (url === '/play') {
    var target = new URL(fullUrl, origin).searchParams.get('url') || '';
    if (!target) { res.writeHead(400); res.end('Missing url param'); return; }
    var decoded = decodeURIComponent(target);
    var gameUrl = decoded;
    if (gameUrl.indexOf('http') !== 0) gameUrl = 'http://' + gameUrl;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>Game</title><style>body{margin:0;background:#000;overflow:hidden}iframe{width:100vw;height:100vh;border:none}</style></head><body><iframe src="' + gameUrl.replace(/"/g, '&quot;') + '" allowfullscreen allow="autoplay;fullscreen"></iframe></body></html>');
    return;
  }

  /* ── Static file serving ── */
  let staticUrl = url;
  if (staticUrl === '/') staticUrl = '/index.html';
  const filePath = path.join(ROOT, staticUrl);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  if (staticUrl === '/index.html' && GAMES_DATA.length) {
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      const script = '<script>window.__GAMES_DATA__=' + JSON.stringify(GAMES_DATA) + ';</script>';
      html = html.replace('</head>', script + '</head>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

var ACTUAL_PORT = PORT;
function tryListen(port) {
  server.once('error', function(e) {
    if (e.code === 'EADDRINUSE') { console.log('Port ' + port + ' in use, trying ' + (port+1) + '...'); tryListen(port+1); }
    else { console.error('Server error:', e.message); process.exit(1); }
  });
  server.listen(port, '0.0.0.0', () => {
    ACTUAL_PORT = port;
    var url = 'http://localhost:' + port;
    console.log('Cache v4.0 running at ' + url);
    console.log('Proxy endpoint: ' + url + '/api/proxy/<encoded_url>');
    if (ytSearch) console.log('Music search: enabled');
    else console.log('Music search: disabled (npm install yt-search)');
    console.log('');
    console.log('>>> OPEN THIS IN YOUR BROWSER: ' + url + ' <<<');
    try { require('child_process').exec('start "" "' + url + '"'); } catch(e) {}
  });
}
tryListen(PORT);
