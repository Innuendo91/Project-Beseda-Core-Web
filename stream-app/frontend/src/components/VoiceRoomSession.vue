<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import { csrfFetch } from "../api.js";

const props = defineProps({
  room: { type: Object, required: true },
});

const emit = defineEmits(["close"]);

const status = ref("подключение...");
const members = ref([]);
const isMuted = ref(false);
const deviceName = ref("…");
const selfSpeaking = ref(false);

const roomName = computed(() => props.room?.name || "Комната");

let ws = null;
let device = null;
let sendTransport = null;
let recvTransport = null;
let localStream = null;
let localTrack = null;
let gainCtx = null;
let gainSource = null;
let gainDest = null;
let vadCtx = null;
let vadAnalyser = null;
let vadData = null;
let vadRaf = null;
let vadLastVoiceTs = 0;
let vadOpen = true;
let selfPeerId = null;
const remoteAudios = new Map();
const producerPeerMap = new Map();
const remoteVad = new Map();
let remoteVadCtx = null;
const pendingProducers = new Set();
const consuming = new Set();
const membersMap = new Map();
let voiceJoinSoundUrl = "";
let voiceLeaveSoundUrl = "";
let vadEnabled = false;
let vadThreshold = 15;
let vadHoldMs = 600;
let inputGain = 100;
let autoGainControl = true;
let noiseSuppression = true;
let echoCancellation = true;
let preferredDeviceId = "";
const selfLabel = ref("");

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function setStatus(msg) {
  status.value = msg || "";
}

function renderMembers() {
  const list = [...membersMap.entries()]
    .map(([peerId, data]) => ({ peerId, username: data?.username || "user" }))
    .sort((a, b) => a.username.localeCompare(b.username, "ru"));
  members.value = list;
  updateSelfSpeaking();
}

function setSelfSpeaking(on) {
  selfSpeaking.value = !!on;
}

function setRemoteSpeaking(peerId, on) {
  if (!peerId) return;
  members.value = members.value.map((m) =>
    m.peerId === peerId ? { ...m, speaking: on } : m
  );
}

function updateSelfSpeaking() {
  if (!localTrack) return;
  const speaking = !isMuted.value && (vadEnabled ? vadOpen : true);
  setSelfSpeaking(speaking);
}

async function resolveDeviceName(actualId) {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === "audioinput");
    const lookupId = actualId || preferredDeviceId;
    const matched = inputs.find((d) => d.deviceId === lookupId);
    if (matched) {
      deviceName.value = matched.label || "Микрофон";
    } else if (inputs.length > 0) {
      deviceName.value = inputs[0].label || "Микрофон";
    } else {
      deviceName.value = "не выбран";
    }
  } catch {
    deviceName.value = "недоступно";
  }
}

function wsSend(ws, type, data) {
  ws.send(JSON.stringify({ type, data }));
}

async function getVoiceToken(roomSlug) {
  const storedPass = sessionStorage.getItem(`voiceRoomPass:${roomSlug}`) || "";
  const r = await csrfFetch("/api/voice/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomSlug, pass: storedPass }),
  });
  const ct = r.headers.get("content-type") || "";
  const text = await r.text();
  if (!r.ok) throw Object.assign(new Error(text.slice(0, 200)), { status: r.status });
  if (!ct.includes("application/json")) throw Object.assign(new Error("token is not JSON"), { status: 502 });
  return JSON.parse(text).token;
}

async function loadVoiceSettings() {
  try {
    const r = await csrfFetch("/api/voice-settings");
    if (r.ok) {
      const data = await r.json();
      const s = data.settings || data;
      if (s.deviceId !== undefined || s.noiseSuppression !== undefined) {
        noiseSuppression = s.noiseSuppression !== false;
        echoCancellation = s.echoCancellation !== false;
        autoGainControl = s.autoGain !== false;
        inputGain = Number.isFinite(Number(s.inputGain)) ? Number(s.inputGain) : 100;
        vadEnabled = s.vadEnabled === true;
        vadThreshold = Number.isFinite(Number(s.vadThreshold)) ? Number(s.vadThreshold) : 10;
        vadHoldMs = Number.isFinite(Number(s.vadHoldMs)) ? Number(s.vadHoldMs) : 600;
        preferredDeviceId = String(s.deviceId || "").trim();
      }
    }
  } catch {}
  try {
    const r = await csrfFetch("/api/me");
    if (r.ok) {
      const data = await r.json();
      selfLabel.value = data.user?.username || "";
    }
  } catch {}
}

