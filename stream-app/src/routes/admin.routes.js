import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import sharp from "sharp";
import { pool } from "../db.js";
import { requireAdmin, requireAuthApi } from "../auth.js";
import { loadSettings, saveSettings, invalidateSettings } from "../settings.js";
import { broadcastToRoom, broadcastToUsers, forceLogoutUser } from "../ws-chat-shared.js";
import fs from "fs";
import { dirname, join, basename, extname } from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const NOTIFY_SOUNDS_DIR = join(__dirname, "../public/notify_sounds");
const ALLOWED_SOUND_EXTS = new Set([".mp3", ".wav", ".ogg"]);

export const adminRouter = express.Router();

function dmParticipantIds(room) {
  const match = String(room || "").match(/^dm:(\d+):(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])].filter(Boolean);
}

function formatTs(ts) {
  if (!ts) return "";
  try {
    const num = typeof ts === 'string' ? parseInt(ts, 10) : ts;
    return new Date(num * 1000).toLocaleString("ru-RU");
  } catch {
    return String(ts);
  }
}

adminRouter.get("/admin", requireAdmin, (req, res) => {
  res.redirect("/app");
});

adminRouter.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, username, email, created_ts, last_login_ts, is_admin, chat_muted FROM users ORDER BY id DESC"
    );
    return res.json({
      ok: true,
      users: rows.map((u) => ({
        id: typeof u.id === 'bigint' ? Number(u.id) : Number(u.id),
        username: u.username,
        email: u.email || "",
        createdAt: formatTs(u.created_ts),
        lastLoginAt: formatTs(u.last_login_ts),
        isAdmin: !!u.is_admin,
        chatMuted: !!u.chat_muted,
      })),
    });
  } catch {
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

adminRouter.patch("/api/admin/users/:id/email", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id || 0);
  if (!userId) return res.status(400).json({ ok: false, error: "bad user" });

  const email = String(req.body?.email || "").trim().toLowerCase();
  if (email && email.length > 255) {
    return res.status(400).json({ ok: false, error: "Email слишком длинный" });
  }

  try {
    const { rowCount } = await pool.query("UPDATE users SET email=$1 WHERE id=$2", [email || null, userId]);
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "user not found" });
    return res.json({ ok: true, email: email || "" });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: "Этот e-mail уже занят" });
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

adminRouter.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id || 0);
  const pass = String(req.body?.pass || "");
  if (!userId || pass.length < 6) {
    return res.status(400).json({ ok: false, error: "Пароль минимум 6 символов" });
  }

  try {
    const hash = await bcrypt.hash(pass, 12);
    const { rowCount } = await pool.query("UPDATE users SET pass_hash=$1 WHERE id=$2", [hash, userId]);
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "user not found" });
    await pool.query("DELETE FROM remember_tokens WHERE user_id=$1", [userId]);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

adminRouter.post("/api/admin/users/:id/admin", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id || 0);
  if (!userId) return res.status(400).json({ ok: false, error: "bad user" });

  const makeAdmin = req.body?.makeAdmin === true || req.body?.makeAdmin === 1 || req.body?.makeAdmin === "1";
  try {
    const { rowCount } = await pool.query("UPDATE users SET is_admin=$1 WHERE id=$2", [makeAdmin, userId]);
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "user not found" });

    if (userId === Number(req.session.user?.id || 0)) {
      req.session.user.isAdmin = makeAdmin;
    }

    return res.json({ ok: true, isAdmin: makeAdmin });
  } catch {
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

adminRouter.post("/api/admin/users/:id/mute", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id || 0);
  if (!userId) return res.status(400).json({ ok: false, error: "bad user" });

  const muted = req.body?.muted === true || req.body?.muted === 1 || req.body?.muted === "1";
  try {
    const { rowCount } = await pool.query("UPDATE users SET chat_muted=$1 WHERE id=$2", [muted, userId]);
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "user not found" });
    return res.json({ ok: true, chatMuted: muted });
  } catch {
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

adminRouter.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id || 0);
  const currentId = Number(req.session.user?.id || 0);

  if (!userId) return res.status(400).json({ ok: false, error: "bad user" });
  if (userId === currentId) {
    return res.status(400).json({ ok: false, error: "Нельзя удалить текущего пользователя" });
  }

  try {
    forceLogoutUser(userId);
    const { rowCount } = await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "user not found" });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

