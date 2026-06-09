import { WebSocketServer } from "ws";
import sharp from "sharp";
import { verifyDesktopToken } from "./desktop-auth.js";
import { pool } from "./db.js";
import { sendPushToMentioned } from "./push-notifications.js";
import {
  registerClient,
  unregisterClient,
  broadcastToRoom,
  broadcastToUsers,
  incPresence,
  decPresence,
  presenceSnapshotForRoom,
} from "./ws-chat-shared.js";

const DEFAULT_MSG_LIMIT = 50;
const DEFAULT_AVATAR = "/public/usericon.jpg";
const roomLimitCache = new Map();
const CACHE_TTL = 60000;

async function getRoomLimit(room) {
  const cached = roomLimitCache.get(room);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.limit;
  let limit = DEFAULT_MSG_LIMIT;
  try {
    const { rows } = await pool.query(
      "SELECT message_limit FROM chat_rooms WHERE slug=$1 LIMIT 1",
      [room]
    );
    if (rows?.[0]) limit = Number(rows[0].message_limit) || DEFAULT_MSG_LIMIT;
  } catch {}
  roomLimitCache.set(room, { limit, ts: Date.now() });
  return limit;
}

async function isUserChatMuted(userId) {
  try {
    const { rows } = await pool.query("SELECT chat_muted FROM users WHERE id=$1 LIMIT 1", [userId]);
    return rows?.[0]?.chat_muted === true;
  } catch {
    return false;
  }
}

function clampText(s, maxLen) {
  s = String(s ?? "").replace(/\u0000/g, "").trim();
  s = s.replace(/\s+/g, " ");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function extractMentions(text) {
  const mentions = new Set();
  const re = /@([a-zA-Z0-9._-]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) mentions.add(m[1]);
  return mentions;
}

function normalizeRoom(room) {
  room = String(room || "").trim();
  if (!room) return "global";
  if (room === "global") return "global";
  if (/^live\/[a-zA-Z0-9._\/-]{1,120}$/.test(room)) return room;
  if (/^dm:\d+:\d+$/.test(room)) return room;
  if (/^[a-z0-9а-яё-]{1,40}$/iu.test(room)) return room;
  return "global";
}

function safeJsonSend(ws, obj) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch {}
}

function dmParticipantIds(room) {
  const match = String(room || "").match(/^dm:(\d+):(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])].filter(Boolean);
}

async function updateDmThread(room, preview) {
  const ids = dmParticipantIds(room);
  if (!ids || ids.length !== 2) return;
  const ts = Math.floor(Date.now() / 1000);
  const previewText = String(preview || "").slice(0, 200);
  await pool.query(
    `INSERT INTO dm_threads(user1_id, user2_id, last_message_preview, updated_ts)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(user1_id, user2_id) DO UPDATE
     SET last_message_preview = $3, updated_ts = $4`,
    [Math.min(ids[0], ids[1]), Math.max(ids[0], ids[1]), previewText, ts]
  );
}

