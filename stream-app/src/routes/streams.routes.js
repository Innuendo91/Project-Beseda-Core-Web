import express from "express";
import { listPaths } from "../mediamtx.js";
import { requireAuth } from "../auth.js";

export const streamsRouter = express.Router();

streamsRouter.get("/api/streams", requireAuth, async (req, res) => {
  try {
    const r = await listPaths();
    const paths = (r.paths || [])
      .filter(p => typeof p === "string" && p.startsWith("live/"))
      .sort();

    res.json({ ok: true, apiOk: r.ok, paths });
  } catch {
    res.json({ ok: true, apiOk: false, paths: [] });
  }
});
