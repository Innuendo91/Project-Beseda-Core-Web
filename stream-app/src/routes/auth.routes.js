import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import { deleteRememberByCookie, issueRememberToken, rememberCookie } from "../remember.js";
import { issueMtxJwtNoExp } from "../whep-jwt.js";
import { requireAuthApi } from "../auth.js";
import { loadSettings, getRegistrationCode } from "../settings.js";
import { checkBruteForce } from "../bruteforce.js";
import { authenticateCredentials, buildSessionUser, loadUserProfile } from "../auth-service.js";
import { issueDesktopToken } from "../desktop-auth.js";

export const authRouter = express.Router();

authRouter.get("/api/me", requireAuthApi, async (req, res) => {
  const user = await loadUserProfile(req.session.user, { includeChatSounds: true });
  res.json({ ok: true, user });
});

authRouter.get("/login", async (req, res) => {
  if (req.session?.user) return res.redirect("/");
  const settings = await loadSettings();
  return res.render("login", { error: "", username: "", siteName: settings.siteName, registrationEnabled: settings.registrationEnabled });
});

authRouter.post("/login", async (req, res) => {
  const username = String(req.body.username ?? "").trim();
  const pass = String(req.body.pass ?? "");
  const remember = String(req.body.remember ?? "") === "1";

  const settings = await loadSettings();
  if (!username || !pass) return res.render("login", { error: "Введите логин и пароль", username, siteName: settings.siteName, registrationEnabled: settings.registrationEnabled });

  const bf = await checkBruteForce(req, "login");
  if (bf.blocked) {
    const mins = Math.ceil(bf.retryAfter / 60);
    return res.render("login", { error: `Слишком много попыток. Попробуйте через ${mins} мин.`, username, siteName: settings.siteName, registrationEnabled: settings.registrationEnabled });
  }

  const auth = await authenticateCredentials(username, pass);
  if (!auth.ok) {
    bf.record(username, false);
    await new Promise(r => setTimeout(r, 600));
    return res.render("login", { error: "Неверный логин или пароль", username, siteName: settings.siteName, registrationEnabled: settings.registrationEnabled });
  }

  bf.record(username, true);
  req.session.user = auth.user;

  // remember-me (30 days)
  if (remember) {
    try {
      const cookieValue = await issueRememberToken(auth.user.id);
      res.cookie(rememberCookie.name, cookieValue, {
        ...rememberCookie.options,
        maxAge: rememberCookie.maxAgeMs,
      });
    } catch {
      // ignore
    }
  }

  res.redirect("/");
});

authRouter.get("/register", async (req, res) => {
  if (req.session?.user) return res.redirect("/");
  const settings = await loadSettings();
  if (!settings.registrationEnabled) {
    return res.render("register", { error: "Регистрация временно отключена", username: "", registrationClosed: true });
  }
  return res.render("register", { error: "", username: "", siteName: settings.siteName, registrationClosed: false });
});

