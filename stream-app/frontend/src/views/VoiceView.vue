<script setup>
import { computed, onMounted, onUnmounted } from "vue";
import { useVoice } from "../composables/useVoice.js";
import VoiceRoomList from "../components/VoiceRoomList.vue";
import VoiceRoomSession from "../components/VoiceRoomSession.vue";

const {
  voiceRooms, voiceLoading, voiceError,
  voiceRoomName, voiceRoomPass, activeVoiceRoom,
  refreshVoiceRooms, createVoiceRoom, openVoiceRoom, closeVoiceRoom,
} = useVoice();

const voiceRoomCount = computed(() => voiceRooms.value.length);

let voiceRefreshInterval = null;

async function handleCreateVoiceRoom() {
  const room = await createVoiceRoom();
  if (room) openVoiceRoom(room);
}

function handleCloseRoom() {
  closeVoiceRoom();
}

onMounted(() => {
  refreshVoiceRooms({ quiet: true });
  voiceRefreshInterval = window.setInterval(() => refreshVoiceRooms({ quiet: true }), 6000);
});

onUnmounted(() => {
  if (voiceRefreshInterval) window.clearInterval(voiceRefreshInterval);
});
</script>

<template>
  <div class="spa-voice-page">
    <div class="voice-page card">
      <div class="panel-head">
        <div>
          <strong>Голосовые комнаты</strong>
          <div class="sub">Комната открывается внутри SPA, без новой вкладки браузера</div>
        </div>
        <button type="button" class="tb-btn" @click="refreshVoiceRooms()">Обновить</button>
      </div>

      <div class="spa-voice-grid">
        <div class="voice-body">
          <template v-if="activeVoiceRoom">
            <VoiceRoomSession :room="activeVoiceRoom" @close="handleCloseRoom" />
          </template>
          <template v-else>
            <div class="voice-header">
              <span class="voice-header-icon">🎙️</span>
              <div class="voice-header-text">
                <div class="voice-header-title">Список комнат</div>
                <div class="voice-header-sub">{{ voiceRoomCount }} доступно</div>
              </div>
            </div>

            <div v-if="!voiceRooms.length" class="empty-state pulse spa-voice-empty">
              <div class="empty-title">Нет голосовых комнат</div>
              <div class="empty-text">Создайте первую комнату ниже.</div>
            </div>
            <div v-else id="voiceRoomsList" class="voice-rooms-list spa-voice-list">
              <div v-for="room in voiceRooms" :key="room.id || room.slug" class="voice-room-row">
                <div class="voice-room-info">
                  <span class="room-icon">🎙️</span>
                  <span class="voice-room-name">{{ room.name }}</span>
                  <span v-if="!room.isPermanent || room.hasPassword" class="voice-room-meta">
                    <template v-if="!room.isPermanent">создал {{ room.createdBy || "—" }}</template>
                    <template v-if="room.hasPassword">{{ !room.isPermanent ? " • " : "" }}🔒</template>
                  </span>
                </div>
                <span
                  class="voice-room-peers"
                  :class="{ 'voice-room-peers--online': Number(room.peerCount || 0) > 0 }"
                >
                  {{ room.peerCount || 0 }}
                </span>
                <button type="button" class="btn voice-join" @click="openVoiceRoom(room)">
                  Подключиться
                </button>
              </div>
            </div>

            <div class="voice-create-card">
              <div class="voice-empty-create">
                <input
                  v-model="voiceRoomName"
                  placeholder="Название комнаты"
                  maxlength="60"
                  @keydown.enter="handleCreateVoiceRoom"
                />
                <input
                  v-model="voiceRoomPass"
                  type="password"
                  placeholder="Пароль (необязательно)"
                  maxlength="60"
                  @keydown.enter="handleCreateVoiceRoom"
                />
                <button type="button" @click="handleCreateVoiceRoom">
                  Создать
                </button>
              </div>
              <div v-if="voiceError" class="voice-error">{{ voiceError }}</div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spa-voice-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  padding: 0;
}
.voice-body {
  display: flex;
  flex-direction: column;
  min-height: 400px;
}
</style>
