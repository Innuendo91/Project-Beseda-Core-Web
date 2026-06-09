<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  browserStreamOptions: { type: Object, required: true },
});

const emit = defineEmits(["close", "start", "update:browserStreamOptions"]);

function updateOption(key, value) {
  emit("update:browserStreamOptions", { ...props.browserStreamOptions, [key]: value });
}
</script>

<template>
  <div v-if="show" class="browser-stream-modal" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="browser-stream-modal-card">
      <div class="browser-stream-modal-head">
        <div class="browser-stream-modal-title">Начать трансляцию</div>
        <button type="button" class="browser-stream-modal-close" aria-label="Закрыть" @click="emit('close')">
          ×
        </button>
      </div>

      <div class="browser-stream-modal-body">
        <div class="browser-stream-section">
          <div class="browser-stream-section-label">Источник трансляции</div>
          <div class="browser-stream-btn-row">
            <button type="button" class="browser-stream-source-btn" @click="emit('start', 'camera')">📷 Камера</button>
            <button type="button" class="browser-stream-source-btn" @click="emit('start', 'screen')">🖥 Экран</button>
          </div>
        </div>

        <div class="browser-stream-section">
          <div class="browser-stream-section-label">Разрешение</div>
          <div class="browser-stream-btn-row">
            <button
              v-for="resolution in ['480p', '720p', '1080p']"
              :key="resolution"
              type="button"
              class="browser-stream-opt-btn"
              :class="{ active: browserStreamOptions.resolution === resolution }"
              @click="updateOption('resolution', resolution)"
            >
              {{ resolution }}
            </button>
          </div>
        </div>

        <div class="browser-stream-section">
          <div class="browser-stream-section-label">Частота кадров</div>
          <div class="browser-stream-btn-row">
            <button
              v-for="fps in [30, 60]"
              :key="fps"
              type="button"
              class="browser-stream-opt-btn"
              :class="{ active: browserStreamOptions.fps === fps }"
              @click="updateOption('fps', fps)"
            >
              {{ fps }} fps
            </button>
          </div>
        </div>

        <div class="browser-stream-section">
          <div class="browser-stream-section-label">Битрейт</div>
          <div class="browser-stream-btn-row">
            <button
              v-for="option in [
                ['auto', 'Авто'],
                ['1000000', '1 Мбит/с'],
                ['2500000', '2.5 Мбит/с'],
                ['5000000', '5 Мбит/с'],
                ['8000000', '8 Мбит/с'],
              ]"
              :key="option[0]"
              type="button"
              class="browser-stream-opt-btn"
              :class="{ active: browserStreamOptions.bitrate === option[0] }"
              @click="updateOption('bitrate', option[0])"
            >
              {{ option[1] }}
            </button>
          </div>
        </div>
      </div>

      <div class="browser-stream-modal-actions">
        <button type="button" class="btn" @click="emit('close')">Отмена</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.browser-stream-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.62);
}

.browser-stream-modal-card {
  width: min(400px, 100%);
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.browser-stream-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.browser-stream-modal-title {
  font-size: 14px;
  font-weight: 700;
}

.browser-stream-modal-close {
  width: 28px;
  height: 28px;
  margin-top: 0;
  padding: 0;
  border-radius: 3px;
  line-height: 1;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.browser-stream-modal-close:hover {
  color: var(--text);
  background: var(--btn);
}

.browser-stream-modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
}

.browser-stream-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.browser-stream-section-label {
  font-size: 12px;
  color: var(--muted);
}

.browser-stream-btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.browser-stream-source-btn {
  flex: 1;
  margin-top: 0;
  padding: 8px 12px;
  border-radius: 3px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #b8860b;
  border: 1px solid #d4a017;
  color: #fff;
  transition: background 0.15s;
}

.browser-stream-source-btn:hover {
  background: #d4a017;
}

.browser-stream-opt-btn {
  flex: 1;
  margin-top: 0;
  padding: 6px 10px;
  border-radius: 3px;
  font-size: 12px;
  cursor: pointer;
  background: rgba(100, 100, 100, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text);
  transition: background 0.15s;
}

.browser-stream-opt-btn:hover {
  background: rgba(100, 100, 100, 0.6);
}

.browser-stream-opt-btn.active {
  background: #b8860b;
  border-color: #d4a017;
}

.browser-stream-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
}

.browser-stream-modal-actions .btn {
  width: auto;
  margin-top: 0;
  padding: 7px 14px;
  border-radius: 3px;
}
</style>
