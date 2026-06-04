import { pool } from "./db.js";

const defaultVoiceSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGain: true,
  inputGain: 100,
  selfMonitor: false,
  selfMonitorDelayMs: 200,
  vadEnabled: true,
  vadThreshold: 10,
  vadHoldMs: 600,
  pushEnabled: true,
  chatNotifySound: true,
  chatMentionSound: true,
};

export async function loadVoiceSettings(userId, { includeChatSounds = false } = {}) {
  const settings = { ...defaultVoiceSettings };
  try {
    const fields = `noise_suppression, echo_cancellation, auto_gain, input_gain, self_monitor, self_monitor_delay_ms, vad_enabled, vad_threshold, vad_hold_ms, device_id, push_enabled${includeChatSounds ? ", chat_notify_sound, chat_mention_sound" : ""}`;
    const { rows } = await pool.query(
      `SELECT ${fields} FROM voice_settings WHERE user_id=$1 LIMIT 1`,
      [userId]
    );
    const v = rows?.[0];
    if (v) {
      settings.noiseSuppression = v.noise_suppression !== false;
      settings.echoCancellation = v.echo_cancellation !== false;
      settings.autoGain = v.auto_gain !== false;
      settings.inputGain = Number.isFinite(Number(v.input_gain)) ? Number(v.input_gain) : 100;
      settings.selfMonitor = v.self_monitor !== false;
      settings.selfMonitorDelayMs = Number.isFinite(Number(v.self_monitor_delay_ms)) ? Number(v.self_monitor_delay_ms) : 200;
      settings.vadEnabled = v.vad_enabled !== false;
      settings.vadThreshold = Number.isFinite(Number(v.vad_threshold)) ? Number(v.vad_threshold) : 10;
      settings.vadHoldMs = Number.isFinite(Number(v.vad_hold_ms)) ? Number(v.vad_hold_ms) : 600;
      settings.deviceId = v.device_id || "";
      settings.pushEnabled = v.push_enabled !== false;
      if (includeChatSounds) {
        settings.chatNotifySound = v.chat_notify_sound !== false;
        settings.chatMentionSound = v.chat_mention_sound !== false;
      }
    }
  } catch { /* ignore */ }
  return settings;
}

export async function loadChatSounds(userId) {
  let chatNotifySound = true;
  let chatMentionSound = true;
  try {
    const { rows } = await pool.query(
      "SELECT chat_notify_sound, chat_mention_sound FROM voice_settings WHERE user_id=$1 LIMIT 1",
      [userId]
    );
    const v = rows?.[0];
    if (v) {
      chatNotifySound = v.chat_notify_sound !== false;
      chatMentionSound = v.chat_mention_sound !== false;
    }
  } catch { /* ignore */ }
  return { chatNotifySound, chatMentionSound };
}