authRouter.post("/register", async (req, res) => {
  const settings = await loadSettings();
  if (!settings.registrationEnabled) {
    return res.render("register", { error: "Регистрация временно отключена", username: "", registrationClosed: true, siteName: settings.siteName });
  }

  const code = String(req.body.code ?? "").trim();
  const username = String(req.body.username ?? "").trim();
  const pass = String(req.body.pass ?? "");
  const remember = String(req.body.remember ?? "") === "1";
  const pass2 = String(req.body.pass2 ?? "");

  const bf = await checkBruteForce(req, "register");
  if (bf.blocked) {
    const mins = Math.ceil(bf.retryAfter / 60);
    return res.render("register", { error: `Слишком много попыток. Попробуйте через ${mins} мин.`, username, siteName: settings.siteName, registrationClosed: false });
  }

  const expectedCode = getRegistrationCode();
  if (code !== expectedCode) {
    bf.record(username, false);
    return res.render("register", { error: "Неверное кодовое слово", username, siteName: settings.siteName, registrationClosed: false });
  }
  if (!username || !pass || !pass2) return res.render("register", { error: "Заполните все поля", username, siteName: settings.siteName, registrationClosed: false });
  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) return res.render("register", { error: "Логин 3–24, латиница/цифры/._-", username, siteName: settings.siteName, registrationClosed: false });
  if (pass.length < 6) return res.render("register", { error: "Пароль слишком короткий", username, siteName: settings.siteName, registrationClosed: false });
  if (pass !== pass2) return res.render("register", { error: "Пароли не совпадают", username, siteName: settings.siteName, registrationClosed: false });

  const hash = await bcrypt.hash(pass, 12);
  const ts = Math.floor(Date.now()/1000);

  try {
    const path = `live/${username}`;
    const publishToken = issueMtxJwtNoExp([{ action: "publish", path }]);
    const { rows } = await pool.query(
      "INSERT INTO users(username, pass_hash, created_ts, publish_token) VALUES ($1,$2,$3,$4) RETURNING id, is_admin",
      [username, hash, ts, publishToken || null]
    );
    bf.record(username, true);
    req.session.user = buildSessionUser({ ...rows[0], username });

    // Default voice settings: VAD (voice activation) enabled
    await pool.query(
      "INSERT INTO voice_settings(user_id, noise_suppression, echo_cancellation, auto_gain, vad_enabled, vad_threshold, vad_hold_ms, chat_notify_sound, chat_mention_sound, push_enabled, updated_ts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (user_id) DO NOTHING",
      [rows[0].id, true, true, true, true, 10, 600, false, true, true, ts]
    ).catch(() => {});

    // remember-me (30 days)
    if (remember) {
      try {
        const cookieValue = await issueRememberToken(rows[0].id);
        res.cookie(rememberCookie.name, cookieValue, {
          ...rememberCookie.options,
          maxAge: rememberCookie.maxAgeMs,
        });
      } catch {
        // ignore
      }
    }

    res.redirect("/");
  } catch {
    res.render("register", { error: "Логин занят", username, siteName: settings.siteName, registrationClosed: false });
  }
});

authRouter.post("/logout", async (req, res) => {
  try {
    const cookieVal = req.cookies?.[rememberCookie.name];
    if (cookieVal) await deleteRememberByCookie(cookieVal);
  } catch {}
  res.clearCookie(rememberCookie.name, rememberCookie.options);

  req.session.destroy(() => res.redirect("/login"));
});

authRouter.post("/api/desktop/login", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const pass = String(req.body?.pass ?? "");

  if (!username || !pass) {
    return res.status(400).json({ ok: false, error: "Введите логин и пароль" });
  }

  const bf = await checkBruteForce(req, "login");
  if (bf.blocked) {
    const mins = Math.ceil(bf.retryAfter / 60);
    return res.status(429).json({ ok: false, error: `Попытки заблокированы на ${mins} мин.` });
  }

  const auth = await authenticateCredentials(username, pass);
  if (!auth.ok) {
    bf.record(username, false);
    await new Promise((r) => setTimeout(r, 600));
    return res.status(401).json({ ok: false, error: "Неверный логин или пароль" });
  }

  bf.record(username, true);

  const token = issueDesktopToken(auth.user);
  res.json({ ok: true, token });
});

authRouter.get("/api/desktop/me", requireAuthApi, async (req, res) => {
  const user = await loadUserProfile(req.session.user, { includeChatSounds: false });
  res.json({ ok: true, user });
});

authRouter.post("/api/desktop/logout", async (req, res) => {
  try {
    const cookieVal = req.cookies?.[rememberCookie.name];
    if (cookieVal) await deleteRememberByCookie(cookieVal);
  } catch {}
  res.clearCookie(rememberCookie.name, rememberCookie.options);
  res.clearCookie("connect.sid", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  });
  if (req.session) {
    req.session.destroy(() => res.json({ ok: true }));
  } else {
    res.json({ ok: true });
  }
});
