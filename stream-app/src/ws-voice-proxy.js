import { WebSocketServer, WebSocket } from "ws";
import { consumeRememberToken, rememberCookie } from "./remember.js";

const VOICE_SERVER_URL = process.env.VOICE_SERVER_URL || "ws://voice-server:4001";
const VOICE_PROXY_SECRET = process.env.VOICE_SERVER_SECRET || "";
const UPSTREAM_CONNECT_TIMEOUT = 5000;

export function attachVoiceProxy(httpServer, sessionParser) {
  const proxyWss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/voice/")) return;

    sessionParser(req, {}, async () => {
      let user = req.session?.user;

      // Fallback: try remember-me if session is empty (multi-device conflict)
      if (!user?.id && req.cookies?.remember) {
        try {
          const r = await consumeRememberToken(req.cookies.remember);
          if (r?.ok && r.user?.id) {
            req.session.user = r.user;
            await new Promise((resolve) => req.session.save(resolve));
            user = r.user;
            console.log("[voice-proxy] session restored via remember-me:", user.username);
          }
        } catch (e) {
          console.warn("[voice-proxy] remember-me restore failed:", e.message);
        }
      }

      if (!user?.id || !user?.username) {
        console.log("[voice-proxy] rejected upgrade: no session, cookies:", !!req.cookies, "remember:", !!req.cookies?.remember);
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      console.log("[voice-proxy] upgrade ok:", user.username, "sessionId:", req.sessionID);
      proxyWss.handleUpgrade(req, socket, head, (clientWs) => {
        proxyWss.emit("connection", clientWs, req);
      });
    });
  });

  proxyWss.on("connection", (clientWs, req) => {
    const upstreamHeaders = {};
    if (VOICE_PROXY_SECRET) {
      upstreamHeaders["x-voice-proxy-secret"] = VOICE_PROXY_SECRET;
    }

    const upstream = new WebSocket(VOICE_SERVER_URL + "/voice/", {
      headers: upstreamHeaders
    });

    // Buffer for client→upstream messages while upstream is connecting
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
          console.warn("[voice-proxy] flush send error:", e.message);
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
        console.error("[voice-proxy] upstream connect timeout");
        upstream.terminate();
        clientWs.close(4002, "Voice server unavailable");
      }
    }, UPSTREAM_CONNECT_TIMEOUT);

    upstream.on("open", () => {
      clearTimeout(connectTimeout);
      upstreamReady = true;
      console.log("[voice-proxy] upstream connected");
      flushBuffer();

      keepaliveInterval = setInterval(() => {
        if (upstream.readyState !== 1) {
          stopKeepalive();
          return;
        }
        upstream.ping();
        pongTimeout = setTimeout(() => {
          if (upstream.readyState === 1) {
            console.warn("[voice-proxy] keepalive timeout, closing");
            upstream.terminate();
            clientWs.terminate();
          }
        }, 10000);
      }, 30000);
    });

    upstream.on("error", (err) => {
      console.error("[voice-proxy] upstream error:", err.message);
      cleanup();
      if (clientWs.readyState === 1) {
        clientWs.close(4002, "Voice server error");
      }
    });

    clientWs.on("error", (err) => {
      console.error("[voice-proxy] client error:", err.message);
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
        console.warn("[voice-proxy] client→upstream send error:", e.message);
      }
    });

    upstream.on("message", (data, isBinary) => {
      try {
        if (clientWs.readyState === 1) {
          clientWs.send(data, { binary: isBinary });
        }
      } catch (e) {
        console.warn("[voice-proxy] upstream→client send error:", e.message);
      }
    });

    // Forward ping/pong between client and upstream
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

  // Graceful shutdown
  const cleanup = () => {
    proxyWss.clients.forEach((clientWs) => {
      try { clientWs.terminate(); } catch {}
    });
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  console.log("[voice-proxy] started, upstream:", VOICE_SERVER_URL);
}
