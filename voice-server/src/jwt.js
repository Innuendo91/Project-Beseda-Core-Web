import jwt from "jsonwebtoken";
import { config } from "./config.js";

export function verifyVoiceToken(token) {
  const payload = jwt.verify(token, config.voiceJwtSecret);
  if (!payload?.roomSlug || !payload?.username) {
    throw new Error("Bad token payload");
  }
  return payload;
}
