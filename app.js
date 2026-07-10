"use strict";

/* ===== Proxy engine init ===== */
var activeProxy = null;
var proxyInitPromise = null;

async function initProxy() {
    var preferred = "server";
    try { preferred = localStorage.getItem("cache-proxy") || "server"; } catch (e) {}
    var engineMap = { server: serverProxyEngine, direct: directFallbackEngine };
    var engineOrder = [engineMap[preferred], serverProxyEngine, directFallbackEngine];
    for (var i = 0; i < engineOrder.length; i++) {
        var engine = engineOrder[i];
        if (!engine) continue;
        try { await engine.init(); activeProxy = engine; return engine; } catch (e) { console.warn("Proxy engine " + engine.id + " failed:", e); }
    }
    activeProxy = directFallbackEngine;
    return activeProxy;
}

async function ensureProxy() {
    if (activeProxy) return activeProxy;
    if (proxyInitPromise) return proxyInitPromise;
    try { proxyInitPromise = initProxy(); return await proxyInitPromise; } finally { proxyInitPromise = null; }
}

/* ===== Particle background ===== */
var canvas = document.getElementById("bg-canvas");
var ctx = canvas.getContext("2d");
var particles = [];
var mouse = { x: -999, y: -999 };
var animId;

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

var COUNT = 80, CONNECT_DIST = 140;

function initParticles() {
    particles = [];
    for (var i = 0; i < COUNT; i++) {
        particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, r: Math.random() * 2 + 1 });
    }
}
initParticles();

canvas.addEventListener("mousemove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("mouseleave", function () { mouse.x = -999; mouse.y = -999; });

function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    var r = parseInt(accent.slice(1, 3), 16);
    var g = parseInt(accent.slice(3, 5), 16);
    var b = parseInt(accent.slice(5, 7), 16);
    for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        var dx = mouse.x - p.x, dy = mouse.y - p.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180) { p.x -= dx * 0.004; p.y -= dy * 0.004; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + r + "," + g + "," + b + ",0.4)";
        ctx.fill();
        for (var j = i + 1; j < particles.length; j++) {
            var q = particles[j];
            var pdx = p.x - q.x, pdy = p.y - q.y, pd = Math.sqrt(pdx * pdx + pdy * pdy);
            if (pd < CONNECT_DIST) {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(q.x, q.y);
                ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + "," + (1 - pd / CONNECT_DIST) * 0.15 + ")";
                ctx.lineWidth = 0.6;
                ctx.stroke();
            }
        }
    }
    animId = requestAnimationFrame(drawParticles);
}
drawParticles();

/* ===== Loading screen ===== */
setTimeout(function () { document.getElementById("loading-screen").classList.add("hidden"); }, 800);

/* ===== Version info ===== */
(function () {
    fetch("/api/version").then(function (r) { return r.json(); }).then(function (d) {
        var badge = document.getElementById("versionBadge");
        if (badge) badge.textContent = "v" + d.version;
        var aboutV = document.getElementById("aboutVersion");
        if (aboutV) aboutV.textContent = d.version;
        var aboutB = document.getElementById("aboutBuild");
        if (aboutB) aboutB.textContent = d.build || "--";
    }).catch(function () { });
})();

/* ===== Broadcast Poll ===== */
setInterval(function () {
    fetch("/broadcast.json?v=" + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
        var b = document.getElementById("broadcast-banner");
        if (d && d.text && (Date.now() - d.timestamp < 5000)) {
            b.textContent = d.admin + ": " + d.text;
            b.style.display = "block";
            setTimeout(function () { b.style.display = "none"; }, 5000);
        } else { b.style.display = "none"; }
    }).catch(function () { });
}, 3000);

/* ===== Init proxy immediately ===== */
ensureProxy();