async function loadNotifySounds() {
  try {
    const r = await csrfFetch("/api/notify-sounds");
    const d = await r.json();
    if (d.ok) {
      if (d.voiceJoinSound) voiceJoinSoundUrl = "/public/notify_sounds/" + encodeURIComponent(d.voiceJoinSound);
      if (d.voiceLeaveSound) voiceLeaveSoundUrl = "/public/notify_sounds/" + encodeURIComponent(d.voiceLeaveSound);
    }
  } catch {}
}

function playVoiceSound(url) {
  if (!url) return;
  try { const a = new Audio(url + "?t=" + Date.now()); a.volume = 0.5; a.play().catch(() => {}); } catch {}
}

function setTrackEnabled(enabled) {
  if (!localTrack) return;
  const want = !isMuted.value && enabled;
  if (localTrack.enabled !== want) localTrack.enabled = want;
}

function startVad() {
  if (!vadEnabled || !localStream) return;
  try {
    vadCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = vadCtx.createMediaStreamSource(localStream);
    vadAnalyser = vadCtx.createAnalyser();
    vadAnalyser.fftSize = 512;
    vadData = new Uint8Array(vadAnalyser.fftSize);
    source.connect(vadAnalyser);
  } catch { return; }
  vadLastVoiceTs = performance.now();
  const threshold = Math.max(0, Math.min(100, vadThreshold)) / 100;
  const holdMs = Math.max(0, Math.min(2000, vadHoldMs));
  const loop = () => {
    if (!vadAnalyser || !vadData) return;
    vadAnalyser.getByteTimeDomainData(vadData);
    let sum = 0;
    for (let i = 0; i < vadData.length; i++) {
      const v = (vadData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / vadData.length);
    const level = Math.min(1, rms * 2.5);
    const now = performance.now();
    if (level >= threshold) {
      vadLastVoiceTs = now;
      vadOpen = true;
    } else if (now - vadLastVoiceTs > holdMs) {
      vadOpen = false;
    }
    setTrackEnabled(vadOpen);
    setSelfSpeaking(vadOpen && !isMuted.value);
    vadRaf = requestAnimationFrame(loop);
  };
  loop();
}

async function startRemoteVad(producerId, stream) {
  const peerId = producerPeerMap.get(producerId);
  if (!peerId) return;
  try {
    if (!remoteVadCtx) {
      remoteVadCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (remoteVadCtx.state === "suspended") {
      try { await remoteVadCtx.resume(); } catch {}
    }
    const source = remoteVadCtx.createMediaStreamSource(stream);
    const analyser = remoteVadCtx.createAnalyser();
    analyser.fftSize = 512;
    const data = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    const lastVoiceTs = { val: performance.now() };
    const rafVal = { val: null };
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, rms * 2.5);
      const now = performance.now();
      if (level >= 0.05) {
        lastVoiceTs.val = now;
        setRemoteSpeaking(peerId, true);
      } else if (now - lastVoiceTs.val > 400) {
        setRemoteSpeaking(peerId, false);
      }
      rafVal.val = requestAnimationFrame(loop);
    };
    rafVal.val = requestAnimationFrame(loop);
    remoteVad.set(producerId, { raf: rafVal });
  } catch (e) {
    console.log("[voice-session] remoteVad error:", e.message);
  }
}

function consumeProducer(producerId) {
  if (!device || !recvTransport || !producerId) return;
  if (consuming.has(producerId)) return;
  consuming.add(producerId);
  wsSend(ws, "consume", {
    transportId: recvTransport.id,
    producerId,
    rtpCapabilities: device.rtpCapabilities,
  });
}

