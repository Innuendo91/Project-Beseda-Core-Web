<script setup>
import { computed, onMounted, ref } from "vue";
import { useUser } from "./composables/useUser.js";
import HomeView from "./views/HomeView.vue";
import ProfileView from "./views/ProfileView.vue";
import AdminView from "./views/AdminView.vue";

const { user, isAdmin, siteName, siteSubtitle, displayName, logout } = useUser();

const activePanel = ref("home");

const panels = computed(() => [
  { id: "home", label: "Обзор" },
  { id: "profile", label: "Профиль" },
  ...(isAdmin.value ? [{ id: "admin", label: "Админ" }] : []),
]);

function handleSiteNameUpdate(settings) {
   if (settings?.siteName) {
     siteName.value = settings.siteName;
   }
   if (settings?.siteSubtitle !== undefined) {
     siteSubtitle.value = settings.siteSubtitle;
   }
 }

onMounted(() => {
});
</script>

<template>
  <div class="spa-root">
    <div class="toolbar toolbar-full">
      <div class="toolbar-inner">
        <div class="tb-left">
          <a class="tb-logo-link" @click="activePanel = 'home'">
            <img class="tb-logo" :src="'/public/logo.png'" alt="Home" />
          </a>
          <div class="tb-text">
            <div class="tb-title">{{ siteName }}</div>
            <div v-if="siteSubtitle" class="tb-sub">{{ siteSubtitle }}</div>
          </div>
        </div>

        <div class="tb-right">
          <div class="tb-pill tb-user-pill">{{ displayName }}</div>
          <div class="tb-desktop-btns spa-nav">
            <button
              v-for="panel in panels"
              :key="panel.id"
              type="button"
              class="tb-btn tb-link"
              :class="{ active: activePanel === panel.id }"
              @click="activePanel = panel.id"
            >
              {{ panel.label }}
            </button>
            <button type="button" class="tb-btn" @click="logout">Выйти</button>
          </div>
        </div>
      </div>
    </div>

    <div class="wrap spa-wrap">
      <div class="spa-mobile-nav">
        <button
          v-for="panel in panels"
          :key="panel.id"
          type="button"
          class="tb-btn"
          :class="{ active: activePanel === panel.id }"
          @click="activePanel = panel.id"
        >
          {{ panel.label }}
        </button>
      </div>

      <HomeView
        v-if="activePanel === 'home'"
        :is-admin="isAdmin"
      />

      <ProfileView v-else-if="activePanel === 'profile'" />

      <AdminView
        v-else-if="activePanel === 'admin' && isAdmin"
        :on-update-site-name="handleSiteNameUpdate"
      />
    </div>
  </div>
</template>
