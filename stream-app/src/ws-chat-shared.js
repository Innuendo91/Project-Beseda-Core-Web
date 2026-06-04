const clients = new Set();
const onlineByUserId = new Map();
const roomMembers = new Map();
const DEFAULT_AVATAR = "/public/usericon.jpg";

export function registerClient(ws) {
  clients.add(ws);
}

export function unregisterClient(ws) {
  clients.delete(ws);
}

export function broadcastToRoom(room, payload) {
  for (const client of clients) {
    if (client.readyState !== 1) continue;
    if ((client.room || "global") !== room) continue;
    try {
      client.send(JSON.stringify(payload));
    } catch { /* ignore */ }
  }
}

export function broadcastToUsers(userIds, payload) {
  const ids = new Set((userIds || []).map((id) => Number(id)).filter(Boolean));
  if (!ids.size) return;
  for (const client of clients) {
    if (client.readyState !== 1) continue;
    if (!ids.has(Number(client.user?.id || 0))) continue;
    try {
      client.send(JSON.stringify(payload));
    } catch { /* ignore */ }
  }
}

export function forceLogoutUser(userId, reason = "user_deleted") {
  const id = Number(userId || 0);
  if (!id) return;
  const payload = JSON.stringify({ type: "force_logout", reason });
  for (const client of clients) {
    if (client.readyState !== 1) continue;
    if (Number(client.user?.id || 0) !== id) continue;
    try {
      client.send(payload);
      client.close(4001, reason);
    } catch { /* ignore */ }
  }
}

export function incPresence(ws) {
  const uid = Number(ws.user?.id || 0);
  if (!uid) return;

  const cur = onlineByUserId.get(uid) || {
    username: ws.user.username,
    nickColor: "#60a5fa",
    avatar: DEFAULT_AVATAR,
    displayName: "",
    bio: "",
    conns: 0,
  };
  cur.username = ws.user.username;
  cur.nickColor = ws.user.nickColor || "#60a5fa";
  cur.avatar = ws.user.avatar || DEFAULT_AVATAR;
  cur.displayName = String(ws.user.displayName || "");
  cur.bio = String(ws.user.bio || "");
  cur.conns += 1;
  onlineByUserId.set(uid, cur);

  const room = ws.room || "global";
  let rm = roomMembers.get(room);
  if (!rm) {
    rm = new Map();
    roomMembers.set(room, rm);
  }
  rm.set(uid, (rm.get(uid) || 0) + 1);
}

export function decPresence(ws) {
  const uid = Number(ws.user?.id || 0);
  if (!uid) return;

  const cur = onlineByUserId.get(uid);
  if (cur) {
    cur.conns -= 1;
    if (cur.conns <= 0) onlineByUserId.delete(uid);
    else onlineByUserId.set(uid, cur);
  }

  const room = ws.room || "global";
  const rm = roomMembers.get(room);
  if (rm) {
    const c = (rm.get(uid) || 0) - 1;
    if (c <= 0) rm.delete(uid);
    else rm.set(uid, c);
    if (rm.size === 0) roomMembers.delete(room);
  }
}

export function presenceSnapshotForRoom(room) {
  const onlineUsers = Array.from(onlineByUserId.entries())
    .map(([id, v]) => ({
      id,
      username: v.username,
      nickColor: v.nickColor || "#60a5fa",
      avatar: v.avatar || DEFAULT_AVATAR,
      displayName: v.displayName || "",
      bio: v.bio || "",
    }))
    .sort((a, b) => a.username.localeCompare(b.username, "ru"));

  const rm = roomMembers.get(room) || new Map();
  const roomUsers = Array.from(rm.keys())
    .map((id) => {
      const v = onlineByUserId.get(id);
      return {
        id,
        username: v?.username || "user",
        nickColor: v?.nickColor || "#60a5fa",
        avatar: v?.avatar || DEFAULT_AVATAR,
        displayName: v?.displayName || "",
        bio: v?.bio || "",
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username, "ru"));

  return {
    onlineCount: onlineUsers.length,
    onlineUsers,
    room,
    roomCount: roomUsers.length,
    roomUsers,
  };
}

export function broadcastPresence(room) {
  broadcastToRoom(room, { type: "presence", ...presenceSnapshotForRoom(room) });
}