/* ===== Store ===== */
var Store = {
    get: function (k, d) { try { var v = localStorage.getItem("cache_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("cache_" + k, JSON.stringify(v)); } catch (e) { } }
};

/* ===== User Roles ===== */
function getRoles() { var r = Store.get("roles", {}); if (typeof r !== "object" || Array.isArray(r)) r = {}; return r; }
function setRoles(r) { Store.set("roles", r); }
function getUserRole(user) { if (!user) return null; var r = getRoles(); return r[user.toLowerCase()] || null; }
function setUserRole(user, role) { var r = getRoles(); if (role) r[user.toLowerCase()] = role; else delete r[user.toLowerCase()]; setRoles(r); }
function isAdmin(user) { return getUserRole(user) === "admin"; }
function isMod(user) { var r = getUserRole(user); return r === "mod" || r === "admin"; }
function currentUserRole() { return getUserRole(AppState ? AppState.user : null); }
function currentIsAdmin() { return currentUserRole() === "admin"; }
function currentIsMod() { var r = currentUserRole(); return r === "mod" || r === "admin"; }

/* ===== AppState ===== */
var AppState = {
    user: Store.get("user", null),
    favorites: Store.get("favorites", []),
    sessions: Store.get("sessions", []),
    canvas: Store.get("canvas", "Welcome to Cache"),
    analytics: Store.get("analytics", { launched: 0, sessions: 0 }),
    adminAuthed: false,
    sideloaded: Store.get("sideloaded", []),
    settings: Store.get("settings", {
        accent: "#2563eb",
        stealth: false,
        cardSize: "medium",
        animations: true,
        backslashPanic: true,
        compactGrid: false,
        lowData: false,
        showFps: false,
        font: "'Inter',sans-serif",
        wallpaper: "",
        cursor: "default"
    }),
    saveUser: function () { Store.set("user", this.user); },
    saveFavorites: function () { Store.set("favorites", this.favorites); },
    saveSessions: function () { Store.set("sessions", this.sessions); },
    saveCanvas: function () { Store.set("canvas", this.canvas); },
    saveAnalytics: function () { Store.set("analytics", this.analytics); },
    saveSideloaded: function () { Store.set("sideloaded", this.sideloaded); },
    saveSettings: function () { Store.set("settings", this.settings); },
    saveAdminAuthed: function () {},
    _save: function () {
        this.saveUser();
        this.saveFavorites();
        this.saveSessions();
        this.saveCanvas();
        this.saveAnalytics();
        this.saveSideloaded();
        this.saveSettings();
    },
    _applySettings: function () {
        var s = this.settings;
        document.documentElement.style.setProperty("--accent-primary", s.accent || "#2563eb");
        if (s.stealth) {
            document.title = "My Drive - Google Drive";
            var l = document.querySelector('link[rel~="icon"]');
            if (l) l.href = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" rx="8" fill="%23fbbc04"/%3E%3Ctext x="32" y="44" font-size="36" font-weight="bold" fill="white" text-anchor="middle" font-family="sans-serif"%3EG%3C/text%3E%3C/svg%3E';
        } else {
            document.title = "Cache";
            var l = document.querySelector('link[rel~="icon"]');
            if (l) l.href = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" rx="8" fill="%2300d4aa"/%3E%3Ctext x="32" y="44" font-size="40" font-weight="bold" fill="white" text-anchor="middle" font-family="sans-serif"%3EC%3C/text%3E%3C/svg%3E';
        }
    },
    _syncSessions: function () {
        if (!this.user || this.user === "Guest") return;
        var e = this.sessions.find(function (s) { return s.handle === this.user; }.bind(this));
        if (!e) { this.sessions.push({ handle: this.user, loginTime: Date.now(), gamesPlayed: 0 }); this.saveSessions(); }
    }
};
window.AppState = AppState;

/* ===== Per-user data ===== */
function loadUserData(handle) {
    if (!handle) return;
    var key = handle.toLowerCase();
    var saved = Store.get("favorites_" + key, null);
    if (saved && Array.isArray(saved)) { AppState.favorites = saved; }
    var savedSettings = Store.get("settings_" + key, null);
    if (savedSettings && typeof savedSettings === "object") {
        for (var k in savedSettings) { if (savedSettings.hasOwnProperty(k)) AppState.settings[k] = savedSettings[k]; }
        AppState.saveSettings();
    }
}

function saveUserData() {
    var handle = AppState.user;
    if (!handle) return;
    var key = handle.toLowerCase();
    Store.set("favorites_" + key, AppState.favorites);
    Store.set("settings_" + key, AppState.settings);
}

/* Patch favorites/settings saves to also save per-user */
var _origSaveFav = AppState.saveFavorites;
AppState.saveFavorites = function () {
    _origSaveFav.call(this);
    saveUserData();
};
var _origSaveSet = AppState.saveSettings;
AppState.saveSettings = function () {
    _origSaveSet.call(this);
    saveUserData();
};

/* ===== Toast ===== */
function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
}

/* ===== Tab system ===== */
var tabs = [];
var activeTabId = null;
var tabCounter = 0;
var frogTimeout = null;
var frogHideTimeout = null;
var urlPollInterval = null;

async function createTab(url) {
    await ensureProxy();
    tabCounter++;
    var id = tabCounter;
    var frame = activeProxy.createFrame();
    var tabEl = document.createElement("button");
    tabEl.className = "frog-tab";
    tabEl.dataset.tabId = id;
    var title = document.createElement("span");
    title.className = "ft-title";
    title.textContent = url ? hostnameFromUrl(url) : "New Tab";
    var close = document.createElement("button");
    close.className = "ft-close";
    close.textContent = "\u00d7";
    tabEl.appendChild(title);
    tabEl.appendChild(close);
    document.getElementById("frog-tab-list").appendChild(tabEl);
    var tab = { id: id, frame: frame, tabEl: tabEl, titleEl: title, url: url || null };
    tabs.push(tab);
    switchTab(id);
    tabEl.addEventListener("click", function (e) { if (e.target !== close) switchTab(id); });
    close.addEventListener("click", function (e) { e.stopPropagation(); closeTab(id); });
    return id;
}

function hostnameFromUrl(url) { try { return new URL(url).hostname; } catch (e) { return url; } }

function switchTab(id) {
    activeTabId = id;
    tabs.forEach(function (t) { t.tabEl.classList.toggle("active", t.id === id); });
    var tab = tabs.find(function (t) { return t.id === id; });
    if (!tab) return;
    var fc = document.getElementById("frame-container");
    fc.innerHTML = "";
    if (tab.frame && tab.frame.frame) {
        fc.appendChild(tab.frame.frame);
        fc.classList.toggle("has-frame", !!tab.url);
        if (tab.url) document.getElementById("frog-url").value = tab.url;
        startUrlPolling(tab);
    } else {
        fc.classList.remove("has-frame");
        stopUrlPolling();
        document.getElementById("frog-url").value = "";
    }
}

function closeTab(id) {
    var tab = tabs.find(function (t) { return t.id === id; });
    if (!tab) return;
    tab.tabEl.remove();
    tabs = tabs.filter(function (t) { return t.id !== id; });
    if (activeTabId === id) {
        stopUrlPolling();
        if (tabs.length > 0) {
            switchTab(tabs[tabs.length - 1].id);
        } else {
            activeTabId = null;
            var fc = document.getElementById("frame-container");
            fc.innerHTML = "";
            fc.classList.remove("has-frame");
            document.getElementById("frog-url").value = "";
        }
    }
}

async function navigateTab(id, url) {
    var tab = tabs.find(function (t) { return t.id === id; });
    if (!tab) return;
    await ensureProxy();
    var fc = document.getElementById("frame-container");
    fc.innerHTML = "";
    fc.appendChild(tab.frame.frame);
    fc.classList.add("has-frame");
    tab.url = url;
    activeProxy.navigate(tab.frame, url);
    tab.titleEl.textContent = hostnameFromUrl(url);
    document.getElementById("frog-url").value = url;
    clearTimeout(tab._proxyCheck);
    tab._proxyCheck = setTimeout(function () {
        try {
            var doc = tab.frame.frame.contentDocument || tab.frame.frame.contentWindow.document;
            if (doc && doc.body && doc.body.textContent && doc.body.textContent.length < 500 && doc.body.textContent.indexOf("http") >= 0) {
                toast("Proxy blocked - try Server mode in settings.");
            }
        } catch (e) { }
    }, 6000);
}

function navigateDirect(id, url) {
    var tab = tabs.find(function (t) { return t.id === id; });
    if (!tab) return;
    var fc = document.getElementById("frame-container");
    fc.innerHTML = "";
    fc.appendChild(tab.frame.frame);
    fc.classList.add("has-frame");
    tab.url = url;
    tab.frame.frame.src = url;
    tab.titleEl.textContent = hostnameFromUrl(url);
    document.getElementById("frog-url").value = url;
}

/* URL polling */
function startUrlPolling(tab) {
    stopUrlPolling();
    updateFrogUrl(tab);
    urlPollInterval = setInterval(function () { updateFrogUrl(tab); }, 800);
}

function stopUrlPolling() {
    if (urlPollInterval) { clearInterval(urlPollInterval); urlPollInterval = null; }
}

function updateFrogUrl(tab) {
    if (!tab || !tab.frame || !tab.frame.frame) return;
    try {
        var loc = tab.frame.frame.contentWindow.location.href;
        if (loc && loc !== "about:blank") {
            var decoded = activeProxy.decodeUrl ? activeProxy.decodeUrl(loc) || loc : loc;
            document.getElementById("frog-url").value = decoded;
            tab.url = decoded;
            tab.titleEl.textContent = hostnameFromUrl(decoded);
        }
    } catch (e) { }
}

/* ===== Games Database ===== */
var GAMES = [];
var _currentGame = null;

if (window.__GAMES_DATA__ && window.__GAMES_DATA__.length) {
    GAMES = window.__GAMES_DATA__;
}

function gameFallback(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    var ah = Math.abs(hash);
    var hue = ((ah % 360) + 360) % 360;
    var h2 = (hue + 40) % 360;
    var letter = name.replace(/[^a-zA-Z0-9]/g, "").charAt(0).toUpperCase() || "G";
    var dark = "hsl(" + hue + ",40%,25%)";
    var mid = "hsl(" + hue + ",45%,38%)";
    var light = "hsl(" + h2 + ",50%,50%)";
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='" + dark + "'/><stop offset='50%' stop-color='" + mid + "'/><stop offset='100%' stop-color='" + light + "'/></linearGradient><radialGradient id='r' cx='30%' cy='30%' r='70%'><stop offset='0%' stop-color='rgba(255,255,255,0.15)'/><stop offset='100%' stop-color='rgba(0,0,0,0.2)'/></radialGradient></defs><rect width='100' height='100' rx='22' fill='url(#g)'/><rect width='100' height='100' rx='22' fill='url(#r)'/><text x='50' y='67' text-anchor='middle' font-size='48' font-weight='800' font-family='-apple-system,BlinkMacSystemFont,sans-serif' fill='rgba(255,255,255,0.92)' letter-spacing='1'>" + letter + "</text></svg>";
    return "data:image/svg+xml;base64," + btoa(svg);
}

function renderGames(games) {
    var grid = document.getElementById("games-grid");
    if (!grid) return;
    var search = (document.getElementById("games-search-input").value || "").toLowerCase();
    grid.innerHTML = "";
    var gc = document.getElementById("game-count");
    if (!games || !games.length) { if (gc) gc.textContent = "0"; grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--muted)">No games loaded</div>'; return; }
    var list = games;
    if (search) { list = games.filter(function (g) { return (g.title || "").toLowerCase().indexOf(search) >= 0; }); }
    if (!list.length) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--muted)">No games match your search</div>'; return; }
    list.forEach(function (game) {
        var card = document.createElement("div");
        card.className = "game-card";
        var fallback = gameFallback(game.title || "G");
        if (game.local) {
            var imgSrc = game.url.replace(/\.html$/, ".png");
            card.innerHTML = '<img src="' + imgSrc + '" alt="" loading="lazy" onerror="this.src=\'' + fallback + '\'"><div class="game-name">' + (game.title || "Game") + '</div>';
        } else {
            card.innerHTML = '<img src="' + fallback + '" alt=""><div class="game-name">' + (game.title || "Game") + '</div>';
        }
        card.addEventListener("click", function () { openTheater(game); });
        grid.appendChild(card);
    });
    if (gc) gc.textContent = list.length + "/" + games.length;
}

function loadAllGames() {
    if (GAMES.length > 30) return Promise.resolve(GAMES);
    return Promise.resolve(GAMES);
}

document.getElementById("games-search-input").addEventListener("input", function () { renderGames(GAMES); });

/* ===== Theater ===== */
function openTheater(game) {
    _currentGame = game;
    var theater = document.getElementById("theater-view");
    var frame = document.getElementById("theater-frame");
    var title = document.getElementById("theater-title");
    if (!theater || !frame) return;
    theater.classList.add("open");
    var src = game.local ? game.url : "/api/proxy/" + encodeURIComponent(game.url);
    frame.src = src;
    title.textContent = game.title;
    AppState.analytics.launched++;
    AppState.saveAnalytics();
}

function closeTheater() {
    var theater = document.getElementById("theater-view");
    var frame = document.getElementById("theater-frame");
    if (theater) theater.classList.remove("open");
    if (frame) frame.src = "";
}

function goFullscreen() {
    var frame = document.getElementById("theater-frame");
    if (!frame) return;
    if (frame.requestFullscreen) frame.requestFullscreen();
    else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
}

function goDownload() {
    var g = _currentGame;
    if (!g) { toast("No game selected"); return; }
    if (g.local) {
        fetch(g.url).then(function (r) { return r.text(); }).then(function (html) {
            var b = new Blob([html], { type: "text/html" });
            var u = URL.createObjectURL(b);
            var a = document.createElement("a");
            a.href = u;
            a.download = g.title.replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".html";
            a.click();
            URL.revokeObjectURL(u);
            toast("Downloaded: " + g.title);
        }).catch(function () { toast("Download failed"); });
    } else toast("External game - try Sideload instead");
}

function goOpen() {
    var g = _currentGame;
    if (!g || !g.url) return;
    var src = g.local ? window.location.origin + "/" + g.url : "/api/proxy/" + encodeURIComponent(g.url);
    window.open("/play?url=" + encodeURIComponent(src), "_blank");
}

function goCloak() {
    var g = _currentGame;
    if (!g || !g.url) return;
    var w = window.open("about:blank");
    if (!w) { toast("Pop-up blocked"); return; }
    var src = g.local ? g.url : "/api/proxy/" + encodeURIComponent(g.url);
    var d = w.document;
    d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>My Drive - Google Drive</title><style>body{margin:0;overflow:hidden}iframe{width:100vw;height:100vh;border:none}</style></head><body><iframe src="' + src.replace(/"/g, "&quot;") + '"></iframe></body></html>');
    d.close();
    toast("Opened in blank pop-up");
}

/* ===== Frog bar ===== */
var frogBar = document.getElementById("frog-bar");
var frogVisible = false;

function showFrogBar() {
    if (frogVisible) return;
    frogVisible = true;
    frogBar.classList.add("visible");
    var ft = document.getElementById("frog-toggle");
    if (ft) ft.classList.add("active");
    clearTimeout(frogHideTimeout);
}

function hideFrogBar(force) {
    if (!frogVisible && !force) return;
    clearTimeout(frogHideTimeout);
    if (document.activeElement && document.activeElement.id === "frog-url") return;
    frogVisible = false;
    frogBar.classList.remove("visible");
    var ft = document.getElementById("frog-toggle");
    if (ft) ft.classList.remove("active");
}

document.getElementById("frog-toggle").addEventListener("click", function () {
    if (frogVisible) { hideFrogBar(true); } else { showFrogBar(); }
});

document.getElementById("frog-url").addEventListener("focus", showFrogBar);
document.getElementById("frog-url").addEventListener("blur", function () {
    setTimeout(function () { if (!frogBar.matches(":hover")) hideFrogBar(); }, 120);
});

document.addEventListener("click", function (e) {
    var ft = document.getElementById("frog-toggle");
    if (frogVisible && !frogBar.contains(e.target) && e.target !== ft) { hideFrogBar(true); }
});

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && frogVisible) { hideFrogBar(true); stopUrlPolling(); }
});

/* Frog-bar drag */
var frogDrag = false, frogDragOffX = 0, frogDragOffY = 0;

(function initFrogPos() {
    try {
        var saved = localStorage.getItem("cache-frog-pos");
        if (saved) {
            var pos = JSON.parse(saved);
            if (typeof pos.x === "number" && typeof pos.y === "number") {
                frogBar.style.left = pos.x + "px";
                frogBar.style.top = pos.y + "px";
                frogBar.classList.add("drag-mode");
            }
        }
    } catch (e) { }
})();

