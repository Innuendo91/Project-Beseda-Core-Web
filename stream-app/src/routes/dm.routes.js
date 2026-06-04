import express from "express";
import { pool } from "../db.js";
import { requireAuthApi } from "../auth.js";

const dmRouter = express.Router();

// Can only DM a different user
function dmRoomKey(id1, id2) {
  const [a, b] = id1 < id2 ? [id1, id2] : [id2, id1];
  return `dm:${a}:${b}`;
}

// GET /api/dm/threads — list all DM threads for current user, sorted by last activity
dmRouter.get("/threads", requireAuthApi, async (req, res) => {
  try {
    const userId = Number(req.session.user.id);
    const { rows } = await pool.query(
      `SELECT dt.id AS thread_id, dt.user1_id, dt.user2_id, dt.last_message_preview, dt.updated_ts,
              u.id AS peer_id, u.username, u.nick_color, u.avatar, u.display_name
       FROM dm_threads dt
       JOIN users u ON (
         (dt.user1_id = $1 AND u.id = dt.user2_id)
         OR (dt.user2_id = $1 AND u.id = dt.user1_id)
       )
       ORDER BY dt.updated_ts DESC`,
      [userId]
    );
    const threads = rows.map(r => ({
      threadId: Number(r.thread_id),
      user1Id: Number(r.user1_id),
      user2Id: Number(r.user2_id),
      peerId: Number(r.peer_id),
      peerUsername: r.username,
      peerNickColor: r.nick_color || "#60a5fa",
      peerAvatar: r.avatar || "",
      peerDisplayName: r.display_name || "",
      lastPreview: r.last_message_preview || "",
      updatedTs: Number(r.updated_ts),
      room: dmRoomKey(Number(r.user1_id), Number(r.user2_id)),
    }));
    return res.json({ ok: true, threads });
  } catch (err) {
    console.error("[dm] threads error:", err.message);
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

// GET /api/dm/:userId — get history for DM with user (creates thread if needed)
dmRouter.get("/:userId", requireAuthApi, async (req, res) => {
  try {
    const myId = Number(req.session.user.id);
    const peerId = Number(req.params.userId);

    if (myId === peerId) {
      return res.status(400).json({ ok: false, error: "cannot dm yourself" });
    }

    // Verify peer exists
    const { rows: peerRows } = await pool.query(
      "SELECT id, username FROM users WHERE id=$1 LIMIT 1",
      [peerId]
    );
    if (!peerRows.length) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    const room = dmRoomKey(myId, peerId);

    // Ensure thread exists
    await pool.query(
      `INSERT INTO dm_threads(user1_id, user2_id) VALUES ($1, $2)
       ON CONFLICT(user1_id, user2_id) DO NOTHING`,
      [Math.min(myId, peerId), Math.max(myId, peerId)]
    );

    // Get messages
    const { rows } = await pool.query(
      `SELECT m.id, m.ts, m.nick, m.text, m.sticker_data, m.image_data, u.nick_color, u.avatar, u.display_name, u.bio
       FROM messages m
       LEFT JOIN users u ON m.nick = u.username
       WHERE m.room=$1 ORDER BY m.id DESC LIMIT 100`,
      [room]
    );

    const msgs = rows.reverse().map(r => ({
      id: Number(r.id),
      ts: Number(r.ts),
      nick: r.nick,
      text: r.text,
      stickerData: r.sticker_data || "",
      imageData: r.image_data || "",
      nickColor: r.nick_color || "#60a5fa",
      avatar: r.avatar || "",
      displayName: String(r.display_name || ""),
      bio: String(r.bio || ""),
    }));

    return res.json({ ok: true, room, messages: msgs });
  } catch (err) {
    console.error("[dm] history error:", err.message);
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

// DELETE /api/dm/:userId — delete DM thread
dmRouter.delete("/:userId", requireAuthApi, async (req, res) => {
  try {
    const myId = Number(req.session.user.id);
    const peerId = Number(req.params.userId);
    const room = dmRoomKey(myId, peerId);

    await pool.query(
      "DELETE FROM dm_threads WHERE user1_id=$1 AND user2_id=$2",
      [Math.min(myId, peerId), Math.max(myId, peerId)]
    );

    // Also delete messages
    await pool.query("DELETE FROM messages WHERE room=$1", [room]);

    return res.json({ ok: true });
  } catch (err) {
    console.error("[dm] delete error:", err.message);
    return res.status(500).json({ ok: false, error: "db error" });
  }
});

export default dmRouter;
