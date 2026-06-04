import webPush from "web-push";
import { pool } from "./db.js";

const vapidPrivate = process.env.VAPID_PRIVATE_KEY || "";
const vapidPublic = process.env.VAPID_PUBLIC_KEY || "";
const vapidEmail = process.env.VAPID_EMAIL || "mailto:admin@stream.shadecraft.ru";

if (vapidPrivate && vapidPublic) {
  webPush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
}

export function getVapidPublicKey() {
  return vapidPublic;
}

export async function savePushSubscription(userId, sub, room) {
  const ts = Math.floor(Date.now() / 1000);
  try {
    await pool.query(
      "INSERT INTO push_subscriptions(user_id, p256dh, auth, endpoint, room, created_ts) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, p256dh, auth) DO UPDATE SET endpoint=EXCLUDED.endpoint, room=EXCLUDED.room",
      [userId, sub.keys.p256dh, sub.keys.auth, sub.endpoint, room, ts]
    );
  } catch (err) {
    console.error("[push] save subscription error:", err.message);
  }
}

export async function removePushSubscription(userId, p256dh, auth) {
  try {
    await pool.query(
      "DELETE FROM push_subscriptions WHERE user_id=$1 AND p256dh=$2 AND auth=$3",
      [userId, p256dh, auth]
    );
  } catch (err) {
    console.error("[push] remove subscription error:", err.message);
  }
}

export async function sendPushToUser(userId, title, body, room) {
  try {
    const { rows } = await pool.query(
      `SELECT ps.p256dh, ps.auth, ps.endpoint
       FROM push_subscriptions ps
       JOIN voice_settings vs ON ps.user_id = vs.user_id
       WHERE ps.user_id=$1 AND ps.room=$2 AND vs.push_enabled = TRUE`,
      [userId, room]
    );
    for (const row of rows) {
      try {
        await webPush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          JSON.stringify({ title, body })
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await removePushSubscription(userId, row.p256dh, row.auth);
        }
        console.error("[push] send error:", err.message);
      }
    }
  } catch (err) {
    console.error("[push] query subscriptions error:", err.message);
  }
}

export async function sendPushToMentioned(room, senderId, senderName, mentionedNames, text) {
  if (!mentionedNames || mentionedNames.size === 0) return;
  try {
const placeholders = Array.from({ length: mentionedNames.size }, (_, i) => `$${i + 3}`).join(', ');
    const { rows } = await pool.query(
      `SELECT ps.user_id, ps.p256dh, ps.auth, ps.endpoint
        FROM push_subscriptions ps
        JOIN users u ON ps.user_id = u.id
        JOIN voice_settings vs ON ps.user_id = vs.user_id
        WHERE ps.room=$1 AND u.username IN (${placeholders}) AND ps.user_id!=$2 AND vs.push_enabled = TRUE`,
      [room, senderId, ...mentionedNames]
    );
    for (const row of rows) {
      try {
        await webPush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          JSON.stringify({ title: senderName, body: text })
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await removePushSubscription(row.user_id, row.p256dh, row.auth);
        }
        console.error("[push] send error:", err.message);
      }
    }
  } catch (err) {
    console.error("[push] query mentioned subscriptions error:", err.message);
  }
}