adminRouter.post("/admin/reset-password", requireAdmin, async (req, res) => {
  const userId = Number(req.body.userId || 0);
  const pass = String(req.body.pass || "");

  if (!userId || pass.length < 6) {
    return res.redirect("/admin?err=" + encodeURIComponent("Пароль минимум 6 символов"));
  }

  const hash = await bcrypt.hash(pass, 12);
  await pool.query("UPDATE users SET pass_hash=$1 WHERE id=$2", [hash, userId]);
  await pool.query("DELETE FROM remember_tokens WHERE user_id=$1", [userId]);

  return res.redirect("/admin?ok=" + encodeURIComponent("Пароль обновлен"));
});

adminRouter.post("/api/admin/generate-reset-link", requireAdmin, async (req, res) => {
  const userId = Number(req.body?.userId || 0);
  if (!userId) return res.status(400).json({ ok: false, error: "Неверный пользователь" });

  const { rows } = await pool.query("SELECT username FROM users WHERE id=$1", [userId]);
  if (!rows.length) return res.status(404).json({ ok: false, error: "Пользователь не найден" });

  const token = crypto.randomBytes(32).toString("hex");
  const ts = Math.floor(Date.now() / 1000);
  const expires = ts + 86400; // 24 hours

  await pool.query(
    "INSERT INTO password_resets(user_id, token, expires_ts, created_ts) VALUES ($1,$2,$3,$4)",
    [userId, token, expires, ts]
  );

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
  const link = `${baseUrl}/reset/${token}`;

  return res.json({ ok: true, link, username: rows[0].username, expiresAt: new Date(expires * 1000).toLocaleString("ru-RU") });
});

adminRouter.post("/admin/toggle-admin", requireAdmin, async (req, res) => {
  const userId = Number(req.body.userId || 0);
  const currentId = Number(req.session.user?.id || 0);

  if (!userId) return res.redirect("/admin?err=" + encodeURIComponent("Неверный пользователь"));

  const makeAdmin = req.body.makeAdmin === "1";
  await pool.query("UPDATE users SET is_admin=$1 WHERE id=$2", [makeAdmin, userId]);

  if (userId === currentId) {
    req.session.user.isAdmin = makeAdmin;
  }

  return res.redirect("/admin?ok=" + encodeURIComponent(makeAdmin ? "Админ назначен" : "Админ отозван"));
});

adminRouter.post("/admin/delete-user", requireAdmin, async (req, res) => {
  const userId = Number(req.body.userId || 0);
  const currentId = Number(req.session.user?.id || 0);

  if (!userId) return res.redirect("/admin?err=" + encodeURIComponent("Неверный пользователь"));
  if (userId === currentId) {
    return res.redirect("/admin?err=" + encodeURIComponent("Нельзя удалить текущего пользователя"));
  }

  forceLogoutUser(userId);
  await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  return res.redirect("/admin?ok=" + encodeURIComponent("Пользователь удален"));
});

