import bcrypt from "bcrypt";
import { pool } from "./db.js";

export function getEnvAdmins() {
  return (process.env.ADMIN_USERS || process.env.ADMIN_USER || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildSessionUser(row) {
  if (!row) return null;
  const username = String(row.username || "");
  return {
    id: Number(row.id),
    username,
    isAdmin: !!row.is_admin || getEnvAdmins().includes(username),
  };
}

export async function authenticateCredentials(username, pass) {
  const { rows } = await pool.query(
    "SELECT id, username, pass_hash, is_admin FROM users WHERE username=$1 LIMIT 1",
    [username]
  );
  const row = rows[0];

  let ok = false;
  if (row?.pass_hash) ok = await bcrypt.compare(pass, row.pass_hash);
  if (!ok) return { ok: false, user: null, row: null };

  const user = buildSessionUser(row);
  await touchLastLogin(user.id);
  return { ok: true, user, row };
}

export async function touchLastLogin(userId) {
  await pool.query("UPDATE users SET last_login_ts=$1 WHERE id=$2", [
    Math.floor(Date.now() / 1000),
    userId,
  ]);
}

export async function loadUserProfile(sessionUser, { includeChatSounds = true } = {}) {
  const user = { ...sessionUser };

  try {
    const { rows } = await pool.query(
      "SELECT display_name, nick_color, avatar, bio FROM users WHERE id=$1 LIMIT 1",
      [sessionUser.id]
    );
    const row = rows?.[0];
    if (row) {
      user.displayName = String(row.display_name || "");
      user.nickColor = String(row.nick_color || "#60a5fa");
      user.avatar = String(row.avatar || "/public/usericon.jpg");
      user.bio = String(row.bio || "");
    }
  } catch {
    // Keep the authenticated session user if profile enrichment fails.
  }

  if (includeChatSounds) {
    try {
      const { rows } = await pool.query(
        "SELECT chat_notify_sound, chat_mention_sound FROM voice_settings WHERE user_id=$1 LIMIT 1",
        [sessionUser.id]
      );
      const vs = rows?.[0];
      user.chatNotifySound = vs ? vs.chat_notify_sound !== false : true;
      user.chatMentionSound = vs ? vs.chat_mention_sound !== false : true;
    } catch {
      user.chatNotifySound = true;
      user.chatMentionSound = true;
    }
  }

  return user;
}
