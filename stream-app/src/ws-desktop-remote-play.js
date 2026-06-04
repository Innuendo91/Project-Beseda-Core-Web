import { WebSocketServer } from "ws";
import { verifyDesktopToken } from "./desktop-auth.js";

const sessions = new Map();
const PAD_COUNT = 4;
const GAMEPAD_BATCH_MS = 5;

function safeJsonSend(ws, obj) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch {}
}

function normalizeStream(value) {
  const stream = String(value || "").trim();
  if (/^live\/[a-zA-Z0-9._\/-]{1,120}$/.test(stream)) return stream;
  return "";
}

function getSession(stream) {
  let session = sessions.get(stream);
  if (!session) {
    session = {
      host: null,
      players: Array(PAD_COUNT).fill(null),
      allowedPlayers: Array(PAD_COUNT).fill(null),
      pendingPadStates: Array(PAD_COUNT).fill(null),
      padFlushTimer: null,
    };
    sessions.set(stream, session);
  }
  if (!session.players) session.players = Array(PAD_COUNT).fill(null);
  if (!session.pendingPadStates) session.pendingPadStates = Array(PAD_COUNT).fill(null);
  if (session.padFlushTimer === undefined) session.padFlushTimer = null;
  if (!session.allowedPlayers) {
    session.allowedPlayers = Array(PAD_COUNT).fill(null);
    if (session.allowedPlayerId) {
      session.allowedPlayers[0] = {
        id: Number(session.allowedPlayerId),
        ...(session.allowedPlayer || {}),
      };
    }
  }
  return session;
}

function cleanupSession(stream) {
  const session = sessions.get(stream);
  if (!session) return;
  const hasPlayers = session.players?.some((player) => player?.readyState === 1);
  const hasAllowed = session.allowedPlayers?.some(Boolean);
  if (!session.host && !hasPlayers && !hasAllowed) {
    if (session.padFlushTimer) clearTimeout(session.padFlushTimer);
    sessions.delete(stream);
  }
}

function flushGamepadBatch(stream, session) {
  if (!session) return;
  session.padFlushTimer = null;

  const states = (session.pendingPadStates || [])
    .map((entry, padIndex) => entry ? { padIndex, playerId: entry.playerId, state: entry.state } : null)
    .filter(Boolean);
  session.pendingPadStates = Array(PAD_COUNT).fill(null);

  if (!states.length || session.host?.readyState !== 1) return;
  safeJsonSend(session.host, { type: "gamepadStates", stream, states });
}

function scheduleGamepadBatch(stream, session) {
  if (session.padFlushTimer) return;
  session.padFlushTimer = setTimeout(() => flushGamepadBatch(stream, session), GAMEPAD_BATCH_MS);
}

function publicPlayer(player) {
  if (!player?.id) return null;
  return {
    id: Number(player.id),
    username: player.username,
    displayName: player.displayName || player.display_name || player.username,
  };
}

function activeAllowedPlayers(session) {
  return (session?.allowedPlayers || [])
    .map((player, padIndex) => player ? { padIndex, player: publicPlayer(player) } : null)
    .filter(Boolean);
}

function findAllowedPadIndex(session, userId, requestedPadIndex = null) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return -1;
  if (
    Number.isInteger(requestedPadIndex) &&
    requestedPadIndex >= 0 &&
    requestedPadIndex < PAD_COUNT &&
    Number(session.allowedPlayers?.[requestedPadIndex]?.id) === id
  ) {
    return requestedPadIndex;
  }
  return (session.allowedPlayers || []).findIndex((player) => Number(player?.id) === id);
}

export function getDesktopRemotePlayAccess(stream, user) {
  const cleanStream = normalizeStream(stream);
  if (!cleanStream || !user?.id) return { ok: false, enabled: false, canControl: false };
  const session = sessions.get(cleanStream);
  const allowedPlayers = activeAllowedPlayers(session);
  const padIndex = session ? findAllowedPadIndex(session, user.id) : -1;
  const isOwner = cleanStream === `live/${user.username}`;
  return {
    ok: true,
    enabled: allowedPlayers.length > 0,
    canControl: padIndex >= 0,
    padIndex: padIndex >= 0 ? padIndex : null,
    isOwner,
    allowedPlayer: allowedPlayers[0]?.player || null,
    allowedPlayers,
  };
}