document.getElementById("frog-drag-handle").addEventListener("mousedown", function (e) {
    e.preventDefault();
    var rect = frogBar.getBoundingClientRect();
    frogDrag = true;
    frogDragOffX = e.clientX - rect.left;
    frogDragOffY = e.clientY - rect.top;
    frogBar.classList.add("drag-mode", "dragging");
    frogBar.style.left = rect.left + "px";
    frogBar.style.top = rect.top + "px";
});

document.addEventListener("mousemove", function (e) {
    if (!frogDrag) return;
    var x = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - frogDragOffX));
    var y = Math.max(0, e.clientY - frogDragOffY);
    frogBar.style.left = x + "px";
    frogBar.style.top = y + "px";
});

document.addEventListener("mouseup", function () {
    if (!frogDrag) return;
    frogDrag = false;
    frogBar.classList.remove("dragging");
    try { localStorage.setItem("cache-frog-pos", JSON.stringify({ x: parseFloat(frogBar.style.left), y: parseFloat(frogBar.style.top) })); } catch (e) { }
});

/* ===== Frog controls ===== */
document.getElementById("frog-back").addEventListener("click", function () {
    var tab = tabs.find(function (t) { return t.id === activeTabId; });
    if (tab) try { tab.frame.back(); } catch (e) { }
});

document.getElementById("frog-forward").addEventListener("click", function () {
    var tab = tabs.find(function (t) { return t.id === activeTabId; });
    if (tab) try { tab.frame.forward(); } catch (e) { }
});

document.getElementById("frog-refresh").addEventListener("click", function () {
    var tab = tabs.find(function (t) { return t.id === activeTabId; });
    if (tab) try { tab.frame.reload(); } catch (e) { }
});

document.getElementById("frog-home").addEventListener("click", function () { switchNav("home"); });

document.getElementById("frog-popout").addEventListener("click", function () {
    var tab = tabs.find(function (t) { return t.id === activeTabId; });
    if (!tab || !tab.url) { toast("Open a page first"); return; }
    var w = window.open("about:blank");
    if (w) {
        var d = w.document;
        d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading...</title><style>body{margin:0;overflow:hidden}iframe{width:100vw;height:100vh;border:none}</style></head><body><iframe src="' + tab.url.replace(/"/g, "&quot;") + '"></iframe></body></html>');
        d.close();
    }
});

document.getElementById("frog-newtab").addEventListener("click", function () { createTab(); showFrogBar(); });

document.getElementById("frog-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var input = document.getElementById("frog-url");
    var url = search(input.value, (document.getElementById("sj-search-engine") || {}).value || "https://duckduckgo.com/?q=%s");
    input.value = url;
    var id = activeTabId;
    if (!id || !tabs.find(function (t) { return t.id === id; })) { id = await createTab(url); await navigateTab(id, url); } else { await navigateTab(id, url); }
    showFrogBar();
});

/* ===== Search form ===== */
document.getElementById("sj-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var address = document.getElementById("sj-address");
    var url = search(address.value, document.getElementById("sj-search-engine").value);
    address.value = url;
    switchNav("proxy");
    var id = activeTabId;
    if (!id || !tabs.find(function (t) { return t.id === id; })) { id = await createTab(url); await navigateTab(id, url); } else { await navigateTab(id, url); }
    showFrogBar();
});

/* ===== Nav ===== */
document.querySelectorAll(".nav-tab").forEach(function (btn) {
    btn.addEventListener("click", function () { switchNav(btn.dataset.view); });
});

var currentView = "home";

function switchNav(view) {
    currentView = view;
    document.querySelectorAll(".nav-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.view === view); });
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    var target = document.getElementById(view + "-view");
    if (target) target.classList.add("active");
    document.getElementById("navbar").style.display = view === "proxy" ? "none" : "flex";
    frogBar.classList.remove("visible");
    var ft = document.getElementById("frog-toggle");
    if (ft) ft.style.display = view === "proxy" ? "flex" : "none";
    if (view !== "proxy") { stopUrlPolling(); }
    if (view === "proxy" && tabs.length > 0) { showFrogBar(); }
    if (view === "games") renderGames(GAMES);
}

switchNav("home");

/* ===== App icons ===== */
document.querySelectorAll(".app-icon").forEach(function (el) {
    el.addEventListener("click", async function (e) {
        e.preventDefault();
        var url = el.dataset.url;
        switchNav("proxy");
        var id = activeTabId;
        if (!id || !tabs.find(function (t) { return t.id === id; })) { id = await createTab(url); await navigateTab(id, url); } else { await navigateTab(id, url); }
        showFrogBar();
    });
});

/* ===== Settings ===== */
var engineSelect = document.getElementById("engine-select");
var searchEngine = document.getElementById("sj-search-engine");
searchEngine.value = engineSelect ? engineSelect.value : "https://duckduckgo.com/?q=%s";
if (engineSelect) {
    engineSelect.addEventListener("change", function () { searchEngine.value = engineSelect.value; });
}

var proxySelect = document.getElementById("proxy-select");
if (proxySelect) {
    proxySelect.addEventListener("change", function () {
        var val = proxySelect.value;
        try { localStorage.setItem("cache-proxy", val); } catch (e) { }
        toast("Reloading proxy engine...");
        setTimeout(function () { location.reload(); }, 500);
    });
}

var themeSelect = document.getElementById("theme-select");
var savedTheme = (function () { try { return localStorage.getItem("cache-theme"); } catch (e) { return null; } })() || "nexus";
document.documentElement.setAttribute("data-theme", savedTheme);
if (themeSelect) themeSelect.value = savedTheme;

if (themeSelect) {
    themeSelect.addEventListener("change", function () {
        var val = themeSelect.value;
        document.documentElement.setAttribute("data-theme", val);
        try { localStorage.setItem("cache-theme", val); } catch (e) { }
        toast("Theme: " + themeSelect.options[themeSelect.selectedIndex].text);
    });
}

/* ===== Cloak system ===== */
var cloakMap = {
    google: { title: "Google", icon: "https://www.google.com/favicon.ico" },
    classroom: { title: "Classroom", icon: "https://ssl.gstatic.com/classroom/favicon.png" },
    drive: { title: "Google Drive", icon: "https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png" }
};
var defaultCloak = { title: "Cache", icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" rx="8" fill="%2300d4aa"/%3E%3Ctext x="32" y="44" font-size="40" font-weight="bold" fill="white" text-anchor="middle" font-family="sans-serif"%3EC%3C/text%3E%3C/svg%3E' };
var activeCloak = "";

function applyCloak(val) {
    var c = val ? cloakMap[val] : defaultCloak;
    if (c) {
        document.title = c.title;
        var link = document.querySelector("link[rel='shortcut icon']");
        if (link) link.href = c.icon;
    }
}

document.querySelectorAll(".cloak-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
        document.querySelectorAll(".cloak-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        activeCloak = btn.dataset.cloak;
        try { localStorage.setItem("cache-cloak", activeCloak); } catch (e) { }
        applyCloak(activeCloak);
    });
});

(function loadSavedCloak() {
    try {
        var saved = localStorage.getItem("cache-cloak");
        if (saved) {
            document.querySelectorAll(".cloak-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.cloak === saved); });
            activeCloak = saved;
            applyCloak(saved);
            return;
        }
    } catch (e) { }
    var noneBtn = document.querySelector('[data-cloak=""]');
    if (noneBtn) noneBtn.classList.add("active");
})();

var autocloakToggle = document.getElementById("autocloak-toggle");
var autocloakLabel = document.getElementById("autocloak-label");

try {
    if (localStorage.getItem("cache-autocloak") === "true") { autocloakToggle.checked = true; autocloakLabel.textContent = "On"; }
} catch (e) { }

if (autocloakToggle) {
    autocloakToggle.addEventListener("change", function () {
        var on = autocloakToggle.checked;
        autocloakLabel.textContent = on ? "On" : "Off";
        try { localStorage.setItem("cache-autocloak", on ? "true" : "false"); } catch (e) { }
        if (on && activeCloak) applyCloak(activeCloak);
    });
}

/* ===== Music Player (YouTube IFrame API) ===== */
var musicQueue = [];
var musicIndex = -1;
var musicMinimized = true;
var musicHidden = false;
var shuffleOn = false;
var repeatOn = false;
var ytPlayer = null;
var ytReady = false;
var ytLoadAttempted = false;
var progressInterval = null;
var isPlaying = false;

var musicEl = document.getElementById("music-player");
var musicThumb = document.getElementById("music-thumb");
var musicTitle = document.getElementById("music-title");
var musicAuthor = document.getElementById("music-author");
var musicSearchInput = document.getElementById("music-search-input");
var musicResults = document.getElementById("music-results");
var musicSearchToggle = document.getElementById("music-search-toggle");
var musicSearchArea = document.getElementById("music-search-area");
var musicToggleBtn = document.getElementById("music-toggle-btn");
var musicToggleIcon = document.getElementById("music-toggle-icon");
var musicQueueList = document.getElementById("music-queue-list");
var musicQueueCount = document.getElementById("music-queue-count");
var frogMusicBtn = document.getElementById("frog-music-btn");
var playPauseBtn = document.getElementById("music-play-pause");
var prevBtn = document.getElementById("music-prev");
var nextBtn = document.getElementById("music-next");
var shuffleBtn = document.getElementById("music-shuffle");
var repeatBtn = document.getElementById("music-repeat");
var volumeBtn = document.getElementById("music-volume-btn");
var volumeSlider = document.getElementById("music-volume-slider");
var musicSeek = document.getElementById("music-seek");
var musicTimeCurrent = document.getElementById("music-time-current");
var musicTimeTotal = document.getElementById("music-time-total");

function formatTime(t) {
    if (!t || isNaN(t)) return "0:00";
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
}

function loadYouTubeAPI() {
    if (ytLoadAttempted) return;
    ytLoadAttempted = true;
    if (typeof YT !== "undefined" && YT.Player) { onYouTubeIframeAPIReady(); return; }
    var tag = document.createElement("script");
    tag.src = "/api/proxy/" + encodeURIComponent("https://www.youtube.com/iframe_api");
    tag.onerror = function () {
        tag.src = "https://www.youtube.com/iframe_api";
        tag.onerror = function () { setTimeout(function () { ytLoadAttempted = false; loadYouTubeAPI(); }, 5000); };
    };
    var first = document.getElementsByTagName("script")[0];
    first.parentNode.insertBefore(tag, first);
}

function onYouTubeIframeAPIReady() {
    var container = document.getElementById("music-youtube-player");
    if (!container) return;
    ytPlayer = new YT.Player("music-youtube-player", {
        height: "0", width: "0",
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, playsinline: 1, rel: 0, iv_load_policy: 3 },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
        }
    });
}

