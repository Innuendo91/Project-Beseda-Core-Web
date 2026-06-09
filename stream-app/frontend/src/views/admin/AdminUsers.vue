<script setup>
import { getAdminInstance } from "../../composables/useAdmin.js";

const {
  adminUsers, adminLoading, adminStatus, adminError,
  adminPasswords, adminEmails, adminResetLink,
  loadAdminUsers, setAdminRole, setUserChatMute, resetAdminPassword,
  generateAdminResetLink, copyAdminResetLink, updateUserEmail, deleteAdminUser,
} = getAdminInstance();
</script>

<template>
  <div>
    <div v-if="adminStatus" class="admin-ok">{{ adminStatus }}</div>
    <div v-if="adminError" class="admin-err">{{ adminError }}</div>

    <div v-if="adminResetLink" class="admin-link-box">
      <div class="admin-reset-user">Пользователь: {{ adminResetLink.username }}</div>
      <div class="admin-link-url">{{ adminResetLink.link }}</div>
      <div class="admin-link-exp">Действительна до: {{ adminResetLink.expiresAt }}</div>
      <div class="row">
        <button type="button" class="btn" @click="copyAdminResetLink">Копировать</button>
        <button type="button" class="btn" @click="adminResetLink = null">Закрыть</button>
      </div>
    </div>

    <div v-if="adminLoading" class="muted">Загрузка...</div>
    <div v-else-if="!adminUsers.length" class="muted">Пользователей нет</div>
    <div v-else class="admin-list">
      <div v-for="adminUser in adminUsers" :key="adminUser.id" class="admin-row spa-admin-row">
        <div class="admin-main">
          <div class="admin-user">
            <span class="mono">#{{ adminUser.id }}</span>
            {{ adminUser.username }}
            <span v-if="adminUser.isAdmin" class="admin-badge">админ</span>
            <span v-if="adminUser.chatMuted" class="admin-badge">mute</span>
          </div>
          <div class="admin-meta">{{ adminUser.createdAt || "—" }} • {{ adminUser.lastLoginAt || "—" }}</div>
          <form class="admin-form" @submit.prevent="updateUserEmail(adminUser)">
            <input
              type="email"
              :placeholder="adminUser.email || 'e-mail'"
              :value="adminEmails[adminUser.id]"
              @input="adminEmails[adminUser.id] = $event.target.value"
              maxlength="255"
            />
            <button class="btn admin-reset-link-btn" type="submit">Сохранить</button>
          </form>
        </div>

        <div class="admin-actions">
          <button class="btn admin-reset-link-btn" type="button" @click="setAdminRole(adminUser, !adminUser.isAdmin)">
            {{ adminUser.isAdmin ? "Отозвать" : "Назначить" }}
          </button>

          <button class="btn admin-reset-link-btn" type="button" @click="setUserChatMute(adminUser, !adminUser.chatMuted)">
            {{ adminUser.chatMuted ? "Unmute" : "Mute" }}
          </button>

          <form class="admin-form" @submit.prevent="resetAdminPassword(adminUser)">
            <input
              v-model="adminPasswords[adminUser.id]"
              type="password"
              placeholder="Новый пароль"
              minlength="6"
            />
            <button class="btn admin-reset-link-btn" type="submit">Сброс</button>
          </form>

          <button class="btn admin-reset-link-btn" type="button" @click="generateAdminResetLink(adminUser)">
            Восстановление
          </button>

          <button
            class="btn admin-user-delete-icon"
            type="button"
            title="Удалить пользователя"
            aria-label="Удалить пользователя"
            @click="deleteAdminUser(adminUser)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M6 6l1 15h10l1-15" />
              <path d="M10 10v7" />
              <path d="M14 10v7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
