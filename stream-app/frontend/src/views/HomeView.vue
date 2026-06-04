<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { getJson } from "../api.js";
import { useStreams } from "../composables/useStreams.js";
import { useVoice } from "../composables/useVoice.js";
import { useChat } from "../composables/useChat.js";
import { useUser } from "../composables/useUser.js";
import { useStreamPlayer } from "../composables/useStreamPlayer.js";
import StreamList from "../components/StreamList.vue";
import VoiceRoomList from "../components/VoiceRoomList.vue";
import ChatPanel from "../components/ChatPanel.vue";
import BrowserStreamModal from "../components/BrowserStreamModal.vue";

const props = defineProps({
  isAdmin: { type: Boolean, default: false },
});

const emit = defineEmits(["refresh"]);

const { streams, loading, status, refresh: refreshStreams } = useStreams();
const {
  voiceRooms, voiceLoading, voiceError,
  voiceRoomName, voiceRoomPass, activeVoiceRoom,
  refreshVoiceRooms, createVoiceRoom, openVoiceRoom, closeVoiceRoom,
} = useVoice();

const {
  chatMessages, chatUnread, chatAllUsers, chatOnlineUsers, chatOnlineCount,
  chatStickers, chatStatus, chatInput,
  showEmojiPanel, showStickerPanel, chatLogEl,
  connectChatRoom, sendChatMessage, sendSticker, sendImage,
  toggleEmojiPanel, toggleStickerPanel, insertEmoji,
  loadChatAux, scrollChatBottom,
  dmThreads, loadDmThreads, openDm,
  loadNotifySounds, loadChatNotifSettings, setActiveRoom,
} = useChat();

const {
  connecting: streamConnecting,
  connected: streamConnected,
  error: streamError,
  streamPath,
  start: startStream,
  stop: stopStream,
} = useStreamPlayer();

const currentUser = ref(window.__APP__?.user || null);
const rooms = ref([]);
const activeChatRoom = ref("global");
const activeStream = ref(null);
const browserStreamer = ref(null);
const browserStreaming = ref(false);
const browserStreamModal = ref(false);
const browserStreamStatus = ref("");
const browserStreamBusy = ref(false);
const browserStreamOptions = ref({
  resolution: "720p",
  fps: 30,
  bitrate: "2500000",
});

const streamCount = computed(() => streams.value.length);
const roomCount = computed(() => rooms.value.length);
const voiceRoomCount = computed(() => voiceRooms.value.length);

let chatAuxInterval = null;
let voiceRefreshInterval = null;
let streamsRefreshInterval = null;

async function refresh() {
  loading.value = true;
  status.value = "";
  try {
    const [me, streamData, roomData] = await Promise.all([
      getJson("/api/me"),
      getJson("/api/streams"),
      getJson("/api/chat-rooms"),
    ]);
    const newStreams = Array.isArray(streamData.paths) ? streamData.paths : [];
    if (newStreams.length > 0 || streams.value.length > 0) streams.value = newStreams;
    rooms.value = Array.isArray(roomData.rooms) ? roomData.rooms : [];
    status.value = streamData.apiOk === false ? "MediaMTX API недоступен, список может быть пустым" : "";
  } catch (err) {
    if (err.status === 401) {
      window.location.href = "/login";
      return;
    }
    status.value = "Не удалось обновить данные";
  } finally {
    loading.value = false;
  }
}

function switchChatRoom(room) {
  activeStream.value = null;
  stopStream();
  activeChatRoom.value = room || "global";
  chatUnread.value = { ...chatUnread.value, [activeChatRoom.value]: 0 };
  setActiveRoom(activeChatRoom.value);
  connectChatRoom(activeChatRoom.value);
  scrollChatBottom();
}

async function switchStream(path) {
  activeStream.value = path;
  try {
    const config = await getJson(`/api/whep-config/${encodeURIComponent(path)}`);
    startStream(path, config);
  } catch (err) {
    console.error("[stream] Failed to get WHEP config:", err);
  }
}

function handleStopStream() {
  activeStream.value = null;
  stopStream();
}

function handleSendMessage() {
  const room = activeStream.value || activeChatRoom.value;
  sendChatMessage(room);
  scrollChatBottom();
}

function handleMentionUser(username) {
  chatInput.value = `${chatInput.value}@${username} `;
}

async function handleOpenDm(user) {
  const room = await openDm(user.id, user);
  if (room) {
    activeStream.value = null;
    stopStream();
    activeChatRoom.value = room;
    chatUnread.value = { ...chatUnread.value, [room]: 0 };
    setActiveRoom(room);
    scrollChatBottom();
  }
}

function handleSwitchDm(room) {
  activeStream.value = null;
  stopStream();
  activeChatRoom.value = room;
  chatUnread.value = { ...chatUnread.value, [room]: 0 };
  setActiveRoom(room);
  connectChatRoom(room);
  scrollChatBottom();
}

function handleCloseDm(peerId) {
  dmThreads.value = dmThreads.value.filter(t => t.peerId !== peerId);
  if (activeChatRoom.value && activeChatRoom.value.startsWith("dm:")) {
    const closed = dmThreads.value.find(t => t.room === activeChatRoom.value);
    if (!closed) {
      activeChatRoom.value = "global";
      setActiveRoom("global");
      connectChatRoom("global");
    }
  }
}

function handleSendImage(file) {
  const room = activeStream.value || activeChatRoom.value;
  sendImage(file, room);
  scrollChatBottom();
}

