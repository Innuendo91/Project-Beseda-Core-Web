<script setup>
import { onMounted, ref } from "vue";
import { useStreams } from "../composables/useStreams.js";

const {
  streamSrtUrl, streamPath,
  streamCopyStatus, streamLoadError,
  loadStreamConfig, copySrtUrl,
} = useStreams();

const browserStreamer = ref(null);
const browserStreaming = ref(false);
const browserStreamModal = ref(false);
const browserStreamStatus = ref("");
const browserStreamBusy = ref(false);
const browserStreamOptions = ref({
  resolution: "720p",
  fps: 30,
  bitrate: "2500000",
});

onMounted(async () => {
  const { createBrowserStreamer } = await import("../browserStream.js");
  browserStreamer.value = createBrowserStreamer({
    onState: (value) => { browserStreaming.value = value; },
    onStatus: (message) => {
      browserStreamStatus.value = message;
      if (message && message !== "Трансляция запущена") {
        window.setTimeout(() => {
          if (browserStreamStatus.value === message) browserStreamStatus.value = "";
        }, 3000);
      }
    },
  });
  loadStreamConfig();
});

async function toggleBrowserStream() {
  if (!browserStreamer.value) return;
  if (browserStreaming.value) {
    browserStreamBusy.value = true;
    await browserStreamer.value.stop();
    browserStreamBusy.value = false;
    return;
  }
  browserStreamModal.value = true;
}

async function startBrowserStream(type) {
  if (!browserStreamer.value) return;
  browserStreamBusy.value = true;
  browserStreamModal.value = false;
  try {
    await browserStreamer.value.start({
      type,
      resolution: browserStreamOptions.value.resolution,
      fps: browserStreamOptions.value.fps,
      bitrate: browserStreamOptions.value.bitrate,
    });
  } catch (err) {
    browserStreamStatus.value = err?.message
      || (type === "screen"
        ? "Нет доступа к экрану или WHIP недоступен"
        : "Нет доступа к камере/микрофону или WHIP недоступен");
  } finally {
    browserStreamBusy.value = false;
  }
}
</script>

<template>
  <div class="spa-stream-page">
    <div class="card">
      <div class="h">Подключение OBS</div>
      <div class="sub muted">Настройки > Трансляция > Служба: Настраиваемая. URL в Сервер, Ключ пустой.</div>
      <div v-if="streamLoadError" class="admin-err">{{ streamLoadError }}</div>
      <div v-else class="row">
        <input class="box mono" :value="streamSrtUrl" readonly style="flex:1;" />
        <button type="button" class="btn" @click="copySrtUrl">{{ streamCopyStatus || "Копировать" }}</button>
      </div>
      <div v-if="streamPath" class="tag muted">Ваш path: <span class="mono">{{ streamPath }}</span></div>

      <div class="stream-flex-wrap">
        <div class="stream-col">
          <div class="sub muted">Настройки кодирования (Output > Streaming):</div>
          <ul class="stream-settings-list">
            <li><strong>Encoder:</strong> H.264 or H.265 Nvidia NVENC (or CPU)</li>
            <li><strong>Bitrate type:</strong> CBR</li>
            <li><strong>Bitrate:</strong> 1080p60 = 8000 kbps · 1080p30 = 6000 kbps</li>
            <li><strong>Keyframe Interval:</strong> 2</li>
            <li><strong>Audio codec:</strong> FFMPEG OPUS</li>
            <li><strong>B-frames:</strong> 0</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="h">Трансляция из браузера</div>
      <div class="sub muted">Стримить камеру или экран без OBS, через WHIP.</div>
      <div class="row">
        <button
          type="button"
          :class="['btn', { streaming: browserStreaming }]"
          :disabled="browserStreamBusy"
          @click="toggleBrowserStream"
        >
          {{ browserStreaming ? "Остановить трансляцию" : "Начать трансляцию" }}
        </button>
      </div>
      <div v-if="browserStreamStatus" class="tag muted">{{ browserStreamStatus }}</div>
    </div>

    <BrowserStreamModal
      :show="browserStreamModal"
      :browser-stream-options="browserStreamOptions"
      @close="browserStreamModal = false"
      @start="startBrowserStream"
      @update:browser-stream-options="browserStreamOptions = $event"
    />
  </div>
</template>