export function setDesktopRemotePlayInvite(stream, hostUser, invitePlayers) {
  const cleanStream = normalizeStream(stream);
  if (!cleanStream || !hostUser?.id || cleanStream !== `live/${hostUser.username}`) {
    return { ok: false, status: 403, error: "forbidden" };
  }

  const session = getSession(cleanStream);
  const nextAllowed = Array(PAD_COUNT).fill(null);
  for (const entry of Array.isArray(invitePlayers) ? invitePlayers : []) {
    const padIndex = Number(entry?.padIndex);
    const player = entry?.player;
    if (!Number.isInteger(padIndex) || padIndex < 0 || padIndex >= PAD_COUNT || !player?.id) continue;
    nextAllowed[padIndex] = publicPlayer(player);
  }
  session.allowedPlayers = nextAllowed;
  session.allowedPlayerId = nextAllowed[0]?.id || null;
  session.allowedPlayer = nextAllowed[0] || null;

  for (let padIndex = 0; padIndex < PAD_COUNT; padIndex += 1) {
    const playerWs = session.players[padIndex];
    const allowed = nextAllowed[padIndex];
    if (playerWs?.readyState === 1 && Number(playerWs.user?.id) !== Number(allowed?.id)) {
      safeJsonSend(playerWs, { type: "notAllowed", stream: cleanStream, padIndex });
      playerWs.close(4003, "Not allowed");
      session.players[padIndex] = null;
    }
  }

  if (session.host?.readyState === 1) {
    safeJsonSend(session.host, {
      type: "inviteChanged",
      stream: cleanStream,
      allowedPlayer: nextAllowed[0] || null,
      allowedPlayers: activeAllowedPlayers(session),
    });
  }

  return {
    ok: true,
    stream: cleanStream,
    allowedPlayer: nextAllowed[0] || null,
    allowedPlayers: activeAllowedPlayers(session),
  };
}

export function attachDesktopRemotePlayWss(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/ws/desktop/remote-play")) return;
    try {
      const u = new URL(req.url, "http://localhost");
      const token = u.searchParams.get("token") || "";
      const user = verifyDesktopToken(token);
      const role = u.searchParams.get("role") || "";
      const stream = normalizeStream(u.searchParams.get("stream") || "");
      const padIndexRaw = Number(u.searchParams.get("padIndex"));

      if (!user || !stream || (role !== "host" && role !== "player")) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.user = user;
        ws.role = role;
        ws.stream = stream;
        ws.requestedPadIndex = Number.isInteger(padIndexRaw) ? padIndexRaw : null;
        wss.emit("connection", ws, req);
      });
    } catch {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  });

  wss.on("connection", (ws) => {
    const session = getSession(ws.stream);
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    if (ws.role === "host") {
      if (session.host && session.host.readyState === 1) {
        session.host.close(4001, "Host replaced");
      }
      session.host = ws;
      safeJsonSend(ws, { type: "hostReady", stream: ws.stream, allowedPlayers: activeAllowedPlayers(session) });
      for (let padIndex = 0; padIndex < PAD_COUNT; padIndex += 1) {
        if (session.players[padIndex]?.readyState === 1) {
          safeJsonSend(session.players[padIndex], { type: "hostReady", stream: ws.stream, padIndex });
        }
      }
    } else {
      const padIndex = findAllowedPadIndex(session, ws.user.id, ws.requestedPadIndex);
      if (padIndex < 0) {
        safeJsonSend(ws, { type: "notAllowed", stream: ws.stream });
        ws.close(4003, "Not allowed");
        return;
      }
      if (session.players[padIndex] && session.players[padIndex].readyState === 1) {
        safeJsonSend(ws, { type: "busy", message: "Remote player slot is busy" });
        ws.close(4003, "Busy");
        return;
      }
      ws.padIndex = padIndex;
      session.players[padIndex] = ws;
      safeJsonSend(ws, {
        type: session.host?.readyState === 1 ? "controlReady" : "waitingHost",
        stream: ws.stream,
        padIndex,
      });
      if (session.host?.readyState === 1) {
        safeJsonSend(session.host, {
          type: "playerJoined",
          padIndex,
          player: { id: ws.user.id, username: ws.user.username },
        });
      }
    }

    ws.on("message", (buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString("utf8"));
      } catch {
        return;
      }

      if (ws.role !== "player" || msg?.type !== "gamepadState") return;
      const session = sessions.get(ws.stream);
      if (!session?.host || session.host.readyState !== 1) return;

      const padIndex = Number.isInteger(ws.padIndex) ? ws.padIndex : 0;
      session.pendingPadStates[padIndex] = {
        playerId: ws.user.id,
        state: msg.state || {},
      };
      scheduleGamepadBatch(ws.stream, session);
    });

    ws.on("close", () => {
      const session = sessions.get(ws.stream);
      if (!session) return;
      if (session.host === ws) {
        session.host = null;
        for (let padIndex = 0; padIndex < PAD_COUNT; padIndex += 1) {
          if (session.players[padIndex]?.readyState === 1) {
            safeJsonSend(session.players[padIndex], { type: "hostLeft", padIndex });
          }
        }
      }
      const padIndex = session.players?.findIndex((player) => player === ws) ?? -1;
      if (padIndex >= 0) {
        session.players[padIndex] = null;
        if (session.host?.readyState === 1) {
          safeJsonSend(session.host, { type: "playerLeft", playerId: ws.user.id, padIndex });
        }
      }
      cleanupSession(ws.stream);
    });
  });

  const pingInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.isAlive === false) return client.terminate();
      client.isAlive = false;
      if (client.readyState === 1) client.ping();
    });
  }, 30000);

  const cleanup = () => {
    clearInterval(pingInterval);
    wss.clients.forEach((client) => {
      try { client.terminate(); } catch {}
    });
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  console.log("[desktop-remote-play] started");
}
