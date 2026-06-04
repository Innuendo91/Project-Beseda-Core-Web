import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import { requireAuthApi } from "../auth.js";

const router = express.Router();

function slugify(input) {
  const base = String(input || "").trim().toLowerCase();
  if (!base) return "";
  const cleaned = base
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return cleaned;
}

const CYRILLIC_MAP = {
  а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"yo", ж:"zh", з:"z", и:"i",
  й:"y", к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t",
  у:"u", ф:"f", х:"kh", ц:"ts", ч:"ch", ш:"sh", щ:"shch", ъ:"", ы:"y",
  ъ:"'", э:"e", ю:"yu", я:"ya", ъ:""
};

function transliterate(text) {
  return String(text || "")
    .toLowerCase()
    .split("")
    .map(c => CYRILLIC_MAP[c] || c)
    .join("");
}

function latinSlugify(input) {
  const base = transliterate(String(input || "").trim());
  if (!base) return "";
  const cleaned = base
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return cleaned;
}

function roomToApi(r) {
  return {
    id: typeof r.id === 'bigint' ? Number(r.id) : r.id,
    slug: r.slug,
    latinSlug: r.latin_slug,
    name: r.name,
    createdBy: r.created_by,
    createdAt: (typeof r.created_ts === 'bigint' ? Number(r.created_ts) : r.created_ts) * 1000,
    hasPassword: !!r.pass_hash,
    isPermanent: !!r.is_permanent
  };
}

function getVoiceRoomPresence(status, slug) {
  const value = status?.[slug];
  if (!value) return { peerCount: 0, peers: [] };
  if (typeof value === "number") return { peerCount: value, peers: [] };
  const peers = Array.isArray(value.peers)
    ? value.peers.map((peer) => ({
        peerId: peer.peerId,
        userId: peer.userId,
        username: peer.username || "user"
      }))
    : [];
  return {
    peerCount: Number(value.count ?? peers.length ?? 0) || 0,
    peers
  };
}

router.get("/rooms", requireAuthApi, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent FROM voice_rooms ORDER BY created_ts DESC"
    );

    let peerCounts = {};
    try {
      const voiceUrl = (process.env.VOICE_SERVER_URL || "http://localhost:4001").replace(/^ws:/, "http:");
      const r = await fetch(`${voiceUrl}/rooms/status`);
      if (r.ok) peerCounts = await r.json();
    } catch {}

    const rooms = rows.map(r => ({
      ...roomToApi(r),
      ...getVoiceRoomPresence(peerCounts, r.slug)
    }));
    res.json({ ok: true, rooms });
  } catch (err) {
    res.status(500).json({ error: "db error" });
  }
});

router.post("/rooms", requireAuthApi, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pass = String(req.body?.pass || "").trim();
  if (!name) return res.status(400).json({ error: "name required" });

  const slug = slugify(name);
  const ls = latinSlugify(name);
  if (!slug) return res.status(400).json({ error: "bad name" });

  const existing = await pool.query(
    "SELECT id, slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent FROM voice_rooms WHERE slug = $1 LIMIT 1",
    [slug]
  );
  if (existing.rows.length > 0) {
    return res.json({
      ok: true,
      room: roomToApi(existing.rows[0]),
      existing: true
    });
  }

  const passHash = pass ? await bcrypt.hash(pass, 10) : null;
  const ts = Math.floor(Date.now() / 1000);

  try {
    const { rows } = await pool.query(
      "INSERT INTO voice_rooms(slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent",
      [slug, ls, name.slice(0, 60), req.session.user.username, ts, passHash, false]
    );
    return res.json({ ok: true, room: roomToApi(rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      const re = await pool.query(
        "SELECT id, slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent FROM voice_rooms WHERE slug = $1 LIMIT 1",
        [slug]
      );
      if (re.rows.length > 0) {
        return res.json({
          ok: true,
          room: roomToApi(re.rows[0]),
          existing: true
        });
      }
      return res.status(409).json({ error: "slug exists" });
    }
    res.status(500).json({ error: "db error" });
  }
});

router.delete("/rooms/:slug", requireAuthApi, async (req, res) => {
  const ls = String(req.params.slug || "").trim().toLowerCase();
  if (!ls) return res.status(400).json({ error: "slug required" });

  try {
    const { rows } = await pool.query(
      "SELECT id, slug, created_by, is_permanent FROM voice_rooms WHERE latin_slug = $1 OR slug = $1 LIMIT 1",
      [ls]
    );
    if (rows.length === 0) return res.json({ ok: true });

    const room = rows[0];
    if (room.is_permanent) {
      return res.status(403).json({ error: "permanent room" });
    }
    if (room.created_by !== req.session.user.username) {
      return res.status(403).json({ error: "forbidden" });
    }

    await pool.query("DELETE FROM voice_rooms WHERE slug = $1", [room.slug]);
    return res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "db error" });
  }
});

