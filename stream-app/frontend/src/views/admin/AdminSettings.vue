<script setup>
import { getAdminInstance } from "../../composables/useAdmin.js";

const props = defineProps({
  onUpdateSiteName: { type: Function, default: null },
});

const {
  adminSettings, adminStatus, adminError,
  generateSrtPassphrase, loadAdminSettings, saveAdminSettings,
} = getAdminInstance();
</script>

<template>
  <div class="admin-settings-form spa-admin-settings-form">
    <div v-if="adminStatus" class="admin-ok">{{ adminStatus }}</div>
    <div v-if="adminError" class="admin-err">{{ adminError }}</div>

    <div class="admin-settings-row">
      <label class="admin-settings-label">Название сайта</label>
      <input v-model="adminSettings.siteName" class="box" placeholder="Stream.ShadeCraft.ru" maxlength="128" />
    </div>

    <div class="admin-settings-row">
      <label class="admin-settings-label">Подзаголовок</label>
      <input v-model="adminSettings.siteSubtitle" class="box" placeholder="стримерская" maxlength="256" />
    </div>

    <div class="admin-settings-row">
      <label class="admin-settings-label">Инвайт-код для регистрации</label>
      <input v-model="adminSettings.registrationCode" class="box" placeholder="Кодовое слово" maxlength="256" />
    </div>

    <div class="admin-settings-row">
      <label class="check admin-settings-check">
        <input v-model="adminSettings.registrationEnabled" type="checkbox" />
        <span>Регистрация включена</span>
      </label>
    </div>

    <div class="admin-settings-row">
      <label class="admin-settings-label">SRT passphrase</label>
      <div class="admin-chat-create">
        <input v-model="adminSettings.srtPassphrase" class="box" placeholder="Ключ шифрования SRT" />
        <button class="btn" type="button" @click="generateSrtPassphrase">Сгенерировать</button>
      </div>
      <div class="admin-settings-hint">
        После изменения ключа нужно синхронизировать MediaMTX-конфиг и перезапустить контейнер mediamtx.
      </div>
    </div>

    <div class="admin-settings-row">
      <label class="admin-settings-label">SRT pbkeylen</label>
      <select v-model.number="adminSettings.srtPbkeylen" class="box">
        <option :value="5">5</option>
        <option :value="16">16</option>
        <option :value="24">24</option>
        <option :value="32">32</option>
      </select>
    </div>

    <div class="row">
      <button class="btn" type="button" @click="saveAdminSettings(props.onUpdateSiteName)">Сохранить</button>
      <button class="btn" type="button" @click="loadAdminSettings">Отменить</button>
    </div>
  </div>
</template>
