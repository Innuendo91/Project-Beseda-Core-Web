<script setup>
import { getAdminInstance } from "../../composables/useAdmin.js";

const {
  adminStickers, adminStickerName, adminStickerLoading, adminStickersLoading,
  adminStatus, adminError,
  handleStickerFile, addSticker, deleteAdminSticker,
} = getAdminInstance();
</script>

<template>
  <div>
    <div v-if="adminStatus" class="admin-ok">{{ adminStatus }}</div>
    <div v-if="adminError" class="admin-err">{{ adminError }}</div>

    <div class="admin-chat-create">
      <input
        v-model="adminStickerName"
        placeholder="Название (необязательно)"
        maxlength="64"
        @keydown.enter.prevent="addSticker"
      />
      <label class="btn admin-sticker-upload-label">
        🖼 Загрузить
        <input type="file" accept="image/*" @change="handleStickerFile" />
      </label>
      <button class="btn" type="button" @click="addSticker" :disabled="adminStickerLoading">
        Добавить
      </button>
    </div>

    <div v-if="adminStickersLoading" class="muted">Загрузка...</div>
    <div v-else-if="!adminStickers.length" class="muted">Стикеров нет</div>
    <div v-else class="admin-stickers-grid">
      <div v-for="sticker in adminStickers" :key="sticker.id" class="admin-sticker-card">
        <div class="admin-sticker-preview">
          <img :src="sticker.data" :alt="sticker.name || ''" />
        </div>
        <span class="admin-sticker-name">{{ sticker.name || `Стикер #${sticker.id}` }}</span>
        <button
          class="btn admin-sticker-del"
          type="button"
          @click="deleteAdminSticker(sticker)"
        >
          Удалить
        </button>
      </div>
    </div>
  </div>
</template>
