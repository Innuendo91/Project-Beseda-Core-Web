import "dotenv/config";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "redis";
import { RedisStore } from "connect-redis";
import bcrypt from "bcrypt";

import { authRouter } from "./routes/auth.routes.js";
import { streamsRouter } from "./routes/streams.routes.js";
import { pagesRouter } from "./routes/pages.routes.js";
import { jwksRouter } from "./routes/jwks.routes.js";
import { attachChatWss } from "./ws-chat.js";
import { attachVoiceProxy } from "./ws-voice-proxy.js";
import { attachDesktopChatWss } from "./ws-desktop-chat.js";
import { attachDesktopVoiceWss } from "./ws-desktop-voice.js";
import { attachDesktopRemotePlayWss } from "./ws-desktop-remote-play.js";
import { consumeRememberToken, rememberCookie } from "./remember.js";
import voiceRoutes, { voiceDesktopRouter } from "./routes/voice.routes.js";
import { adminRouter, getChatRoomsApi } from "./routes/admin.routes.js";
import { loadSettings } from "./settings.js";
import dmRouter from "./routes/dm.routes.js";
import mediamtxAuthRoutes from "./routes/mediamtx-auth.routes.js";
import { getVapidPublicKey, savePushSubscription, removePushSubscription } from "./push-notifications.js";
import { csrfMiddleware } from "./csrf.js";
import { desktopAuthMiddleware } from "./desktop-auth.js";
import { pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("views", new URL("./views", import.meta.url).pathname);

// --- load settings at startup to populate cache ---
loadSettings().catch(() => {});

// --- middleware базовые ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '2mb' }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    if (req.path?.startsWith("/api/")) {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
    return res.status(400).send("Invalid JSON body");
  }
  return next(err);
});

// --- static ---
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/runtime", express.static(path.join(__dirname, "runtime")));

// --- MediaMTX HTTP auth (до session, у MediaMTX нет сессии) ---
app.use(mediamtxAuthRoutes);

// --- session (Redis store с фоллбэком на память) ---
let sessionStore;
if (process.env.REDIS_URL) {
  const redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.connect().catch(() => {});
  sessionStore = new RedisStore({ client: redisClient, prefix: "sess:" });
}

const sessionParser = session({
  secret: process.env.SESSION_SECRET || "change_me",
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  },
});
app.use(sessionParser);

// --- CSRF protection (after session, before routes) ---
app.use(csrfMiddleware());

// --- remember-me restore (после sessionParser) ---
app.use(async (req, res, next) => {
  try {
    if (req.session?.user?.id) return next();

    const cookieVal = req.cookies?.[rememberCookie.name];
    if (!cookieVal) return next();

    const r = await consumeRememberToken(cookieVal);
    if (!r?.ok || !r.user?.id) {
      res.clearCookie(rememberCookie.name, rememberCookie.options);
      return next();
    }

    req.session.user = r.user;

    // rotation cookie
    if (r.newCookieValue) {
      res.cookie(rememberCookie.name, r.newCookieValue, {
        ...rememberCookie.options,
        maxAge: rememberCookie.maxAgeMs,
      });
    }
  } catch {
    // ignore
  }
  next();
});

// --- Desktop token auth (restores session from Bearer token) ---
app.use(desktopAuthMiddleware);

app.use(async (req, res, next) => {
  const userId = Number(req.session?.user?.id || 0);
  if (!userId) return next();

  try {
    const { rows } = await pool.query("SELECT id FROM users WHERE id=$1 LIMIT 1", [userId]);
    if (rows.length > 0) return next();
  } catch {
    return next();
  }

  try {
    res.clearCookie(rememberCookie.name, rememberCookie.options);
  } catch {}

  const finish = () => {
    if (req.path?.startsWith("/api/")) {
      return res.status(401).json({ ok: false, error: "user deleted", forceLogout: true });
    }
    return res.redirect("/login");
  };

  if (req.session) {
    return req.session.destroy(finish);
  }
  return finish();
});

// --- API (после session) ---
app.use("/api/voice", voiceRoutes);
app.use("/api/desktop/voice", voiceDesktopRouter);
app.use("/api/dm", dmRouter);
app.use(getChatRoomsApi());

// --- Push notifications ---
app.get("/api/push/vapid-key", (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

app.post("/api/push/subscribe", async (req, res) => {
  const user = req.session?.user;
  if (!user?.id) return res.status(401).json({ ok: false });
  const { subscription, room } = req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ ok: false, error: "bad subscription" });
  }
  await savePushSubscription(user.id, subscription, room || "global");
  res.json({ ok: true });
});

app.delete("/api/push/subscribe", async (req, res) => {
  const user = req.session?.user;
  if (!user?.id) return res.status(401).json({ ok: false });
  const { p256dh, auth } = req.body;
  if (!p256dh || !auth) return res.status(400).json({ ok: false, error: "bad request" });
  await removePushSubscription(user.id, p256dh, auth);
  res.json({ ok: true });
});

// --- остальной роутинг ---
app.use(authRouter);
app.use(streamsRouter);
app.use(pagesRouter);
app.use(jwksRouter);
app.use(adminRouter);

// --- http + ws ---
const server = http.createServer(app);
attachChatWss(server, sessionParser);
attachVoiceProxy(server, sessionParser);
attachDesktopChatWss(server);
attachDesktopVoiceWss(server);
attachDesktopRemotePlayWss(server);

// --- bootstrap: create admin user if env vars are set ---
(async () => {
  const adminUser = process.env.ADMIN_BOOTSTRAP_USER;
  const adminPass = process.env.ADMIN_BOOTSTRAP_PASS;
  if (!adminUser || !adminPass) return;
  try {
    const { pool } = await import("./db.js");
    const existing = await pool.query("SELECT id FROM users WHERE username=$1 LIMIT 1", [adminUser]);
    if (existing.rows.length > 0) {
      console.log(`[bootstrap] admin user "${adminUser}" already exists, updating is_admin`);
      await pool.query("UPDATE users SET is_admin=TRUE WHERE username=$1", [adminUser]);
    } else {
      const hash = await bcrypt.hash(adminPass, 12);
      const ts = Math.floor(Date.now() / 1000);
      await pool.query(
        "INSERT INTO users(username, pass_hash, created_ts, is_admin) VALUES ($1, $2, $3, TRUE)",
        [adminUser, hash, ts]
      );
      console.log(`[bootstrap] admin user "${adminUser}" created`);
    }
  } catch (err) {
    console.error(`[bootstrap] failed to create admin:`, err.message);
  }
})();

// --- bootstrap: ensure default "global" chat room exists ---
(async () => {
  try {
    const { pool } = await import("./db.js");
    const { rows } = await pool.query("SELECT id FROM chat_rooms WHERE slug='global' LIMIT 1");
    if (rows.length === 0) {
      const ts = Math.floor(Date.now() / 1000);
      await pool.query(
        "INSERT INTO chat_rooms(slug, name, sort_order, created_ts, is_permanent) VALUES ('global', 'Общий чат', 0, $1, TRUE)",
        [ts]
      );
      console.log("[bootstrap] default chat room \"global\" created");
    }
  } catch (err) {
    console.error("[bootstrap] failed to create default chat room:", err.message);
  }
})();

const port = Number(process.env.PORT || 8080);
server.listen(port, () => console.log("stream-node listening on port", port));