async function cleanup() {
  try { ws?.close(); } catch {}
  try { sendTransport?.close(); } catch {}
  try { recvTransport?.close(); } catch {}
  if (localStream) { for (const t of localStream.getTracks()) t.stop(); }
  if (gainDest) { for (const t of gainDest.stream.getTracks()) t.stop(); }
  try { gainCtx?.close(); } catch {}
  gainCtx = null; gainSource = null; gainDest = null;
  if (vadRaf) cancelAnimationFrame(vadRaf);
  vadRaf = null;
  try { vadCtx?.close(); } catch {}
  vadCtx = null; vadAnalyser = null; vadData = null;
  vadLastVoiceTs = 0; vadOpen = true;
  setSelfSpeaking(false);
  for (const [pid, v] of remoteVad.entries()) {
    try { cancelAnimationFrame(v.raf?.val); } catch {}
  }
  remoteVad.clear();
  try { remoteVadCtx?.close(); } catch {}
  remoteVadCtx = null;
}

function toggleMute() {
  if (!localTrack) return;
  isMuted.value = !isMuted.value;
  if (isMuted.value) {
    localTrack.enabled = false;
  } else {
    setTrackEnabled(vadEnabled ? vadOpen : true);
  }
  if (!vadEnabled) updateSelfSpeaking();
  if (vadEnabled) setSelfSpeaking(vadOpen && !isMuted.value);
}

function handleLeave() {
  cleanup();
  emit("close");
}

