<script setup>
import { computed, watch, ref, nextTick, onMounted, onUnmounted } from "vue";

const activeUserMenu = ref(null);
const userMenuPos = ref({ top: 0, left: 0 });
const userPillRows = ref([]);

function toggleUserMenu(user, e) {
  e.stopPropagation();
  if (activeUserMenu.value?.username === user.username) {
    closeUserMenu();
    return;
  }
  const rect = e.currentTarget.getBoundingClientRect();
  userMenuPos.value = { top: rect.top + window.scrollY, left: rect.left };
  activeUserMenu.value = user;
}

function closeUserMenu() {
  activeUserMenu.value = null;
}

function onMenuKeydown(e) {
  if (e.key === "Escape") {
    closePreview();
    closeUserProfile();
    closeUserMenu();
  }
}

function handleClickOutside(e) {
  if (!activeUserMenu.value) return;
  const row = userPillRows.value.find(
    (el) => el && el.dataset.username === activeUserMenu.value.username
  );
  if (row && !row.contains(e.target)) {
    closeUserMenu();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onMenuKeydown);
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onMenuKeydown);
  document.removeEventListener("click", handleClickOutside);
});

const props = defineProps({
  chatMessages: { type: Object, required: true },
  chatUnread: { type: Object, required: true },
  chatOnlineUsers: { type: Array, required: true },
  chatOnlineCount: { type: Number, required: true },
  chatAllUsers: { type: Array, default: () => [] },
  chatStickers: { type: Array, required: true },
  chatStatus: { type: String, default: "" },
  chatInput: { type: String, default: "" },
  showEmojiPanel: { type: Boolean, default: false },
  showStickerPanel: { type: Boolean, default: false },
  activeChatRoom: { type: String, default: "global" },
  rooms: { type: Array, required: true },
  // Stream props
  streams: { type: Array, default: () => [] },
  activeStream: { type: String, default: null },
  streamConnecting: { type: Boolean, default: false },
  streamConnected: { type: Boolean, default: false },
  streamError: { type: String, default: "" },
  // Chat connection
  connectChatRoom: { type: Function, default: null },
  // DM props
  dmThreads: { type: Array, default: () => [] },
  currentUser: { type: Object, default: null },
  isAdmin: { type: Boolean, default: false },
});

const emit = defineEmits([
  "switchRoom",
  "switchStream",
  "stopStream",
  "sendMessage",
  "sendSticker",
  "sendImage",
  "toggleEmoji",
  "toggleSticker",
  "insertEmoji",
  "update:chatInput",
  "mentionUser",
  "openDm",
  "switchDm",
  "closeDm",
  "deleteMessage",
]);

const DEFAULT_AVATAR = "/public/usericon.jpg";

const chatTabs = computed(() => [
  { slug: "global", name: "Общий чат" },
  ...props.rooms.filter((room) => room.slug !== "global").map((room) => ({ slug: room.slug, name: room.name || room.slug, room })),
]);

