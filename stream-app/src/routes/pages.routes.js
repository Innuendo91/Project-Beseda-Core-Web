import express from "express";
import bcrypt from "bcrypt";
import { requireAuth, requireAuthApi, isAdminUser } from "../auth.js";
import { issueMtxJwtNoExp, issueWhepJwt } from "../whep-jwt.js";
import { verifyDesktopToken } from "../desktop-auth.js";
import { pool } from "../db.js";
import sharp from "sharp";
import { loadSettings, getSrtPassphrase, getSrtPbkeylen } from "../settings.js";
import { loadVoiceSettings } from "../voice-settings.js";
import { getDesktopRemotePlayAccess, setDesktopRemotePlayInvite } from "../ws-desktop-remote-play.js";

export const pagesRouter = express.Router();

async function renderSpa(req, res) {
  const settings = await loadSettings();
  return res.render("spa", {
    user: req.session.user,
    isAdmin: isAdminUser(req.session.user),
    siteName: settings.siteName,
    siteSubtitle: settings.siteSubtitle,
  });
}

// --- SPA entry points (redirect legacy URLs) ---
pagesRouter.get(["/", "/app", "/app/*"], requireAuth, renderSpa);

pagesRouter.get("/chat/:path(*)", requireAuth, (req, res) => {
  res.redirect("/app");
});

pagesRouter.get("/watch/:path(*)", requireAuth, (req, res) => {
  res.redirect("/app");
});

pagesRouter.get("/room/:slug", requireAuth, (req, res) => {
  res.redirect("/app");
});

pagesRouter.get("/mini-room/:slug", requireAuth, (req, res) => {
  res.redirect("/app");
});

pagesRouter.get("/stream", requireAuth, (req, res) => {
  res.redirect("/app");
});

pagesRouter.get("/profile", requireAuth, (req, res) => {
  res.redirect("/app");
});

// --- API routes (used by Vue SPA) ---
pagesRouter.get("/api/whep-config/:path(*)", requireAuthApi, (req, res) => {
  const path = String(req.params.path ?? "").trim();
  if (!/^live\/[a-zA-Z0-9._\/-]{1,120}$/.test(path)) {
    return res.status(400).json({ ok: false, error: "Неверный путь стрима" });
  }

  const token = issueWhepJwt(path);
  if (!token) {
    return res.status(500).json({ ok: false, error: "JWT не настроен" });
  }

  const protocol = process.env.WHEP_PROTOCOL || "https";
  const streamHost = process.env.STREAM_HOST || req.hostname || "127.0.0.1";
  const whepPort = process.env.WHEP_PORT || "8889";

  res.json({
    ok: true,
    path,
    protocol,
    streamHost,
    whepPort,
    token,
  });
});

// Desktop WHEP config (token auth)
pagesRouter.get("/api/desktop/whep-config/:path(*)", (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const user = verifyDesktopToken(authHeader.slice(7));
  if (!user) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const path = String(req.params.path ?? "").trim();
  if (!/^live\/[a-zA-Z0-9._\/-]{1,120}$/.test(path)) {
    return res.status(400).json({ ok: false, error: "Неверный путь стрима" });
  }

  const token = issueWhepJwt(path);
  if (!token) {
    return res.status(500).json({ ok: false, error: "JWT не настроен" });
  }

  const protocol = process.env.WHEP_PROTOCOL || "https";
  const streamHost = process.env.STREAM_HOST || req.hostname || "127.0.0.1";
  const whepPort = process.env.WHEP_PORT || "8889";

  res.json({
    ok: true,
    path,
    protocol,
    streamHost,
    whepPort,
    token,
  });
});