router.post("/rooms/:slug/close", requireAuthApi, async (req, res) => {
  const ls = String(req.params.slug || "").trim().toLowerCase();
  if (!ls) return res.status(400).json({ error: "slug required" });

  try {
    const { rows } = await pool.query(
      "SELECT id, slug, created_by, is_permanent FROM voice_rooms WHERE latin_slug = $1 OR slug = $1 LIMIT 1",
      [ls]
    );
    if (rows.length === 0) return res.json({ ok: true });

    const room = rows[0];
    if (room.is_permanent) {
      return res.json({ ok: true });
    }
    if (room.created_by !== req.session.user.username) {
      return res.status(403).json({ error: "forbidden" });
    }

    await pool.query("DELETE FROM voice_rooms WHERE slug = $1", [room.slug]);
    return res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "db error" });
  }
});

// Internal endpoint called by voice-server after cleanup timer expires
// Requires shared secret header from voice-server (not CSRF-protected)
router.delete("/rooms/:slug/cleanup", async (req, res) => {
  const expectedSecret = process.env.VOICE_SERVER_SECRET || "";
  if (expectedSecret) {
    const provided = req.headers["x-voice-secret"];
    if (!provided || provided !== expectedSecret) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  const slug = String(req.params.slug || "").trim().toLowerCase();
  if (!slug) return res.status(400).json({ error: "slug required" });

  try {
    const { rows } = await pool.query(
      "SELECT slug, is_permanent FROM voice_rooms WHERE slug = $1 LIMIT 1",
      [slug]
    );
    if (rows.length === 0) return res.json({ ok: true });

    if (rows[0].is_permanent) {
      return res.json({ ok: true, skipped: true });
    }

    await pool.query("DELETE FROM voice_rooms WHERE slug = $1", [slug]);
    console.log(`[voice-cleanup] deleted DB room slug=${slug}`);
    return res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "db error" });
  }
});

router.post("/token", requireAuthApi, async (req, res) => {
  const { roomSlug, pass } = req.body || {};
  if (!roomSlug || typeof roomSlug !== "string") {
    return res.status(400).json({ error: "roomSlug required" });
  }

  const ls = roomSlug.trim().toLowerCase();

  try {
    const { rows } = await pool.query(
      "SELECT slug, pass_hash, is_permanent FROM voice_rooms WHERE latin_slug = $1 OR slug = $1 LIMIT 1",
      [ls]
    );

    if (rows.length === 0) return res.status(404).json({ error: "room not found" });

    const room = rows[0];
    if (room.pass_hash && room.pass_hash !== "") {
      const ok = await bcrypt.compare(pass || "", room.pass_hash);
      if (!ok) return res.status(403).json({ error: "bad password" });
    }

    const token = jwt.sign(
      {
        sub: `user:${req.session.user.id}`,
        username: req.session.user.username,
        roomSlug: room.slug,
        isPermanent: !!room.is_permanent
      },
      process.env.VOICE_JWT_SECRET,
      { expiresIn: "90s" }
    );

    res.json({ token });
  } catch {
    res.status(500).json({ error: "db error" });
  }
});

// --- Desktop client voice endpoints (JWT auth, no CSRF) ---
// Mounted under /api/voice-desktop/* to avoid CSRF issues
const desktopRouter = express.Router();

