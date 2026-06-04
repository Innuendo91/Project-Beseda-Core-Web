import crypto from "crypto";

function parseKeyMap(raw) {
  const map = new Map();
  for (const part of String(raw || "").split(",")) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    const path = p.slice(0, eq).trim();
    const key = p.slice(eq + 1).trim();
    if (!path || !key) continue;
    map.set(path, key);
  }
  return map;
}

const keyMap = parseKeyMap(process.env.STREAM_WATCH_KEYS || "");
const fallbackKey = String(process.env.STREAM_WATCH_KEY || "").trim();

function timingSafeEq(a, b) {
  const aBuf = Buffer.from(String(a || ""), "utf8");
  const bBuf = Buffer.from(String(b || ""), "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function validateWatchKey(path, providedKey) {
  const expected = keyMap.get(path) || fallbackKey;

  if (!expected) {
    return { ok: false, reason: "watch_key_not_configured" };
  }
  if (!providedKey) {
    return { ok: false, reason: "watch_key_required" };
  }
  if (!timingSafeEq(expected, providedKey)) {
    return { ok: false, reason: "watch_key_invalid" };
  }
  return { ok: true };
}

export function getWatchKeysObject() {
  const obj = {};
  for (const [k, v] of keyMap.entries()) obj[k] = v;
  return obj;
}