pagesRouter.get("/api/stream-config", requireAuthApi, async (req, res) => {
  const username = req.session.user.username;
  const path = `live/${username}`;

  const ingestHost = (process.env.SRT_INGEST_HOST || req.hostname).replace(/:\d+$/, "");
  const srtPort = process.env.SRT_INGEST_PORT || "8890";
  const latency = process.env.SRT_LATENCY || "300000";
  const pkt = "1316";

  let pubToken = "";

  try {
    const { rows } = await pool.query("SELECT publish_token FROM users WHERE id=$1 LIMIT 1", [req.session.user.id]);
    const row = rows?.[0];
    pubToken = String(row?.publish_token || "").trim();
    if (!pubToken) {
      pubToken = issueMtxJwtNoExp([{ action: "publish", path }]);
      if (pubToken) {
        await pool.query("UPDATE users SET publish_token=$1 WHERE id=$2", [pubToken, req.session.user.id]);
      }
    }
  } catch {}

  if (!pubToken) {
    pubToken = issueMtxJwtNoExp([{ action: "publish", path }]);
  }

  const streamid = pubToken ? `publish:${path}:${username}:${pubToken}` : `publish:${path}`;
  const base = `srt://${ingestHost}:${srtPort}?streamid=${streamid}&latency=${latency}&pkt_size=${pkt}`;

  const passphrase = getSrtPassphrase();
  const pbkeylen = String(getSrtPbkeylen());
  const enc = passphrase ? `${base}&passphrase=${encodeURIComponent(passphrase)}&pbkeylen=${pbkeylen}` : "";

  res.json({
    ok: true,
    path,
    srtUrl: base,
    srtUrlEnc: enc,
  });
});

pagesRouter.get("/api/browser-stream-config", requireAuthApi, async (req, res) => {
  const username = req.session.user.username;
  const path = `live/${username}`;

  let pubToken = "";
  try {
    const { rows } = await pool.query("SELECT publish_token FROM users WHERE id=$1 LIMIT 1", [req.session.user.id]);
    pubToken = String(rows?.[0]?.publish_token || "").trim();
    if (!pubToken) {
      pubToken = issueMtxJwtNoExp([{ action: "publish", path }]);
      if (pubToken) {
        await pool.query("UPDATE users SET publish_token=$1 WHERE id=$2", [pubToken, req.session.user.id]);
      }
    }
  } catch {
    pubToken = issueMtxJwtNoExp([{ action: "publish", path }]);
  }

  res.json({ ok: true, pubToken, path });
});

pagesRouter.get("/api/desktop/remote-play-access/:path(*)", requireAuthApi, (req, res) => {
  const path = String(req.params.path ?? "").trim();
  return res.json(getDesktopRemotePlayAccess(path, req.session.user));
});

pagesRouter.post("/api/desktop/remote-play-invite", requireAuthApi, async (req, res) => {
  const stream = String(req.body?.stream || "").trim();
  const remotePlayEnabled = Boolean(req.body?.enabled);
  const rawPlayers = Array.isArray(req.body?.players)
    ? req.body.players
    : [{ padIndex: 0, playerId: Number(req.body?.playerId || 0) }];

  const invitePlayers = [];
  if (remotePlayEnabled) {
    const requested = rawPlayers
      .map((entry) => ({
        padIndex: Number(entry?.padIndex),
        playerId: Number(entry?.playerId || 0),
      }))
      .filter((entry) => Number.isInteger(entry.padIndex) && entry.padIndex >= 0 && entry.padIndex < 4 && entry.playerId > 0);

    const seenSlots = new Set();
    const seenPlayers = new Set();
    for (const entry of requested) {
      if (entry.playerId === Number(req.session.user.id) || seenSlots.has(entry.padIndex) || seenPlayers.has(entry.playerId)) {
        return res.status(400).json({ ok: false, error: "invalid player" });
      }
      seenSlots.add(entry.padIndex);
      seenPlayers.add(entry.playerId);
    }
    if (!requested.length) return res.status(400).json({ ok: false, error: "invalid player" });

    const { rows } = await pool.query(
      "SELECT id, username, display_name FROM users WHERE id = ANY($1::int[])",
      [[...seenPlayers]]
    );
    const byId = new Map((rows || []).map((row) => [Number(row.id), row]));
    for (const entry of requested) {
      const player = byId.get(entry.playerId);
      if (!player) return res.status(404).json({ ok: false, error: "player not found" });
      invitePlayers.push({ padIndex: entry.padIndex, player });
    }
  }

  const result = setDesktopRemotePlayInvite(stream, req.session.user, invitePlayers);
  if (!result.ok) return res.status(result.status || 400).json(result);
  return res.json(result);
});

// Public site settings (used by desktop client)
pagesRouter.get("/api/site-settings", async (req, res) => {
  const settings = await loadSettings();
  return res.json({
    ok: true,
    siteName: settings.siteName || "Project Beseda",
    siteSubtitle: settings.siteSubtitle || "",
  });
});