function onPlayerReady() {
    ytReady = true;
    ytPlayer.setVolume(parseInt(volumeSlider.value));
    if (musicIndex >= 0 && musicIndex < musicQueue.length) { playCurrent(); }
}

function onPlayerStateChange(e) {
    if (e.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        playPauseBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        startProgressTimer();
    } else if (e.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        playPauseBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        stopProgressTimer();
    } else if (e.data === YT.PlayerState.ENDED) {
        isPlaying = false;
        playPauseBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        stopProgressTimer();
        if (repeatOn) { ytPlayer.seekTo(0); ytPlayer.playVideo(); } else if (musicIndex < musicQueue.length - 1) { musicIndex++; playCurrent(); } else if (shuffleOn) { musicIndex = Math.floor(Math.random() * musicQueue.length); playCurrent(); }
    }
}

function onPlayerError() {
    if (musicQueue.length > 1) { playNext(); }
}

function updateProgressDisplay() {
    if (!ytPlayer || !ytPlayer.getCurrentTime) return;
    var current = ytPlayer.getCurrentTime();
    var dur = ytPlayer.getDuration();
    if (dur > 0) { musicSeek.value = Math.min(100, (current / dur) * 100); }
    musicTimeCurrent.textContent = formatTime(current);
    musicTimeTotal.textContent = formatTime(dur);
}

function startProgressTimer() {
    if (progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(updateProgressDisplay, 500);
}

function stopProgressTimer() {
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
}

function playSong(videoId, title, author, thumbnail, durationSec) {
    var existingIdx = musicQueue.findIndex(function (t) { return t.id === videoId; });
    if (existingIdx >= 0) { musicIndex = existingIdx; } else { musicQueue.push({ id: videoId, title: title, author: author, thumbnail: thumbnail, durationSec: durationSec }); musicIndex = musicQueue.length - 1; }
    if (!ytReady) { loadYouTubeAPI(); updateThumb(musicQueue[musicIndex]); updateQueueUI(); if (musicMinimized) toggleMinimize(); showPlayer(); return; }
    playCurrent();
    updateQueueUI();
    if (musicMinimized) toggleMinimize();
    showPlayer();
}

function playCurrent() {
    if (musicIndex < 0 || musicIndex >= musicQueue.length) return;
    var track = musicQueue[musicIndex];
    updateThumb(track);
    updateQueueUI();
    if (ytReady && ytPlayer && ytPlayer.loadVideoById) { ytPlayer.loadVideoById(track.id); ytPlayer.playVideo(); isPlaying = true; }
}

function updateThumb(track) {
    var thumb = track.thumbnail || "https://i.ytimg.com/vi/" + track.id + "/mqdefault.jpg";
    musicThumb.src = thumb;
    musicThumb.onerror = function () { musicThumb.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"%3E%3Ccircle cx="24" cy="24" r="22" fill="%23222"/%3E%3Cpath d="M18 14v20l16-10z" fill="%23888"/%3E%3C/svg%3E'; };
    musicTitle.textContent = track.title;
    musicAuthor.textContent = track.author;
}

function playNext() {
    if (musicQueue.length === 0) return;
    if (shuffleOn) { var next; do { next = Math.floor(Math.random() * musicQueue.length); } while (next === musicIndex && musicQueue.length > 1); musicIndex = next; } else if (musicIndex < musicQueue.length - 1) { musicIndex++; } else if (repeatOn) { musicIndex = 0; } else { return; }
    playCurrent();
}

function playPrev() {
    if (musicQueue.length === 0) return;
    if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getCurrentTime() > 3) { ytPlayer.seekTo(0); return; }
    if (musicIndex > 0) { musicIndex--; playCurrent(); } else if (repeatOn && musicQueue.length > 0) { musicIndex = musicQueue.length - 1; playCurrent(); }
}

function toggleMinimize() {
    musicMinimized = !musicMinimized;
    musicEl.classList.toggle("music-minimized", musicMinimized);
    musicToggleIcon.innerHTML = musicMinimized ? '<polyline points="18 15 12 9 6 15"/>' : '<polyline points="6 9 12 15 18 9"/>';
    musicToggleBtn.title = musicMinimized ? "Maximize" : "Minimize";
}

function toggleMusicVisibility() {
    musicHidden = !musicHidden;
    musicEl.classList.toggle("music-hidden", musicHidden);
    frogMusicBtn.classList.toggle("active", !musicHidden);
}

/* Music search */
var searchTimeout = null;
musicSearchInput.addEventListener("input", function () {
    clearTimeout(searchTimeout);
    var q = musicSearchInput.value.trim();
    if (q.length < 2) { musicResults.innerHTML = ""; return; }
    searchTimeout = setTimeout(function () { doMusicSearch(q); }, 300);
});

async function doMusicSearch(q) {
    musicResults.innerHTML = '<div class="music-loading"><span></span><span></span><span></span></div>';
    try {
        var res = await fetch("/api/music/search?q=" + encodeURIComponent(q));
        if (!res.ok) throw new Error("Search failed");
        var data = await res.json();
        renderMusicResults(data.results || []);
    } catch (err) {
        musicResults.innerHTML = "<div style='padding:8px;color:var(--muted);font-size:12px'>Search failed</div>";
    }
}

function escapeHtml(val) { return String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

function renderMusicResults(results) {
    if (results.length === 0) { musicResults.innerHTML = "<div style='padding:8px;color:var(--muted);font-size:12px'>No results found</div>"; return; }
    musicResults.innerHTML = results.map(function (r) {
        var parts = (r.duration || "0:00").split(":").map(Number);
        var durSec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] || 0;
        return '<div class="music-result-item" data-id="' + r.id + '" data-title="' + escapeHtml(r.title) + '" data-author="' + escapeHtml(r.author) + '" data-thumb="' + r.thumbnail + '" data-dur="' + durSec + '">' +
            '<img src="' + r.thumbnail + '" alt="" loading="lazy" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"%3E%3Ccircle cx="24" cy="24" r="22" fill="%23222"/%3E%3Cpath d="M18 14v20l16-10z" fill="%23888"/%3E%3C/svg%3E\'" />' +
            '<div class="r-info"><div class="r-title">' + escapeHtml(r.title) + '</div><div class="r-meta">' + r.author + ' \u00b7 ' + r.duration + '</div></div>' +
            '<button class="r-play-btn" title="Play now">\u25b6</button>' +
            '<button class="r-add-btn" title="Add to queue">+</button></div>';
    }).join("");
    musicResults.querySelectorAll(".music-result-item").forEach(function (el) {
        var id = el.dataset.id, title = el.dataset.title, author = el.dataset.author, thumb = el.dataset.thumb, dur = parseInt(el.dataset.dur) || 0;
        el.querySelector(".r-play-btn").addEventListener("click", function (e) {
            e.stopPropagation();
            playSong(id, title, author, thumb, dur);
            musicSearchInput.value = "";
            musicResults.innerHTML = "";
            musicSearchArea.classList.add("music-hidden");
        });
        el.querySelector(".r-add-btn").addEventListener("click", function (e) {
            e.stopPropagation();
            queueSong(id, title, author, thumb, dur);
            toast("Added to queue");
        });
    });
}

function queueSong(videoId, title, author, thumbnail, durationSec) {
    if (musicQueue.findIndex(function (t) { return t.id === videoId; }) >= 0) return;
    musicQueue.push({ id: videoId, title: title, author: author, thumbnail: thumbnail, durationSec: durationSec });
    if (musicIndex < 0) musicIndex = 0;
    updateQueueUI();
    showPlayer();
}

function updateQueueUI() {
    musicQueueList.innerHTML = musicQueue.map(function (t, i) {
        return '<div class="music-qitem ' + (i === musicIndex ? "active" : "") + '" data-idx="' + i + '">' +
            '<img src="' + (t.thumbnail || "https://i.ytimg.com/vi/" + t.id + "/mqdefault.jpg") + '" alt="" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"%3E%3Ccircle cx="24" cy="24" r="22" fill="%23222"/%3E%3Cpath d="M18 14v20l16-10z" fill="%23888"/%3E%3C/svg%3E\'" />' +
            '<span class="q-title">' + escapeHtml(t.title) + '</span>' +
            '<button class="q-remove" data-idx="' + i + '">\u00d7</button></div>';
    }).join("");
    musicQueueCount.textContent = musicQueue.length + " song" + (musicQueue.length !== 1 ? "s" : "");
    musicQueueList.querySelectorAll(".music-qitem").forEach(function (el) {
        el.addEventListener("click", function (e) {
            if (e.target.classList.contains("q-remove")) return;
            musicIndex = parseInt(el.dataset.idx);
            playCurrent();
            if (musicMinimized) toggleMinimize();
        });
    });
    musicQueueList.querySelectorAll(".q-remove").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            var idx = parseInt(btn.dataset.idx);
            musicQueue.splice(idx, 1);
            if (idx < musicIndex) musicIndex--;
            else if (idx === musicIndex) {
                if (musicQueue.length === 0) { musicIndex = -1; if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo(); } else { if (musicIndex >= musicQueue.length) musicIndex = musicQueue.length - 1; playCurrent(); }
            }
            updateQueueUI();
        });
    });
}

function showPlayer() {
    musicHidden = false;
    musicEl.classList.remove("music-hidden");
    frogMusicBtn.classList.add("active");
}

/* Event listeners */
prevBtn.addEventListener("click", playPrev);
playPauseBtn.addEventListener("click", function () {
    if (!ytReady || musicIndex < 0) { if (musicQueue.length > 0) playCurrent(); return; }
    var state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) { ytPlayer.pauseVideo(); } else { ytPlayer.playVideo(); }
});
nextBtn.addEventListener("click", playNext);

