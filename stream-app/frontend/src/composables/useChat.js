import { ref, nextTick } from "vue";
import { getJson, csrfFetch } from "../api.js";

function wsChatUrl(room) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/chat?room=${encodeURIComponent(room || "global")}`;
}

function clampChatText(value, maxLen = 500) {
  let text = typeof value === "string" ? value : String(value ?? "");
  text = text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function checkMention(message, username) {
  if (!message || !message.text || !username) return false;
  const name = username.toLowerCase();
  const text = message.text.toLowerCase();
  const words = text.split(/[\s@.,;:!?\-—–_()[\]{}|/\\]+/);
  return words.some(w => w === name);
}

function isOwnMessage(message, username) {
  if (!message || !username) return false;
  return String(message.sender?.username || message.nick || "").toLowerCase() === String(username || "").toLowerCase();
}

function playNotifySound(url) {
  if (url) {
    try { const a = new Audio(url + "?t=" + Date.now()); a.volume = 0.5; a.play().catch(() => {}); } catch {}
    return;
  }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {}
}

function playMentionSound(url) {
  if (url) {
    try { const a = new Audio(url + "?t=" + Date.now()); a.volume = 0.5; a.play().catch(() => {}); } catch {}
    return;
  }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const playTone = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.2, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    playTone(600, 0, 0.12);
    playTone(900, 0.14, 0.12);
    playTone(1200, 0.28, 0.18);
  } catch {}
}

export function useChat() {
  const chatMessages = ref({});
  const chatUnread = ref({});
  const chatAllUsers = ref([]);
  const chatOnlineUsers = ref([]);
  const chatOnlineCount = ref(0);
  const chatStickers = ref([]);
  const chatStatus = ref("");
  const chatInput = ref("");
  const showEmojiPanel = ref(false);
  const showStickerPanel = ref(false);
  const chatLogEl = ref(null);
  const chatSockets = new Map();

  // Notification sounds state
  const notifySoundUrl = ref("");
  const mentionSoundUrl = ref("");
  const chatNotifySound = ref(true);
  const chatMentionSound = ref(true);
  let _currentUsername = "";
  let _currentActiveRoom = "global";
  let _notifSoundRef = null;

  // DM state
  const dmThreads = ref([]);

  function messageTime(ts) {
    if (!ts) return "";
    const date = new Date(Number(ts) * 1000);
    return `${date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function scrollChatBottom() {
    nextTick(() => {
      if (chatLogEl.value) chatLogEl.value.scrollTop = chatLogEl.value.scrollHeight;
    });
  }

  function pushChatMessages(room, messages) {
    const list = [...(chatMessages.value[room] || []), ...messages].slice(-400);
    chatMessages.value = { ...chatMessages.value, [room]: list };
  }

  function connectChatRoom(room) {
    if (!room || chatSockets.has(room)) return;
    chatStatus.value = "Подключение...";
    const ws = new WebSocket(wsChatUrl(room));
    chatSockets.set(room, ws);

    ws.onopen = () => {
      chatStatus.value = "";
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "init") {
        chatMessages.value = { ...chatMessages.value, [room]: Array.isArray(data.messages) ? data.messages : [] };
        scrollChatBottom();
        chatOnlineUsers.value = Array.isArray(data.onlineUsers) ? data.onlineUsers : [];
        chatOnlineCount.value = Number(data.onlineCount || 0);
      }

      if (data.type === "msg") {
        const msgRoom = data.room || room;
        if (data.message) {
          pushChatMessages(msgRoom, [data.message]);
          const ownMsg = isOwnMessage(data.message, _currentUsername);
          if (!ownMsg && msgRoom.startsWith("dm:") && data.message.sender) {
            const peerId = data.message.sender.id;
            if (peerId && !dmThreads.value.find((t) => t.peerId === peerId)) {
              dmThreads.value.push({
                room: msgRoom,
                peerId,
                peerUsername: data.message.sender.username || "",
                peerDisplayName: data.message.sender.displayName || data.message.sender.username || "",
                peerAvatar: data.message.sender.avatar,
                peerNickColor: data.message.sender.nickColor,
              });
              connectChatRoom(msgRoom);
            }
          }
          const isMention = checkMention(data.message, _currentUsername);
          if (!ownMsg && msgRoom !== _currentActiveRoom) {
            chatUnread.value = { ...chatUnread.value, [msgRoom]: (chatUnread.value[msgRoom] || 0) + 1 };
            if (chatMentionSound.value && isMention) {
              playMentionSound(notifySoundUrl.value ? "/public/notify_sounds/" + encodeURIComponent(mentionSoundUrl.value) : null);
            } else if (chatNotifySound.value) {
              if (!_notifSoundRef || _notifSoundRef !== msgRoom) {
                playNotifySound(notifySoundUrl.value ? "/public/notify_sounds/" + encodeURIComponent(notifySoundUrl.value) : null);
                _notifSoundRef = msgRoom;
              }
            }
          } else {
            _notifSoundRef = null;
            if (!ownMsg && chatMentionSound.value && isMention) {
              playMentionSound(mentionSoundUrl.value ? "/public/notify_sounds/" + encodeURIComponent(mentionSoundUrl.value) : null);
            }
          }
        }
        scrollChatBottom();
      }

      if (data.type === "delete") {
        const msgRoom = data.room || room;
        const messageId = Number(data.messageId || 0);
        if (messageId && Array.isArray(chatMessages.value[msgRoom])) {
          chatMessages.value = {
            ...chatMessages.value,
            [msgRoom]: chatMessages.value[msgRoom].filter((message) => Number(message.id || 0) !== messageId),
          };
        }
      }

      if (data.type === "presence") {
        chatOnlineUsers.value = Array.isArray(data.onlineUsers) ? data.onlineUsers : [];
        chatOnlineCount.value = Number(data.onlineCount || 0);
      }

      if (data.type === "error") {
        chatStatus.value = String(data.error || "Сообщение не отправлено");
        window.setTimeout(() => {
          if (chatStatus.value === data.error) chatStatus.value = "";
        }, 5000);
      }

      if (data.type === "force_logout") {
        window.location.href = "/login";
      }
    };

    ws.onclose = () => {
      chatSockets.delete(room);
      window.setTimeout(() => connectChatRoom(room), 1200);
    };

    ws.onerror = () => {
      chatStatus.value = "Ошибка соединения";
    };
  }

  function sendChatMessage(activeRoom) {
    const text = clampChatText(chatInput.value);
    if (!text) return;
    const ws = chatSockets.get(activeRoom);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      chatStatus.value = "Чат ещё подключается";
      return;
    }
    ws.send(JSON.stringify({ type: "post", text }));
    chatInput.value = "";
    showEmojiPanel.value = false;
  }

  function sendSticker(data, activeRoom) {
    const ws = chatSockets.get(activeRoom);
    if (!ws || ws.readyState !== WebSocket.OPEN || !data) return;
    ws.send(JSON.stringify({ type: "sticker", data }));
    showStickerPanel.value = false;
  }

  function sendImage(file, activeRoom) {
    const ws = chatSockets.get(activeRoom);
    if (!ws || ws.readyState !== WebSocket.OPEN || !file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      ws.send(JSON.stringify({ type: "image", data: reader.result }));
    };
    reader.readAsDataURL(file);
  }

  function toggleEmojiPanel() {
    showEmojiPanel.value = !showEmojiPanel.value;
    showStickerPanel.value = false;
  }

  function toggleStickerPanel() {
    showStickerPanel.value = !showStickerPanel.value;
    showEmojiPanel.value = false;
  }

  function insertEmoji(emoji) {
    chatInput.value = `${chatInput.value}${emoji}`;
    showEmojiPanel.value = false;
  }

  async function loadChatAux() {
    try {
      const [stickersData, usersData] = await Promise.all([
        getJson("/api/stickers"),
        getJson("/api/users"),
      ]);
      chatStickers.value = Array.isArray(stickersData.stickers) ? stickersData.stickers : [];
      if (Array.isArray(usersData.users)) {
        chatAllUsers.value = usersData.users;
      }
    } catch {
      // Chat still works without stickers/users.
    }
  }

  async function loadDmThreads() {
    try {
      const data = await getJson("/api/dm/threads");
      if (data.ok && Array.isArray(data.threads)) {
        dmThreads.value = data.threads;
      }
    } catch {
      dmThreads.value = [];
    }
  }

  async function openDm(userId, user) {
    try {
      const data = await getJson(`/api/dm/${userId}`);
      if (!data.ok || !data.room) return null;
      if (!chatMessages.value[data.room]) {
        chatMessages.value = {
          ...chatMessages.value,
          [data.room]: data.messages || [],
        };
      }
      const existing = dmThreads.value.find(t => t.peerId === userId);
      if (!existing) {
        dmThreads.value.push({
          room: data.room,
          peerId: userId,
          peerUsername: user?.username || '',
          peerDisplayName: user?.displayName || user?.username || '',
          peerAvatar: user?.avatar,
          peerNickColor: user?.nickColor,
        });
      }
      connectChatRoom(data.room);
      scrollChatBottom();
      return data.room;
    } catch {
      return null;
    }
  }

  async function deleteDm(userId) {
    try {
      const data = await csrfFetch(`/api/dm/${userId}`, { method: "DELETE" });
      if (!data.ok) return;
      dmThreads.value = dmThreads.value.filter(
        t => t.peerId !== userId
      );
    } catch {}
  }

  async function loadNotifySounds() {
    try {
      const data = await getJson("/api/notify-sounds");
      if (data.ok) {
        notifySoundUrl.value = data.notifySound || "";
        mentionSoundUrl.value = data.mentionSound || "";
      }
    } catch {}
  }

  async function loadChatNotifSettings(username) {
    _currentUsername = username || "";
    try {
      const data = await getJson("/api/desktop/voice-settings");
      if (data.ok && data.data) {
        chatNotifySound.value = !!data.data.chatNotifySound;
        chatMentionSound.value = !!data.data.chatMentionSound;
      }
    } catch {
      try {
        const data = await getJson("/api/voice-settings");
        if (data.ok) {
          chatNotifySound.value = data.chatNotifySound !== false;
          chatMentionSound.value = data.chatMentionSound !== false;
        }
      } catch {}
    }
  }

  function setActiveRoom(room) {
    _currentActiveRoom = room || "global";
    chatUnread.value = { ...chatUnread.value, [_currentActiveRoom]: 0 };
    _notifSoundRef = null;
  }

  return {
    chatMessages,
    chatUnread,
    chatAllUsers,
    chatOnlineUsers,
    chatOnlineCount,
    chatStickers,
    chatStatus,
    chatInput,
    showEmojiPanel,
    showStickerPanel,
    chatLogEl,
    messageTime,
    scrollChatBottom,
    connectChatRoom,
    sendChatMessage,
    sendSticker,
    sendImage,
    toggleEmojiPanel,
    toggleStickerPanel,
    insertEmoji,
    loadChatAux,
    dmThreads,
    loadDmThreads,
    openDm,
    deleteDm,
    loadNotifySounds,
    loadChatNotifSettings,
    setActiveRoom,
  };
}
