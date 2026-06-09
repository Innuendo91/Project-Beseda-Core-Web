import express from "express";
import { listPaths } from "../mediamtx.js";
import { requireAuth } from "../auth.js";
import { pool } from "../db.js";

export const streamsRouter = express.Router();

streamsRouter.get("/api/streams", requireAuth, async (req, res) => {
  try {
    const r = await listPaths();
    const paths = (r.paths || [])
      .filter(p => typeof p === "string" && p.startsWith("live/"))
      .sort();

    const usernames = paths.map(p => p.slice(5));
    let streamers = {};
    if (usernames.length > 0) {
      const { rows } = await pool.query(
        "SELECT username, display_name FROM users WHERE username = ANY($1)",
        [usernames]
      );
      for (const row of rows) {
        streamers[row.username] = row.display_name || row.username;
      }
    }

    const streams = paths.map(p => ({
      path: p,
      username: p.slice(5),
      displayName: streamers[p.slice(5)] || p.slice(5),
    }));

    res.json({ ok: true, apiOk: r.ok, paths: streams });
  } catch {
    res.json({ ok: true, apiOk: false, paths: [] });
  }
});
