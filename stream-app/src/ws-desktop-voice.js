import { WebSocketServer, WebSocket } from "ws";
import { verifyDesktopToken } from "./desktop-auth.js";

const VOICE_SERVER_URL = process.env.VOICE_SERVER_URL || "ws://voice-server:4001";
const VOICE_PROXY_SECRET = process.env.VOICE_SERVER_SECRET || "";
const UPSTREAM_CONNECT_TIMEOUT = 5000;

export function attachDesktopVoiceWss(httpServer) {
  const proxyWss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/ws/desktop/voice")) return;

    try {
      const u = new URL(req.url, "http://localhost");
      const token = u.searchParams.get("token") || "";
      const user = verifyDesktopToken(token);
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      console.log("[desktop-voice] upgrade ok:", user.username);
      proxyWss.handleUpgrade(req, socket, head, (clientWs) => {
        clientWs.user = user;
        proxyWss.emit("connection", clientWs, req);
      });
    } catch {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  });

  proxyWss.on("connection", (clientWs) => {
    const upstreamHeaders = {};
    if (VOICE_PROXY_SECRET) {
      upstreamHeaders["x-voice-proxy-secret"] = VOICE_PROXY_SECRET;
    }

    const upstream = new WebSocket(VOICE_SERVER_URL + "/voice/", {
      headers: upstreamHeaders
    });

    const msgBuffer = [];
    let upstreamReady = false;
    let pongTimeout = null;
    let keepaliveInterval = null;
    let connectTimeout = null;

    const flushBuffer = () => {
      for (const [data, isBinary] of msgBuffer) {
        try {
          if (upstream.readyState === 1) {
            upstream.send(data, { binary: isBinary });
          }
        } catch (e) {
          console.warn("[desktop-voice] flush send error:", e.message);
        }
      }
      msgBuffer.length = 0;
    };

    const stopKeepalive = () => {
      clearTimeout(pongTimeout);
      clearInterval(keepaliveInterval);
    };

    const cleanup = () => {
      clearTimeout(connectTimeout);
      stopKeepalive();
      msgBuffer.length = 0;
    };

    connectTimeout = setTimeout(() => {
      if (upstream.readyState !== 1) {
        console.error("[desktop-voice] upstream connect timeout");
        upstream.terminate();
        clientWs.close(4002, "Voice server unavailable");
      }
    }, UPSTREAM_CONNECT_TIMEOUT);

    upstream.on("open", () => {
      clearTimeout(connectTimeout);
      upstreamReady = true;
      console.log("[desktop-voice] upstream connected");
      flushBuffer();

      keepaliveInterval = setInterval(() => {
        if (upstream.readyState !== 1) {
          stopKeepalive();
          return;
        }
        upstream.ping();
        pongTimeout = setTimeout(() => {
          if (upstream.readyState === 1) {
            console.warn("[desktop-voice] keepalive timeout, closing");
            upstream.terminate();
            clientWs.terminate();
          }
        }, 10000);
      }, 30000);
    });

    upstream.on("error", (err) => {
      console.error("[desktop-voice] upstream error:", err.message);
      cleanup();
      if (clientWs.readyState === 1) {
        clientWs.close(4002, "Voice server error");
      }
    });

    clientWs.on("error", (err) => {
      console.error("[desktop-voice] client error:", err.message);
      cleanup();
      if (upstream.readyState === 1) {
        upstream.close();
      }
    });

    clientWs.on("message", (data, isBinary) => {
      if (!upstreamReady) {
        msgBuffer.push([data, isBinary]);
        return;
      }
      try {
        if (upstream.readyState === 1) {
          upstream.send(data, { binary: isBinary });
        }
      } catch (e) {
        console.warn("[desktop-voice] client→upstream send error:", e.message);
      }
    });

    upstream.on("message", (data, isBinary) => {
      try {
        if (clientWs.readyState === 1) {
          clientWs.send(data, { binary: isBinary });
        }
      } catch (e) {
        console.warn("[desktop-voice] upstream→client send error:", e.message);
      }
    });

    clientWs.on("ping", (data) => {
      try {
        if (upstream.readyState === 1) upstream.ping(data);
      } catch {}
    });
    upstream.on("ping", (data) => {
      try {
        if (clientWs.readyState === 1) clientWs.ping(data);
      } catch {}
    });
    clientWs.on("pong", (data) => {
      try {
        if (upstream.readyState === 1) upstream.pong(data);
      } catch {}
    });
    upstream.on("pong", () => {
      clearTimeout(pongTimeout);
    });

    clientWs.on("close", () => {
      cleanup();
      if (upstream.readyState === 1 || upstream.readyState === 0) {
        upstream.close();
      }
    });

    upstream.on("close", () => {
      cleanup();
      if (clientWs.readyState === 1) {
        clientWs.close(4000, "Upstream closed");
      }
    });
  });

  const cleanup = () => {
    proxyWss.clients.forEach((clientWs) => {
      try { clientWs.terminate(); } catch {}
    });
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  console.log("[desktop-voice] started, upstream:", VOICE_SERVER_URL);
}