shuffleBtn.addEventListener("click", function () {
    shuffleOn = !shuffleOn;
    shuffleBtn.classList.toggle("active", shuffleOn);
    toast(shuffleOn ? "Shuffle on" : "Shuffle off");
});
repeatBtn.addEventListener("click", function () {
    repeatOn = !repeatOn;
    repeatBtn.classList.toggle("active", repeatOn);
    toast(repeatOn ? "Repeat on" : "Repeat off");
});

musicSeek.addEventListener("input", function () {
    if (!ytReady || !ytPlayer || !ytPlayer.getDuration) return;
    var dur = ytPlayer.getDuration();
    if (dur <= 0) return;
    ytPlayer.seekTo(dur * (parseInt(musicSeek.value) / 100));
});

volumeSlider.addEventListener("input", function () {
    var v = parseInt(volumeSlider.value) / 100;
    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(parseInt(volumeSlider.value));
    volumeBtn.innerHTML = v === 0
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
        : v < 0.5
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
});

musicToggleBtn.addEventListener("click", function (e) { e.stopPropagation(); toggleMinimize(); });
document.getElementById("music-header").addEventListener("click", function (e) {
    if (e.target.closest("button")) return;
    if (musicMinimized) toggleMinimize();
});
musicSearchToggle.addEventListener("click", function () {
    musicSearchArea.classList.toggle("music-hidden");
    if (!musicSearchArea.classList.contains("music-hidden")) musicSearchInput.focus();
});

frogMusicBtn.addEventListener("click", toggleMusicVisibility);

document.getElementById("music-queue-toggle").addEventListener("click", function () {
    var q = document.getElementById("music-queue");
    q.style.display = q.style.display === "none" ? "" : "none";
});

/* Keyboard shortcuts */
document.addEventListener("keydown", function (e) {
    if (musicHidden) return;
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
    if (e.key === "Escape" && !musicSearchArea.classList.contains("music-hidden")) { musicSearchArea.classList.add("music-hidden"); }
    if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); playPauseBtn.click(); }
});

/* Init music */
frogMusicBtn.classList.add("active");
volumeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
loadYouTubeAPI();

/* ===== Home Shortcuts ===== */
var shortcuts = [];
try {
    var saved = localStorage.getItem("cache-shortcuts");
    if (saved) shortcuts = JSON.parse(saved);
    if (!Array.isArray(shortcuts)) shortcuts = [];
} catch (e) { shortcuts = []; }

function saveShortcuts() { try { localStorage.setItem("cache-shortcuts", JSON.stringify(shortcuts)); } catch (e) { } }

function renderShortcuts() {
    var grid = document.getElementById("shortcutsGrid");
    if (!grid) return;
    grid.innerHTML = "";
    shortcuts.forEach(function (s, i) {
        var card = document.createElement("button");
        card.className = "shortcut-card";
        var letter = (s.name || "?").charAt(0).toUpperCase();
        card.innerHTML = '<span class="sc-icon">' + letter + '</span><span class="sc-name">' + escapeHtml(s.name) + '</span><span class="sc-remove" data-idx="' + i + '">x</span>';
        card.addEventListener("click", async function (e) {
            if (e.target.classList.contains("sc-remove")) { shortcuts.splice(parseInt(e.target.dataset.idx), 1); saveShortcuts(); renderShortcuts(); return; }
            var url = s.url.trim();
            if (!url) return;
            switchNav("proxy");
            var id = activeTabId;
            if (!id || !tabs.find(function (t) { return t.id === id; })) { id = await createTab(url); await navigateTab(id, url); } else { await navigateTab(id, url); }
            showFrogBar();
        });
        grid.appendChild(card);
    });
}

document.getElementById("addShortcutBtn").addEventListener("click", function () { document.getElementById("addShortcutModal").classList.remove("hidden"); });
document.getElementById("cancelShortcut").addEventListener("click", function () { document.getElementById("addShortcutModal").classList.add("hidden"); });
document.getElementById("confirmShortcut").addEventListener("click", function () {
    var name = document.getElementById("shortcutNameInput").value.trim();
    var url = document.getElementById("shortcutUrlInput").value.trim();
    if (!name || !url) return;
    shortcuts.push({ name: name, url: url });
    saveShortcuts();
    renderShortcuts();
    document.getElementById("shortcutNameInput").value = "";
    document.getElementById("shortcutUrlInput").value = "";
    document.getElementById("addShortcutModal").classList.add("hidden");
});
document.getElementById("addShortcutModal").addEventListener("click", function (e) { if (e.target === e.currentTarget) e.target.classList.add("hidden"); });
renderShortcuts();

/* ===== AI Chat ===== */
var aiHistory = [];

function aiAddMsg(role, content) {
    var conv = document.getElementById("aiConversation");
    if (!conv) return;
    var div = document.createElement("div");
    div.className = "ai-msg " + role;
    if (role === "assistant") {
        var label = document.createElement("div");
        label.className = "ai-role";
        label.textContent = "Cache AI";
        div.appendChild(label);
    }
    var bubble = document.createElement("div");
    bubble.className = "ai-msg-content";
    bubble.textContent = content;
    div.appendChild(bubble);
    conv.appendChild(div);
    conv.scrollTop = conv.scrollHeight;
}

function aiShowLoading() {
    var conv = document.getElementById("aiConversation");
    if (!conv) return;
    var div = document.createElement("div");
    div.className = "ai-msg assistant";
    div.id = "aiLoading";
    var bubble = document.createElement("div");
    bubble.className = "ai-msg-content";
    bubble.innerHTML = '<div class="ai-loading"><span></span><span></span><span></span></div>';
    div.appendChild(bubble);
    conv.appendChild(div);
    conv.scrollTop = conv.scrollHeight;
}

function aiRemoveLoading() {
    var el = document.getElementById("aiLoading");
    if (el) el.remove();
}

document.getElementById("aiForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var input = document.getElementById("aiInput");
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    aiAddMsg("user", text);
    aiHistory.push({ role: "user", content: text });
    aiShowLoading();
    try {
        var res = await fetch("/api/ai/cache", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: aiHistory.slice(-20) })
        });
        if (!res.ok) throw new Error("AI unavailable");
        var data = await res.json();
        aiRemoveLoading();
        var reply = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "No response";
        aiAddMsg("assistant", reply);
        aiHistory.push({ role: "assistant", content: reply });
    } catch (err) {
        aiRemoveLoading();
        aiAddMsg("assistant", "Error: " + err.message);
    }
});

/* ===== Admin ===== */
function renderAdmin() {
    var closeBtn = document.getElementById("admin-close");
    if (closeBtn) closeBtn.addEventListener("click", function () { document.getElementById("admin-panel").classList.remove("open"); AppState.adminAuthed = false; });
    Array.from(document.querySelectorAll(".admin-tab")).forEach(function (tab) {
        tab.addEventListener("click", function () {
            var role = currentUserRole();
            var restricted = ["users", "uploader", "games", "broadcast", "jarvis"];
            if (role !== "admin" && restricted.indexOf(tab.dataset.atab) >= 0) { toast("Only admins can access this section"); return; }
            Array.from(document.querySelectorAll(".admin-tab")).forEach(function (t) { t.classList.remove("active"); });
            tab.classList.add("active");
            Array.from(document.querySelectorAll(".admin-tab-content")).forEach(function (c) { c.classList.remove("active"); });
            var c = document.querySelector('[data-atab-content="' + tab.dataset.atab + '"]');
            if (c) c.classList.add("active");
            if (tab.dataset.atab === "analytics") renderAnalytics();
            if (tab.dataset.atab === "profiles") renderSessions();
            if (tab.dataset.atab === "users") renderUserManagement();
            if (tab.dataset.atab === "uploader") renderUploader();
            if (tab.dataset.atab === "games") renderGamesManagement();
                if (tab.dataset.atab === "broadcast") { renderBroadcastManagement(); }
            if (tab.dataset.atab === "jarvis") renderJarvis();
        });
    });
    var role = currentUserRole();
    Array.from(document.querySelectorAll(".admin-only")).forEach(function (t) { t.style.display = role === "admin" ? "" : "none"; });
    renderSessions();
    renderUserManagement();
    renderCanvas();
    renderAppearance();
}

function renderUserManagement() {
    var body = document.getElementById("users-manage-body");
    if (!body) return;
    var roles = getRoles();
    var entries = Object.keys(roles).map(function (k) { return { user: k, role: roles[k] }; });
    if (!entries.length) body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--muted)">No users assigned roles</td></tr>';
    else {
        body.innerHTML = entries.map(function (e) {
            var isSelf = e.user === (AppState.user || "").toLowerCase();
            var selfTag = isSelf ? ' <span style="color:var(--muted);font-size:11px">(you)</span>' : "";
            var roleTag = e.role === "admin" ? '<span style="color:var(--accent)">Admin</span>' : '<span style="color:#f59e0b">Mod</span>';
            var rmBtn = currentIsAdmin() && !isSelf ? '<button class="remove-role-btn" data-user="' + e.user + '" style="color:var(--pink);cursor:pointer;background:none;border:none;font-size:12px">Remove</button>' : "";
            return '<tr><td>' + e.user + selfTag + '</td><td>' + roleTag + '</td><td>' + rmBtn + '</td></tr>';
        }).join("");
        Array.from(document.querySelectorAll(".remove-role-btn")).forEach(function (b) {
            b.addEventListener("click", function () { if (!confirm("Remove role from " + b.dataset.user + "?")) return; setUserRole(b.dataset.user, null); renderUserManagement(); updateNavBar(); toast("Role removed"); });
        });
    }
    var addBtn = document.getElementById("user-manage-add"), input = document.getElementById("user-manage-input"), roleSelect = document.getElementById("user-manage-role");
    if (addBtn && input && roleSelect) addBtn.addEventListener("click", function () {
        var name = input.value.trim().toLowerCase();
        if (!name) { toast("Enter a username"); return; }
        if (name === (AppState.user || "").toLowerCase() && roleSelect.value !== "admin") { toast("You cannot demote yourself"); return; }
        setUserRole(name, roleSelect.value);
        input.value = "";
        renderUserManagement();
        updateNavBar();
        toast("Role set: " + name + " = " + roleSelect.value);
    });
}

