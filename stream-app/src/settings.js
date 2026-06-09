import { pool } from "./db.js";

let _cache = null;

function defaults() {
  return {
    siteName: "Stream.ShadeCraft.ru",
    siteSubtitle: "стримлерская",
    registrationCode: process.env.REGISTRATION_CODE || "",
    registrationEnabled: true,
    srtPassphrase: process.env.SRT_PASSPHRASE || "",
    srtPbkeylen: Number(process.env.SRT_PBKEYLEN || 32),
    portalIp: "",
    notifySound: "",
    mentionSound: "",
    voiceJoinSound: "",
    voiceLeaveSound: "",
    updatedAt: null,
  };
}

export async function loadSettings() {
  try {
    const { rows } = await pool.query(
      "SELECT site_name, site_subtitle, registration_code, registration_enabled, srt_passphrase, srt_pbkeylen, portal_ip, notify_sound, mention_sound, voice_join_sound, voice_leave_sound, updated_ts FROM site_settings WHERE id = 1 LIMIT 1"
    );
    const r = rows?.[0];
    if (!r) {
      _cache = defaults();
      return _cache;
    }
    _cache = {
      siteName: String(r.site_name || ""),
      siteSubtitle: String(r.site_subtitle || ""),
      registrationCode: String(r.registration_code || ""),
      registrationEnabled: r.registration_enabled !== false,
      srtPassphrase: String(r.srt_passphrase || ""),
      srtPbkeylen: Number(r.srt_pbkeylen || 32),
      portalIp: String(r.portal_ip || ""),
      notifySound: String(r.notify_sound || ""),
      mentionSound: String(r.mention_sound || ""),
      voiceJoinSound: String(r.voice_join_sound || ""),
      voiceLeaveSound: String(r.voice_leave_sound || ""),
      updatedAt: r.updated_ts ? new Date(Number(r.updated_ts) * 1000) : null,
    };
    return _cache;
  } catch {
    _cache = defaults();
    return _cache;
  }
}

export function getSettings() {
  return _cache || defaults();
}

export function invalidateSettings() {
  _cache = null;
}

export async function saveSettings(data) {
  const siteName = String(data?.siteName || "").trim().slice(0, 128);
  const siteSubtitle = String(data?.siteSubtitle || "").trim().slice(0, 256);
  const registrationCode = String(data?.registrationCode || "").trim().slice(0, 256);
  const registrationEnabled = data?.registrationEnabled !== false;
  const srtPassphrase = String(data?.srtPassphrase || "").trim();
  let srtPbkeylen = Number(data?.srtPbkeylen || 32);
  if (![5, 16, 24, 32].includes(srtPbkeylen)) srtPbkeylen = 32;
  const portalIp = String(data?.portalIp || "").trim().slice(0, 64);
  const notifySound = String(data?.notifySound || "").trim().slice(0, 128);
  const mentionSound = String(data?.mentionSound || "").trim().slice(0, 128);
  const voiceJoinSound = String(data?.voiceJoinSound || "").trim().slice(0, 128);
  const voiceLeaveSound = String(data?.voiceLeaveSound || "").trim().slice(0, 128);
  const ts = Math.floor(Date.now() / 1000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure row exists
    await client.query("INSERT INTO site_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING");

    await client.query(
      `UPDATE site_settings SET site_name=$1, site_subtitle=$2, registration_code=$3, registration_enabled=$4, srt_passphrase=$5, srt_pbkeylen=$6, portal_ip=$7, notify_sound=$8, mention_sound=$9, voice_join_sound=$10, voice_leave_sound=$11, updated_ts=$12 WHERE id=1`,
      [siteName, siteSubtitle, registrationCode, registrationEnabled, srtPassphrase, srtPbkeylen, portalIp, notifySound, mentionSound, voiceJoinSound, voiceLeaveSound, ts]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  _cache = null;
  return loadSettings();
}

// Convenience: get registration code (DB value, fallback to env)
export function getRegistrationCode() {
  const s = getSettings();
  return s.registrationCode || (process.env.REGISTRATION_CODE || "");
}

// Convenience: check if registration is enabled
export function isRegistrationEnabled() {
  const s = getSettings();
  return s.registrationEnabled;
}

// Convenience: get SRT passphrase (DB value, fallback to env)
export function getSrtPassphrase() {
  const s = getSettings();
  return s.srtPassphrase || (process.env.SRT_PASSPHRASE || "");
}

// Convenience: get SRT pbkeylen (DB value, fallback to env)
export function getSrtPbkeylen() {
  const s = getSettings();
  return s.srtPbkeylen || Number(process.env.SRT_PBKEYLEN || 32);
}

// Convenience: get portal IP (for generating URLs behind reverse proxy)
export function getPortalIp() {
  return getSettings().portalIp || "";
}

export function getNotifySound() {
  return getSettings().notifySound || "";
}

export function getMentionSound() {
  return getSettings().mentionSound || "";
}

export function getVoiceJoinSound() {
  return getSettings().voiceJoinSound || "";
}

export function getVoiceLeaveSound() {
  return getSettings().voiceLeaveSound || "";
}

export function getBaseUrl() {
  return process.env.BASE_URL || "";
}
