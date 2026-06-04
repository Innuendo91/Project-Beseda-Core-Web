<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { csrfFetch, getJson } from "../api.js";
import { useStreams } from "../composables/useStreams.js";
import AvatarCropModal from "../components/AvatarCropModal.vue";
import BrowserStreamModal from "../components/BrowserStreamModal.vue";

const profileTab = ref("profile");

const user = ref({
  displayName: "",
  nickColor: "#60a5fa",
  bio: "",
  avatar: "",
});

const profileStatus = ref("");
const profileSaving = ref(false);

const voiceSettings = ref({
  noiseSuppression: true,
  echoCancellation: true,
  autoGain: true,
  inputGain: 100,
  selfMonitor: true,
  selfMonitorDelayMs: 200,
  vadEnabled: false,
  vadThreshold: 10,
  vadHoldMs: 600,
  deviceId: "",
  chatNotifySound: true,
  chatMentionSound: true,
  pushEnabled: true,
});

const voiceStatus = ref("");
const voiceSaving = ref(false);

const notifyStatus = ref("");
const notifySaving = ref(false);

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

const micDevices = ref([]);
const isTesting = ref(false);
const meterRaw = ref(0);
const meterProc = ref(0);

const avatarPreview = computed(() => user.value.avatar || "");
const cropFile = ref(null);
const avatarInput = ref(null);

let meterRaf = null;
let meterCtxRaw = null;
let meterCtxProc = null;
let meterStreamRaw = null;
let meterStreamProc = null;
let meterAnalyserRaw = null;
let meterAnalyserProc = null;
let meterDataRaw = null;
let meterDataProc = null;
let meterGainProc = null;
let monitorDelay = null;
let monitorGain = null;

watch(profileTab, (tab) => {
  if (tab === "voice") {
    stopMeter();
  }
});

async function loadProfile() {
  try {
    const data = await getJson("/api/me");
    if (data.user) {
      user.value.displayName = data.user.displayName || "";
      user.value.nickColor = data.user.nickColor || "#60a5fa";
      user.value.bio = data.user.bio || "";
      user.value.avatar = data.user.avatar || "";
    }
  } catch {}
}

async function loadVoiceSettings() {
  try {
    const data = await getJson("/api/voice-settings");
    if (data.ok) {
      voiceSettings.value = { ...voiceSettings.value, ...data };
    }
  } catch {}
}

async function saveProfile() {
  profileSaving.value = true;
  profileStatus.value = "Сохранение...";
  try {
    const res = await csrfFetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: user.value.displayName,
        nickColor: user.value.nickColor,
        bio: user.value.bio,
        avatar: user.value.avatar,
      }),
    });
    if (!res.ok) throw new Error("bad");
    profileStatus.value = "Сохранено";
    setTimeout(() => { profileStatus.value = ""; }, 1200);
  } catch {
    profileStatus.value = "Ошибка";
  } finally {
    profileSaving.value = false;
  }
}

async function saveVoiceSettings() {
  voiceSaving.value = true;
  voiceStatus.value = "Сохранение...";
  try {
    const res = await csrfFetch("/api/voice-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noiseSuppression: voiceSettings.value.noiseSuppression,
        echoCancellation: voiceSettings.value.echoCancellation,
        autoGain: voiceSettings.value.autoGain,
        inputGain: Number(voiceSettings.value.inputGain),
        selfMonitor: voiceSettings.value.selfMonitor,
        selfMonitorDelayMs: Number(voiceSettings.value.selfMonitorDelayMs),
        vadEnabled: voiceSettings.value.vadEnabled,
        vadThreshold: Number(voiceSettings.value.vadThreshold),
        vadHoldMs: Number(voiceSettings.value.vadHoldMs),
        deviceId: voiceSettings.value.deviceId,
        chatNotifySound: voiceSettings.value.chatNotifySound,
        chatMentionSound: voiceSettings.value.chatMentionSound,
        pushEnabled: voiceSettings.value.pushEnabled,
      }),
    });
    if (!res.ok) throw new Error("bad");
    voiceStatus.value = "Сохранено";
    setTimeout(() => { voiceStatus.value = ""; }, 1200);
  } catch {
    voiceStatus.value = "Ошибка";
  } finally {
    voiceSaving.value = false;
  }
}