export function attachDesktopChatWss(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/ws/desktop/chat")) return;
    try {
      const u = new URL(req.url, "http://localhost");
      const token = u.searchParams.get("token") || "";
      const user = verifyDesktopToken(token);
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const room = normalizeRoom(u.searchParams.get("room") || "global");
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.user = user;
        ws.room = room;
        wss.emit("connection", ws, req);
      });
    } catch {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  });

  const pingInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.isAlive === false) return client.terminate();
      client.isAlive = false;
      if (client.readyState === 1) client.ping();
    });
  }, 30000);

  wss.on("connection", async (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    registerClient(ws);

    try {
      const { rows } = await pool.query(
        "SELECT nick_color, avatar, display_name, bio FROM users WHERE id=$1 LIMIT 1",
        [ws.user.id]
      );
      const row = rows?.[0];
      ws.user.nickColor = String(row?.nick_color || "#60a5fa");
      ws.user.avatar = String(row?.avatar || DEFAULT_AVATAR);
      ws.user.displayName = String(row?.display_name || "");
      ws.user.bio = String(row?.bio || "");
    } catch {
      ws.user.nickColor = "#60a5fa";
      ws.user.avatar = DEFAULT_AVATAR;
      ws.user.displayName = "";
      ws.user.bio = "";
    }

    incPresence(ws);

    try {
      const limit = await getRoomLimit(ws.room);
      const { rows } = await pool.query(
        `SELECT m.id, m.ts, m.nick, m.text, m.sticker_data, m.image_data,
                u.nick_color, u.avatar, u.display_name, u.bio
         FROM messages m
         LEFT JOIN users u ON u.username = m.nick
         WHERE m.room=$1 ORDER BY m.id DESC LIMIT $2`,
        [ws.room, limit]
      );
      const snap = presenceSnapshotForRoom(ws.room);
      const msgs = rows.reverse().map((r) => ({
        id: Number(r.id),
        ts: r.ts,
        nick: r.nick,
        text: r.text,
        stickerData: r.sticker_data || "",
        imageData: r.image_data || "",
        nickColor: r.nick_color || "#60a5fa",
        avatar: r.avatar || "",
        displayName: String(r.display_name || ""),
        bio: String(r.bio || ""),
        sender: {
          username: r.nick,
          displayName: String(r.display_name || ""),
          avatar: r.avatar || "",
          nickColor: r.nick_color || "#60a5fa",
        },
      }));
      safeJsonSend(ws, { type: "init", messages: msgs, ...snap });
    } catch (err) {
      console.error("[ws-desktop-chat] init error:", err.message);
      const snap = presenceSnapshotForRoom(ws.room);
      safeJsonSend(ws, { type: "init", messages: [], ...snap });
    }

    ws.on("close", () => {
      unregisterClient(ws);
      decPresence(ws);
    });

    ws.on("message", async (buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString("utf8"));
      } catch {
        return;
      }
      if (msg?.type !== "post" && msg?.type !== "sticker" && msg?.type !== "image")
        return;

      if (await isUserChatMuted(ws.user.id)) {
        safeJsonSend(ws, { type: "error", error: "Вы не можете отправлять сообщения: администратор выдал mute." });
        return;
      }

      const nick = clampText(ws.user.username, 24);
      const ts = Math.floor(Date.now() / 1000);
      const room = ws.room || "global";

      let text = "";
      let stickerData = "";
      let imageData = "";

      if (msg.type === "post") {
        text = clampText(msg.text, 500);
        if (!text) return;
      } else if (msg.type === "sticker") {
        stickerData = String(msg.data || "").slice(0, 500000);
        if (!stickerData) return;
      } else if (msg.type === "image") {
        const raw = String(msg.data || "");
        if (!raw) return;
        try {
          const match = raw.match(/^data:image\/(\w+);base64,(.+)$/);
          if (!match) return;
          const buf = Buffer.from(match[2], "base64");
          const resized = await sharp(buf)
            .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          imageData = "data:image/jpeg;base64," + resized.toString("base64");
        } catch {
          return;
        }
      }

      try {
        const insertRes = await pool.query(
          "INSERT INTO messages(ts, nick, text, room, sticker_data, image_data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
          [ts, nick, text, room, stickerData, imageData]
        );

        await pool.query(
          `DELETE FROM messages
            WHERE room=$1 AND id NOT IN (
              SELECT id FROM messages WHERE room=$1 ORDER BY id DESC LIMIT $2
            )`,
          [room, await getRoomLimit(room)]
        );

        const out = {
          type: "msg",
          room,
          message: {
            id: Number(insertRes.rows[0].id),
            ts,
            nick,
            text,
            stickerData,
            imageData,
            nickColor: ws.user.nickColor || "#60a5fa",
            avatar: ws.user.avatar || DEFAULT_AVATAR,
            displayName: String(ws.user.displayName || ""),
            bio: String(ws.user.bio || ""),
            sender: {
              id: Number(ws.user.id),
              username: ws.user.username,
              displayName: String(ws.user.displayName || ""),
              avatar: ws.user.avatar || DEFAULT_AVATAR,
              nickColor: ws.user.nickColor || "#60a5fa",
            },
          },
        };

        const dmIds = dmParticipantIds(room);
        if (dmIds) {
          await updateDmThread(room, text || (stickerData ? "(стикер)" : imageData ? "(изображение)" : ""));
          broadcastToUsers(dmIds, out);
        } else {
          broadcastToRoom(room, out);
        }

        if (text) {
          const mentioned = extractMentions(text);
          if (mentioned.size > 0) {
            const senderId = ws.user?.id || 0;
            sendPushToMentioned(room, senderId, nick, mentioned, text);
          }
        }
      } catch (err) {
        console.error("[ws-desktop-chat] post error:", err.message);
      }
    });
  });

  const cleanup = () => {
    clearInterval(pingInterval);
    wss.clients.forEach((client) => {
      try {
        client.terminate();
      } catch {}
    });
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  return wss;
}
