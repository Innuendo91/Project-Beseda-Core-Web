<script setup>
import { getAdminInstance } from "../../composables/useAdmin.js";

const {
  adminNotifyFiles, adminNotifySound, adminMentionSound,
  adminVoiceJoinSound, adminVoiceLeaveSound, adminNotifyFile,
  adminNotifyLoading, adminStatus, adminError,
  playNotifySound, saveNotifySound, uploadNotifySound,
  handleNotifyFile, deleteNotifySound,
} = getAdminInstance();
</script>

<template>
  <div>
    <div v-if="adminStatus" class="admin-ok">{{ adminStatus }}</div>
    <div v-if="adminError" class="admin-err">{{ adminError }}</div>

    <div v-if="adminNotifyLoading" class="muted">Загрузка...</div>
    <div v-else class="admin-notify-sounds-panel">
      <div class="admin-notify-row">
        <div class="admin-notify-label">
          <div class="admin-notify-title">Звук новых сообщений</div>
          <div class="admin-notify-desc">Звуковой сигнал при любом сообщении</div>
        </div>
        <div class="admin-notify-controls">
          <select v-model="adminNotifySound" class="box admin-notify-select">
            <option value="">— без файла (тон) —</option>
            <option v-for="f in adminNotifyFiles" :key="f.name" :value="f.name">{{ f.name }}</option>
          </select>
          <button class="btn" type="button" @click="playNotifySound(adminNotifySound)">▶</button>
          <button class="btn" type="button" @click="saveNotifySound('notifySound', adminNotifySound)">Сохранить</button>
        </div>
      </div>

      <div class="admin-notify-row">
        <div class="admin-notify-label">
          <div class="admin-notify-title">Звук упоминания</div>
          <div class="admin-notify-desc">Отдельный звук при @упоминании</div>
        </div>
        <div class="admin-notify-controls">
          <select v-model="adminMentionSound" class="box admin-notify-select">
            <option value="">— без файла (тон) —</option>
            <option v-for="f in adminNotifyFiles" :key="f.name" :value="f.name">{{ f.name }}</option>
          </select>
          <button class="btn" type="button" @click="playNotifySound(adminMentionSound)">▶</button>
          <button class="btn" type="button" @click="saveNotifySound('mentionSound', adminMentionSound)">Сохранить</button>
        </div>
      </div>

      <div class="admin-notify-row">
        <div class="admin-notify-label">
          <div class="admin-notify-title">Звук входа в голосовую комнату</div>
          <div class="admin-notify-desc">Звук когда кто-то заходит в комнату</div>
        </div>
        <div class="admin-notify-controls">
          <select v-model="adminVoiceJoinSound" class="box admin-notify-select">
            <option value="">— без звука —</option>
            <option v-for="f in adminNotifyFiles" :key="f.name" :value="f.name">{{ f.name }}</option>
          </select>
          <button class="btn" type="button" @click="playNotifySound(adminVoiceJoinSound)">▶</button>
          <button class="btn" type="button" @click="saveNotifySound('voiceJoinSound', adminVoiceJoinSound)">Сохранить</button>
        </div>
      </div>

      <div class="admin-notify-row">
        <div class="admin-notify-label">
          <div class="admin-notify-title">Звук выхода из голосовой комнаты</div>
          <div class="admin-notify-desc">Звук когда кто-то выходит из комнаты</div>
        </div>
        <div class="admin-notify-controls">
          <select v-model="adminVoiceLeaveSound" class="box admin-notify-select">
            <option value="">— без звука —</option>
            <option v-for="f in adminNotifyFiles" :key="f.name" :value="f.name">{{ f.name }}</option>
          </select>
          <button class="btn" type="button" @click="playNotifySound(adminVoiceLeaveSound)">▶</button>
          <button class="btn" type="button" @click="saveNotifySound('voiceLeaveSound', adminVoiceLeaveSound)">Сохранить</button>
        </div>
      </div>

      <div class="admin-notify-upload">
        <div class="admin-notify-upload-title">Загрузить звук</div>
        <div class="admin-notify-upload-row">
          <label class="btn admin-sticker-upload-label">
            📁 Выбрать файл
            <input type="file" accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg" @change="handleNotifyFile" />
          </label>
          <button class="btn" type="button" :disabled="adminNotifyLoading" @click="uploadNotifySound">Загрузить</button>
        </div>
      </div>

      <div class="admin-notify-files">
        <div class="admin-notify-files-title">Файлы в папке</div>
        <div v-if="!adminNotifyFiles.length" class="muted" style="font-size:12px;">Нет файлов</div>
        <div v-else class="admin-notify-files-grid">
          <div v-for="f in adminNotifyFiles" :key="f.name" class="admin-notify-file-card">
            <div class="admin-notify-file-name" :title="f.name">{{ f.name }}</div>
            <div class="admin-notify-file-btns">
              <button class="admin-notify-file-play" type="button" title="Прослушать" @click="playNotifySound(f.name)">▶</button>
              <button class="admin-notify-file-del" type="button" title="Удалить" @click="deleteNotifySound(f.name)">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
