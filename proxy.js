var ProxyEngines = {};

var serverProxyEngine = {
  name: 'Server Proxy',
  id: 'server',
  _proxyBase: '/api/proxy/',
  async init() {},
  createFrame() {
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block';
    iframe.setAttribute('allow', 'autoplay; fullscreen; clipboard-read; clipboard-write');
    var _this = this;
    return {
      frame: iframe,
      go: function(u) { _this.navigate({ frame: iframe }, u); },
      back: function() { try { iframe.contentWindow.history.back(); } catch {} },
      forward: function() { try { iframe.contentWindow.history.forward(); } catch {} },
      reload: function() { try { iframe.contentWindow.location.reload(); } catch {} },
    };
  },
  encodeUrl(url) {
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return this._proxyBase + encodeURIComponent(url);
  },
  decodeUrl(url) {
    try {
      var prefix = this._proxyBase;
      if (url.startsWith(prefix)) return decodeURIComponent(url.slice(prefix.length));
      return url;
    } catch { return url; }
  },
  navigate(frame, url) {
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch { return; }
    frame.frame.src = this._proxyBase + encodeURIComponent(url);
  },
};

var directFallbackEngine = {
  name: 'Direct',
  id: 'direct',
  async init() {},
  createFrame() {
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block';
    iframe.setAttribute('allow', 'autoplay; fullscreen; clipboard-read; clipboard-write');
    var _this = this;
    return {
      frame: iframe,
      go: function(u) { _this.navigate({ frame: iframe }, u); },
      back: function() { try { iframe.contentWindow.history.back(); } catch {} },
      forward: function() { try { iframe.contentWindow.history.forward(); } catch {} },
      reload: function() { try { iframe.contentWindow.location.reload(); } catch {} },
    };
  },
  encodeUrl(url) {
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  },
  decodeUrl(url) { return url; },
  navigate(frame, url) {
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    frame.frame.src = url;
  },
};

ProxyEngines.scramjet = null;
ProxyEngines.server = serverProxyEngine;
ProxyEngines.direct = directFallbackEngine;