async function saveNotifySettings() {
  notifySaving.value = true;
  notifyStatus.value = "Сохранение...";
  try {
    const res = await csrfFetch("/api/voice-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noiseSuppression: voiceSettings.value.noiseSuppression,
        echoCancellation: voiceSettings.value.echoCancellation,
        autoGain: voiceSettings.value.autoGain,
        inputGain: Number(voiceSettings.value.inputGain),
        selfMonitor: voiceSettings.value.selfMonitor,
        selfMonitorDelayMs: Number(voiceSettings.value.selfMonitorDelayMs),
        vadEnabled: voiceSettings.value.vadEnabled,
        vadThreshold: Number(voiceSettings.value.vadThreshold),
        vadHoldMs: Number(voiceSettings.value.vadHoldMs),
        deviceId: voiceSettings.value.deviceId,
        chatNotifySound: voiceSettings.value.chatNotifySound,
        chatMentionSound: voiceSettings.value.chatMentionSound,
        pushEnabled: voiceSettings.value.pushEnabled,
      }),
    });
    if (!res.ok) throw new Error("bad");
    notifyStatus.value = "Сохранено";
    setTimeout(() => { notifyStatus.value = ""; }, 1200);
  } catch {
    notifyStatus.value = "Ошибка";
  } finally {
    notifySaving.value = false;
  }
}

async function handleAvatarUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 1000000) {
    profileStatus.value = "Файл слишком большой (макс. 1 Мб)";
    return;
  }
  cropFile.value = file;
  if (avatarInput.value) avatarInput.value.value = "";
}

function onAvatarCropped(dataUrl) {
  user.value.avatar = dataUrl;
  cropFile.value = null;
}

function onCropClosed() {
  cropFile.value = null;
}

async function ensureMicPermission() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    s.getTracks().forEach(t => t.stop());
  } catch {}
}

async function loadDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter(d => d.kind === "audioinput");
  micDevices.value = inputs.map((d, i) => ({
    deviceId: d.deviceId,
    label: d.label || `Микрофон ${i + 1}`,
  }));
  if (!voiceSettings.value.deviceId && micDevices.value.length > 0) {
    voiceSettings.value.deviceId = micDevices.value[0].deviceId;
  }
}

function calcMeter(analyser, data) {
  if (!analyser || !data) return 0;
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / data.length);
  return Math.min(1, rms * 2.5);
}

function updateMeter() {
  meterRaw.value = Math.round(calcMeter(meterAnalyserRaw, meterDataRaw) * 100);
  meterProc.value = Math.round(calcMeter(meterAnalyserProc, meterDataProc) * 100);
  meterRaf = requestAnimationFrame(updateMeter);
}

function stopMeter() {
  if (meterRaf) cancelAnimationFrame(meterRaf);
  meterRaf = null;
  if (meterStreamRaw) { meterStreamRaw.getTracks().forEach(t => t.stop()); meterStreamRaw = null; }
  if (meterStreamProc) { meterStreamProc.getTracks().forEach(t => t.stop()); meterStreamProc = null; }
  try { meterCtxRaw?.close(); } catch {}
  try { meterCtxProc?.close(); } catch {}
  meterCtxRaw = null;
  meterCtxProc = null;
  meterAnalyserRaw = null;
  meterAnalyserProc = null;
  meterDataRaw = null;
  meterDataProc = null;
  meterGainProc = null;
  monitorDelay = null;
  monitorGain = null;
  meterRaw.value = 0;
  meterProc.value = 0;
  isTesting.value = false;
}

