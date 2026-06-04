import { ref } from "vue";
import { getJson } from "../api.js";

export function useVoice() {
  const voiceRooms = ref([]);
  const voiceLoading = ref(false);
  const voiceError = ref("");
  const voiceRoomName = ref("");
  const voiceRoomPass = ref("");
  const activeVoiceRoom = ref(null);

  async function refreshVoiceRooms({ quiet = false } = {}) {
    if (!quiet) voiceLoading.value = true;
    voiceError.value = "";
    try {
      const data = await getJson("/api/voice/rooms");
      voiceRooms.value = Array.isArray(data.rooms) ? data.rooms : [];
    } catch {
      voiceError.value = "Не удалось загрузить голосовые комнаты";
    } finally {
      voiceLoading.value = false;
    }
  }

  async function createVoiceRoom() {
    const name = voiceRoomName.value.trim();
    if (!name) {
      voiceError.value = "Введите название комнаты";
      return;
    }

    voiceLoading.value = true;
    voiceError.value = "";
    try {
      const pass = voiceRoomPass.value.trim();
      const data = await getJson("/api/voice/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pass }),
      });
      if (!data.ok || !data.room) throw new Error(data.error || "create failed");

      const room = data.room;
      const slug = room.latinSlug || room.slug;
      if (room.hasPassword && pass) {
        sessionStorage.setItem(`voiceRoomPass:${slug}`, pass);
      }
      voiceRoomName.value = "";
      voiceRoomPass.value = "";
      await refreshVoiceRooms({ quiet: true });
      return room;
    } catch {
      voiceError.value = "Не удалось создать комнату";
      return null;
    } finally {
      voiceLoading.value = false;
    }
  }

  function openVoiceRoom(room) {
    if (!room) return;
    const slug = room.latinSlug || room.slug;
    if (!slug) return;
    if (room.hasPassword && !sessionStorage.getItem(`voiceRoomPass:${slug}`)) {
      const pass = window.prompt("Введите пароль комнаты");
      if (!pass) return;
      sessionStorage.setItem(`voiceRoomPass:${slug}`, pass);
    }
    activeVoiceRoom.value = room;
  }

  function closeVoiceRoom() {
    activeVoiceRoom.value = null;
    refreshVoiceRooms({ quiet: true });
  }

  return {
    voiceRooms,
    voiceLoading,
    voiceError,
    voiceRoomName,
    voiceRoomPass,
    activeVoiceRoom,
    refreshVoiceRooms,
    createVoiceRoom,
    openVoiceRoom,
    closeVoiceRoom,
  };
}
