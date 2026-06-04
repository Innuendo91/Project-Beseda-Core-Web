import express from "express";
import { getJwks } from "../whep-jwt.js";

export const jwksRouter = express.Router();

jwksRouter.get("/.well-known/jwks.json", (req, res) => {
  const jwks = getJwks();
  if (!jwks) return res.status(404).json({ error: "jwks_not_configured" });
  res.json(jwks);
});