desktopRouter.get("/rooms", requireAuthApi, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent FROM voice_rooms ORDER BY created_ts DESC"
    );

    let peerCounts = {};
    try {
      const voiceUrl = (process.env.VOICE_SERVER_URL || "http://localhost:4001").replace(/^ws:/, "http:");
      const r = await fetch(`${voiceUrl}/rooms/status`);
      if (r.ok) peerCounts = await r.json();
    } catch {}

    const rooms = rows.map(r => ({
      ...roomToApi(r),
      ...getVoiceRoomPresence(peerCounts, r.slug)
    }));
    res.json({ ok: true, rooms });
  } catch (err) {
    res.status(500).json({ error: "db error" });
  }
});

desktopRouter.post("/rooms", requireAuthApi, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pass = String(req.body?.pass || "").trim();
  if (!name) return res.status(400).json({ error: "name required" });

  const slug = slugify(name);
  const ls = latinSlugify(name);
  if (!slug) return res.status(400).json({ error: "bad name" });

  const existing = await pool.query(
    "SELECT id, slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent FROM voice_rooms WHERE slug = $1 LIMIT 1",
    [slug]
  );
  if (existing.rows.length > 0) {
    return res.json({ ok: true, room: roomToApi(existing.rows[0]), existing: true });
  }

  const passHash = pass ? await bcrypt.hash(pass, 10) : null;
  const ts = Math.floor(Date.now() / 1000);

  try {
    const { rows } = await pool.query(
      "INSERT INTO voice_rooms(slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent",
      [slug, ls, name.slice(0, 60), req.session.user.username, ts, passHash, false]
    );
    return res.json({ ok: true, room: roomToApi(rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      const re = await pool.query(
        "SELECT id, slug, latin_slug, name, created_by, created_ts, pass_hash, is_permanent FROM voice_rooms WHERE slug = $1 LIMIT 1",
        [slug]
      );
      if (re.rows.length > 0) {
        return res.json({ ok: true, room: roomToApi(re.rows[0]), existing: true });
      }
      return res.status(409).json({ error: "slug exists" });
    }
    res.status(500).json({ error: "db error" });
  }
});

desktopRouter.delete("/rooms/:slug", requireAuthApi, async (req, res) => {
  const ls = String(req.params.slug || "").trim().toLowerCase();
  if (!ls) return res.status(400).json({ error: "slug required" });

  try {
    const { rows } = await pool.query(
      "SELECT id, slug, created_by, is_permanent FROM voice_rooms WHERE latin_slug = $1 OR slug = $1 LIMIT 1",
      [ls]
    );
    if (rows.length === 0) return res.json({ ok: true });

    const room = rows[0];
    if (room.is_permanent) return res.status(403).json({ error: "permanent room" });
    if (room.created_by !== req.session.user.username) return res.status(403).json({ error: "forbidden" });

    await pool.query("DELETE FROM voice_rooms WHERE slug = $1", [room.slug]);
    return res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "db error" });
  }
});

desktopRouter.post("/token", requireAuthApi, async (req, res) => {
  const { roomSlug, pass } = req.body || {};
  if (!roomSlug || typeof roomSlug !== "string") {
    return res.status(400).json({ error: "roomSlug required" });
  }

  const ls = roomSlug.trim().toLowerCase();

  try {
    const { rows } = await pool.query(
      "SELECT slug, pass_hash, is_permanent FROM voice_rooms WHERE latin_slug = $1 OR slug = $1 LIMIT 1",
      [ls]
    );

    if (rows.length === 0) return res.status(404).json({ error: "room not found" });

    const room = rows[0];
    if (room.pass_hash && room.pass_hash !== "") {
      const ok = await bcrypt.compare(pass || "", room.pass_hash);
      if (!ok) return res.status(403).json({ error: "bad password" });
    }

    const token = jwt.sign(
      {
        sub: `user:${req.session.user.id}`,
        username: req.session.user.username,
        roomSlug: room.slug,
        isPermanent: !!room.is_permanent
      },
      process.env.VOICE_JWT_SECRET,
      { expiresIn: "90s" }
    );

    res.json({ token });
  } catch {
    res.status(500).json({ error: "db error" });
  }
});

export default router;
export { desktopRouter as voiceDesktopRouter };
