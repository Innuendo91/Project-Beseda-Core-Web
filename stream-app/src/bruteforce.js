import { pool } from "./db.js";

const WINDOW_MS = Number(process.env.BF_WINDOW_MS || 600000); // 10 min
const MAX_FAILS = Number(process.env.BF_MAX_FAILS || 10);
const BLOCK_MS = Number(process.env.BF_BLOCK_MS || 900000); // 15 min

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded.split(",")[0]).trim();
  return req.socket?.remoteAddress || req.ip || "";
}

async function recordAttempt(ip, action, username, success) {
  try {
    await pool.query(
      "INSERT INTO auth_attempts(ip, action, username, success, created_ts) VALUES($1,$2,$3,$4,$5)",
      [ip, action, username, success, Math.floor(Date.now() / 1000)]
    );
  } catch { /* ignore */ }
}

async function isBlocked(ip, action) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - Math.floor(WINDOW_MS / 1000);

  const { rows } = await pool.query(
    "SELECT COUNT(*) AS cnt FROM auth_attempts WHERE ip=$1 AND action=$2 AND success=FALSE AND created_ts >= $3",
    [ip, action, windowStart]
  );

  const fails = parseInt(rows[0].cnt, 10);
  if (fails < MAX_FAILS) return { blocked: false, remaining: MAX_FAILS - fails };

  // Check when the block expires
  const { rows: lastRows } = await pool.query(
    "SELECT created_ts FROM auth_attempts WHERE ip=$1 AND action=$2 AND success=FALSE AND created_ts >= $3 ORDER BY created_ts DESC LIMIT 1",
    [ip, action, windowStart]
  );

  const lastFailTs = lastRows?.[0]?.created_ts ?? now;
  const blockUntil = lastFailTs + Math.floor(BLOCK_MS / 1000);
  const nowTs = Math.floor(Date.now() / 1000);

  if (nowTs < blockUntil) {
    const remainingSec = blockUntil - nowTs;
    return { blocked: true, retryAfter: remainingSec };
  }

  // Block window expired, allow but still track
  return { blocked: false, remaining: 0 };
}

export async function checkBruteForce(req, action) {
  const ip = getIp(req);
  const status = await isBlocked(ip, action);
  return { ...status, ip, record: (username, success) => recordAttempt(ip, action, username, success) };
}