async function init() {
  const slug = props.room.latinSlug || props.room.slug;
  if (!slug) { setStatus("некорректная комната"); return; }

  await Promise.all([loadVoiceSettings(), loadNotifySounds()]);

  let mediasoupClient;
  try {
    setStatus("загрузка…");
    const mod = await Promise.race([
      import("/public/mediasoup-client.js"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("таймаут загрузки")), 15000)),
    ]);
    mediasoupClient = mod;
  } catch (e) {
    setStatus("ошибка загрузки: " + e.message);
    return;
  }

  let token;
  try {
    setStatus("запрос токена…");
    token = await getVoiceToken(slug);
  } catch (e) {
    const code = e.status;
    if (code === 403) {
      const pass = window.prompt("Введите пароль комнаты");
      if (!pass) { setStatus("нужен пароль"); return; }
      sessionStorage.setItem(`voiceRoomPass:${slug}`, pass);
      try {
        token = await getVoiceToken(slug);
      } catch (e2) {
        setStatus(e2.status === 403 ? "неверный пароль" : `ошибка токена: ${String(e2.message || e2).slice(0, 120)}`);
        return;
      }
    } else if (code === 404) {
      setStatus("комната не найдена");
      return;
    } else {
      setStatus(`ошибка: ${(e.message || "сетевая ошибка").slice(0, 120)}`);
      return;
    }
  }

  const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/voice/";
  ws = new WebSocket(wsUrl);

  let wsConnected = false;
  const wsTimeout = setTimeout(() => {
    if (!wsConnected) {
      wsConnected = true;
      try { ws.close(); } catch {}
      setStatus("таймаут подключения");
    }
  }, 15000);

  let authTimeout = null;

  ws.onopen = () => {
    wsConnected = true;
    clearTimeout(wsTimeout);
    setStatus("аутентификация…");
    wsSend(ws, "auth", { token });
    authTimeout = setTimeout(() => {
      if (selfPeerId === null) {
        try { ws.close(); } catch {}
        setStatus("таймаут аутентификации");
      }
    }, 10000);
  };

  ws.onclose = (e) => {
    clearTimeout(wsTimeout);
    clearTimeout(authTimeout);
    if (!wsConnected) { setStatus("не удалось подключиться"); return; }
    if (e.code === 4002 || e.reason?.includes("Voice server")) {
      setStatus("сервер голоса недоступен");
    } else if (e.code === 1006) {
      setStatus("соединение разорвано");
    } else {
      setStatus("соединение закрыто");
    }
  };

  ws.onerror = (e) => {
    clearTimeout(wsTimeout);
    if (!wsConnected) { setStatus("ошибка соединения"); }
  };

  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    const { type, data } = msg;

    if (type === "authed") {
      clearTimeout(authTimeout);
      setStatus("подключено");
      selfPeerId = data?.peerId || null;
      membersMap.clear();
      if (Array.isArray(data?.peers)) {
        for (const p of data.peers) {
          membersMap.set(p.peerId, { username: p.username || "user" });
          for (const producerId of p?.producers || []) {
            pendingProducers.add(producerId);
            producerPeerMap.set(producerId, p.peerId);
          }
        }
        const hasSelf = selfLabel.value && [...membersMap.values()].some(
          (m) => String(m.username || "").toLowerCase() === selfLabel.value.toLowerCase()
        );
        if (!hasSelf) membersMap.set(selfPeerId || "self", { username: selfLabel.value || "вы" });
        renderMembers();
      }
      wsSend(ws, "getRouterRtpCapabilities", {});
      return;
    }

    if (type === "peerJoined") {
      membersMap.set(data?.peerId, { username: data?.username || "user" });
      renderMembers();
      playVoiceSound(voiceJoinSoundUrl);
      return;
    }

    if (type === "peerLeft") {
      membersMap.delete(data?.peerId);
      setRemoteSpeaking(data?.peerId, false);
      renderMembers();
      playVoiceSound(voiceLeaveSoundUrl);
      return;
    }

    if (type === "routerRtpCapabilities") {
      device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: data });
      wsSend(ws, "createWebRtcTransport", { direction: "send" });
      wsSend(ws, "createWebRtcTransport", { direction: "recv" });
      return;
    }

    if (type === "webRtcTransportCreated") {
      const { direction, transportOptions } = data;

      if (direction === "send") {
        sendTransport = device.createSendTransport(transportOptions);

        sendTransport.on("connect", ({ dtlsParameters }, cb) => {
          wsSend(ws, "connectWebRtcTransport", { transportId: sendTransport.id, dtlsParameters });
          cb();
        });

        sendTransport.on("produce", ({ kind, rtpParameters, appData }, cb) => {
          wsSend(ws, "produce", { transportId: sendTransport.id, kind, rtpParameters, appData });
          const handler = (ev2) => {
            const m2 = JSON.parse(ev2.data);
            if (m2.type === "produced") {
              ws.removeEventListener("message", handler);
              cb({ id: m2.data.producerId });
            }
          };
          ws.addEventListener("message", handler);
        });

        let tryConstraints = preferredDeviceId
          ? { deviceId: { exact: preferredDeviceId }, noiseSuppression, echoCancellation, autoGainControl }
          : { noiseSuppression, echoCancellation, autoGainControl };
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: tryConstraints, video: false });
        } catch (e) {
          if (preferredDeviceId) {
            tryConstraints = { noiseSuppression, echoCancellation, autoGainControl };
            localStream = await navigator.mediaDevices.getUserMedia({ audio: tryConstraints, video: false });
          } else {
            setStatus("нет доступа к микрофону");
            return;
          }
        }
        const actualTrack = localStream.getAudioTracks()[0];
        const actualDeviceId = actualTrack?.settings?.deviceId || "";
        setTimeout(() => resolveDeviceName(actualDeviceId).catch(() => {}), 200);
        let track = actualTrack;
        if (track && (vadEnabled || inputGain !== 100)) {
          gainCtx = new (window.AudioContext || window.webkitAudioContext)();
          gainSource = gainCtx.createMediaStreamSource(localStream);
          const gainNode = gainCtx.createGain();
          gainNode.gain.value = (!autoGainControl && Number.isFinite(inputGain)) ? (inputGain / 100) : 1.0;
          gainDest = gainCtx.createMediaStreamDestination();
          gainSource.connect(gainNode);
          gainNode.connect(gainDest);
          track = gainDest.stream.getAudioTracks()[0];
        }
        localTrack = track;
        if (vadEnabled) {
          startVad();
        } else {
          setTrackEnabled(true);
          updateSelfSpeaking();
        }
        await sendTransport.produce({ track });
      }

      if (direction === "recv") {
        recvTransport = device.createRecvTransport(transportOptions);

        recvTransport.on("connect", ({ dtlsParameters }, cb) => {
          wsSend(ws, "connectWebRtcTransport", { transportId: recvTransport.id, dtlsParameters });
          cb();
        });

        for (const producerId of pendingProducers) consumeProducer(producerId);
        pendingProducers.clear();
      }
      return;
    }

    if (type === "newProducer") {
      const { producerId, peerId } = data || {};
      if (!producerId) return;
      if (peerId) producerPeerMap.set(producerId, peerId);
      if (!recvTransport) { pendingProducers.add(producerId); return; }
      consumeProducer(producerId);
      return;
    }

    if (type === "consuming") {
      const { consumerOptions } = data;
      if (!recvTransport || !consumerOptions) return;
      const consumer = await recvTransport.consume(consumerOptions);
      const stream = new MediaStream([consumer.track]);

      if (!remoteAudios.has(consumerOptions.producerId)) {
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.srcObject = stream;
        audio.hidden = true;
        document.body.appendChild(audio);
        remoteAudios.set(consumerOptions.producerId, audio);
        audio.play().catch(() => {});
        startRemoteVad(consumerOptions.producerId, stream);
      }

      wsSend(ws, "resume", { consumerId: consumer.id });
      return;
    }

    if (type === "error") {
      setStatus(`ошибка: ${data?.code || "ERR"} ${data?.message || ""}`.trim());
    }
  };

  document.addEventListener("click", () => {
    for (const a of remoteAudios.values()) { a.play().catch(() => {}); }
    if (remoteVadCtx && remoteVadCtx.state === "suspended") remoteVadCtx.resume().catch(() => {});
  }, { once: true });
}

