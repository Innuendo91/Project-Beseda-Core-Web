import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4001),
  env: process.env.NODE_ENV || "development",
  voiceJwtSecret: process.env.VOICE_JWT_SECRET,
  voiceServerSecret: process.env.VOICE_SERVER_SECRET || "",
  announcedIp: process.env.ANNOUNCED_IP || null,
  rtpMinPort: Number(process.env.RTP_MIN_PORT || 40000),
  rtpMaxPort: Number(process.env.RTP_MAX_PORT || 40100),
  streamAppUrl: process.env.STREAM_APP_URL || "http://localhost:8085",
  roomCleanupDelayMs: Number(process.env.ROOM_CLEANUP_DELAY_MS || 60000),
};

if (!config.announcedIp) {
   console.warn("[WARN] ANNOUNCED_IP is not set. WebRTC may fail behind NAT/VPS.");
 }

if (!config.voiceJwtSecret) {
   console.error("[FATAL] VOICE_JWT_SECRET is not set. Voice server cannot start.");
   process.exit(1);
 }