async function toggleTest() {
  if (isTesting.value) {
    stopMeter();
    return;
  }
  await ensureMicPermission();
  try {
    const deviceId = voiceSettings.value.deviceId;
    const rawAudio = deviceId
      ? { deviceId: { exact: deviceId }, noiseSuppression: false, echoCancellation: false, autoGainControl: false }
      : { noiseSuppression: false, echoCancellation: false, autoGainControl: false };
    const procAudio = deviceId
      ? { deviceId: { exact: deviceId }, noiseSuppression: voiceSettings.value.noiseSuppression, echoCancellation: voiceSettings.value.echoCancellation, autoGainControl: voiceSettings.value.autoGain }
      : { noiseSuppression: voiceSettings.value.noiseSuppression, echoCancellation: voiceSettings.value.echoCancellation, autoGainControl: voiceSettings.value.autoGain };

    try { meterStreamRaw = await navigator.mediaDevices.getUserMedia({ audio: rawAudio, video: false }); } catch {}
    try { meterStreamProc = await navigator.mediaDevices.getUserMedia({ audio: procAudio, video: false }); } catch {}

    if (!meterStreamRaw && !meterStreamProc) throw new Error("no stream");

    if (meterStreamRaw) {
      meterCtxRaw = new (window.AudioContext || window.webkitAudioContext)();
      const sourceRaw = meterCtxRaw.createMediaStreamSource(meterStreamRaw);
      meterAnalyserRaw = meterCtxRaw.createAnalyser();
      meterAnalyserRaw.fftSize = 512;
      meterDataRaw = new Uint8Array(meterAnalyserRaw.fftSize);
      sourceRaw.connect(meterAnalyserRaw);
    }

    if (meterStreamProc) {
      meterCtxProc = new (window.AudioContext || window.webkitAudioContext)();
      const sourceProc = meterCtxProc.createMediaStreamSource(meterStreamProc);
      meterGainProc = meterCtxProc.createGain();
      meterGainProc.gain.value = Number(voiceSettings.value.inputGain || 100) / 100;
      meterAnalyserProc = meterCtxProc.createAnalyser();
      meterAnalyserProc.fftSize = 512;
      meterDataProc = new Uint8Array(meterAnalyserProc.fftSize);
      sourceProc.connect(meterGainProc);
      meterGainProc.connect(meterAnalyserProc);
      monitorDelay = meterCtxProc.createDelay(2.0);
      monitorGain = meterCtxProc.createGain();
      monitorGain.gain.value = 1.0;
      if (voiceSettings.value.selfMonitor) {
        monitorDelay.delayTime.value = Math.max(0, Math.min(2.0, Number(voiceSettings.value.selfMonitorDelayMs || 200) / 1000));
        meterGainProc.connect(monitorDelay);
        monitorDelay.connect(monitorGain);
        monitorGain.connect(meterCtxProc.destination);
      }
    }

    isTesting.value = true;
    updateMeter();
  } catch {
    stopMeter();
  }
}

async function refreshDevices() {
  await ensureMicPermission();
  await loadDevices();
}

function onGainInput() {
  if (meterGainProc) {
    meterGainProc.gain.value = Number(voiceSettings.value.inputGain || 100) / 100;
  }
}

function onSelfMonitorChange() {
  if (!meterGainProc || !monitorDelay || !monitorGain || !meterCtxProc) return;
  try { monitorGain.disconnect(); } catch {}
  try { monitorDelay.disconnect(); } catch {}
  if (voiceSettings.value.selfMonitor) {
    monitorDelay.delayTime.value = Math.max(0, Math.min(2.0, Number(voiceSettings.value.selfMonitorDelayMs || 200) / 1000));
    meterGainProc.connect(monitorDelay);
    monitorDelay.connect(monitorGain);
    monitorGain.connect(meterCtxProc.destination);
  }
}

function onSelfMonitorDelayInput() {
  if (monitorDelay) {
    monitorDelay.delayTime.value = Math.max(0, Math.min(2.0, Number(voiceSettings.value.selfMonitorDelayMs || 200) / 1000));
  }
}

onMounted(async () => {
  await loadProfile();
  await loadVoiceSettings();
  await loadDevices();
  await loadStreamConfig();
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
});

onUnmounted(() => {
  stopMeter();
});
</script>

