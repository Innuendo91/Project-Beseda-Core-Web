<script setup>
import { getAdminInstance } from "../../composables/useAdmin.js";

const props = defineProps({
  onVoiceRefresh: { type: Function, default: null },
  onOpenVoiceRoom: { type: Function, default: null },
  onCloseVoiceRoom: { type: Function, default: null },
});

const {
  adminVoiceRooms, adminVoiceRoomName, adminVoiceRoomPass, adminVoiceLoading,
  adminStatus, adminError,
  createAdminVoiceRoom, deleteAdminVoiceRoom,
  clearAdminVoiceRoomPassword, clearAllAdminVoicePasswords,
} = getAdminInstance();
</script>

<template>
  <div>
    <div v-if="adminStatus" class="admin-ok">{{ adminStatus }}</div>
    <div v-if="adminError" class="admin-err">{{ adminError }}</div>

    <div class="admin-chat-create spa-admin-chat-create">
      <input
        v-model="adminVoiceRoomName"
        placeholder="Название комнаты"
        maxlength="64"
        @keydown.enter.prevent="createAdminVoiceRoom(onVoiceRefresh)"
      />
      <input
        v-model="adminVoiceRoomPass"
        type="password"
        placeholder="Пароль (необязательно)"
        maxlength="60"
        @keydown.enter.prevent="createAdminVoiceRoom(onVoiceRefresh)"
      />
      <button class="btn" type="button" @click="createAdminVoiceRoom(onVoiceRefresh)">Создать</button>
      <button class="btn" type="button" @click="clearAllAdminVoicePasswords(onVoiceRefresh)">Снять пароли</button>
    </div>

    <div v-if="adminVoiceLoading" class="muted spa-admin-loading">Загрузка...</div>
    <div v-else-if="!adminVoiceRooms.length" class="muted spa-admin-loading">Комнат нет</div>
    <div v-else class="admin-list">
      <div v-for="room in adminVoiceRooms" :key="room.id" class="admin-row spa-admin-row">
        <div class="admin-main">
          <div class="admin-user">
            <span class="mono">#{{ room.id }}</span>
            {{ room.name }}
            <span v-if="room.isPermanent" class="admin-badge">постоянная</span>
            <span v-if="room.hasPassword" class="admin-badge">пароль</span>
          </div>
          <div class="admin-meta">
            /{{ room.slug }} • {{ room.latinSlug || room.slug }} • создал {{ room.createdBy || "—" }} • {{ room.createdAt || "—" }}
          </div>
        </div>

        <div class="admin-actions">
          <button
            v-if="room.hasPassword"
            class="btn admin-reset-link-btn"
            type="button"
            @click="clearAdminVoiceRoomPassword(room, onVoiceRefresh)"
          >
            Без пароля
          </button>
          <button class="btn admin-reset-link-btn" type="button" @click="onOpenVoiceRoom?.(room)">
            Открыть
          </button>
          <button class="btn admin-reset-link-btn" type="button" @click="deleteAdminVoiceRoom(room, onVoiceRefresh)">
            Удалить
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
