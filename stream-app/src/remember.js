import crypto from "crypto";
import { pool } from "./db.js";
import { buildSessionUser } from "./auth-service.js";

const COOKIE_NAME = "remember";
const SELECTOR_LEN = 24; // hex chars
const VALIDATOR_LEN = 32; // bytes

function sha256Hex(bufOrStr) {
  return crypto.createHash("sha256").update(bufOrStr).digest("hex");
}

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

export const rememberCookie = {
  name: COOKIE_NAME,
  // 30 дней
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  options: {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  },
};

export function parseRememberCookie(value) {
  const v = String(value || "");
  const m = /^([a-f0-9]{24})\.([A-Za-z0-9_-]{30,})$/.exec(v);
  if (!m) return null;
  return { selector: m[1], validator: m[2] };
}

export async function issueRememberToken(userId) {
  const selector = crypto.randomBytes(12).toString("hex"); // 24 chars
  const validatorBytes = crypto.randomBytes(VALIDATOR_LEN);
  const validator = validatorBytes.toString("base64url");

  const created_ts = nowTs();
  const expires_ts = created_ts + 30 * 24 * 60 * 60;

  const token_hash = sha256Hex(validator);

  await pool.query(
    "INSERT INTO remember_tokens(user_id, selector, token_hash, created_ts, expires_ts) VALUES ($1,$2,$3,$4,$5)",
    [userId, selector, token_hash, created_ts, expires_ts]
  );

  return `${selector}.${validator}`;
}

// Проверяет и делает rotation (обновляет validator/hash) для повышения безопасности.
export async function consumeRememberToken(cookieValue) {
  const parsed = parseRememberCookie(cookieValue);
  if (!parsed) return { ok: false, reason: "bad_format" };

  const { selector, validator } = parsed;
  const token_hash = sha256Hex(validator);
  const ts = nowTs();

  const { rows } = await pool.query(
    `SELECT rt.id, rt.user_id, rt.expires_ts, rt.token_hash, u.username, u.is_admin
     FROM remember_tokens rt
     JOIN users u ON u.id=rt.user_id
     WHERE rt.selector=$1 LIMIT 1`,
    [selector]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (Number(row.expires_ts || 0) < ts) {
    await pool.query("DELETE FROM remember_tokens WHERE id=$1", [row.id]);
    return { ok: false, reason: "expired" };
  }

  // constant time compare
  const a = Buffer.from(String(row.token_hash || ""), "utf8");
  const b = Buffer.from(String(token_hash || ""), "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    // подозрительная ситуация: удаляем по selector
    await pool.query("DELETE FROM remember_tokens WHERE selector=$1", [selector]);
    return { ok: false, reason: "mismatch" };
  }

  // rotation
  const newValidator = crypto.randomBytes(VALIDATOR_LEN).toString("base64url");
  const newHash = sha256Hex(newValidator);

  await pool.query(
    "UPDATE remember_tokens SET token_hash=$1, last_used_ts=$2 WHERE id=$3",
    [newHash, ts, row.id]
  );

  return {
    ok: true,
    user: buildSessionUser({ id: row.user_id, username: row.username, is_admin: row.is_admin }),
    newCookieValue: `${selector}.${newValidator}`,
  };
}

export async function deleteRememberByCookie(cookieValue) {
  const parsed = parseRememberCookie(cookieValue);
  if (!parsed) return;
  await pool.query("DELETE FROM remember_tokens WHERE selector=$1", [parsed.selector]);
}