<template>
  <div class="panel profile-panel">
    <div class="panel-head">
      <div>Профиль</div>
    </div>

    <div class="admin-tabs-bar" role="tablist">
      <button type="button" class="admin-tab-btn" :class="{ active: profileTab === 'profile' }" @click="profileTab = 'profile'">
        Данные профиля
      </button>
      <button type="button" class="admin-tab-btn" :class="{ active: profileTab === 'voice' }" @click="profileTab = 'voice'">
        Настройки микрофона
      </button>
      <button type="button" class="admin-tab-btn" :class="{ active: profileTab === 'notify' }" @click="profileTab = 'notify'">
        Настройка уведомлений
      </button>
      <button type="button" class="admin-tab-btn" :class="{ active: profileTab === 'stream' }" @click="profileTab = 'stream'">
        Стрим
      </button>
    </div>

    <div class="admin-body">
      <div v-if="profileTab === 'profile'" class="profile-form">
        <div class="profile-avatar-section">
          <img v-if="avatarPreview" class="profile-avatar-preview" :src="avatarPreview" alt="Avatar" />
          <div v-else class="profile-avatar-preview profile-avatar-empty">{{ (user.displayName || user.username || "?")[0]?.toUpperCase() || "?" }}</div>
          <input type="file" accept="image/*" @change="handleAvatarUpload" ref="avatarInput" />
        </div>

        <div class="profile-fields">
          <div class="field">
            <label class="field-label">Отображаемое имя</label>
            <input class="box" type="text" v-model="user.displayName" placeholder="Ваше имя" maxlength="64" />
          </div>
          <div class="field">
            <label class="field-label">Цвет ника</label>
            <input class="box box-color" type="color" v-model="user.nickColor" />
          </div>
          <div class="field">
            <label class="field-label">Био</label>
            <textarea class="box" v-model="user.bio" placeholder="Расскажите о себе" maxlength="500" rows="3"></textarea>
          </div>
        </div>

        <div class="profile-footer">
          <button type="button" class="btn" :disabled="profileSaving" @click="saveProfile">
            {{ profileSaving ? "Сохранение..." : "Сохранить" }}
          </button>
          <span class="muted">{{ profileStatus }}</span>
        </div>
      </div>

      <div v-if="profileTab === 'voice'">
        <div class="sub muted" style="margin-bottom:12px">Сохраняются в профиле и применяются при подключении.</div>

        <div class="vs-device-bar">
          <div class="vs-device-left">
            <label class="vs-label">Микрофон</label>
            <div class="vs-device-selects">
              <select class="vs-select" v-model="voiceSettings.deviceId">
                <option v-for="dev in micDevices" :key="dev.deviceId" :value="dev.deviceId">{{ dev.label }}</option>
              </select>
              <button type="button" class="vs-icon-btn" @click="refreshDevices" title="Обновить">&#219;</button>
            </div>
          </div>
          <button type="button" class="btn vs-test-btn" @click="toggleTest">
            {{ isTesting ? "Стоп" : "Тест" }}
          </button>
        </div>

        <div class="vs-meters">
          <div class="vs-meter-row">
            <span class="vs-meter-label">До обработки</span>
            <div class="vs-meter-track">
              <div class="vs-meter-fill vs-meter-raw" :style="{ width: meterRaw + '%' }"></div>
            </div>
            <span class="mono muted vs-meter-val">{{ meterRaw }}%</span>
          </div>
          <div class="vs-meter-row">
            <span class="vs-meter-label">После обработки</span>
            <div class="vs-meter-track">
              <div class="vs-meter-fill vs-meter-proc" :style="{ width: meterProc + '%' }"></div>
            </div>
            <span class="mono muted vs-meter-val">{{ meterProc }}%</span>
          </div>
        </div>

        <div class="vs-columns">
          <div class="vs-col vs-col-left">
            <div class="vs-section-title">Обработка аудио</div>
            <div class="vs-checks">
              <label class="vs-check">
                <input type="checkbox" v-model="voiceSettings.noiseSuppression" @change="toggleTest" />
                <span class="vs-check-box"></span>
                <div class="vs-check-text">
                  <span class="vs-check-label">Noise suppression</span>
                  <span class="vs-check-desc">Подавление шума</span>
                </div>
              </label>
              <label class="vs-check">
                <input type="checkbox" v-model="voiceSettings.echoCancellation" @change="toggleTest" />
                <span class="vs-check-box"></span>
                <div class="vs-check-text">
                  <span class="vs-check-label">Echo cancellation</span>
                  <span class="vs-check-desc">Подавление эха</span>
                </div>
              </label>
              <label class="vs-check">
                <input type="checkbox" v-model="voiceSettings.autoGain" @change="toggleTest" />
                <span class="vs-check-box"></span>
                <div class="vs-check-text">
                  <span class="vs-check-label">Auto gain</span>
                  <span class="vs-check-desc">Автоматическая громкость</span>
                </div>
              </label>
              <label class="vs-check">
                <input type="checkbox" v-model="voiceSettings.selfMonitor" @change="onSelfMonitorChange" />
                <span class="vs-check-box"></span>
                <div class="vs-check-text">
                  <span class="vs-check-label">Мониторинг себя</span>
                  <span class="vs-check-desc">Слышать себя в наушниках</span>
                </div>
              </label>
              <label class="vs-check">
                <input type="checkbox" v-model="voiceSettings.vadEnabled" />
                <span class="vs-check-box"></span>
                <div class="vs-check-text">
                  <span class="vs-check-label">Активация по голосу</span>
                  <span class="vs-check-desc">Передача только при разговоре</span>
                </div>
              </label>
            </div>
          </div>

          <div class="vs-col vs-col-right">
            <div class="vs-section-title">Параметры</div>
            <div class="vs-sliders">
              <div class="vs-slider-group">
                <div class="vs-slider-head">
                  <span class="vs-slider-label">Input gain</span>
                  <span class="mono muted">{{ voiceSettings.inputGain }}%</span>
                </div>
                <input class="vs-range" type="range" min="0" max="200" step="1" v-model.number="voiceSettings.inputGain" @input="onGainInput" />
              </div>
              <div class="vs-slider-group">
                <div class="vs-slider-head">
                  <span class="vs-slider-label">Задержка мониторинга</span>
                  <span class="mono muted">{{ voiceSettings.selfMonitorDelayMs }} ms</span>
                </div>
                <input class="vs-range" type="range" min="0" max="2000" step="10" v-model.number="voiceSettings.selfMonitorDelayMs" @input="onSelfMonitorDelayInput" />
              </div>
              <div class="vs-slider-group">
                <div class="vs-slider-head">
                  <span class="vs-slider-label">Порог голоса (VAD)</span>
                  <span class="mono muted">{{ voiceSettings.vadThreshold }}%</span>
                </div>
                <input class="vs-range" type="range" min="0" max="100" step="1" v-model.number="voiceSettings.vadThreshold" />
              </div>
              <div class="vs-slider-group">
                <div class="vs-slider-head">
                  <span class="vs-slider-label">VAD hold</span>
                  <span class="mono muted">{{ voiceSettings.vadHoldMs }} ms</span>
                </div>
                <input class="vs-range" type="range" min="0" max="2000" step="50" v-model.number="voiceSettings.vadHoldMs" />
              </div>
            </div>
          </div>
        </div>

        <div class="vs-footer">
          <button type="button" class="btn vs-save-btn" :disabled="voiceSaving" @click="saveVoiceSettings">
            {{ voiceSaving ? "Сохранение..." : "Сохранить" }}
          </button>
          <span class="muted">{{ voiceStatus }}</span>
        </div>
      </div>

      <div v-if="profileTab === 'notify'">
        <div class="sub muted" style="margin-bottom:16px">Настройки звуковых и push-уведомлений.</div>

        <div class="vs-checks">
          <label class="vs-check">
            <input type="checkbox" v-model="voiceSettings.chatNotifySound" />
            <span class="vs-check-box"></span>
            <div class="vs-check-text">
              <span class="vs-check-label">Звук новых сообщений</span>
              <span class="vs-check-desc">Звуковой сигнал при любом сообщении в чате</span>
            </div>
          </label>
          <label class="vs-check">
            <input type="checkbox" v-model="voiceSettings.chatMentionSound" />
            <span class="vs-check-box"></span>
            <div class="vs-check-text">
              <span class="vs-check-label">Звук упоминания</span>
              <span class="vs-check-desc">Отдельный звук при @упоминании в чате</span>
            </div>
          </label>
          <label class="vs-check">
            <input type="checkbox" v-model="voiceSettings.pushEnabled" />
            <span class="vs-check-box"></span>
            <div class="vs-check-text">
              <span class="vs-check-label">Push-уведомления</span>
              <span class="vs-check-desc">Браузерные уведомления, когда вкладка не активна</span>
            </div>
          </label>
        </div>

        <div class="vs-footer">
          <button type="button" class="btn vs-save-btn" :disabled="notifySaving" @click="saveNotifySettings">
            {{ notifySaving ? "Сохранение..." : "Сохранить" }}
          </button>
          <span class="muted">{{ notifyStatus }}</span>
        </div>
      </div>

      <div v-if="profileTab === 'stream'">
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
    </div>
  </div>

  <AvatarCropModal
    :file="cropFile"
    @cropped="onAvatarCropped"
    @closed="onCropClosed"
  />
</template>

<style scoped>
.profile-panel {
  min-height: calc(100vh - 220px);
}
.profile-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.profile-avatar-section {
  display: flex;
  align-items: center;
  gap: 12px;
}
.profile-avatar-preview {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border);
}
.profile-avatar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: var(--muted);
  background: rgba(42,36,32,.6);
}
.profile-avatar-section input[type="file"] {
  font-size: 13px;
  color: var(--muted);
}
.profile-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 13px;
  color: var(--muted);
}
.box {
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: 4px;
  font-size: 14px;
  outline: none;
}
.box:focus {
  border-color: rgba(255,255,255,.25);
}
.box-color {
  width: 60px;
  height: 36px;
  padding: 2px;
  cursor: pointer;
}
.profile-footer {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
