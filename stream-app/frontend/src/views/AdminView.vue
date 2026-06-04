<script setup>
import { watch } from "vue";
import { getAdminInstance } from "../composables/useAdmin.js";
import AdminUsers from "./admin/AdminUsers.vue";
import AdminSettings from "./admin/AdminSettings.vue";
import AdminChatRooms from "./admin/AdminChatRooms.vue";
import AdminVoiceRooms from "./admin/AdminVoiceRooms.vue";
import AdminStickers from "./admin/AdminStickers.vue";
import AdminNotifySounds from "./admin/AdminNotifySounds.vue";
import AdminAttachments from "./admin/AdminAttachments.vue";

const props = defineProps({
  onVoiceRefresh: { type: Function, default: null },
  onOpenVoiceRoom: { type: Function, default: null },
  onUpdateSiteName: { type: Function, default: null },
});

const {
  adminTab, adminStatus, adminError, adminResetLink,
  loadAdminUsers, loadAdminSettings, loadAdminChatRooms,
  loadAdminVoiceRooms, loadAdminStickers, loadAdminNotifySounds, loadAttachmentStats,
} = getAdminInstance();

watch(adminTab, (tab) => {
  if (tab === "users") loadAdminUsers();
  if (tab === "settings") loadAdminSettings();
  if (tab === "chatRooms") loadAdminChatRooms();
  if (tab === "voiceRooms") loadAdminVoiceRooms();
  if (tab === "stickers") loadAdminStickers();
  if (tab === "notifySounds") loadAdminNotifySounds();
  if (tab === "attachments") loadAttachmentStats();
});
</script>

<template>
  <div class="panel admin-panel spa-admin-panel" :class="{ 'admin-panel-settings': adminTab === 'settings' }">
    <div class="panel-head">
      <div>Админ-панель</div>
      <button type="button" class="tb-btn" @click="loadAdminUsers">Обновить</button>
    </div>

    <div class="admin-tabs-bar" role="tablist">
      <button type="button" class="admin-tab-btn" :class="{ active: adminTab === 'settings' }" @click="adminTab = 'settings'">
        Настройки
      </button>
      <button type="button" class="admin-tab-btn" :class="{ active: adminTab === 'users' }" @click="adminTab = 'users'">
        Пользователи
      </button>
      <button type="button" class="admin-tab-btn" :class="{ active: adminTab === 'chatRooms' }" @click="adminTab = 'chatRooms'">
        Чат-комнаты
      </button>
      <button type="button" class="admin-tab-btn" :class="{ active: adminTab === 'voiceRooms' }" @click="adminTab = 'voiceRooms'">
        Голосовые
      </button>
      <button type="button" class="admin-tab-btn" :class="{ active: adminTab === 'stickers' }" @click="adminTab = 'stickers'">
        Стикеры
      </button>
      <button type="button" class="admin-tab-btn" :class="{ active: adminTab === 'notifySounds' }" @click="adminTab = 'notifySounds'">
        Звуки
      </button>
      <button type="button" class="admin-tab-btn" :class="{ active: adminTab === 'attachments' }" @click="adminTab = 'attachments'">
        Вложения
      </button>
    </div>

    <div class="admin-body">
      <AdminUsers v-if="adminTab === 'users'" />
      <AdminSettings v-if="adminTab === 'settings'" :on-update-site-name="onUpdateSiteName" />
      <AdminChatRooms v-if="adminTab === 'chatRooms'" />
      <AdminVoiceRooms
        v-if="adminTab === 'voiceRooms'"
        :on-voice-refresh="onVoiceRefresh"
        :on-open-voice-room="onOpenVoiceRoom"
      />
      <AdminStickers v-if="adminTab === 'stickers'" />
      <AdminNotifySounds v-if="adminTab === 'notifySounds'" />
      <AdminAttachments v-if="adminTab === 'attachments'" />
    </div>
  </div>
</template>