function renderGamesManagement() {
    var body = document.getElementById("games-manage-body");
    if (!body) return;
    loadJSON("games-data.json").then(function (games) {
        if (!games) return;
        body.innerHTML = games.map(function (g) { return '<tr><td>' + g.t + '</td><td>' + g.f + '</td><td><button class="delete-game-btn" data-f="' + g.f + '" style="color:var(--pink);cursor:pointer;background:none;border:none;font-size:12px;font-family:var(--font)">Delete</button></td></tr>'; }).join("");
        Array.from(document.querySelectorAll(".delete-game-btn")).forEach(function (b) {
            b.addEventListener("click", function () {
                if (!confirm("Delete " + b.dataset.f + "?")) return;
                fetch("/delete-game", { method: "POST", body: JSON.stringify({ filename: b.dataset.f }) }).then(function () { toast("Deleted"); renderGamesManagement(); });
            });
        });
    });
}

var _broadcastInit = false;
function renderBroadcastManagement() {
    if (_broadcastInit) return;
    _broadcastInit = true;
    var btn = document.getElementById("broadcast-submit"), txt = document.getElementById("broadcast-text");
    if (btn) btn.addEventListener("click", function () {
        fetch("/broadcast", { method: "POST", body: JSON.stringify({ text: txt.value, admin: AppState.user }) }).then(function () { toast("Broadcast sent"); });
    });
}

var _jarvisInit = false;
var _jarvisAbort = null;

function renderJarvis() {
    if (_jarvisInit) return;
    _jarvisInit = true;
    var conv = document.getElementById("jarvis-conversation");
    var input = document.getElementById("jarvis-input");
    var submit = document.getElementById("jarvis-submit");
    var clearBtn = document.getElementById("jarvis-clear");
    var stopBtn = document.getElementById("jarvis-stop");
    if (!conv || !input || !submit) return;

    function addMsg(role, html) {
        var div = document.createElement("div");
        div.className = "jarvis-msg " + role;
        div.innerHTML = html;
        conv.appendChild(div);
        conv.scrollTop = conv.scrollHeight;
    }

    function addLoading() {
        var div = document.createElement("div");
        div.className = "jarvis-msg assistant";
        div.id = "jarvis-loading";
        div.innerHTML = '<div class="ai-loading"><span></span><span></span><span></span></div>';
        conv.appendChild(div);
        conv.scrollTop = conv.scrollHeight;
        if (stopBtn) stopBtn.style.display = "";
    }

    function removeLoading() {
        var el = document.getElementById("jarvis-loading");
        if (el) el.remove();
        if (stopBtn) stopBtn.style.display = "none";
    }

    var _changeStack = [];
    var _changeIndex = -1;

    function saveSnapshot() {
        _changeStack = _changeStack.slice(0, _changeIndex + 1);
        _changeStack.push({
            games: JSON.parse(JSON.stringify(GAMES)),
            settings: JSON.parse(JSON.stringify(AppState.settings))
        });
        _changeIndex++;
        updateUndoButtons();
    }

    function restoreSnapshot(snap) {
        GAMES.length = 0;
        snap.games.forEach(function(g) { GAMES.push(g); });
        renderGames(GAMES);
        AppState.settings = JSON.parse(JSON.stringify(snap.settings));
        AppState.saveSettings();
        AppState._applySettings();
        if (typeof updateNavBar === 'function') updateNavBar();
    }

    function undoChange() {
        if (_changeIndex <= 0) return;
        _changeIndex--;
        restoreSnapshot(_changeStack[_changeIndex]);
    }

    function redoChange() {
        if (_changeIndex >= _changeStack.length - 1) return;
        _changeIndex++;
        restoreSnapshot(_changeStack[_changeIndex]);
    }

    function updateUndoButtons() {
        var u = document.getElementById("jarvis-undo");
        var r = document.getElementById("jarvis-redo");
        if (u) u.style.opacity = _changeIndex > 0 ? "1" : ".3";
        if (r) r.style.opacity = _changeIndex < _changeStack.length - 1 ? "1" : ".3";
    }

    function deployToGitHub() {
        var btn = document.getElementById("jarvis-deploy");
        if (!btn) return;
        btn.textContent = "Deploying...";
        btn.disabled = true;
        fetch("/api/deploy", { method: "POST" }).then(function(r) { return r.json(); }).then(function(d) {
            if (d.success) { toast("Deployed to GitHub!"); btn.textContent = "Deployed"; }
            else { toast("Deploy failed: " + (d.error || d.detail || "unknown")); btn.textContent = "Deploy"; btn.disabled = false; }
        }).catch(function(e) {
            toast("Deploy error: " + e.message);
            btn.textContent = "Deploy";
            btn.disabled = false;
        });
    }

    function parseAndExecute(reply) {
        var lines = reply.split("\n");
        var actionLines = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.indexOf("ADD_GAME:") === 0 || line.indexOf("BROADCAST:") === 0 || line.indexOf("SETTINGS:") === 0 || line.indexOf("SET_ROLE:") === 0 || line.indexOf("BAN:") === 0 || line.indexOf("UNBAN:") === 0 || line.indexOf("REMOVE_GAME:") === 0) actionLines.push(line);
        }
        if (!actionLines.length) return [];
        saveSnapshot();
        var executed = [];
        for (var j = 0; j < actionLines.length; j++) {
            var cmd = actionLines[j];
            try {
                if (cmd.indexOf("ADD_GAME:") === 0) {
                    var data = JSON.parse(cmd.substring(9).trim());
                    var newGame = { title: data.title || "New Game", url: data.url || data.file || "", f: data.file || data.f || "", local: false };
                    if (data.title && data.url) {
                        var dup = false;
                        for (var gi = 0; gi < GAMES.length; gi++) {
                            if ((GAMES[gi].title || "").toLowerCase() === data.title.toLowerCase()) { dup = true; break; }
                        }
                        if (!dup) { GAMES.push(newGame); renderGames(GAMES); executed.push("Added game: " + data.title); }
                        else executed.push("Skipped duplicate: " + data.title);
                    }
                } else if (cmd.indexOf("BROADCAST:") === 0) {
                    var msg = cmd.substring(10).trim();
                    fetch("/broadcast", { method: "POST", body: JSON.stringify({ text: msg, admin: AppState.user }) });
                    executed.push("Broadcast sent");
                } else if (cmd.indexOf("SETTINGS:") === 0) {
                    var sdata = JSON.parse(cmd.substring(9).trim());
                    for (var sk in sdata) { if (sdata.hasOwnProperty(sk) && AppState.settings.hasOwnProperty(sk)) { AppState.settings[sk] = sdata[sk]; } }
                    AppState.saveSettings();
                    AppState._applySettings();
                    if (sdata.stealth) executed.push("Stealth mode on");
                    if (sdata.compactGrid) executed.push("Compact grid on");
                    if (sdata.accent) executed.push("Accent changed");
                    if (sdata.proxy) { try { localStorage.setItem("cache-proxy", sdata.proxy); } catch(e){} executed.push("Proxy mode: " + sdata.proxy); }
                } else if (cmd.indexOf("SET_ROLE:") === 0) {
                    var rdata = JSON.parse(cmd.substring(9).trim());
                    if (rdata.user && rdata.role) { setUserRole(rdata.user, rdata.role); executed.push("Role set for " + rdata.user); updateNavBar(); }
                } else if (cmd.indexOf("REMOVE_GAME:") === 0) {
                    var target = cmd.substring(12).trim().toLowerCase();
                    for (var k = GAMES.length - 1; k >= 0; k--) {
                        if ((GAMES[k].title || "").toLowerCase().indexOf(target) >= 0 || (GAMES[k].f || "").toLowerCase().indexOf(target) >= 0) {
                            GAMES.splice(k, 1); executed.push("Removed matching: " + target);
                        }
                    }
                    renderGames(GAMES);
                }
            } catch (e) { executed.push("Failed: " + cmd.substring(0, 30) + " - " + e.message); }
        }
        return executed;
    }

    if (clearBtn) clearBtn.addEventListener("click", function () {
        _jarvisHistory = [];
        conv.innerHTML = "";
        addMsg("assistant", '<div style="color:var(--muted)">Jarvis ready. Waiting for command.</div>');
    });

    if (stopBtn) stopBtn.addEventListener("click", function () {
        if (_jarvisAbort) { try { _jarvisAbort.abort(); } catch (e) {} _jarvisAbort = null; }
        removeLoading();
        addMsg("assistant", '<div style="color:var(--muted)">Command cancelled.</div>');
    });

    /* API Key toggle and save */
    var keyToggle = document.getElementById("jarvis-key-toggle");
    var keySection = document.getElementById("jarvis-key-section");
    var keyInput = document.getElementById("jarvis-api-key");
    var keySave = document.getElementById("jarvis-api-save");
    if (keyToggle && keySection) keyToggle.addEventListener("click", function () {
        keySection.style.display = keySection.style.display === "none" ? "block" : "none";
        if (keySection.style.display === "block") { fetch("/api/ai/key").then(function(r){return r.json()}).then(function(d){ if (d.hasKey) { keyInput.placeholder = "Key saved (enter new to replace)"; } }); }
    });
    if (keySave && keyInput) keySave.addEventListener("click", function () {
        var key = keyInput.value.trim();
        if (!key) { toast("Enter an API key"); return; }
        fetch("/api/ai/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: key }) }).then(function(r){
            if (r.ok) { toast("API key saved"); keyInput.value = ""; keyInput.placeholder = "Key saved"; keySection.style.display = "none"; }
            else { toast("Failed to save key"); }
        });
    });

    /* Undo / Redo / Deploy buttons */
    var undoBtn = document.getElementById("jarvis-undo");
    var redoBtn = document.getElementById("jarvis-redo");
    var deployBtn = document.getElementById("jarvis-deploy");
    if (undoBtn) undoBtn.addEventListener("click", undoChange);
    if (redoBtn) redoBtn.addEventListener("click", redoChange);
    if (deployBtn) deployBtn.addEventListener("click", deployToGitHub);

    if (submit) submit.addEventListener("click", sendJarvis);
    if (input) input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendJarvis(); }
    });

    if (!conv.children.length) {
        addMsg("assistant", '<div style="color:var(--muted)">Jarvis ready. Chat with me or ask me to manage the site — "add 5 games", "broadcast hi", etc.</div>');
        saveSnapshot();
    }

    var modelSelect = document.getElementById("jarvis-model");
    var currentModel = modelSelect ? modelSelect.value : "auto";
    var _jarvisHistory = [];

    function sendJarvis() {
        var text = input.value.trim();
        if (!text) return;
        input.value = "";
        input.style.height = "44px";
        addMsg("user", '<div style="color:var(--accent);font-weight:500">' + escapeHtml(text) + '</div>');
        _jarvisHistory.push({ role: "user", content: text });

        var systemPrompt = "You are Jarvis, a conversational AI assistant for the Cache games website. Be friendly, helpful, and natural — like ChatGPT. The website has:\n"
            + "- " + GAMES.length + " games (each with title and url)\n"
            + "- Web proxy, admin panel, music player, AI chat, settings\n\n"
            + "When the user asks to perform an action, include the appropriate command on its own line:\n"
            + "ADD_GAME: {\"title\":\"...\",\"url\":\"...\"} — BROADCAST: message — REMOVE_GAME: name — SETTINGS: {\"key\":\"value\"} — SET_ROLE: {\"user\":\"name\",\"role\":\"admin|mod\"}\n"
            + "But for casual conversation, just chat normally. Be concise but warm.";

        addLoading();
        _jarvisAbort = new AbortController();
        var timeoutId = setTimeout(function () { try { _jarvisAbort.abort(); } catch(e) {} }, 45000);

        fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "system", content: systemPrompt }].concat(_jarvisHistory.slice(-30)) }),
            signal: _jarvisAbort.signal
        }).then(function (res) {
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error("AI returned status " + res.status);
            return res.json();
        }).then(function (data) {
            removeLoading();
            var reply = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "No response";
            _jarvisHistory.push({ role: "assistant", content: reply });
            var executed = parseAndExecute(reply);
            var actionPrefixes = ["ADD_GAME:", "BROADCAST:", "REMOVE_GAME:", "SETTINGS:", "SET_ROLE:", "BAN:", "UNBAN:"];
            var cleanReply = reply;
            reply.split("\n").forEach(function (l) {
                for (var pi = 0; pi < actionPrefixes.length; pi++) { if (l.trim().indexOf(actionPrefixes[pi]) === 0) cleanReply = cleanReply.replace(l, ""); }
            });
            cleanReply = cleanReply.trim();
            var html = "";
            if (cleanReply) html += '<div>' + escapeHtml(cleanReply).replace(/\n/g, "<br>") + '</div>';
            if (executed.length) html += '<div style="margin-top:8px;padding:8px 10px;background:rgba(16,185,129,.12);border-radius:8px;font-size:12px;color:#10b981">Executed:<br>' + executed.map(function (e) { return "&check; " + escapeHtml(e); }).join("<br>") + '</div>';
            addMsg("assistant", html);
        }).catch(function (err) {
            clearTimeout(timeoutId);
            removeLoading();
            if (err.name === "AbortError") { addMsg("assistant", '<div style="color:var(--muted)">Request timed out after 45s. Try again.</div>'); return; }
            addMsg("assistant", '<div style="color:var(--pink)">Could not reach Jarvis — server may have restarted. Try a hard refresh (Ctrl+F5) and try again.</div>');
        });
    }
}

