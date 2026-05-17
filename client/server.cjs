const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BUILD = path.join(__dirname, 'build');

const mime = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(BUILD, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);

  if (!fs.existsSync(filePath) || !ext) {
    filePath = path.join(BUILD, 'index.html');
  }

  const contentType = mime[path.extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => console.log(`Dashboard serving on port ${PORT}`));