async function handleDeleteMessage(message) {
  if (!props.isAdmin || !message?.id) return;
  const ok = window.confirm("Удалить сообщение?");
  if (!ok) return;
  try {
    await getJson(`/api/admin/messages/${message.id}`, { method: "DELETE" });
  } catch (err) {
    console.error("[chat] Failed to delete message:", err);
  }
}

async function toggleBrowserStream() {
  if (!browserStreamer.value) return;
  if (browserStreaming.value) {
    browserStreamBusy.value = true;
    await browserStreamer.value.stop();
    browserStreamBusy.value = false;
    return;
  }
  browserStreamModal.value = true;
}

async function startBrowserStream(type) {
  if (!browserStreamer.value) return;
  browserStreamBusy.value = true;
  browserStreamModal.value = false;
  try {
    await browserStreamer.value.start({
      type,
      resolution: browserStreamOptions.value.resolution,
      fps: browserStreamOptions.value.fps,
      bitrate: browserStreamOptions.value.bitrate,
    });
  } catch (err) {
    browserStreamStatus.value = err?.message
      || (type === "screen"
        ? "Нет доступа к экрану или WHIP недоступен"
        : "Нет доступа к камере/микрофону или WHIP недоступен");
  } finally {
    browserStreamBusy.value = false;
  }
}

async function handleCreateVoiceRoom() {
  const room = await createVoiceRoom();
  if (room) openVoiceRoom(room);
}

onMounted(async () => {
  const { createBrowserStreamer } = await import("../browserStream.js");
  browserStreamer.value = createBrowserStreamer({
    onState: (value) => { browserStreaming.value = value; },
    onStatus: (message) => {
      browserStreamStatus.value = message;
      if (message && message !== "Трансляция запущена") {
        window.setTimeout(() => {
          if (browserStreamStatus.value === message) browserStreamStatus.value = "";
        }, 3000);
      }
    },
  });

  refresh();
  refreshVoiceRooms({ quiet: true });
  loadChatAux();
  loadNotifySounds();
  loadChatNotifSettings(currentUser.value?.username || "");
  connectChatRoom("global");
  setActiveRoom("global");

  voiceRefreshInterval = window.setInterval(() => refreshVoiceRooms({ quiet: true }), 6000);
  chatAuxInterval = window.setInterval(loadChatAux, 30000);
  streamsRefreshInterval = window.setInterval(refresh, 10000);
});

onUnmounted(() => {
  if (voiceRefreshInterval) window.clearInterval(voiceRefreshInterval);
  if (chatAuxInterval) window.clearInterval(chatAuxInterval);
  if (streamsRefreshInterval) window.clearInterval(streamsRefreshInterval);
});
</script>

<template>
  <div class="spa-home-view">
    <div v-if="status" class="status">{{ status }}</div>

    <div class="home-split spa-home">
      <div class="home-left">
        <div class="streams-body">
          <StreamList
            :streams="streams"
            :loading="loading"
            :browser-streaming="browserStreaming"
            :browser-stream-busy="browserStreamBusy"
            @watch="switchStream($event)"
            @toggle-browser-stream="toggleBrowserStream"
          />
          <div v-if="browserStreamStatus" class="spa-browser-status">{{ browserStreamStatus }}</div>
        </div>

        <div class="voice-body">
          <VoiceRoomList
            :voice-rooms="voiceRooms"
            :voice-loading="voiceLoading"
            :voice-room-name="voiceRoomName"
            :voice-room-pass="voiceRoomPass"
            :voice-error="voiceError"
            :active-room="activeVoiceRoom"
            v-model:voice-room-name="voiceRoomName"
            v-model:voice-room-pass="voiceRoomPass"
            @join="openVoiceRoom($event)"
            @create="handleCreateVoiceRoom"
            @close-room="closeVoiceRoom"
          />
        </div>
      </div>

      <div class="home-right">
       <ChatPanel
           :chat-messages="chatMessages"
           :chat-unread="chatUnread"
           :chat-online-users="chatOnlineUsers"
           :chat-online-count="chatOnlineCount"
           :chat-all-users="chatAllUsers"
           :chat-stickers="chatStickers"
           :chat-status="chatStatus"
           :chat-input="chatInput"
           :show-emoji-panel="showEmojiPanel"
           :show-sticker-panel="showStickerPanel"
           :active-chat-room="activeChatRoom"
           :rooms="rooms"
           :streams="streams"
           :active-stream="activeStream"
           :stream-connecting="streamConnecting"
           :stream-connected="streamConnected"
           :stream-error="streamError"
           :connect-chat-room="connectChatRoom"
           :dm-threads="dmThreads"
           :current-user="currentUser"
           :is-admin="isAdmin"
           @switch-room="switchChatRoom"
           @switch-stream="switchStream"
           @stop-stream="handleStopStream"
           @send-message="handleSendMessage"
           @send-sticker="sendSticker($event, activeStream || activeChatRoom)"
           @send-image="handleSendImage"
           @toggle-emoji="toggleEmojiPanel"
           @toggle-sticker="toggleStickerPanel"
           @insert-emoji="insertEmoji"
           @mention-user="handleMentionUser"
           @open-dm="handleOpenDm"
           @switch-dm="handleSwitchDm"
           @close-dm="handleCloseDm"
           @delete-message="handleDeleteMessage"
           v-model:chat-input="chatInput"
         />
      </div>
    </div>

    <BrowserStreamModal
      :show="browserStreamModal"
      :browser-stream-options="browserStreamOptions"
      @close="browserStreamModal = false"
      @start="startBrowserStream"
      @update:browser-stream-options="browserStreamOptions = $event"
    />
  </div>
</template>
