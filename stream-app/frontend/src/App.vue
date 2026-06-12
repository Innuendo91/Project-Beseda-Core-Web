<script setup>
import { computed, onMounted, ref } from "vue";
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
} from "reka-ui";
import { useUser } from "./composables/useUser.js";
import HomeView from "./views/HomeView.vue";
import ProfileView from "./views/ProfileView.vue";
import AdminView from "./views/AdminView.vue";

const { isAdmin, siteName, siteSubtitle, logout } = useUser();

const activePanel = ref("home");
const profileOpen = ref(false);
const adminOpen = ref(false);

const panels = computed(() => [
  { id: "home", label: "Главная" },
  { id: "profile", label: "Профиль" },
  ...(isAdmin.value ? [{ id: "admin", label: "Админ" }] : []),
]);

function openPanel(panelId) {
  if (panelId === "profile") {
    profileOpen.value = true;
    return;
  }
  if (panelId === "admin") {
    adminOpen.value = true;
    return;
  }
  activePanel.value = panelId;
}

function handleSiteNameUpdate(settings) {
  if (settings?.siteName) {
    siteName.value = settings.siteName;
  }
  if (settings?.siteSubtitle !== undefined) {
    siteSubtitle.value = settings.siteSubtitle;
  }
}

onMounted(() => {});
</script>

<template>
  <div class="spa-root">
    <header class="spa-header">
      <div class="spa-header-brand">
        <button type="button" class="spa-logo-btn" @click="activePanel = 'home'">
          <span class="spa-logo-text">{{ siteName }}</span>
        </button>
        <div v-if="siteSubtitle" class="spa-header-subtitle">{{ siteSubtitle }}</div>
      </div>

      <div class="spa-header-actions">
        <div class="spa-nav">
          <button
            v-for="panel in panels"
            :key="panel.id"
            type="button"
            class="spa-nav-btn"
            :class="{ active: activePanel === panel.id && panel.id !== 'profile' }"
            @click="openPanel(panel.id)"
          >
            {{ panel.label }}
          </button>
          <button type="button" class="spa-nav-btn spa-logout-btn" aria-label="Выйти" title="Выйти" @click="logout">
            <svg class="spa-logout-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <div class="wrap spa-wrap">
      <div class="spa-mobile-nav">
        <button
          v-for="panel in panels"
          :key="panel.id"
          type="button"
          class="spa-nav-btn"
          :class="{ active: activePanel === panel.id && panel.id !== 'profile' }"
          @click="openPanel(panel.id)"
        >
          {{ panel.label }}
        </button>
        <button type="button" class="spa-nav-btn spa-logout-btn" aria-label="Выйти" title="Выйти" @click="logout">
          <svg class="spa-logout-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </div>

      <HomeView
        v-if="activePanel === 'home'"
        :is-admin="isAdmin"
      />
    </div>

    <DialogRoot v-model:open="profileOpen">
      <DialogPortal>
        <DialogOverlay class="profile-modal-overlay" />
        <DialogContent class="profile-modal-card">
          <ProfileView @close="profileOpen = false" />
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="adminOpen">
      <DialogPortal>
        <DialogOverlay class="admin-modal-overlay" />
        <DialogContent class="admin-modal-card">
          <button type="button" class="admin-modal-close" aria-label="Закрыть" @click="adminOpen = false">
            ×
          </button>
          <AdminView
            v-if="isAdmin"
            :on-update-site-name="handleSiteNameUpdate"
          />
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
