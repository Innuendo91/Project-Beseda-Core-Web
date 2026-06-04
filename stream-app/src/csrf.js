import crypto from "crypto";

const CSRF_COOKIE = "_csrf";
const CSRF_HEADER = "x-csrf-token";
const CSRF_LEN = 32;

// Routes that don't need CSRF at all (no session or not user-facing)
const SKIP_PATHS = [
  "/api/mediamtx/auth",
  "/api/desktop/",
  "/ws/chat",
  "/voice/",
];

const VALIDATE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

function generateToken() {
  return crypto.randomBytes(CSRF_LEN).toString("base64url");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function isSkippedPath(req) {
  const path = req.path || "";
  for (const skip of SKIP_PATHS) {
    if (path === skip || path.startsWith(skip)) return true;
  }
  return false;
}

function isValidInternalSecret(req) {
  const expected = process.env.VOICE_SERVER_SECRET || "";
  if (!expected) return false;
  const provided = req.headers["x-voice-secret"];
  if (!provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function csrfMiddleware() {
  return (req, res, next) => {
    // Completely skip external/non-session routes
    if (isSkippedPath(req)) return next();

    // Desktop clients authenticate with an Authorization bearer token instead
    // of a browser cookie, so CSRF protection does not apply to those requests.
    if (String(req.headers.authorization || "").startsWith("Bearer ")) return next();

    // Internal service-to-service requests bypass CSRF (authenticated via shared secret)
    if (isValidInternalSecret(req)) return next();

    // Ensure CSRF token exists in session
    if (!req.session._csrf) {
      req.session._csrf = generateToken();
    }

    const token = req.session._csrf;

    // Set cookie (read-only, httpOnly, sameSite lax)
    if (!req.cookies[CSRF_COOKIE]) {
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
      });
    }

    // Make token available to templates on ALL requests
    res.locals.csrfToken = token;

    // For state-changing methods, validate token
    if (VALIDATE_METHODS.has(req.method)) {
      const headerToken = req.headers[CSRF_HEADER];
      const bodyToken = req.body?._csrf;

      // Accept token from header (AJAX) or body (form POST)
      const provided = headerToken || bodyToken;

      if (!provided || !timingSafeEqual(provided, token)) {
        const isApi = req.path.startsWith("/api/");
        const acceptsJson = (req.headers.accept || "").includes("application/json");

        if (isApi || acceptsJson || req.headers["content-type"]?.includes("application/json")) {
          return res.status(403).json({ ok: false, error: "CSRF token required" });
        }

        return res.status(403).send("CSRF token required");
      }
    }

    next();
  };
}
