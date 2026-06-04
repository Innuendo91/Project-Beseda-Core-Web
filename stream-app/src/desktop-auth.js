import jwt from "jsonwebtoken";

const DESKTOP_JWT_SECRET = process.env.SESSION_SECRET || "desktop_secret";
const DESKTOP_TOKEN_TTL = "180d";

export function issueDesktopToken(user) {
  return jwt.sign(
    {
      desktop: true,
      userId: user.id,
      username: user.username,
      isAdmin: !!user.isAdmin,
    },
    DESKTOP_JWT_SECRET,
    { expiresIn: DESKTOP_TOKEN_TTL }
  );
}

export function verifyDesktopToken(token) {
  try {
    const decoded = jwt.verify(token, DESKTOP_JWT_SECRET);
    if (!decoded.desktop) return null;
    return {
      id: decoded.userId,
      username: decoded.username,
      isAdmin: !!decoded.isAdmin,
    };
  } catch {
    return null;
  }
}

export function desktopAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return next();

  const token = authHeader.slice(7);
  const user = verifyDesktopToken(token);
  if (user) {
    req.session.user = user;
  } else if (req.path.startsWith("/api/desktop/")) {
    delete req.session.user;
  }

  next();
}