onMounted(() => {
  init();
});

onUnmounted(() => {
  cleanup();
});
</script>

<template>
  <div class="voice-session-inline">
    <div class="voice-session-head">
      <span class="voice-session-title">🎙️ {{ roomName }}</span>
      <button type="button" class="voice-session-close" title="Закрыть" @click="handleLeave">✕</button>
    </div>

    <div class="voice-session-status" :class="{ 'voice-session-status--connected': status === 'подключено' }">
      {{ status }}
    </div>

    <div class="voice-session-device">
      <span class="voice-session-device-icon">🎤</span>
      <span class="voice-session-device-name">{{ deviceName }}</span>
    </div>

    <div class="voice-session-members">
      <div v-if="members.length === 0" class="voice-session-members-empty">
        никого
      </div>
      <template v-else>
        <div
          v-for="m in members"
          :key="m.peerId"
          class="voice-session-pill"
          :class="{
            'voice-session-pill--self': m.username.toLowerCase() === selfLabel.toLowerCase(),
            'voice-session-pill--speaking': m.speaking,
            'voice-session-pill--self-speaking': m.username.toLowerCase() === selfLabel.toLowerCase() && selfSpeaking,
          }"
          :data-peer="m.peerId"
        >
          <span class="voice-session-pill-name">{{ m.username }}</span>
        </div>
      </template>
    </div>

    <div class="voice-session-footer">
      <button
        type="button"
        class="voice-session-mute"
        :class="{ 'voice-session-mute--active': isMuted }"
        @click="toggleMute"
      >
        {{ isMuted ? "🔇 Включить" : "🎤 Выкл." }}
      </button>
      <button type="button" class="voice-session-leave" @click="handleLeave">
        Выйти
      </button>
    </div>
  </div>
</template>

<style scoped>
.voice-session-inline {
  display: flex;
  flex-direction: column;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color: var(--text);
}
.voice-session-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.voice-session-title {
  font-weight: 800;
  font-size: 14px;
}
.voice-session-close {
  background: none !important;
  border: none !important;
  color: var(--muted) !important;
  font-size: 18px;
  cursor: pointer;
  padding: 2px 6px !important;
  margin: 0 !important;
  width: 28px !important;
  height: 28px !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  min-width: auto !important;
}
.voice-session-close:hover {
  color: var(--text) !important;
  background: var(--btn) !important;
}
.voice-session-status {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}
.voice-session-status--connected {
  color: #22c55e;
}
.voice-session-device {
  padding: 4px 12px;
  font-size: 11px;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 6px;
}
.voice-session-device-icon {
  font-size: 12px;
  flex-shrink: 0;
}
.voice-session-device-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.voice-session-members {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.voice-session-members-empty {
  font-size: 12px;
  color: var(--muted);
  text-align: center;
  padding: 20px 0;
}
.voice-session-pill {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}
.voice-session-pill--self {
  border-color: rgba(168, 159, 148, 0.5);
  color: var(--text);
}
.voice-session-pill--speaking {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(34, 197, 94, 0.12);
}
.voice-session-pill--self-speaking {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(34, 197, 94, 0.12);
}
.voice-session-pill-name {
  display: inline-block;
}
.voice-session-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}
.voice-session-footer button {
  flex: 1;
  margin-top: 0 !important;
  font-size: 12px;
  padding: 6px 10px !important;
  height: 30px !important;
}
.voice-session-mute--active {
  background: #2a1410;
  border-color: rgba(240, 160, 144, 0.35);
}
</style>