function escapeHtml(str) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
}

function renderSessions() {
    var body = document.getElementById("sessions-body");
    if (!body) return;
    var s = AppState.sessions;
    if (!s || !s.length) body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">No active sessions</td></tr>';
    else body.innerHTML = s.map(function (s) {
        var role = getUserRole(s.handle);
        var badge = role === "admin" ? '<span style="color:var(--accent);font-size:11px;font-weight:600">ADMIN</span>' : role === "mod" ? '<span style="color:#f59e0b;font-size:11px;font-weight:600">MOD</span>' : '<span style="color:var(--muted);font-size:11px">user</span>';
        return '<tr><td>' + s.handle + '</td><td>' + new Date(s.loginTime).toLocaleString() + '</td><td>' + (s.gamesPlayed || 0) + '</td><td>' + badge + '</td></tr>';
    }).join("");
}

function renderCanvas() {
    var editor = document.getElementById("admin-canvas-editor"), btn = document.getElementById("canvas-update-btn");
    if (editor) editor.value = AppState.canvas;
    if (btn) btn.addEventListener("click", function () { AppState.canvas = (editor ? editor.value : "").trim() || "Welcome to Cache"; AppState.saveCanvas(); toast("Canvas updated"); });
}

function renderAnalytics() {
    var e1 = document.getElementById("stat-sessions"), e2 = document.getElementById("stat-launched"), e3 = document.getElementById("stat-favs");
    if (e1) e1.textContent = AppState.analytics.sessions || 0;
    if (e2) e2.textContent = AppState.analytics.launched || 0;
    if (e3) e3.textContent = AppState.favorites.length;
}

function renderAppearance() {
    var s = AppState.settings, picker = document.getElementById("color-picker");
    if (picker) {
        var colors = ["#2563eb", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#6366f1"];
        picker.innerHTML = "";
        colors.forEach(function (c) {
            var swatch = document.createElement("div");
            swatch.className = "color-swatch" + (s.accent === c ? " active" : "");
            swatch.style.background = c;
            swatch.addEventListener("click", function () { s.accent = c; AppState.saveSettings(); AppState._applySettings(); Array.from(document.querySelectorAll(".color-swatch")).forEach(function (x) { x.classList.remove("active"); }); swatch.classList.add("active"); });
            picker.appendChild(swatch);
        });
    }
    var opts = document.getElementById("appearance-options");
    if (!opts) return;
    var html = "";
    html += '<div class="stealth-row" style="padding:10px 0"><div><div style="font-size:13px;font-weight:500">Stealth Mode</div><div style="font-size:11px;color:var(--muted)">Disguises tab as Google Drive</div></div><button id="stealth-toggle" class="stealth-toggle' + (s.stealth ? " active" : "") + '"></button></div>';
    html += '<div class="stealth-row" style="padding:10px 0"><div><div style="font-size:13px;font-weight:500">Compact Grid</div></div><button id="compact-toggle" class="stealth-toggle' + (s.compactGrid ? " active" : "") + '"></button></div>';
    html += '<div class="stealth-row" style="padding:10px 0"><div><div style="font-size:13px;font-weight:500">Low-Data Mode</div></div><button id="lowdata-toggle" class="stealth-toggle' + (s.lowData ? " active" : "") + '"></button></div>';
    html += '<hr style="border-color:var(--border);margin:16px 0"><div class="stealth-row" style="padding:4px 0"><div><div style="font-size:13px;font-weight:500">OpenRouter AI Key</div><div style="font-size:11px;color:var(--muted)" id="ai-key-status">Checking...</div></div><div style="display:flex;gap:6px;align-items:center"><input type="password" id="admin-ai-key-input" placeholder="sk-or-..." style="width:180px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:rgba(255,255,255,.04);color:var(--text);font-size:11px;outline:none"><button id="admin-ai-key-save" class="modal-btn primary" style="padding:5px 12px;font-size:11px">Save</button></div></div>';
    opts.innerHTML = html;
    fetch("/api/ai/key").then(function(r){return r.json()}).then(function(d){ var ks = document.getElementById("ai-key-status"); if (ks) ks.textContent = d.hasKey ? "Key set" : "No key set — Cache AI will be unavailable"; });
    var aiKeySave = document.getElementById("admin-ai-key-save"), aiKeyInput = document.getElementById("admin-ai-key-input");
    if (aiKeySave && aiKeyInput) aiKeySave.addEventListener("click", function () {
        var key = aiKeyInput.value.trim();
        if (!key) { toast("Enter a key"); return; }
        fetch("/api/ai/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: key }) }).then(function(r){
            if (r.ok) { toast("Global AI key saved"); aiKeyInput.value = ""; var ks = document.getElementById("ai-key-status"); if (ks) ks.textContent = "Key set"; }
            else { toast("Failed to save key"); }
        });
    });
    var st = document.getElementById("stealth-toggle");
    if (st) st.addEventListener("click", function () { s.stealth = !s.stealth; AppState.saveSettings(); AppState._applySettings(); st.classList.toggle("active"); });
    var ct = document.getElementById("compact-toggle");
    if (ct) ct.addEventListener("click", function () { s.compactGrid = !s.compactGrid; AppState.saveSettings(); ct.classList.toggle("active"); });
    var lt = document.getElementById("lowdata-toggle");
    if (lt) lt.addEventListener("click", function () { s.lowData = !s.lowData; AppState.saveSettings(); lt.classList.toggle("active"); });
}

function renderUploader() {
    var dz = document.getElementById("drop-zone"), fi = document.getElementById("file-input"), sb = document.getElementById("upload-submit"), ti = document.getElementById("upload-title"), ci = document.getElementById("upload-category"), st = document.getElementById("upload-status");
    var uploadedFile = null;
    if (dz && fi) {
        dz.addEventListener("click", function () { fi.click(); });
        dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("drag-over"); });
        dz.addEventListener("dragleave", function () { dz.classList.remove("drag-over"); });
        dz.addEventListener("drop", function (e) { e.preventDefault(); dz.classList.remove("drag-over"); if (e.dataTransfer.files.length) { uploadedFile = e.dataTransfer.files[0]; if (st) st.textContent = "File: " + uploadedFile.name; } });
        fi.addEventListener("change", function () { if (fi.files.length) { uploadedFile = fi.files[0]; if (st) st.textContent = "File: " + uploadedFile.name; } });
    }
    if (sb) sb.addEventListener("click", function () {
        if (!uploadedFile) { if (st) st.textContent = "Please select a file first"; return; }
        var r = new FileReader();
        r.onload = function (e) {
            var content = e.target.result;
            var title = ti ? ti.value.trim() : "";
            var cat = ci ? ci.value.trim() : "Sideloaded";
            if (!title) title = uploadedFile.name.replace(/\.html$/i, "");
            fetch("/upload-game", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: uploadedFile.name, content: content, title: title, category: cat })
            }).then(function (res) { return res.json(); }).then(function (data) {
                if (data.success) { if (st) st.textContent = "Uploaded! Reloading catalog..."; toast("Game uploaded: " + title); loadAllGames().then(function (games) { if (games && games.length) { GAMES = games; renderCategories(); renderCatalog(); } }); } else { if (st) st.textContent = "Upload failed: " + (data.error || "unknown"); }
            }).catch(function () { if (st) st.textContent = "Upload error - server running?"; });
        };
        r.readAsText(uploadedFile);
    });
}

