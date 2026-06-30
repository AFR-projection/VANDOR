import http, { request as httpRequest } from "node:http";

const PORT = Number(process.env.PORT || 8080);
const COBALT_PORT = Number(process.env.COBALT_PORT || 9000);
const YTDLP_PORT = Number(process.env.YTDLP_PORT || 8081);

function proxyRequest(req, res, targetPort, rewritePath) {
  const path = rewritePath ?? req.url ?? "/";
  const headers = { ...req.headers, host: `127.0.0.1:${targetPort}` };

  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      method: req.method,
      path,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: `Upstream error: ${err.message}` }));
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/ytdlp/health" || url.startsWith("/ytdlp/health?")) {
    proxyRequest(req, res, YTDLP_PORT, "/health");
    return;
  }

  if (url.startsWith("/ytdlp/")) {
    proxyRequest(req, res, YTDLP_PORT, url.slice("/ytdlp".length) || "/");
    return;
  }

  proxyRequest(req, res, COBALT_PORT, url);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[vandor-media-proxy] :${PORT} -> cobalt :${COBALT_PORT}, ytdlp :${YTDLP_PORT}`
  );
});
