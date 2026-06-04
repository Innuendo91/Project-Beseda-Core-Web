<script setup>
import { getAdminInstance } from "../../composables/useAdmin.js";

const {
  adminChatRooms, adminChatRoomName, adminChatLoading,
  adminStatus, adminError,
  createAdminChatRoom, deleteAdminChatRoom, patchAdminChatRoom,
  clampAdminRoomNumber, loadAdminChatRooms,
} = getAdminInstance();

async function saveAdminChatBgColor(room) {
  await patchAdminChatRoom(room, "bg-color", { bgColor: room.bg_color || "" }, { reload: true });
}

async function saveAdminChatFontSize(room) {
  const fontSize = clampAdminRoomNumber(room, "font_size", 8, 32, 13);
  await patchAdminChatRoom(room, "font-size", { fontSize }, { reload: true });
}

async function saveAdminChatMessageLimit(room) {
  const limit = clampAdminRoomNumber(room, "message_limit", 5, 500, 50);
  await patchAdminChatRoom(room, "message-limit", { limit });
}

async function saveAdminChatTabColors(room) {
  await patchAdminChatRoom(room, "tab-colors", {
    tabTextColor: room.tab_text_color || "",
    tabBgColor: room.tab_bg_color || "",
    tabBorderColor: room.tab_border_color || "",
  }, { reload: true });
}

async function clearAdminChatTabColors(room) {
  room.tab_text_color = "";
  room.tab_bg_color = "";
  room.tab_border_color = "";
  await saveAdminChatTabColors(room);
}
</script>

<template>
  <div>
    <div v-if="adminStatus" class="admin-ok">{{ adminStatus }}</div>
    <div v-if="adminError" class="admin-err">{{ adminError }}</div>

    <div class="admin-chat-create spa-admin-chat-create">
      <input
        v-model="adminChatRoomName"
        placeholder="Название комнаты"
        maxlength="64"
        @keydown.enter.prevent="createAdminChatRoom()"
      />
      <button class="btn" type="button" @click="createAdminChatRoom()">Создать</button>
    </div>

    <div v-if="adminChatLoading" class="muted spa-admin-loading">Загрузка...</div>
    <div v-else-if="!adminChatRooms.length" class="muted spa-admin-loading">Комнат нет</div>
    <div v-else class="admin-chat-list">
      <div v-for="room in adminChatRooms" :key="room.id" class="admin-chat-room-card">
        <div class="admin-room-card-header">
          <span class="admin-chat-name">{{ room.name }}</span>
          <span v-if="room.is_permanent" class="admin-perm-badge" title="Постоянная комната">★</span>
          <span class="mono muted admin-chat-slug">/{{ room.slug }}</span>
          <button
            v-if="!room.is_permanent"
            class="btn admin-chat-del"
            type="button"
            @click="deleteAdminChatRoom(room)"
          >
            Удалить
          </button>
        </div>

        <div class="admin-room-card-body">
          <div class="admin-room-setting">
            <span class="admin-setting-label">Цвет фона</span>
            <div class="admin-setting-value">
              <input
                v-model="room.bg_color"
                type="color"
                class="admin-chat-bg-color-input"
                @change="saveAdminChatBgColor(room)"
              />
              <button
                v-if="room.bg_color"
                class="btn admin-chat-bg-clear"
                type="button"
                @click="room.bg_color = ''; saveAdminChatBgColor(room)"
              >
                ×
              </button>
              <span v-else class="muted admin-chat-no-bg">нет</span>
            </div>
          </div>

          <div class="admin-room-setting">
            <span class="admin-setting-label">Размер шрифта</span>
            <div class="admin-setting-value">
              <input
                v-model.number="room.font_size"
                type="number"
                min="8"
                max="32"
                class="admin-chat-font-input"
                @change="saveAdminChatFontSize(room)"
              />
              <span class="muted">px</span>
            </div>
          </div>

          <div class="admin-room-setting">
            <span class="admin-setting-label">Лимит сообщений</span>
            <div class="admin-setting-value">
              <input
                v-model.number="room.message_limit"
                type="number"
                min="5"
                max="500"
                class="admin-chat-msglimit-input"
                @change="saveAdminChatMessageLimit(room)"
              />
              <span class="muted">сообщений</span>
            </div>
          </div>

          <div class="admin-room-setting">
            <span class="admin-setting-label">Кнопка таба</span>
            <div class="admin-setting-value admin-tab-colors-row">
              <span
                class="admin-tab-preview"
                :style="{
                  color: room.tab_text_color || '',
                  background: room.tab_bg_color || '',
                  borderColor: room.tab_border_color || '',
                }"
              >
                {{ room.name }}
              </span>
              <span class="admin-color-pick">
                <span class="admin-color-label">Текст</span>
                <input v-model="room.tab_text_color" type="color" class="admin-tab-color-input" />
              </span>
              <span class="admin-color-pick">
                <span class="admin-color-label">Фон</span>
                <input v-model="room.tab_bg_color" type="color" class="admin-tab-color-input" />
              </span>
              <span class="admin-color-pick">
                <span class="admin-color-label">Бордер</span>
                <input v-model="room.tab_border_color" type="color" class="admin-tab-color-input" />
              </span>
              <button class="btn admin-tab-color-apply" type="button" @click="saveAdminChatTabColors(room)">
                Применить
              </button>
              <button class="admin-tab-color-clear" type="button" @click="clearAdminChatTabColors(room)">
                сброс
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