adminRouter.delete("/api/admin/messages/:id", requireAdmin, async (req, res) => {
  const messageId = Number(req.params.id || 0);
  if (!messageId) return res.status(400).json({ ok: false, error: "bad message" });

  try {
    const { rows } = await pool.query(
      "DELETE FROM messages WHERE id=$1 RETURNING id, room, image_data",
      [messageId]
    );
    const deleted = rows?.[0];
    if (!deleted) return res.status(404).json({ ok: false, error: "message not found" });

    const room = deleted.room || "global";
    const payload = {
      type: "delete",
      room,
      messageId: Number(deleted.id),
    };
    const dmIds = dmParticipantIds(room);
    if (dmIds) {
      broadcastToUsers(dmIds, payload);
    } else {
      broadcastToRoom(room, payload);
    }

    return res.json({
      ok: true,
      messageId: Number(deleted.id),
      room,
      imageDeleted: Boolean(deleted.image_data),
    });
  } catch (err) {
    console.error("[admin] delete message error:", err.message);
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

// --- Chat rooms ---
adminRouter.get("/api/admin/chat-rooms", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, slug, name, sort_order, is_permanent, bg_color, font_size, tab_text_color, tab_bg_color, tab_border_color, message_limit FROM chat_rooms ORDER BY sort_order ASC, id ASC"
    );
    return res.json({
      ok: true,
      rooms: rows.map(r => ({
        ...r,
        id: typeof r.id === 'bigint' ? Number(r.id) : r.id,
        sort_order: typeof r.sort_order === 'bigint' ? Number(r.sort_order) : r.sort_order,
        font_size: typeof r.font_size === 'bigint' ? Number(r.font_size) : r.font_size,
        message_limit: typeof r.message_limit === 'bigint' ? Number(r.message_limit) : r.message_limit,
      })),
    });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

adminRouter.post("/api/admin/chat-rooms", requireAdmin, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name || name.length > 64) return res.status(400).json({ ok: false, error: "bad name" });

  const slug = name.toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  if (!slug) return res.status(400).json({ ok: false, error: "bad name" });

  try {
    const { rows } = await pool.query(
      "INSERT INTO chat_rooms(slug, name, sort_order, created_ts) VALUES ($1,$2,$3,$4) RETURNING id, slug, name, sort_order",
      [slug, name, 0, Math.floor(Date.now() / 1000)]
    );
    return res.json({ ok: true, room: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: "slug exists" });
    return res.status(500).json({ ok: false });
  }
});

adminRouter.delete("/api/admin/chat-rooms/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  try {
    const { rows } = await pool.query("SELECT is_permanent FROM chat_rooms WHERE id=$1", [id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: "not found" });
    if (rows[0].is_permanent) return res.status(403).json({ ok: false, error: "permanent room cannot be deleted" });
    await pool.query("DELETE FROM chat_rooms WHERE id=$1", [id]);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

adminRouter.patch("/api/admin/chat-rooms/:id/bg-color", requireAdmin, async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok: false, error: "id required" });

  const bgColor = String(req.body?.bgColor || "").trim();
  if (bgColor && !/^#[0-9a-fA-F]{6}$/.test(bgColor)) {
    return res.status(400).json({ ok: false, error: "Неверный формат цвета" });
  }

  try {
    const { rowCount } = await pool.query(
      "UPDATE chat_rooms SET bg_color=$1 WHERE id=$2",
      [bgColor || "", id]
    );
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, bgColor: bgColor || "" });
  } catch (err) {
    console.error("[admin] chat room bg_color error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminRouter.patch("/api/admin/chat-rooms/:id/font-size", requireAdmin, async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok: false, error: "id required" });

  const fontSize = Math.min(32, Math.max(8, Number(req.body?.fontSize ?? 13)));

  try {
    const { rowCount } = await pool.query(
      "UPDATE chat_rooms SET font_size=$1 WHERE id=$2",
      [fontSize, id]
    );
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, fontSize });
  } catch (err) {
    console.error("[admin] chat room font_size error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminRouter.patch("/api/admin/chat-rooms/:id/message-limit", requireAdmin, async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok: false, error: "id required" });

  const limit = Math.min(500, Math.max(5, Number(req.body?.limit ?? 50)));

  try {
    const { rowCount } = await pool.query(
      "UPDATE chat_rooms SET message_limit=$1 WHERE id=$2",
      [limit, id]
    );
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, limit });
  } catch (err) {
    console.error("[admin] chat room message_limit error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminRouter.patch("/api/admin/chat-rooms/:id/tab-colors", requireAdmin, async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok: false, error: "id required" });

  const hexRe = /^#[0-9a-fA-F]{6}$/;
  const tabTextColor = hexRe.test(req.body?.tabTextColor || '') ? req.body.tabTextColor : '';
  const tabBgColor = hexRe.test(req.body?.tabBgColor || '') ? req.body.tabBgColor : '';
  const tabBorderColor = hexRe.test(req.body?.tabBorderColor || '') ? req.body.tabBorderColor : '';

  try {
    const { rowCount } = await pool.query(
      "UPDATE chat_rooms SET tab_text_color=$1, tab_bg_color=$2, tab_border_color=$3 WHERE id=$4",
      [tabTextColor, tabBgColor, tabBorderColor, id]
    );
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, tabTextColor, tabBgColor, tabBorderColor });
  } catch (err) {
    console.error("[admin] chat room tab_colors error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminRouter.put("/api/admin/chat-rooms/order", requireAdmin, async (req, res) => {
  const order = req.body?.order;
  if (!Array.isArray(order)) return res.status(400).json({ ok: false, error: "order required" });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < order.length; i++) {
        const roomId = Number(order[i]);
        if (roomId) await client.query("UPDATE chat_rooms SET sort_order=$1 WHERE id=$2", [i, roomId]);
      }
      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch {
    return res.status(500).json({ ok: false });
  }
});



