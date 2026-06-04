import http from "http";
import { URL } from "url";
import { config } from "./config.js";
import { startWsServer } from "./ws.js";
import { rooms, getOrCreateRoom, removeRoom, forceRemoveRoom } from "./rooms.js";

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${config.port}`);

  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("OK");
  }

  if (req.method === "GET" && url.pathname === "/rooms/status") {
    const status = {};
    for (const [slug, room] of rooms.entries()) {
      status[slug] = {
        count: room.peers.size,
        peers: room.getPeersSnapshot().map((peer) => ({
          peerId: peer.peerId,
          userId: peer.userId,
          username: peer.username
        }))
      };
    }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(status));
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/room/")) {
    const slug = decodeURIComponent(url.pathname.slice(6));
    const removed = forceRemoveRoom(slug);
    res.writeHead(removed ? 200 : 404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: removed }));
  }

  res.writeHead(404);
  res.end();
});

startWsServer({ server });

server.listen(config.port, "0.0.0.0", () => {
  console.log(`[voice] listening on :${config.port} env=${config.env}`);
});
