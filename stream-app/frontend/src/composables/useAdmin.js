import { ref } from "vue";
import { getJson } from "../api.js";

let _instance;

export function getAdminInstance() {
  if (!_instance) _instance = useAdmin();
  return _instance;
}

export function useAdmin() {
  const adminTab = ref("users");
  const adminUsers = ref([]);
  const adminLoading = ref(false);
  const adminStatus = ref("");
  const adminError = ref("");
  const adminPasswords = ref({});
  const adminEmails = ref({});
  const adminResetLink = ref(null);
  const adminSettings = ref({
    siteName: "",
    siteSubtitle: "",
    registrationCode: "",
    registrationEnabled: true,
    srtPassphrase: "",
    srtPbkeylen: 32,
  });
  const adminChatRooms = ref([]);
  const adminChatRoomName = ref("");
  const adminChatLoading = ref(false);
  const adminVoiceRooms = ref([]);
  const adminVoiceRoomName = ref("");
  const adminVoiceRoomPass = ref("");
  const adminVoiceLoading = ref(false);
  const adminStickers = ref([]);
  const adminStickerName = ref("");
  const adminStickerFile = ref(null);
  const adminStickerLoading = ref(false);
  const adminStickersLoading = ref(false);
  const adminNotifyFiles = ref([]);
  const adminNotifySound = ref("");
  const adminMentionSound = ref("");
  const adminVoiceJoinSound = ref("");
  const adminVoiceLeaveSound = ref("");
  const adminNotifyFile = ref(null);
  const adminNotifyLoading = ref(false);
  const attachmentStats = ref(null);
  const attachmentLoading = ref(false);
  const attachmentRetentionDays = ref(0);

  async function loadAdminUsers() {
    adminLoading.value = true;
    adminError.value = "";
    try {
      const data = await getJson("/api/admin/users");
      adminUsers.value = Array.isArray(data.users) ? data.users : [];
    } catch {
      adminError.value = "Не удалось загрузить пользователей";
    } finally {
      adminLoading.value = false;
    }
  }

  async function loadAdminSettings() {
    adminError.value = "";
    try {
      const data = await getJson("/api/admin/site-settings");
      if (data.settings) {
        adminSettings.value = {
          ...adminSettings.value,
          ...data.settings,
          registrationEnabled: data.settings.registrationEnabled !== false,
          srtPbkeylen: Number(data.settings.srtPbkeylen || 32),
        };
      }
    } catch {
      adminError.value = "Не удалось загрузить настройки";
    }
  }

  async function loadAdminChatRooms() {
    adminChatLoading.value = true;
    adminError.value = "";
    try {
      const data = await getJson("/api/admin/chat-rooms");
      adminChatRooms.value = Array.isArray(data.rooms) ? data.rooms : [];
    } catch {
      adminError.value = "Не удалось загрузить чат-комнаты";
    } finally {
      adminChatLoading.value = false;
    }
  }

  async function loadAdminVoiceRooms() {
    adminVoiceLoading.value = true;
    adminError.value = "";
    try {
      const data = await getJson("/api/admin/voice-rooms");
      adminVoiceRooms.value = Array.isArray(data.rooms) ? data.rooms : [];
    } catch {
      adminError.value = "Не удалось загрузить голосовые комнаты";
    } finally {
      adminVoiceLoading.value = false;
    }
  }

  async function loadAdminStickers() {
    adminStickersLoading.value = true;
    adminError.value = "";
    try {
      const data = await getJson("/api/admin/stickers");
      adminStickers.value = Array.isArray(data.stickers) ? data.stickers : [];
    } catch {
      adminError.value = "Не удалось загрузить стикеры";
    } finally {
      adminStickersLoading.value = false;
    }
  }

  async function loadAdminNotifySounds() {
    adminNotifyLoading.value = true;
    adminError.value = "";
    try {
      const data = await getJson("/api/admin/notify-sounds");
      adminNotifyFiles.value = Array.isArray(data.files) ? data.files : [];
      adminNotifySound.value = data.notifySound || "";
      adminMentionSound.value = data.mentionSound || "";
      adminVoiceJoinSound.value = data.voiceJoinSound || "";
      adminVoiceLeaveSound.value = data.voiceLeaveSound || "";
    } catch {
      adminError.value = "Не удалось загрузить звуки";
    } finally {
      adminNotifyLoading.value = false;
    }
  }

  function generateSrtPassphrase() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const bytes = new Uint32Array(32);
    crypto.getRandomValues(bytes);
    adminSettings.value.srtPassphrase = Array.from(bytes, (n) => chars[n % chars.length]).join("");
  }

  async function saveAdminSettings(onUpdate) {
    adminError.value = "";
    adminStatus.value = "";
    try {
      const data = await getJson("/api/admin/site-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteName: adminSettings.value.siteName,
          siteSubtitle: adminSettings.value.siteSubtitle,
          registrationCode: adminSettings.value.registrationCode,
          registrationEnabled: adminSettings.value.registrationEnabled,
          srtPassphrase: adminSettings.value.srtPassphrase,
          srtPbkeylen: Number(adminSettings.value.srtPbkeylen || 32),
        }),
      });
      if (data.settings) {
        adminSettings.value = {
          ...adminSettings.value,
          ...data.settings,
          registrationEnabled: data.settings.registrationEnabled !== false,
          srtPbkeylen: Number(data.settings.srtPbkeylen || 32),
        };
        onUpdate?.(data.settings);
      }
      adminStatus.value = "Настройки сохранены";
    } catch {
      adminError.value = "Не удалось сохранить настройки";
    }
  }

  async function setAdminRole(adminUser, makeAdmin) {
    if (!adminUser?.id) return;
    const ok = window.confirm(makeAdmin ? "Назначить администратором?" : "Отозвать админ-права?");
    if (!ok) return;

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/users/${adminUser.id}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ makeAdmin }),
      });
      adminStatus.value = makeAdmin ? "Админ назначен" : "Админ отозван";
      await loadAdminUsers();
    } catch {
      adminError.value = "Не удалось изменить права";
    }
  }

  async function setUserChatMute(adminUser, muted) {
    if (!adminUser?.id) return;
    const ok = window.confirm(muted ? `Выдать mute пользователю ${adminUser.username}?` : `Снять mute с пользователя ${adminUser.username}?`);
    if (!ok) return;

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/users/${adminUser.id}/mute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted }),
      });
      adminStatus.value = muted ? "Mute выдан" : "Mute снят";
      await loadAdminUsers();
    } catch {
      adminError.value = "Не удалось изменить mute";
    }
  }

  async function resetAdminPassword(adminUser) {
    const pass = String(adminPasswords.value[adminUser.id] || "");
    if (pass.length < 6) {
      adminError.value = "Пароль минимум 6 символов";
      return;
    }

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/users/${adminUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass }),
      });
      adminPasswords.value = { ...adminPasswords.value, [adminUser.id]: "" };
      adminStatus.value = `Пароль обновлён: ${adminUser.username}`;
    } catch {
      adminError.value = "Не удалось сбросить пароль";
    }
  }

  async function generateAdminResetLink(adminUser) {
    adminError.value = "";
    adminStatus.value = "";
    adminResetLink.value = null;
    try {
      const data = await getJson("/api/admin/generate-reset-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: adminUser.id }),
      });
      adminResetLink.value = {
        username: data.username || adminUser.username,
        link: data.link,
        expiresAt: data.expiresAt,
      };
    } catch {
      adminError.value = "Не удалось создать ссылку восстановления";
    }
  }

  async function copyAdminResetLink() {
    if (!adminResetLink.value?.link) return;
    try {
      await navigator.clipboard.writeText(adminResetLink.value.link);
      adminStatus.value = "Ссылка скопирована";
    } catch {
      adminError.value = "Не удалось скопировать ссылку";
    }
  }

  async function updateUserEmail(adminUser) {
    if (!adminUser?.id) return;
    const email = String(adminEmails.value[adminUser.id] || "").trim().toLowerCase();

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/users/${adminUser.id}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      adminStatus.value = `E-mail обновлён: ${adminUser.username}`;
      await loadAdminUsers();
    } catch (err) {
      adminError.value = err.message || "Не удалось обновить e-mail";
    }
  }

  async function deleteAdminUser(adminUser) {
    if (!adminUser?.id) return;
    const ok = window.confirm(`Удалить пользователя ${adminUser.username}?`);
    if (!ok) return;

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/users/${adminUser.id}`, { method: "DELETE" });
      adminStatus.value = "Пользователь удалён";
      await loadAdminUsers();
    } catch {
      adminError.value = "Не удалось удалить пользователя";
    }
  }

  async function createAdminChatRoom(onRefresh) {
    const name = adminChatRoomName.value.trim();
    if (!name) {
      adminError.value = "Введите название комнаты";
      return;
    }

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson("/api/admin/chat-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      adminChatRoomName.value = "";
      adminStatus.value = "Комната создана";
      await Promise.all([loadAdminChatRooms(), onRefresh?.()]);
    } catch (err) {
      adminError.value = err.data?.error || "Не удалось создать комнату";
    }
  }

  async function deleteAdminChatRoom(room) {
    if (!room?.id || room.is_permanent) return;
    const ok = window.confirm(`Удалить комнату ${room.name}?`);
    if (!ok) return;

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/chat-rooms/${room.id}`, { method: "DELETE" });
      adminStatus.value = "Комната удалена";
      await loadAdminChatRooms();
    } catch {
      adminError.value = "Не удалось удалить комнату";
    }
  }

  async function patchAdminChatRoom(room, path, body, { reload = false } = {}) {
    if (!room?.id) return;
    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/chat-rooms/${room.id}/${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      adminStatus.value = "Комната обновлена";
      if (reload) await Promise.all([loadAdminChatRooms()]);
    } catch {
      adminError.value = "Не удалось сохранить комнату";
    }
  }

  function clampAdminRoomNumber(room, field, min, max, fallback) {
    let value = Number(room[field]);
    if (!Number.isFinite(value)) value = fallback;
    value = Math.min(max, Math.max(min, value));
    room[field] = value;
    return value;
  }

  async function createAdminVoiceRoom(onRefresh) {
    const name = adminVoiceRoomName.value.trim();
    if (!name) {
      adminError.value = "Введите название голосовой комнаты";
      return;
    }

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson("/api/admin/voice-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pass: adminVoiceRoomPass.value.trim() }),
      });
      adminVoiceRoomName.value = "";
      adminVoiceRoomPass.value = "";
      adminStatus.value = "Голосовая комната создана";
      await loadAdminVoiceRooms();
      onRefresh?.();
    } catch (err) {
      adminError.value = err.data?.error || "Не удалось создать голосовую комнату";
    }
  }

  async function deleteAdminVoiceRoom(room, onRefresh) {
    if (!room?.id) return;
    const ok = window.confirm(`Удалить голосовую комнату ${room.name}?`);
    if (!ok) return;

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/voice-rooms/${room.id}`, { method: "DELETE" });
      adminStatus.value = "Голосовая комната удалена";
      await loadAdminVoiceRooms();
      onRefresh?.();
    } catch {
      adminError.value = "Не удалось удалить голосовую комнату";
    }
  }

  async function clearAdminVoiceRoomPassword(room, onRefresh) {
    if (!room?.id) return;
    const ok = window.confirm(`Убрать пароль у комнаты ${room.name}?`);
    if (!ok) return;

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/voice-rooms/${room.id}/clear-password`, { method: "POST" });
      adminStatus.value = "Пароль комнаты убран";
      await loadAdminVoiceRooms();
      onRefresh?.();
    } catch {
      adminError.value = "Не удалось убрать пароль";
    }
  }

  async function clearAllAdminVoicePasswords(onRefresh) {
    const ok = window.confirm("Убрать пароли у всех голосовых комнат?");
    if (!ok) return;

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson("/api/admin/voice-rooms/clear-all-passwords", { method: "POST" });
      adminStatus.value = "Пароли голосовых комнат убраны";
      await loadAdminVoiceRooms();
      onRefresh?.();
    } catch {
      adminError.value = "Не удалось убрать пароли";
    }
  }

  function handleStickerFile(event) {
    const file = event.target.files?.[0];
    adminStickerFile.value = file || null;
    event.target.value = "";
  }

  async function addSticker() {
    const file = adminStickerFile.value;
    if (!file) {
      adminError.value = "Выберите файл изображения";
      return;
    }

    adminError.value = "";
    adminStatus.value = "";
    adminStickerLoading.value = true;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const name = adminStickerName.value.trim().slice(0, 64);
      await getJson("/api/admin/stickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: dataUrl }),
      });

      adminStickerName.value = "";
      adminStickerFile.value = null;
      adminStatus.value = "Стикеры добавлены";
      await loadAdminStickers();
    } catch (err) {
      adminError.value = err.data?.error || "Не удалось загрузить стикер";
    } finally {
      adminStickerLoading.value = false;
    }
  }

  async function deleteAdminSticker(sticker) {
    if (!sticker?.id) return;
    const ok = window.confirm(`Удалить стикер "${sticker.name || sticker.id}"?`);
    if (!ok) return;

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/stickers/${sticker.id}`, { method: "DELETE" });
      adminStatus.value = "Стикер удалён";
      await loadAdminStickers();
    } catch {
      adminError.value = "Не удалось удалить стикер";
    }
  }

  function playNotifySound(filename) {
    if (!filename) return;
    const audio = new Audio(`/public/notify_sounds/${encodeURIComponent(filename)}?t=${Date.now()}`);
    audio.play().catch(() => {});
  }

  async function saveNotifySound(field, value) {
    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson("/api/admin/notify-sounds/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      adminStatus.value = "Сохранено";
      setTimeout(() => { adminStatus.value = ""; }, 3000);
    } catch {
      adminError.value = "Не удалось сохранить";
    }
  }

  async function uploadNotifySound() {
    const file = adminNotifyFile.value;
    if (!file) {
      adminError.value = "Выберите файл";
      return;
    }

    adminError.value = "";
    adminStatus.value = "";
    adminNotifyLoading.value = true;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await getJson("/api/admin/notify-sounds/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, data: dataUrl }),
      });

      adminNotifyFile.value = null;
      adminStatus.value = `Файл загружен: ${file.name}`;
      setTimeout(() => { adminStatus.value = ""; }, 3000);
      await loadAdminNotifySounds();
    } catch (err) {
      adminError.value = err.data?.error || "Не удалось загрузить файл";
    } finally {
      adminNotifyLoading.value = false;
    }
  }

  function handleNotifyFile(event) {
    adminNotifyFile.value = event.target.files?.[0] || null;
    event.target.value = "";
  }

  async function deleteNotifySound(filename) {
    if (!filename) return;
    const ok = window.confirm(`Удалить файл ${filename}?`);
    if (!ok) return;

    adminError.value = "";
    adminStatus.value = "";
    try {
      await getJson(`/api/admin/notify-sounds/${encodeURIComponent(filename)}`, { method: "DELETE" });
      adminStatus.value = "Файл удалён";
      await loadAdminNotifySounds();
    } catch {
      adminError.value = "Не удалось удалить файл";
    }
  }

  async function loadAttachmentStats() {
    attachmentLoading.value = true;
    adminError.value = "";
    try {
      const data = await getJson("/api/admin/attachments/stats");
      attachmentStats.value = data;
      attachmentRetentionDays.value = data.retentionDays ?? 0;
    } catch {
      adminError.value = "Не удалось загрузить статистику вложений";
    } finally {
      attachmentLoading.value = false;
    }
  }

  async function saveRetentionDays(days) {
    adminError.value = "";
    adminStatus.value = "";
    const d = Math.min(365, Math.max(0, Number(days || 0)));
    try {
      await getJson("/api/admin/attachments/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: d }),
      });
      attachmentRetentionDays.value = d;
      adminStatus.value = d === 0 ? "Ограничение снято" : `Сохранено: ${d} дн.`;
      setTimeout(() => { adminStatus.value = ""; }, 3000);
    } catch {
      adminError.value = "Не удалось сохранить";
    }
  }

  async function runCleanup() {
    const d = attachmentRetentionDays.value || 30;
    const ok = window.confirm(`Удалить старые изображения и стикеры в чате старше ${d} дн.?`);
    if (!ok) return;

    adminError.value = "";
    adminStatus.value = "";
    try {
      const data = await getJson("/api/admin/attachments/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: d }),
      });
      adminStatus.value = `Очищено: ${data.totalDeleted || 0} записей (изображений: ${data.deletedImages}, стикеров: ${data.deletedStickers})`;
      await loadAttachmentStats();
    } catch {
      adminError.value = "Не удалось выполнить очистку";
    }
  }

  return {
    adminTab,
    adminUsers,
    adminLoading,
    adminStatus,
    adminError,
    adminPasswords,
    adminEmails,
    adminResetLink,
    adminSettings,
    adminChatRooms,
    adminChatRoomName,
    adminChatLoading,
    adminVoiceRooms,
    adminVoiceRoomName,
    adminVoiceRoomPass,
    adminVoiceLoading,
    adminStickers,
    adminStickerName,
    adminStickerFile,
    adminStickerLoading,
    adminStickersLoading,
    adminNotifyFiles,
    adminNotifySound,
    adminMentionSound,
    adminVoiceJoinSound,
    adminVoiceLeaveSound,
    adminNotifyFile,
    adminNotifyLoading,
    attachmentStats,
    attachmentLoading,
    attachmentRetentionDays,
    loadAdminUsers,
    loadAdminSettings,
    loadAdminChatRooms,
    loadAdminVoiceRooms,
    loadAdminStickers,
    loadAdminNotifySounds,
    loadAttachmentStats,
    generateSrtPassphrase,
    saveAdminSettings,
    setAdminRole,
    setUserChatMute,
    resetAdminPassword,
    generateAdminResetLink,
    copyAdminResetLink,
    updateUserEmail,
    deleteAdminUser,
    createAdminChatRoom,
    deleteAdminChatRoom,
    patchAdminChatRoom,
    clampAdminRoomNumber,
    createAdminVoiceRoom,
    deleteAdminVoiceRoom,
    clearAdminVoiceRoomPassword,
    clearAllAdminVoicePasswords,
    handleStickerFile,
    addSticker,
    deleteAdminSticker,
    playNotifySound,
    saveNotifySound,
    uploadNotifySound,
    handleNotifyFile,
    deleteNotifySound,
    saveRetentionDays,
    runCleanup,
  };
}