const streamTabs = computed(() =>
  props.streams.map((path) => ({
    path,
    name: path.replace(/^live\//, ""),
  }))
);

const dmTabs = computed(() =>
  props.dmThreads.map(t => ({
    room: t.room,
    name: t.peerDisplayName || t.peerUsername,
    peerId: t.peerId,
    peerAvatar: t.peerAvatar,
    peerNickColor: t.peerNickColor,
  }))
);

const isCurrentDm = computed(() => {
  if (!props.activeChatRoom || !props.activeChatRoom.startsWith("dm:")) return null;
  return dmTabs.value.find(t => t.room === props.activeChatRoom) || null;
});

const hasStreams = computed(() => streamTabs.value.length > 0);
const showStream = computed(() => !!props.activeStream);
const streamName = computed(() => props.activeStream ? props.activeStream.replace(/^live\//, "") : "");
const activeStreamChatMessages = computed(() => props.activeStream ? (props.chatMessages[props.activeStream] || []) : []);

const chatLogEl = ref(null);
const streamChatLogEl = ref(null);
const activeChatMessages = computed(() => props.chatMessages[props.activeChatRoom] || []);
const onlineUsernames = computed(() => new Set(props.chatOnlineUsers.map((u) => u.username)));
const activeChatRoomMeta = computed(() => props.rooms.find((room) => room.slug === props.activeChatRoom) || null);
const activeChatStyle = computed(() => {
  const room = activeChatRoomMeta.value;
  if (!room) return {};
  const style = {};
  if (room.bg_color) {
    style.backgroundColor = room.bg_color;
  }
  if (room.font_size) style.fontSize = `${room.font_size}px`;
  return style;
});

const chatPlaceholder = computed(() => {
  if (props.activeStream) return `Сообщение в стрим ${streamName.value}...`;
  if (isCurrentDm.value) return `Личное сообщение ${isCurrentDm.value.name}...`;
  if (props.activeChatRoom === "global") return "Сообщение...";
  return `Сообщение в ${props.activeChatRoom}...`;
});

function scrollToBottom() {
  nextTick(() => {
    if (chatLogEl.value) chatLogEl.value.scrollTop = chatLogEl.value.scrollHeight;
  });
}

watch(activeChatMessages, () => scrollToBottom(), { deep: true });

watch(
  () => props.activeStream,
  (newStream) => {
    if (newStream && props.connectChatRoom) {
      props.connectChatRoom(newStream);
    }
  }
);

const scrollToStreamChatBottom = () => {
  nextTick(() => {
    if (streamChatLogEl.value) streamChatLogEl.value.scrollTop = streamChatLogEl.value.scrollHeight;
  });
};

watch(activeStreamChatMessages, () => scrollToStreamChatBottom(), { deep: true });

function messageTime(ts) {
  if (!ts) return "";
  const date = new Date(Number(ts) * 1000);
  return `${date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textWithLinks(text) {
  const urlRe = /(https?:\/\/[^\s<>'"]+)/g;
  const safe = escapeHtml(text);
  return safe.replace(urlRe, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function onInputUpdate(e) {
  emit("update:chatInput", e.target.value);
}

const imageInputRef = ref(null);
const previewImage = ref("");
const showPreview = ref(false);

function triggerImageUpload() {
  imageInputRef.value?.click();
}

function onImageSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  emit("sendImage", file);
  e.target.value = "";
}

function openPreview(src) {
  previewImage.value = src;
  showPreview.value = true;
}

function closePreview() {
  showPreview.value = false;
  previewImage.value = "";
}

const selectedProfileUser = ref(null);

function openUserProfile(user) {
  selectedProfileUser.value = user;
}

function closeUserProfile() {
  selectedProfileUser.value = null;
}

function onKeydown(e) {
  if (e.key === "Escape" && (showPreview.value || selectedProfileUser.value)) {
    closePreview();
    closeUserProfile();
  }
}

function onDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  dragCounter++;
  isDragging.value = true;
}

function onDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  dragCounter--;
  if (dragCounter === 0) {
    isDragging.value = false;
  }
}

function onDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dragCounter = 0;
  isDragging.value = false;

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  for (const file of files) {
    if (file.type.startsWith("image/") && file.size <= 10 * 1024 * 1024) {
      emit("sendImage", file);
    }
  }
}

function tabTabStyle(tab) {
  const room = tab?.room;
  if (!room) return {};
  const style = {};
  const isActive = !props.activeStream && props.activeChatRoom === tab.slug;
  if (room.tab_text_color) style.color = room.tab_text_color;
  if (room.tab_bg_color) style.backgroundColor = room.tab_bg_color;
  if (room.tab_border_color && !isActive) style.borderColor = room.tab_border_color;
  return style;
}

function onTabClick(slug) {
  if (props.streams.includes(slug)) {
    if (props.activeStream === slug) {
      emit("stopStream");
    } else {
      emit("switchStream", slug);
    }
  } else {
    emit("switchRoom", slug);
  }
}
</script>

<template>
  <div class="chat-wide">
    <div class="panel chat-panel spa-chat-panel">
      <div class="panel-head">
        <div id="chatTabsBar">
          <div class="chat-tabs-dynamic">
            <button
              v-for="tab in chatTabs"
              :key="tab.slug"
              type="button"
              class="chat-tab"
              :class="{ active: !showStream && activeChatRoom === tab.slug }"
              :style="tabTabStyle(tab)"
              @click="onTabClick(tab.slug)"
            >
              <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>{{ tab.name }}</span>
              <span v-if="chatUnread[tab.slug]" class="chat-tab-badge">
                {{ chatUnread[tab.slug] > 99 ? "99+" : chatUnread[tab.slug] }}
              </span>
            </button>
            <button
              v-for="stab in streamTabs"
              :key="'stream-' + stab.path"
              type="button"
              class="chat-tab stream-tab"
              :class="{ active: showStream && activeStream === stab.path }"
              @click="onTabClick(stab.path)"
            >
              <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>
              <span>{{ stab.name }}</span>
            </button>
            <button
              v-for="dmtab in dmTabs"
              :key="'dm-' + dmtab.room"
              type="button"
              class="chat-tab dm-tab"
              :class="{ active: !showStream && activeChatRoom === dmtab.room }"
              @click="emit('switchDm', dmtab.room)"
            >
              <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>{{ dmtab.name }}</span>
              <span v-if="chatUnread[dmtab.room]" class="chat-tab-badge">
                {{ chatUnread[dmtab.room] > 99 ? "99+" : chatUnread[dmtab.room] }}
              </span>
              <span class="dm-tab-close" @click.stop="emit('closeDm', dmtab.peerId)">×</span>
            </button>
          </div>
        </div>
        <div class="tb-online-pill"><span class="mono">{{ chatOnlineCount }}</span></div>
      </div>

      <div
        class="chat-split"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <div v-if="isDragging" class="drop-zone-overlay">
          <span>Бросьте картинку в чат</span>
        </div>
        <template v-if="showStream">
          <div class="stream-video-col">
            <div class="stream-player-wrap">
              <video id="streamVideo" class="stream-video" controls autoplay playsinline></video>
              <div v-if="streamConnecting" class="stream-overlay">
                <div class="stream-spinner"></div>
                <div class="stream-status-text">Подключение...</div>
              </div>
              <div v-else-if="streamError" class="stream-overlay">
                <div class="stream-status-text error">{{ streamError }}</div>
                <button type="button" class="btn btn-sm" @click="emit('stopStream')">Закрыть</button>
              </div>
            </div>
          </div>
          <div class="stream-chat-col">
            <div class="stream-chat-header">
              <span>Чат стрима</span>
              <span class="muted mono">📡 {{ streamName }}</span>
            </div>
            <div
              ref="streamChatLogEl"
              class="chatLog"
            >
              <div v-if="!activeStreamChatMessages.length" class="chat-date-sep">Сообщений пока нет</div>
              <div
                v-for="message in activeStreamChatMessages"
                :key="message.id || `${message.nick}-${message.ts}-${message.text}`"
                class="chat-msg"
                :class="{ 'chat-msg-sticker': !!message.stickerData }"
              >
                <img :src="message.avatar || DEFAULT_AVATAR" class="chat-avatar" alt="" />
                <span class="chat-nick" :style="{ color: message.nickColor || '#60a5fa' }">{{ message.nick }}:</span>
                <img
                  v-if="message.stickerData"
                  class="chat-sticker-img chat-sticker-img-inline"
                  :src="message.stickerData"
                  alt=""
                  loading="lazy"
                />
                <img
                  v-else-if="message.imageData"
                  class="chat-image"
                  :src="message.imageData"
                  alt=""
                  loading="lazy"
                  @click="openPreview(message.imageData)"
                />
                <span v-else class="chat-text" v-html="textWithLinks(message.text)"></span>
                <span class="chat-time">{{ messageTime(message.ts) }}</span>
                <button
                  v-if="isAdmin && message.id"
                  type="button"
                  class="chat-delete-btn"
                  title="Удалить сообщение"
                  @click="emit('deleteMessage', message)"
                >
                  ×
                </button>
              </div>
            </div>
            <div class="send-wrap">
              <div v-if="showEmojiPanel" class="emojiPanel">
                <div class="emoji-grid">
                  <button
                    v-for="emoji in ['😀','😁','😂','🤣','😊','😍','😘','😎','🤔','😭','😡','👍','👎','👏','🙏','🔥','💯','❤️','🎉','✅','❌','⚡','💡','🚀']"
                    :key="emoji"
                    type="button"
                    @click="emit('insertEmoji', emoji)"
                  >
                    {{ emoji }}
                  </button>
                </div>
              </div>
              <div v-if="showStickerPanel" class="emojiPanel">
                <div class="emoji-grid sticker-grid">
                  <div v-if="!chatStickers.length" class="muted">Нет стикеров</div>
                  <button
                    v-for="sticker in chatStickers"
                    :key="sticker.id"
                    type="button"
                    class="sticker-grid-btn"
                    @click="emit('sendSticker', sticker.data)"
                  >
                    <img class="sticker-grid-img" :src="sticker.data" :alt="sticker.name || ''" />
                  </button>
                </div>
              </div>
             <input type="file" ref="imageInputRef" accept="image/*" style="display:none" @change="onImageSelected" />
              <div class="send">
                  <button type="button" title="Emoji" @click="emit('toggleEmoji')">😀</button>
                  <button type="button" title="Sticker" @click="emit('toggleSticker')">🎭</button>
                  <button type="button" title="Картинка" @click="triggerImageUpload">🖼️</button>
                  <input
                    :value="chatInput"
                    :placeholder="`Сообщение в стрим ${streamName}...`"
                    @input="onInputUpdate"
                    @keydown.enter.prevent="emit('sendMessage')"
                  />
                  <button type="button" @click="emit('sendMessage')">Отправить</button>
                </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="chat-col">
            <div
              ref="chatLogEl"
              class="chatLog"
              :style="activeChatStyle"
            >
              <div v-if="chatStatus" class="chat-date-sep">{{ chatStatus }}</div>
              <div v-if="!activeChatMessages.length && !chatStatus" class="chat-date-sep">Сообщений пока нет</div>
              <div
                v-for="message in activeChatMessages"
                :key="message.id || `${message.nick}-${message.ts}-${message.text}`"
                class="chat-msg"
                :class="{ 'chat-msg-sticker': !!message.stickerData }"
              >
                <img :src="message.avatar || DEFAULT_AVATAR" class="chat-avatar" alt="" />
                <span class="chat-nick" :style="{ color: message.nickColor || '#60a5fa' }">{{ message.nick }}:</span>
                <img
                  v-if="message.stickerData"
                  class="chat-sticker-img chat-sticker-img-inline"
                  :src="message.stickerData"
                  alt=""
                  loading="lazy"
                />
                <img
                  v-else-if="message.imageData"
                  class="chat-image"
                  :src="message.imageData"
                  alt=""
                  loading="lazy"
                  @click="openPreview(message.imageData)"
                />
                <span v-else class="chat-text" v-html="textWithLinks(message.text)"></span>
                <span class="chat-time">{{ messageTime(message.ts) }}</span>
                <button
                  v-if="isAdmin && message.id"
                  type="button"
                  class="chat-delete-btn"
                  title="Удалить сообщение"
                  @click="emit('deleteMessage', message)"
                >
                  ×
                </button>
              </div>
            </div>
            <div class="send-wrap">
              <div v-if="showEmojiPanel" class="emojiPanel">
                <div class="emoji-grid">
                  <button
                    v-for="emoji in ['😀','😁','😂','🤣','😊','😍','😘','😎','🤔','😭','😡','👍','👎','👏','🙏','🔥','💯','❤️','🎉','✅','❌','⚡','💡','🚀']"
                    :key="emoji"
                    type="button"
                    @click="emit('insertEmoji', emoji)"
                  >
                    {{ emoji }}
                  </button>
                </div>
              </div>
              <div v-if="showStickerPanel" class="emojiPanel">
                <div class="emoji-grid sticker-grid">
                  <div v-if="!chatStickers.length" class="muted">Нет стикеров</div>
                  <button
                    v-for="sticker in chatStickers"
                    :key="sticker.id"
                    type="button"
                    class="sticker-grid-btn"
                    @click="emit('sendSticker', sticker.data)"
                  >
                    <img class="sticker-grid-img" :src="sticker.data" :alt="sticker.name || ''" />
                  </button>
                </div>
              </div>
             <input type="file" ref="imageInputRef" accept="image/*" style="display:none" @change="onImageSelected" />
              <div class="send">
                  <button type="button" title="Emoji" @click="emit('toggleEmoji')">😀</button>
                  <button type="button" title="Sticker" @click="emit('toggleSticker')">🎭</button>
                  <button type="button" title="Картинка" @click="triggerImageUpload">🖼️</button>
                 <input
                     :value="chatInput"
                     :placeholder="chatPlaceholder"
                     @input="onInputUpdate"
                     @keydown.enter.prevent="emit('sendMessage')"
                   />
                  <button type="button" @click="emit('sendMessage')">Отправить</button>
                </div>
            </div>
          </div>
         <div class="users-col">
            <div class="users-list">
              <div v-if="!chatAllUsers.length" class="muted">нет пользователей</div>
              <div
                v-for="user in chatAllUsers"
                :key="user.id || user.username"
                ref="userPillRows"
                :data-username="user.username"
                class="user-pill-row"
                @click.stop="toggleUserMenu(user, $event)"
              >
                <div class="user-pill">
                  <img
                    :src="user.avatar || DEFAULT_AVATAR"
                    class="chat-avatar-sm"
                    alt=""
                  />
                  <span :style="{ color: user.nickColor || '#60a5fa' }">{{ user.username }}</span>
                  <span v-if="onlineUsernames.has(user.username)" class="user-online-dot"></span>
                </div>
              </div>
            </div>
          </div>

          <!-- User dropdown menu (positioned above all blocks) -->
          <div
            v-if="activeUserMenu"
            class="user-dropdown-fixed"
            :style="{ top: userMenuPos.top + 'px', left: userMenuPos.left + 'px' }"
            @click.stop
          >
            <button type="button" class="user-dropdown-item" @click="emit('mentionUser', activeUserMenu.username); closeUserMenu()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a6 6 0 0 0-6-6h-1a9 9 0 0 0-9 9v2"/></svg>
              Упомянуть
            </button>
            <button v-if="activeUserMenu.id && activeUserMenu.id !== currentUser?.id" type="button" class="user-dropdown-item" @click="emit('openDm', activeUserMenu); closeUserMenu()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2-2z"/></svg>
              Личное сообщение
            </button>
            <button type="button" class="user-dropdown-item" @click="openUserProfile(activeUserMenu); closeUserMenu()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Профиль
            </button>
         </div>
        </template>
       </div>

       <!-- Image preview lightbox -->
      <div v-if="showPreview" class="image-preview-overlay" @click.self="closePreview">
        <div class="image-preview-close" @click="closePreview">&times;</div>
        <img class="image-preview-img" :src="previewImage" alt="" />
      </div>

      <!-- User profile modal -->
      <div v-if="selectedProfileUser" class="image-preview-overlay" @click.self="closeUserProfile">
        <div class="image-preview-close" @click="closeUserProfile">&times;</div>
        <div class="user-profile-card">
          <img :src="selectedProfileUser.avatar || DEFAULT_AVATAR" class="user-profile-avatar" alt="" />
          <div class="user-profile-name" :style="{ color: selectedProfileUser.nickColor || '#60a5fa' }">
            {{ selectedProfileUser.displayName || selectedProfileUser.username }}
          </div>
          <div class="user-profile-username">@{{ selectedProfileUser.username }}</div>
          <div v-if="selectedProfileUser.bio" class="user-profile-bio">{{ selectedProfileUser.bio }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-right: 4px;
  opacity: 0.7;
}

.stream-video-col {
  flex: 1 1 60%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.stream-player-wrap {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  min-height: 0;
  background: #000;
  position: relative;
  overflow: hidden;
}

.stream-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.stream-chat-col {
  flex: 0 0 340px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--border, rgba(255,255,255,0.08));
}

.chat-split {
  position: relative;
}

.chat-image {
  max-width: 280px;
  max-height: 200px;
  border-radius: 6px;
  margin: 4px 0;
  cursor: pointer;
  object-fit: contain;
  transition: opacity 0.15s;
}

.chat-image:hover {
  opacity: 0.85;
}

.chat-delete-btn {
  width: 18px;
  height: 18px;
  padding: 0;
  margin-left: 6px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 4px;
  background: rgba(127, 29, 29, 0.25);
  color: #fca5a5;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.chat-msg:hover .chat-delete-btn {
  opacity: 1;
}

.chat-delete-btn:hover {
  background: rgba(220, 38, 38, 0.35);
  color: #fff;
}

.drop-zone-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.15);
  border: 3px dashed #3b82f6;
  border-radius: 8px;
  font-size: 18px;
  color: #60a5fa;
  font-weight: 600;
  pointer-events: none;
}

.image-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  padding: 20px;
}

.image-preview-close {
  position: absolute;
  top: 16px;
  right: 20px;
  font-size: 32px;
  color: #fff;
  cursor: pointer;
  z-index: 10000;
  line-height: 1;
  user-select: none;
  transition: color 0.15s;
}

.image-preview-close:hover {
  color: #f87171;
}

.image-preview-img {
  max-width: 90vw;
  max-height: 85vh;
  border-radius: 8px;
  object-fit: contain;
}

.stream-chat-header {
  flex: 0 0 auto;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-text a {
  color: #60a5fa;
  text-decoration: underline;
  word-break: break-all;
}

.chat-text a:hover {
  color: #93bbfc;
}

.avatar-clickable {
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}

.avatar-clickable:hover {
  opacity: 0.7;
  transform: scale(1.1);
}

.user-profile-card {
  background: #1e1a17;
  border-radius: 12px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-width: 280px;
  max-width: 400px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.user-profile-avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid rgba(255, 255, 255, 0.1);
}

.user-profile-name {
  font-size: 20px;
  font-weight: 700;
}

.user-profile-username {
  color: var(--muted, #8b8078);
  font-size: 13px;
}

.user-profile-bio {
  color: var(--text, #d4cec7);
  font-size: 14px;
  text-align: center;
  line-height: 1.5;
  max-width: 320px;
  word-break: break-word;
}

.dm-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  margin-left: 4px;
  opacity: 0.5;
  transition: opacity 0.15s, transform 0.15s;
  line-height: 1;
}

.dm-btn:hover {
  opacity: 1;
  transform: scale(1.2);
}

.dm-tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted, #8b8078);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  margin-left: 4px;
  padding: 0 2px;
  line-height: 1;
  transition: color 0.15s;
  user-select: none;
}

.dm-tab-close:hover {
  color: #f87171;
}

.user-pill-row {
  position: relative;
}

.user-pill {
  padding: 6px 10px;
  margin: 0;
  border: none;
  border-radius: 0;
  background: rgba(42, 36, 32, 0.6);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  text-align: left;
  position: relative;
  padding-right: 24px;
  min-height: 40px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}

.user-pill:hover {
  background: rgba(54, 47, 40, 0.8);
}

.user-online-dot {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}

.chat-avatar-sm {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  vertical-align: middle;
  margin-right: 4px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.user-dropdown-fixed {
  position: fixed;
  z-index: 10000;
  background: #1e1a17;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 4px 0;
  min-width: 170px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: dropdownFadeIn 0.12s ease-out;
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.user-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text, #d4cec7);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  text-align: left;
}

.user-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.user-dropdown-item svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  opacity: 0.6;
}

.user-dropdown-item:hover svg {
  opacity: 1;
}
</style>