// --- Voice rooms admin ---
adminRouter.get("/api/admin/voice-rooms", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent FROM voice_rooms ORDER BY created_ts DESC"
    );
    return res.json({
      ok: true,
      rooms: rows.map(r => ({
        id: typeof r.id === 'bigint' ? Number(r.id) : r.id,
        slug: r.slug,
        latinSlug: r.latin_slug,
        name: r.name,
        createdBy: r.created_by,
        createdAt: formatTs(r.created_ts),
        hasPassword: !!r.pass_hash,
        isPermanent: !!r.is_permanent
      }))
    });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

adminRouter.post("/api/admin/voice-rooms", requireAdmin, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pass = String(req.body?.pass || "").trim();
  if (!name || name.length > 64) return res.status(400).json({ ok: false, error: "bad name" });

  const slug = name.toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  if (!slug) return res.status(400).json({ ok: false, error: "bad name" });

  const cyrMap = {
    а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"yo", ж:"zh", з:"z", и:"i",
    й:"y", к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t",
    у:"u", ф:"f", х:"kh", ц:"ts", ч:"ch", ш:"sh", щ:"shch", ъ:"", ы:"y",
    ъ:"'", э:"e", ю:"yu", я:"ya", ъ:""
  };
  const latinSlug = slug
    .split("")
    .map(c => cyrMap[c] || c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  try {
    const passHash = pass ? await bcrypt.hash(pass, 10) : null;
    const ts = Math.floor(Date.now() / 1000);
    const { rows } = await pool.query(
      "INSERT INTO voice_rooms(slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent",
      [slug, latinSlug, name, req.session.user.username, ts, passHash, true]
    );
    return res.json({
      ok: true,
      room: {
        id: typeof rows[0].id === 'bigint' ? Number(rows[0].id) : rows[0].id,
        slug: rows[0].slug,
        latinSlug: rows[0].latin_slug,
        name: rows[0].name,
        createdBy: rows[0].created_by,
        createdAt: formatTs(rows[0].created_ts),
        hasPassword: !!rows[0].pass_hash
      }
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: "slug exists" });
    return res.status(500).json({ ok: false });
  }
});

