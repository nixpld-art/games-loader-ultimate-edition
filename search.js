function search(input, template) {
  try { return new URL(input).toString(); } catch (err) {}
  try {
    var url = new URL('http://' + input);
    if (url.hostname.includes('.')) return url.toString();
    if (url.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return url.toString();
  } catch (err) {}
  return template.replace('%s', encodeURIComponent(input));
}