/* ===== Gateway ===== */
function initGateway() {
    var overlay = document.getElementById("gateway-overlay"), input = document.getElementById("username-input"), errEl = document.getElementById("gateway-error"), submit = document.getElementById("gateway-submit");
    var passInput = document.getElementById("gateway-passkey"), passErr = document.getElementById("gateway-pass-error"), passBtn = document.getElementById("gateway-pass-submit");
    var gc = document.getElementById("gateway-game-count");
    var returnInfo = document.getElementById("gateway-return-info");
    if (AppState.user && AppState.user !== "Guest") { overlay.classList.add("hidden"); setTimeout(initApp, 100); return; }
    if (gc) gc.textContent = GAMES.length;
    if (input) input.addEventListener("input", function () {
        var name = input.value.trim().toLowerCase();
        var role = getUserRole(name);
        if (returnInfo) {
            if (role === "admin") returnInfo.innerHTML = "&#10003; Welcome back, <strong>" + escapeHtml(name) + "</strong> (Admin) &mdash; admin panel auto-unlocked";
            else if (role === "mod") returnInfo.innerHTML = "&#10003; Welcome back, <strong>" + escapeHtml(name) + "</strong> (Moderator) &mdash; admin panel auto-unlocked";
            else returnInfo.innerHTML = "";
        }
    });
    function enter() {
        var name = (input ? input.value : "").trim();
        if (!name) { if (errEl) errEl.textContent = "Enter a handle"; if (input) input.classList.add("error"); return; }
        if (name.length < 2) { if (errEl) errEl.textContent = "At least 2 characters"; if (input) input.classList.add("error"); return; }
        AppState.user = name;
        AppState.saveUser();
        loadUserData(name);
        AppState.saveFavorites();
        AppState.saveSettings();
        AppState._syncSessions();
        overlay.classList.add("hidden");
        setTimeout(initApp, 100);
    }
    if (submit) submit.addEventListener("click", enter);
    if (input) { input.addEventListener("keydown", function (e) { if (e.key === "Enter") enter(); }); input.addEventListener("input", function () { if (errEl) errEl.textContent = ""; if (input) input.classList.remove("error"); }); }
    if (passBtn) passBtn.addEventListener("click", function () {
        var val = passInput ? passInput.value : "";
        if (val === "roundMin+2") { setUserRole((input ? input.value : "").trim().toLowerCase(), "admin"); if (passErr) passErr.textContent = "Admin role set! Enter your handle above."; } else { if (passErr) passErr.textContent = "Invalid passkey"; }
    });
}

/* ===== Panic ===== */
var _backslashTimer = null, _backslashCount = 0;

function triggerPanic() {
    var audios = document.querySelectorAll("audio,video,iframe");
    audios.forEach(function (el) { if (el.tagName === "IFRAME") return; el.pause(); el.muted = true; });
    window.location.href = "https://classroom.google.com";
}

document.addEventListener("keydown", function (e) {
    if (e.key === "\\" && AppState.settings.backslashPanic !== false) {
        e.preventDefault();
        _backslashCount++;
        if (_backslashCount === 1) { _backslashTimer = setTimeout(function () { _backslashCount = 0; }, 600); }
        if (_backslashCount >= 2) {
            clearTimeout(_backslashTimer);
            _backslashCount = 0;
            if (document.getElementById("admin-panel").classList.contains("open")) {
                if (confirm("Wipe all local data?")) { localStorage.clear(); toast("All local data wiped"); setTimeout(function () { location.reload(); }, 500); }
            } else { triggerPanic(); }
        } else { triggerPanic(); }
    }
});

document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p")) { e.preventDefault(); triggerPanic(); }
});

/* ===== Nav bar helpers ===== */
function updateNavBar() {
    var userEl = document.getElementById("nav-user");
    var roleBadge = document.getElementById("mod-badge");
    var adminBtn = document.getElementById("nav-admin-btn");
    if (adminBtn) adminBtn.style.display = "";
    var role = currentUserRole();
    if (userEl) {
        if (role === "admin") userEl.textContent = (AppState.user || "") + " (Admin)";
        else if (role === "mod") userEl.textContent = (AppState.user || "") + " (Mod)";
        else userEl.textContent = AppState.user || "";
        userEl.style.display = AppState.user ? "" : "none";
    }
    if (roleBadge) {
        if (role === "admin") { roleBadge.textContent = "Admin"; roleBadge.style.display = ""; roleBadge.style.background = "var(--accent)"; roleBadge.style.color = "#0b0b12"; } else if (role === "mod") { roleBadge.textContent = "Mod"; roleBadge.style.display = ""; roleBadge.style.background = "#f59e0b"; roleBadge.style.color = "#fff"; } else roleBadge.style.display = "none";
    }
}

/* ===== Admin authentication ===== */
var adminOverlay = document.getElementById("admin-overlay"), adminPanel = document.getElementById("admin-panel");
if (adminOverlay) {
    var authSubmit = document.getElementById("auth-submit"), authCancel = document.getElementById("auth-cancel"), authPasskey = document.getElementById("auth-passkey"), authError = document.getElementById("auth-error");
    if (authSubmit) authSubmit.addEventListener("click", function () {
        var val = authPasskey.value;
        if (val === "roundMin+2") { setUserRole(AppState.user ? AppState.user.toLowerCase() : "", "admin"); adminOverlay.classList.remove("open"); adminPanel.classList.add("open"); renderAdmin(); if (authError) authError.textContent = ""; updateNavBar(); toast("Admin authenticated via passkey"); } else { if (authError) authError.textContent = "Invalid passkey"; }
    });
    if (authCancel) authCancel.addEventListener("click", function () { adminOverlay.classList.remove("open"); if (authError) authError.textContent = ""; authPasskey.value = ""; });
    if (authPasskey) authPasskey.addEventListener("keydown", function (e) { if (e.key === "Enter") authSubmit.click(); });
}

/* Admin nav button - auto-auth if has role */
function openAdminPanel() {
    var role = currentUserRole();
    if (role === "admin" || role === "mod") {
        adminPanel.classList.add("open");
        renderAdmin();
    } else {
        adminOverlay.classList.add("open");
    }
}
var navAdminBtn = document.getElementById("nav-admin-btn");
if (navAdminBtn) {
    navAdminBtn.style.display = "";
    navAdminBtn.addEventListener("click", openAdminPanel);
}

/* Admin key combo: type a ` m in sequence */
var adminKeySeq = [];
document.addEventListener("keydown", function (e) {
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    adminKeySeq.push(e.key);
    if (adminKeySeq.length > 3) adminKeySeq.shift();
    if (adminKeySeq.length === 3 && adminKeySeq[0] === "a" && (adminKeySeq[1] === "`" || adminKeySeq[1] === "Dead") && adminKeySeq[2] === "m") {
        adminKeySeq = [];
        openAdminPanel();
    }
});

/* ===== Settings toggles ===== */
var toggleAnim = document.getElementById("toggle-anim");
if (toggleAnim) toggleAnim.addEventListener("click", function () {
    AppState.settings.animations = !AppState.settings.animations;
    AppState.saveSettings();
    this.classList.toggle("active");
    document.documentElement.style.setProperty("--anim-speed", AppState.settings.animations ? ".3s" : "0s");
});

var fpsToggle = document.getElementById("fps-toggle");
if (fpsToggle) fpsToggle.addEventListener("click", function () {
    AppState.settings.showFps = !AppState.settings.showFps;
    AppState.saveSettings();
    this.classList.toggle("active");
    var el = document.getElementById("fps-counter");
    if (el) el.style.display = AppState.settings.showFps ? "block" : "none";
});

var memBtn = document.getElementById("mem-cleanup-btn");
if (memBtn) memBtn.addEventListener("click", function () {
    if ("caches" in window) { caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }); }
    toast("Cache flushed");
});

/* ===== Patch Notes ===== */
(function () {
    var patchModal = document.getElementById("patchModal");
    if (!localStorage.getItem("cache-patch-seen") && patchModal) { patchModal.classList.remove("hidden"); }
    function dismissPatch() { patchModal.classList.add("hidden"); try { localStorage.setItem("cache-patch-seen", "1"); } catch (e) { } }
    document.getElementById("patchClose").addEventListener("click", dismissPatch);
    document.getElementById("patchGotIt").addEventListener("click", dismissPatch);
    if (patchModal) patchModal.addEventListener("click", function (e) { if (e.target === patchModal) dismissPatch(); });
})();

/* ===== Theater buttons ===== */
document.getElementById("theater-back").addEventListener("click", closeTheater);
document.getElementById("theater-fullscreen").addEventListener("click", goFullscreen);
document.getElementById("theater-download").addEventListener("click", goDownload);
document.getElementById("dock-back").addEventListener("click", closeTheater);
document.getElementById("dock-reload").addEventListener("click", function () { var frame = document.getElementById("theater-frame"); if (frame) frame.src = frame.src; });
document.getElementById("dock-fullscreen").addEventListener("click", goFullscreen);
document.getElementById("dock-download").addEventListener("click", goDownload);
document.getElementById("dock-open").addEventListener("click", goOpen);
document.getElementById("dock-cloak").addEventListener("click", goCloak);

/* ===== Init ===== */
function initApp() {
    try { AppState._applySettings(); } catch (e) { }
    try { updateNavBar(); } catch (e) { }
    try { renderGames(GAMES); } catch (e) { }
    try { renderAdmin(); } catch (e) { }
    try { ensureProxy(); } catch (e) { }
    var gc = document.getElementById("game-count");
    if (gc) gc.textContent = GAMES.length;
    if (AppState.user && AppState.user !== "Guest") loadUserData(AppState.user);
}

setTimeout(function () {
    AppState._applySettings();
    if (GAMES.length > 0) {
        loadAllGames().then(function (games) {
            if (games && games.length) { GAMES = games; renderGames(GAMES); var gc = document.getElementById("game-count"); if (gc) gc.textContent = GAMES.length; }
        });
    }
    initGateway();
}, 100);