pagesRouter.get("/api/voice-settings", requireAuthApi, async (req, res) => {
  try {
    const voiceSettings = await loadVoiceSettings(req.session.user.id, { includeChatSounds: true });
    return res.json({ ok: true, ...voiceSettings });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

pagesRouter.get("/api/desktop/voice-settings", requireAuthApi, async (req, res) => {
  try {
    const voiceSettings = await loadVoiceSettings(req.session.user.id, { includeChatSounds: true });
    return res.json({ ok: true, ...voiceSettings });
  } catch {
    return res.status(500).json({ ok: false });
  }
});


pagesRouter.post("/api/voice-settings", requireAuthApi, async (req, res) => {
  const ns = req.body?.noiseSuppression ? true : false;
  const ec = req.body?.echoCancellation ? true : false;
  const ag = req.body?.autoGain ? true : false;
  const sm = req.body?.selfMonitor ? true : false;
  let smd = Number(req.body?.selfMonitorDelayMs);
  const vad = req.body?.vadEnabled ? true : false;
  let vadThreshold = Number(req.body?.vadThreshold);
  let vadHold = Number(req.body?.vadHoldMs);
  let ig = Number(req.body?.inputGain);
  const deviceId = String(req.body?.deviceId || "").slice(0, 255);
  const chatNotifySound = req.body?.chatNotifySound !== false;
  const chatMentionSound = req.body?.chatMentionSound !== false;
  const pushEnabled = req.body?.pushEnabled !== false;

  if (!Number.isFinite(ig)) ig = 100;
  if (ig < 0) ig = 0;
  if (ig > 200) ig = 200;
  if (!Number.isFinite(smd)) smd = 200;
  if (smd < 0) smd = 0;
  if (smd > 2000) smd = 2000;
  if (!Number.isFinite(vadThreshold)) vadThreshold = 10;
  if (vadThreshold < 0) vadThreshold = 0;
  if (vadThreshold > 100) vadThreshold = 100;
  if (!Number.isFinite(vadHold)) vadHold = 600;
  if (vadHold < 0) vadHold = 0;
  if (vadHold > 2000) vadHold = 2000;

  try {
    await pool.query(
      `INSERT INTO voice_settings(user_id, noise_suppression, echo_cancellation, auto_gain, input_gain, self_monitor, self_monitor_delay_ms, vad_enabled, vad_threshold, vad_hold_ms, device_id, chat_notify_sound, chat_mention_sound, push_enabled, updated_ts)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (user_id) DO UPDATE SET
          noise_suppression=EXCLUDED.noise_suppression,
          echo_cancellation=EXCLUDED.echo_cancellation,
          auto_gain=EXCLUDED.auto_gain,
          input_gain=EXCLUDED.input_gain,
          self_monitor=EXCLUDED.self_monitor,
          self_monitor_delay_ms=EXCLUDED.self_monitor_delay_ms,
          vad_enabled=EXCLUDED.vad_enabled,
          vad_threshold=EXCLUDED.vad_threshold,
          vad_hold_ms=EXCLUDED.vad_hold_ms,
          device_id=EXCLUDED.device_id,
          chat_notify_sound=EXCLUDED.chat_notify_sound,
          chat_mention_sound=EXCLUDED.chat_mention_sound,
          push_enabled=EXCLUDED.push_enabled,
          updated_ts=EXCLUDED.updated_ts`,
      [req.session.user.id, ns, ec, ag, ig, sm, smd, vad, vadThreshold, vadHold, deviceId, chatNotifySound, chatMentionSound, pushEnabled, Math.floor(Date.now() / 1000)]
    );
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

pagesRouter.post("/api/desktop/voice-settings", requireAuthApi, async (req, res) => {
  const ns = req.body?.noiseSuppression ? true : false;
  const ec = req.body?.echoCancellation ? true : false;
  const ag = req.body?.autoGain ? true : false;
  const sm = req.body?.selfMonitor ? true : false;
  let smd = Number(req.body?.selfMonitorDelayMs);
  const vad = req.body?.vadEnabled ? true : false;
  let vadThreshold = Number(req.body?.vadThreshold);
  let vadHold = Number(req.body?.vadHoldMs);
  let ig = Number(req.body?.inputGain);
  const deviceId = String(req.body?.deviceId || "").slice(0, 255);
  const chatNotifySound = req.body?.chatNotifySound !== false;
  const chatMentionSound = req.body?.chatMentionSound !== false;
  const pushEnabled = req.body?.pushEnabled !== false;

  if (!Number.isFinite(ig)) ig = 100;
  if (ig < 0) ig = 0;
  if (ig > 200) ig = 200;
  if (!Number.isFinite(smd)) smd = 200;
  if (smd < 0) smd = 0;
  if (smd > 2000) smd = 2000;
  if (!Number.isFinite(vadThreshold)) vadThreshold = 10;
  if (vadThreshold < 0) vadThreshold = 0;
  if (vadThreshold > 100) vadThreshold = 100;
  if (!Number.isFinite(vadHold)) vadHold = 600;
  if (vadHold < 0) vadHold = 0;
  if (vadHold > 2000) vadHold = 2000;

  try {
    await pool.query(
      `INSERT INTO voice_settings(user_id, noise_suppression, echo_cancellation, auto_gain, input_gain, self_monitor, self_monitor_delay_ms, vad_enabled, vad_threshold, vad_hold_ms, device_id, chat_notify_sound, chat_mention_sound, push_enabled, updated_ts)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (user_id) DO UPDATE SET
          noise_suppression=EXCLUDED.noise_suppression,
          echo_cancellation=EXCLUDED.echo_cancellation,
          auto_gain=EXCLUDED.auto_gain,
          input_gain=EXCLUDED.input_gain,
          self_monitor=EXCLUDED.self_monitor,
          self_monitor_delay_ms=EXCLUDED.self_monitor_delay_ms,
          vad_enabled=EXCLUDED.vad_enabled,
          vad_threshold=EXCLUDED.vad_threshold,
          vad_hold_ms=EXCLUDED.vad_hold_ms,
          device_id=EXCLUDED.device_id,
          chat_notify_sound=EXCLUDED.chat_notify_sound,
          chat_mention_sound=EXCLUDED.chat_mention_sound,
          push_enabled=EXCLUDED.push_enabled,
          updated_ts=EXCLUDED.updated_ts`,
      [req.session.user.id, ns, ec, ag, ig, sm, smd, vad, vadThreshold, vadHold, deviceId, chatNotifySound, chatMentionSound, pushEnabled, Math.floor(Date.now() / 1000)]
    );
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

pagesRouter.post("/api/profile", requireAuthApi, async (req, res) => {
  const displayName = String(req.body?.displayName ?? "").trim().slice(0, 64);
  const nickColor = String(req.body?.nickColor ?? "#60a5fa").trim();
  const bio = String(req.body?.bio ?? "").trim().slice(0, 500);
  let avatar = String(req.body?.avatar ?? "").trim();

  if (!/^#[0-9a-fA-F]{6}$/.test(nickColor)) {
    return res.status(400).json({ ok: false, error: "Неверный формат цвета" });
  }

  if (avatar.length > 1000000) {
    return res.status(400).json({ ok: false, error: "Аватар слишком большой (макс. 1 Мб)" });
  }

  // Resize avatar to 128x128 if provided
  if (avatar) {
    try {
      const buf = Buffer.from(avatar.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const resized = await sharp(buf)
        .resize(128, 128, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 80 })
        .toBuffer();
      // Check size limit (100KB)
      if (resized.length > 102400) {
        const smaller = await sharp(buf)
          .resize(128, 128, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 50 })
          .toBuffer();
        avatar = 'data:image/jpeg;base64,' + smaller.toString('base64');
      } else {
        avatar = 'data:image/jpeg;base64,' + resized.toString('base64');
      }
    } catch {
      // If resize fails, use original
    }
  }

  try {
    await pool.query(
      "UPDATE users SET display_name=$1, nick_color=$2, bio=$3, avatar=$4 WHERE id=$5",
      [displayName, nickColor, bio, avatar, req.session.user.id]
    );

    req.session.user.displayName = displayName;
    req.session.user.nickColor = nickColor;
    req.session.user.avatar = avatar;

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

pagesRouter.post("/api/desktop/profile", requireAuthApi, async (req, res) => {
  const displayName = String(req.body?.displayName ?? "").trim().slice(0, 64);
  const nickColor = String(req.body?.nickColor ?? "#60a5fa").trim();
  const bio = String(req.body?.bio ?? "").trim().slice(0, 500);
  let avatar = String(req.body?.avatar ?? "").trim();

  if (!/^#[0-9a-fA-F]{6}$/.test(nickColor)) {
    return res.status(400).json({ ok: false, error: "Неверный формат цвета" });
  }

  if (avatar.length > 1000000) {
    return res.status(400).json({ ok: false, error: "Аватар слишком большой (макс. 1 МБ)" });
  }

  if (avatar) {
    try {
      const buf = Buffer.from(avatar.replace(/^data:image\/\w+;base64,/, ""), "base64");
      const resized = await sharp(buf)
        .resize(128, 128, { fit: "cover", position: "center" })
        .jpeg({ quality: 80 })
        .toBuffer();
      if (resized.length > 102400) {
        const smaller = await sharp(buf)
          .resize(128, 128, { fit: "cover", position: "center" })
          .jpeg({ quality: 50 })
          .toBuffer();
        avatar = "data:image/jpeg;base64," + smaller.toString("base64");
      } else {
        avatar = "data:image/jpeg;base64," + resized.toString("base64");
      }
    } catch {
      /* keep original avatar */
    }
  }

  try {
    await pool.query(
      "UPDATE users SET display_name=$1, nick_color=$2, bio=$3, avatar=$4 WHERE id=$5",
      [displayName, nickColor, bio, avatar, req.session.user.id]
    );

    req.session.user.displayName = displayName;
    req.session.user.nickColor = nickColor;
    req.session.user.avatar = avatar;

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

pagesRouter.get("/api/users", requireAuthApi, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, username, display_name, nick_color, avatar, bio FROM users ORDER BY username ASC"
    );
    return res.json({ ok: true, users: rows.map(r => ({
      id: r.id,
      username: r.username,
      displayName: String(r.display_name || ''),
      nickColor: String(r.nick_color || '#60a5fa'),
      avatar: String(r.avatar || '/public/usericon.jpg'),
      bio: String(r.bio || ''),
    }))});
  } catch {
    return res.status(500).json({ ok: false });
  }
});

// --- Password reset (EJS, standalone template) ---
pagesRouter.get("/reset/:token", async (req, res) => {
  if (req.session?.user) return res.redirect("/");

  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.render("reset-password", { error: "Неверная ссылка", token: "", username: "" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT pr.used, pr.expires_ts, u.username FROM password_resets pr JOIN users u ON u.id = pr.user_id WHERE pr.token = $1 LIMIT 1",
      [token]
    );

    if (!rows.length) {
      return res.render("reset-password", { error: "Ссылка не найдена", token, username: "" });
    }

    const reset = rows[0];
    if (reset.used) {
      return res.render("reset-password", { error: "Эта ссылка уже использована", token: "", username: "" });
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > Number(reset.expires_ts)) {
      return res.render("reset-password", { error: "Ссылка истекла", token: "", username: "" });
    }

    return res.render("reset-password", { error: "", token, username: reset.username });
  } catch {
    return res.render("reset-password", { error: "Ошибка сервера", token: "", username: "" });
  }
});

pagesRouter.post("/reset/:token", async (req, res) => {
  if (req.session?.user) return res.redirect("/");

  const token = String(req.params.token || "");
  const pass = String(req.body.pass || "");
  const pass2 = String(req.body.pass2 || "");

  if (!pass || pass.length < 6) {
    return res.render("reset-password", { error: "Пароль минимум 6 символов", token, username: "" });
  }
  if (pass !== pass2) {
    return res.render("reset-password", { error: "Пароли не совпадают", token, username: "" });
  }

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.render("reset-password", { error: "Неверная ссылка", token: "", username: "" });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        "SELECT pr.id, pr.used, pr.expires_ts, pr.user_id FROM password_resets pr WHERE pr.token = $1 FOR UPDATE LIMIT 1",
        [token]
      );

      if (!rows.length) {
        await client.query("ROLLBACK");
        return res.render("reset-password", { error: "Ссылка не найдена", token: "", username: "" });
      }

      const reset = rows[0];
      if (reset.used) {
        await client.query("ROLLBACK");
        return res.render("reset-password", { error: "Эта ссылка уже использована", token: "", username: "" });
      }

      const now = Math.floor(Date.now() / 1000);
      if (now > Number(reset.expires_ts)) {
        await client.query("ROLLBACK");
        return res.render("reset-password", { error: "Ссылка истекла", token: "", username: "" });
      }

      const hash = await bcrypt.hash(pass, 12);
      await client.query("UPDATE users SET pass_hash = $1 WHERE id = $2", [hash, reset.user_id]);
      await client.query("DELETE FROM remember_tokens WHERE user_id = $1", [reset.user_id]);
      await client.query("UPDATE password_resets SET used = TRUE WHERE id = $1", [reset.id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return res.render("reset-password", {
      error: "",
      token: "",
      username: "",
      success: true,
    });
  } catch {
    return res.render("reset-password", { error: "Ошибка сервера", token, username: "" });
  }
});
