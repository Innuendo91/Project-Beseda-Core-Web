import jwt from "jsonwebtoken";
import { createPrivateKey, createPublicKey } from "crypto";

// Asymmetric key (RS256/ES256)
function readPrivateKey() {
  const raw = String(process.env.MEDIAMTX_JWT_PRIVATE_KEY || process.env.WHEP_JWT_PRIVATE_KEY || "").trim();
  if (!raw) return "";
  return raw.includes("-----BEGIN") ? raw.replace(/\\n/g, "\n") : raw;
}

// Symmetric secret (HS256) — used by install.sh
function readSymmetricSecret() {
  return String(process.env.WHEP_JWT_SECRET || "").trim();
}

function claimKey() {
  return process.env.MEDIAMTX_JWT_CLAIM_KEY || process.env.WHEP_JWT_CLAIM_KEY || "mediamtx_permissions";
}

function signOptions() {
  const alg = process.env.MEDIAMTX_JWT_ALG || process.env.WHEP_JWT_ALG || "RS256";
  const kid = String(process.env.MEDIAMTX_JWT_KID || process.env.WHEP_JWT_KID || "").trim() || undefined;
  const iss = String(process.env.MEDIAMTX_JWT_ISS || process.env.WHEP_JWT_ISS || "").trim() || undefined;
  const aud = String(process.env.MEDIAMTX_JWT_AUD || process.env.WHEP_JWT_AUD || "").trim() || undefined;
  const ttl = Number(process.env.MEDIAMTX_JWT_TTL || process.env.WHEP_JWT_TTL || 300);
  return { alg, kid, iss, aud, ttl };
}

function signingConfig() {
  const privKey = readPrivateKey();
  const symSecret = readSymmetricSecret();
  if (privKey) {
    const { alg, kid, iss, aud } = signOptions();
    return { mode: "asymmetric", key: privKey, alg, kid, iss, aud };
  }
  if (symSecret) {
    return { mode: "symmetric", key: symSecret, alg: "HS256" };
  }
  return null;
}

export function issueMtxJwt(permissions) {
  const cfg = signingConfig();
  if (!cfg) return "";

  const payload = { [claimKey()]: permissions };
  const { ttl } = signOptions();

  if (cfg.mode === "symmetric") {
    return jwt.sign(payload, cfg.key, {
      algorithm: "HS256",
      expiresIn: Number.isFinite(ttl) && ttl > 0 ? ttl : 300,
    });
  }

  const opts = {
    algorithm: String(cfg.alg || "RS256"),
    expiresIn: Number.isFinite(ttl) && ttl > 0 ? ttl : 300,
  };
  if (cfg.kid) opts.keyid = String(cfg.kid);
  if (cfg.iss) opts.issuer = String(cfg.iss);
  if (cfg.aud) opts.audience = String(cfg.aud);
  return jwt.sign(payload, cfg.key, opts);
}

export function issueMtxJwtNoExp(permissions) {
  const cfg = signingConfig();
  if (!cfg) return "";

  const payload = { [claimKey()]: permissions };

  if (cfg.mode === "symmetric") {
    return jwt.sign(payload, cfg.key, { algorithm: "HS256" });
  }

  const opts = { algorithm: String(cfg.alg || "RS256") };
  if (cfg.kid) opts.keyid = String(cfg.kid);
  if (cfg.iss) opts.issuer = String(cfg.iss);
  if (cfg.aud) opts.audience = String(cfg.aud);
  return jwt.sign(payload, cfg.key, opts);
}

export function getJwks() {
  const raw = String(process.env.MEDIAMTX_JWKS_JSON || process.env.WHEP_JWKS_JSON || "").trim();
  if (raw) {
    try { return JSON.parse(raw); } catch { return null; }
  }

  const privKey = readPrivateKey();
  if (!privKey) return null;

  try {
    const { alg, kid } = signOptions();
    const pub = createPublicKey(createPrivateKey(privKey));
    const jwk = pub.export({ format: "jwk" });
    if (kid) jwk.kid = kid;
    jwk.use = "sig";
    jwk.alg = alg;
    return { keys: [jwk] };
  } catch {
    return null;
  }
}

export function issueWhepJwt(path) {
  const permissions = [
    { action: "read", path },
    { action: "playback", path },
  ];
  return issueMtxJwt(permissions);
}

export function verifyMtxJwt(tokenStr) {
  const cfg = signingConfig();
  if (!cfg) return null;

  if (cfg.mode === "symmetric") {
    try {
      return jwt.verify(tokenStr, cfg.key, { algorithms: ["HS256"] });
    } catch {
      return null;
    }
  }

  const pub = createPublicKey(createPrivateKey(cfg.key));
  try {
    return jwt.verify(tokenStr, pub, { algorithms: [cfg.alg || "RS256"] });
  } catch {
    return null;
  }
}
