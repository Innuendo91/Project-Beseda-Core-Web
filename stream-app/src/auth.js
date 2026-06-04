export function requireAuth(req, res, next) {
  if (req.session?.user?.id && req.session?.user?.username) return next();
  return res.redirect("/login");
}

export function requireAuthApi(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: "unauthorized" });
}

export function isAdminUser(user) {
  if (!user?.id || !user?.username) return false;
  if (user.isAdmin === true) return true;

  const raw = process.env.ADMIN_USERS || process.env.ADMIN_USER || "";
  const admins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return admins.length > 0 && admins.includes(user.username);
}

export function requireAdmin(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  if (!isAdminUser(req.session.user)) return res.status(403).send("forbidden");
  return next();
}
