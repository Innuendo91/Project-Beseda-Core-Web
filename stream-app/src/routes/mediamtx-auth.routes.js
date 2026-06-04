import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import { verifyMtxJwt } from "../whep-jwt.js";
import { getSrtPassphrase } from "../settings.js";

const router = express.Router();

function stripBearer(authHeader) {
  if (!authHeader) return "";
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") return parts[1].trim();
  return authHeader.trim();
}

function checkBasicAuth(user, password) {
  const apiUser = process.env.MEDIAMTX_API_USER || "";
  const apiPass = process.env.MEDIAMTX_API_PASS || "";
  return apiUser && apiPass && user === apiUser && password === apiPass;
}

function hasPermission(payload, needAction, needPath) {
  const ck = process.env.MEDIAMTX_JWT_CLAIM_KEY || process.env.WHEP_JWT_CLAIM_KEY || "mediamtx_permissions";
  const perms = Array.isArray(payload?.[ck]) ? payload[ck] : [];
  for (const p of perms) {
    if (p?.action !== needAction) continue;
    const pPath = String(p?.path || "");
    if (!pPath || pPath === needPath || needPath.startsWith(pPath)) return true;
  }
  return false;
}

// CORS preflight: MediaMTX пересылает OPTIONS на наш эндпоинт
router.options("/api/mediamtx/auth", (req, res) => {
  res.status(200).json({ ok: true });
});

router.post("/api/mediamtx/auth", async (req, res) => {
  const { user, password, token, action, path: mtxPath, protocol, ip } = req.body || {};

  // read — требуется валидный JWT с read-разрешением
  if (action === "read") {
    const jwtToken = stripBearer(token || "");
    if (!jwtToken) return res.status(401).json({ ok: false, error: "token required" });
    const payload = verifyMtxJwt(jwtToken);
    if (!payload || !hasPermission(payload, "read", mtxPath)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    return res.status(200).json({ ok: true });
  }

  // publish — проверяем, что пользователь существует в БД
  if (action === "publish") {
    console.log("[mediamtx-auth] publish:", JSON.stringify({ user, action, path: mtxPath, protocol, hasToken: !!token }));
    let userId = null;

    // SRT: если passphrase настроен — проверяем его, иначе пропускаем
    if (protocol === "srt" && password) {
      const srtPass = getSrtPassphrase();
      if (srtPass && password === srtPass) {
        return res.status(200).json({ ok: true });
      }
      if (!srtPass) {
        return res.status(200).json({ ok: true });
      }
      // srtPass set but password doesn't match — пробуем дальше как publish_token
    }

    // 1. Проверяем по publish_token (если пришёл token)
    if (token) {
      try {
        const { rows } = await pool.query(
          "SELECT id FROM users WHERE publish_token = $1 LIMIT 1",
          [token]
        );
        if (rows?.[0]) userId = rows[0].id;
      } catch {}
    }

    // 2. Проверяем по user + password=publish_token
    if (!userId && user && password) {
      try {
        const { rows } = await pool.query(
          "SELECT id, pass_hash, publish_token FROM users WHERE username = $1 LIMIT 1",
          [user]
        );
        const row = rows?.[0];
        if (row) {
          if (row.publish_token === password) {
            userId = row.id;
          } else if (await bcrypt.compare(password, row.pass_hash)) {
            userId = row.id;
          }
        }
      } catch {}
    }

    // 3. SRT: password может быть publish_token — ищем его напрямую
    if (!userId && protocol === "srt" && password) {
      try {
        const { rows } = await pool.query(
          "SELECT id FROM users WHERE publish_token = $1 LIMIT 1",
          [password]
        );
        if (rows?.[0]) userId = rows[0].id;
      } catch {}
    }

    if (userId) {
      return res.status(200).json({ ok: true });
    }

    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  // api, metrics, pprof — требуется Basic auth или валидный JWT
  if (["api", "metrics", "pprof"].includes(action)) {
    if (checkBasicAuth(user, password)) return res.status(200).json({ ok: true });
    const jwtToken = stripBearer(token || "");
    if (jwtToken) {
      const payload = verifyMtxJwt(jwtToken);
      if (payload && hasPermission(payload, action, mtxPath)) {
        return res.status(200).json({ ok: true });
      }
    }
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  res.status(401).json({ ok: false, error: "action not allowed" });
});

export default router;
