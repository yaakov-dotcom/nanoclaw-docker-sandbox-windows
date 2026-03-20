// CDP proxy: routes Chrome CDP through the sandbox MITM proxy
// HTTP: forward proxy mode. WebSocket: upgrade via forward proxy.
import { createServer, request as httpRequest } from 'http';
import { HttpProxyAgent } from 'http-proxy-agent';

const LISTEN_PORT = 9222;
const PROXY_URL = process.env.http_proxy || process.env.HTTP_PROXY || 'http://host.docker.internal:3128';
const agent = new HttpProxyAgent(PROXY_URL);

const httpServer = createServer((req, res) => {
  const opts = {
    hostname: 'host.docker.internal',
    port: 9222,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: 'host.docker.internal:9222' },
    agent,
  };
  const proxy = httpRequest(opts, (cr) => {
    let body = '';
    cr.on('data', (chunk) => body += chunk);
    cr.on('end', () => {
      const rewritten = body
        .replace(/127\.0\.0\.1:9222/g, `host.docker.internal:${LISTEN_PORT}`)
        .replace(/localhost:9222/g, `host.docker.internal:${LISTEN_PORT}`);
      const headers = { ...cr.headers };
      headers['content-length'] = Buffer.byteLength(rewritten);
      res.writeHead(cr.statusCode, headers);
      res.end(rewritten);
    });
  });
  req.pipe(proxy);
  proxy.on('error', (e) => { console.error('HTTP error:', e.message); res.writeHead(502); res.end(e.message); });
});

// WebSocket: pipe the upgrade request through the forward proxy
httpServer.on('upgrade', (req, clientSocket, head) => {
  const opts = {
    hostname: 'host.docker.internal',
    port: 9222,
    path: req.url,
    method: 'GET',
    headers: { ...req.headers, host: 'host.docker.internal:9222' },
    agent,
  };
  const proxy = httpRequest(opts);
  proxy.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    // Send 101 back to client
    let response = `HTTP/1.1 101 Switching Protocols\r\n`;
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      response += `${k}: ${v}\r\n`;
    }
    response += '\r\n';
    clientSocket.write(response);
    if (proxyHead.length) clientSocket.write(proxyHead);
    if (head.length) proxySocket.write(head);
    // Bidirectional pipe
    proxySocket.pipe(clientSocket);
    clientSocket.pipe(proxySocket);
    proxySocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => proxySocket.destroy());
  });
  proxy.on('error', (e) => {
    console.error('WS upgrade error:', e.message);
    clientSocket.destroy();
  });
  proxy.end();
});

httpServer.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`CDP proxy listening on 0.0.0.0:${LISTEN_PORT} via ${PROXY_URL}`);
});
