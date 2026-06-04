import { ref } from "vue";
import { getJson } from "../api.js";

export function useStreams() {
  const streams = ref([]);
  const loading = ref(true);
  const status = ref("");
  const streamSrtUrl = ref("");
  const streamPath = ref("");
  const streamCopyStatus = ref("");
  const streamLoadError = ref("");

  async function refresh() {
    loading.value = true;
    status.value = "";
    try {
      const streamData = await getJson("/api/streams");
      streams.value = Array.isArray(streamData.paths) ? streamData.paths : [];
      status.value = streamData.apiOk === false ? "MediaMTX API недоступен, список может быть пустым" : "";
    } catch (err) {
      if (err.status === 401) {
        window.location.href = "/login";
        return;
      }
      status.value = "Не удалось обновить данные";
    } finally {
      loading.value = false;
    }
  }

  async function loadStreamConfig() {
    streamLoadError.value = "";
    try {
      const data = await getJson("/api/stream-config");
      streamSrtUrl.value = data.srtUrlEnc || data.srtUrl || "";
      streamPath.value = data.path || "";
    } catch {
      streamLoadError.value = "Не удалось загрузить настройки стрима";
    }
  }

  async function copySrtUrl() {
    if (!streamSrtUrl.value) return;
    try {
      await navigator.clipboard.writeText(streamSrtUrl.value);
      streamCopyStatus.value = "Скопировано";
      setTimeout(() => { streamCopyStatus.value = ""; }, 1500);
    } catch {
      streamCopyStatus.value = "Ошибка копирования";
      setTimeout(() => { streamCopyStatus.value = ""; }, 1500);
    }
  }


  return {
    streams,
    loading,
    status,
    streamSrtUrl,
    streamPath,
    streamCopyStatus,
    streamLoadError,
    refresh,
    loadStreamConfig,
    copySrtUrl,
  };
}