adminRouter.delete("/api/admin/voice-rooms/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  try {
    const { rows } = await pool.query("SELECT slug, latin_slug FROM voice_rooms WHERE id=$1", [id]);
    const slug = rows?.[0]?.slug;
    const latinSlug = rows?.[0]?.latin_slug;

    await pool.query("DELETE FROM voice_rooms WHERE id=$1", [id]);

    if (slug) {
      try {
        const voiceUrl = process.env.VOICE_SERVER_URL || "http://voice-server:4001";
        await fetch(`${voiceUrl}/room/${encodeURIComponent(slug)}`, { method: "DELETE" });
      } catch {}
    }

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

adminRouter.post("/api/admin/voice-rooms/:id/clear-password", requireAdmin, async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  try {
    await pool.query("UPDATE voice_rooms SET pass_hash = NULL WHERE id=$1", [id]);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

adminRouter.post("/api/admin/voice-rooms/clear-all-passwords", requireAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE voice_rooms SET pass_hash = NULL WHERE pass_hash IS NOT NULL AND pass_hash != ''");
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

// --- Site settings ---
adminRouter.get("/api/admin/site-settings", requireAdmin, async (req, res) => {
  try {
    const settings = await loadSettings();
    return res.json({ ok: true, settings });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

adminRouter.post("/api/admin/site-settings", requireAdmin, async (req, res) => {
  try {
    const current = await loadSettings();
    const settings = await saveSettings({
      notifySound: current.notifySound,
      mentionSound: current.mentionSound,
      ...req.body,
    });
    return res.json({ ok: true, settings });
  } catch (err) {
    console.error("[admin] site-settings save error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminRouter.post("/api/admin/srt-passphrase", requireAdmin, async (req, res) => {
  try {
    const passphrase = String(req.body?.passphrase || "").trim();
    const ts = Math.floor(Date.now() / 1000);
    await pool.query(
      "UPDATE site_settings SET srt_passphrase=$1, updated_ts=$2 WHERE id=1",
      [passphrase, ts]
    );
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

// --- Auth attempts ---
adminRouter.get("/api/admin/auth-attempts", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const { rows } = await pool.query(
      "SELECT id, ip, action, username, success, created_ts FROM auth_attempts ORDER BY created_ts DESC LIMIT $1",
      [limit]
    );
    return res.json({
      ok: true,
      attempts: rows.map(r => ({
        id: Number(r.id),
        ip: r.ip,
        action: r.action,
        username: r.username,
        success: r.success,
        createdTs: r.created_ts,
      })),
    });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

adminRouter.delete("/api/admin/auth-attempts/ip", requireAdmin, async (req, res) => {
  const ip = String(req.body?.ip || "").trim();
  if (!ip) return res.status(400).json({ ok: false, error: "IP required" });
  try {
    await pool.query("DELETE FROM auth_attempts WHERE ip=$1", [ip]);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

adminRouter.delete("/api/admin/auth-attempts", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM auth_attempts");
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

// --- Stickers ---
adminRouter.get("/api/admin/stickers", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, data, sort_order, created_ts FROM stickers ORDER BY sort_order ASC, id ASC"
    );
    return res.json({ ok: true, stickers: rows });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

adminRouter.post("/api/admin/stickers", requireAdmin, async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 64);
  const dataRaw = String(req.body?.data || "");

  if (!dataRaw) return res.status(400).json({ ok: false, error: "Image data required" });

  function isAnimatedWebp(buf){
    if (buf.length < 20) return false;
    // Check for "ANIM" chunk at offset 12
    if (buf[12] === 65 && buf[13] === 78 && buf[14] === 73 && buf[15] === 77) return true;
    // Check VP8X animation flag (bit 2 of flags byte at offset 24)
    if (buf[12] === 86 && buf[13] === 80 && buf[14] === 56 && buf[15] === 88 && buf.length > 24) {
      if ((buf[24] & 0x10)) return true;
    }
    return false;
  }

  try {
    let stickerData = "";

    if (dataRaw.startsWith("data:image/gif")) {
      stickerData = dataRaw.slice(0, 500000);
    } else if (dataRaw.startsWith("data:image/webp")) {
      const buf = Buffer.from(dataRaw.replace(/^data:image\/webp;base64,/, ""), "base64");
      if (isAnimatedWebp(buf)) {
        stickerData = dataRaw.slice(0, 500000);
      } else {
        const meta = await sharp(buf).metadata();
        if ((meta.width || 0) > 512 || (meta.height || 0) > 512) {
          const resized = await sharp(buf)
            .resize(512, 512, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          stickerData = "data:image/webp;base64," + resized.toString("base64");
        } else {
          stickerData = dataRaw.slice(0, 500000);
        }
      }
    } else if (dataRaw.startsWith("data:image/")) {
      const buf = Buffer.from(dataRaw.replace(/^data:image\/\w+;base64,/, ""), "base64");
      const meta = await sharp(buf).metadata();
      if ((meta.width || 0) > 512 || (meta.height || 0) > 512) {
        const resized = await sharp(buf)
          .resize(512, 512, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        stickerData = "data:image/webp;base64," + resized.toString("base64");
      } else {
        stickerData = dataRaw.slice(0, 500000);
      }
    } else if (dataRaw.length > 0) {
      stickerData = dataRaw.slice(0, 500000);
    }

    if (!stickerData) return res.status(400).json({ ok: false, error: "Invalid image" });

    const ts = Math.floor(Date.now() / 1000);
    const { rows } = await pool.query(
      "INSERT INTO stickers(name, data, sort_order, created_ts) VALUES ($1,$2,$3,$4) RETURNING id, name, data, sort_order, created_ts",
      [name, stickerData, 0, ts]
    );
    return res.json({ ok: true, sticker: rows[0] });
  } catch (err) {
    console.error("[admin] sticker upload error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminRouter.delete("/api/admin/stickers/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  try {
    const { rowCount } = await pool.query("DELETE FROM stickers WHERE id=$1", [id]);
    if (rowCount === 0) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

adminRouter.put("/api/admin/stickers/order", requireAdmin, async (req, res) => {
  const order = req.body?.order;
  if (!Array.isArray(order)) return res.status(400).json({ ok: false, error: "order required" });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < order.length; i++) {
        const stickerId = Number(order[i]);
        if (stickerId) await client.query("UPDATE stickers SET sort_order=$1 WHERE id=$2", [i, stickerId]);
      }
      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch {
    return res.status(500).json({ ok: false });
  }
});

// --- Notify sounds ---
function listSoundFiles() {
  try {
    if (!fs.existsSync(NOTIFY_SOUNDS_DIR)) return [];
    return fs.readdirSync(NOTIFY_SOUNDS_DIR)
      .filter(f => ALLOWED_SOUND_EXTS.has(extname(f).toLowerCase()))
      .map(f => ({
        name: f,
        url: "/public/notify_sounds/" + encodeURIComponent(f),
        size: fs.statSync(join(NOTIFY_SOUNDS_DIR, f)).size,
      }));
  } catch {
    return [];
  }
}

adminRouter.get("/api/admin/notify-sounds", requireAdmin, async (req, res) => {
  try {
    const settings = await loadSettings();
    const files = listSoundFiles();
    return res.json({ ok: true, files, notifySound: settings.notifySound, mentionSound: settings.mentionSound, voiceJoinSound: settings.voiceJoinSound, voiceLeaveSound: settings.voiceLeaveSound });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

adminRouter.post("/api/admin/notify-sounds/upload", requireAdmin, async (req, res) => {
  const filename = String(req.body?.filename || "").trim();
  const data = String(req.body?.data || "");
  if (!filename || !data) return res.status(400).json({ ok: false, error: "filename and data required" });

  const safeName = basename(filename);
  const ext = extname(safeName).toLowerCase();
  if (!ALLOWED_SOUND_EXTS.has(ext)) return res.status(400).json({ ok: false, error: "only mp3/wav/ogg" });

  try {
    if (!fs.existsSync(NOTIFY_SOUNDS_DIR)) fs.mkdirSync(NOTIFY_SOUNDS_DIR, { recursive: true });

    let buf;
    if (data.startsWith("data:audio/")) {
      const match = data.match(/^data:audio\/\w+;base64,(.+)$/);
      if (!match) return res.status(400).json({ ok: false, error: "invalid data URI" });
      buf = Buffer.from(match[1], "base64");
    } else if (data.startsWith("data:")) {
      const match = data.match(/^data:[^;]+;base64,(.+)$/);
      if (!match) return res.status(400).json({ ok: false, error: "invalid data URI" });
      buf = Buffer.from(match[1], "base64");
    } else {
      return res.status(400).json({ ok: false, error: "data URI required" });
    }

    if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ ok: false, error: "file too large (10MB)" });

    const dest = join(NOTIFY_SOUNDS_DIR, safeName);
    fs.writeFileSync(dest, buf);
    return res.json({ ok: true, name: safeName, url: "/public/notify_sounds/" + encodeURIComponent(safeName) });
  } catch (err) {
    console.error("[admin] notify sound upload error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminRouter.delete("/api/admin/notify-sounds/:filename", requireAdmin, async (req, res) => {
  const filename = basename(req.params.filename);
  const ext = extname(filename).toLowerCase();
  if (!ALLOWED_SOUND_EXTS.has(ext)) return res.status(400).json({ ok: false, error: "invalid file" });

  try {
    const filePath = join(NOTIFY_SOUNDS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: "not found" });
    fs.unlinkSync(filePath);

    // Clear any settings referencing this file
    const settings = await loadSettings();
    const updates = {};
    if (settings.notifySound === filename) updates.notifySound = "";
    if (settings.mentionSound === filename) updates.mentionSound = "";
    if (Object.keys(updates).length > 0) await saveSettings(updates);

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminRouter.post("/api/admin/notify-sounds/select", requireAdmin, async (req, res) => {
  try {
    await pool.query("INSERT INTO site_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING");

    const current = await loadSettings();

    const notifySound = req.body?.notifySound !== undefined
      ? String(req.body.notifySound).trim()
      : current.notifySound;
    const mentionSound = req.body?.mentionSound !== undefined
      ? String(req.body.mentionSound).trim()
      : current.mentionSound;
    const voiceJoinSound = req.body?.voiceJoinSound !== undefined
      ? String(req.body.voiceJoinSound).trim()
      : current.voiceJoinSound;
    const voiceLeaveSound = req.body?.voiceLeaveSound !== undefined
      ? String(req.body.voiceLeaveSound).trim()
      : current.voiceLeaveSound;

    await pool.query(
      "UPDATE site_settings SET notify_sound=$1, mention_sound=$2, voice_join_sound=$3, voice_leave_sound=$4 WHERE id=1",
      [notifySound, mentionSound, voiceJoinSound, voiceLeaveSound]
    );
    invalidateSettings();
    await loadSettings();
    return res.json({ ok: true, notifySound, mentionSound, voiceJoinSound, voiceLeaveSound });
  } catch (err) {
    console.error("[admin] notify-sounds/select error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Attachments management ---
function calcBase64Size(text) {
  if (!text || typeof text !== "string") return 0;
  const match = text.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return 0;
  return Math.ceil(match[1].length * 0.75);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

adminRouter.get("/api/admin/attachments/stats", requireAdmin, async (req, res) => {
  try {
    const soundFiles = listSoundFiles();
    let diskBytes = 0;
    for (const f of soundFiles) diskBytes += f.size || 0;

    let dbAvatars = 0, dbImages = 0, dbStickersMsg = 0, dbStickersLib = 0;
    let avatarCount = 0, imageCount = 0, stickerMsgCount = 0, chatBgCount = 0, stickerLibCount = 0;

    const { rows: avatarRows } = await pool.query("SELECT avatar FROM users WHERE avatar IS NOT NULL AND avatar != ''");
    for (const r of avatarRows) { const s = calcBase64Size(r.avatar); if (s) { dbAvatars += s; avatarCount++; } }

    const { rows: imageRows } = await pool.query("SELECT image_data FROM messages WHERE image_data IS NOT NULL AND image_data != ''");
    for (const r of imageRows) { const s = calcBase64Size(r.image_data); if (s) { dbImages += s; imageCount++; } }

    const { rows: stMsgRows } = await pool.query("SELECT sticker_data FROM messages WHERE sticker_data IS NOT NULL AND sticker_data != ''");
    for (const r of stMsgRows) { const s = calcBase64Size(r.sticker_data); if (s) { dbStickersMsg += s; stickerMsgCount++; } }

    const { rows: stLibRows } = await pool.query("SELECT data FROM stickers WHERE data IS NOT NULL AND data != ''");
    for (const r of stLibRows) { const s = calcBase64Size(r.data); if (s) { dbStickersLib += s; stickerLibCount++; } }

    const dbTotal = dbAvatars + dbImages + dbStickersMsg + dbStickersLib;
    const totalBytes = dbTotal + diskBytes;

    const { rows: cfgRows } = await pool.query("SELECT attachment_retention_days FROM site_settings WHERE id=1 LIMIT 1");
    const retentionDays = cfgRows?.[0]?.attachment_retention_days ?? 0;

    return res.json({
      ok: true,
      retentionDays: Number(retentionDays),
      totalBytes,
      diskBytes,
      dbTotal,
      categories: [
        { key: "avatars", label: "Аватары", bytes: dbAvatars, count: avatarCount },
        { key: "images", label: "Изображения в чате", bytes: dbImages, count: imageCount },
        { key: "stickerMessages", label: "Стикеры в чате", bytes: dbStickersMsg, count: stickerMsgCount },
        { key: "stickerLibrary", label: "Библиотека стикеров", bytes: dbStickersLib, count: stickerLibCount },
        { key: "soundFiles", label: "Звуковые файлы", bytes: diskBytes, count: soundFiles.length },
      ],
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminRouter.post("/api/admin/attachments/retention", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(365, Math.max(0, Number(req.body?.days ?? 0)));
    await pool.query("INSERT INTO site_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING");
    await pool.query("UPDATE site_settings SET attachment_retention_days=$1 WHERE id=1", [days]);
    return res.json({ ok: true, retentionDays: days });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminRouter.post("/api/admin/attachments/cleanup", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.body?.days ?? 30)));
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    let deletedImages = 0, deletedStickers = 0;

    const { rowCount: rc1 } = await pool.query(
      "UPDATE messages SET image_data='' WHERE image_data IS NOT NULL AND image_data != '' AND ts < $1",
      [cutoff]
    );
    deletedImages = Number(rc1 || 0);

    const { rowCount: rc2 } = await pool.query(
      "UPDATE messages SET sticker_data='' WHERE sticker_data IS NOT NULL AND sticker_data != '' AND ts < $1",
      [cutoff]
    );
    deletedStickers = Number(rc2 || 0);

    return res.json({ ok: true, days, deletedImages, deletedStickers, totalDeleted: deletedImages + deletedStickers });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Public API: list chat rooms (for frontend)
export function getChatRoomsApi() {
  const router = express.Router();
router.get("/api/chat-rooms", async (req, res) => {
     try {
       const { rows } = await pool.query(
         "SELECT slug, name, bg_color, font_size, tab_text_color, tab_bg_color, tab_border_color FROM chat_rooms ORDER BY sort_order ASC, id ASC"
       );
       return res.json({ ok: true, rooms: rows.map(r => ({
         ...r,
         font_size: typeof r.font_size === 'bigint' ? Number(r.font_size) : r.font_size,
       }))});
     } catch {
       return res.json({ ok: false });
     }
   });
 
  router.get("/api/stickers", async (req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT id, name, data FROM stickers ORDER BY sort_order ASC, id ASC"
      );
      return res.json({ ok: true, stickers: rows });
    } catch {
      return res.status(500).json({ ok: false });
    }
  });
  router.get("/api/notify-sounds", async (req, res) => {
    try {
      const settings = await loadSettings();
      return res.json({
        ok: true,
        notifySound: settings.notifySound || "",
        mentionSound: settings.mentionSound || "",
        voiceJoinSound: settings.voiceJoinSound || "",
        voiceLeaveSound: settings.voiceLeaveSound || "",
      });
    } catch {
      return res.status(500).json({ ok: false });
    }
  });
  return router;
}
