import { ref, computed } from "vue";
import { csrfFetch } from "../api.js";

export function useUser() {
  const user = ref(window.__APP__?.user || null);
  const isAdmin = ref(Boolean(window.__APP__?.isAdmin));
  const siteName = ref(window.__APP__?.siteName || "Stream");
  const siteSubtitle = ref(window.__APP__?.siteSubtitle || "");

  const displayName = computed(() => user.value?.displayName || user.value?.username || "");

  async function logout() {
    await csrfFetch("/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function updateUser(data) {
    if (data) user.value = data;
  }

  return {
    user,
    isAdmin,
    siteName,
    siteSubtitle,
    displayName,
    logout,
    updateUser,
  };
}
