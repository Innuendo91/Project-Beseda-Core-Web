<script setup>
import { nextTick, ref } from "vue";
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
} from "reka-ui";
import VoiceRoomSession from "./VoiceRoomSession.vue";

defineProps({
  voiceRooms: { type: Array, required: true },
  voiceLoading: { type: Boolean, default: false },
  voiceRoomName: { type: String, default: "" },
  voiceRoomPass: { type: String, default: "" },
  voiceError: { type: String, default: "" },
  activeRoom: { type: Object, default: null },
});

const emit = defineEmits(["join", "create", "update:voiceRoomName", "update:voiceRoomPass", "close-room"]);
const createModalOpen = ref(false);
const nameInput = ref(null);

function onNameUpdate(e) {
  emit("update:voiceRoomName", e.target.value);
}

function onPassUpdate(e) {
  emit("update:voiceRoomPass", e.target.value);
}

function handleJoin(room) {
  emit("join", room);
}

function handleCloseRoom() {
  emit("close-room");
}

async function openCreateModal() {
  createModalOpen.value = true;
  await nextTick();
  nameInput.value?.focus();
}

function submitCreate() {
  emit("create");
  createModalOpen.value = false;
}
</script>

<template>
  <div id="voiceRoomsBlock" class="voice-list-panel">
    <div class="voice-header panel-header-web">
      <span class="panel-title-web">Голосовые</span>
      <span class="panel-count-web">{{ activeRoom ? 1 : voiceRooms.length }}</span>
    </div>

    <template v-if="activeRoom">
      <VoiceRoomSession :room="activeRoom" @close="handleCloseRoom" />
    </template>
    <template v-else>
      <div v-if="voiceLoading && !voiceRooms.length" class="voice-rooms-list">
        <div class="streams-empty-msg">Загрузка...</div>
      </div>
      <div v-else-if="!voiceRooms.length" class="empty-state pulse spa-voice-empty">
        <div class="empty-title">Нет голосовых комнат</div>
        <div class="empty-text">Создайте комнату, чтобы сразу общаться голосом.</div>
      </div>
      <div v-else id="voiceRoomsList" class="voice-rooms-list">
        <button
          v-for="room in voiceRooms"
          :key="room.id || room.slug"
          type="button"
          class="voice-room-row voice-item-web"
          @click="handleJoin(room)"
        >
          <span class="voice-item-left-web">
            <span class="voice-icon-web">🎙</span>
            <span class="voice-item-info-web">
              <span class="voice-room-name">{{ room.name }}</span>
              <span v-if="!room.isPermanent || room.hasPassword" class="voice-room-meta">
                <template v-if="!room.isPermanent">создал {{ room.createdBy || "-" }}</template>
                <template v-if="room.hasPassword">{{ !room.isPermanent ? " / " : "" }}пароль</template>
              </span>
            </span>
          </span>
          <span
            class="voice-room-peers"
            :class="{ 'voice-room-peers--online': Number(room.peerCount || 0) > 0 }"
          >
            {{ room.peerCount || 0 }}
          </span>
        </button>
      </div>
    </template>
  </div>

  <div v-if="!activeRoom" class="voice-create-card">
    <button type="button" class="start-stream-btn-web" @click="openCreateModal">
      Создать комнату
    </button>
    <div v-if="voiceError" class="voice-error">{{ voiceError }}</div>
  </div>

  <DialogRoot v-model:open="createModalOpen">
    <DialogPortal>
      <DialogOverlay class="voice-create-modal" />
      <DialogContent class="voice-create-modal-card">
        <div class="voice-create-modal-head">
          <div id="voiceCreateTitle" class="voice-create-modal-title">Создать голосовую комнату</div>
          <button type="button" class="voice-create-modal-close" aria-label="Закрыть" @click="createModalOpen = false">
            ×
          </button>
        </div>

        <div class="voice-create-modal-body">
          <label class="voice-create-field">
            <span>Название комнаты</span>
            <input
              ref="nameInput"
              :value="voiceRoomName"
              placeholder="Название комнаты"
              maxlength="60"
              @input="onNameUpdate"
              @keydown.enter="submitCreate"
            />
          </label>
          <label class="voice-create-field">
            <span>Пароль</span>
            <input
              :value="voiceRoomPass"
              type="password"
              placeholder="Необязательно"
              maxlength="60"
              @input="onPassUpdate"
              @keydown.enter="submitCreate"
            />
          </label>
          <div v-if="voiceError" class="voice-error">{{ voiceError }}</div>
        </div>

        <div class="voice-create-modal-actions">
          <button type="button" class="btn" @click="createModalOpen = false">
            Отмена
          </button>
          <button type="button" class="btn voice-create-submit" @click="submitCreate">
            Создать
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
