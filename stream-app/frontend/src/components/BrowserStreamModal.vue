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
  <div v-if="show" class="browser-stream-modal" @click.self="emit('close')">
    <div class="browser-stream-modal-content">
      <h3>Источник трансляции</h3>
      <div class="browser-stream-modal-actions">
        <button class="btn-camera" type="button" @click="emit('start', 'camera')">📷 Камера</button>
        <button class="btn-screen" type="button" @click="emit('start', 'screen')">🖥 Экран</button>
      </div>

      <h3>Разрешение</h3>
      <div class="browser-stream-modal-actions">
        <button
          v-for="resolution in ['480p', '720p', '1080p']"
          :key="resolution"
          type="button"
          class="btn-res"
          :class="{ active: browserStreamOptions.resolution === resolution }"
          @click="updateOption('resolution', resolution)"
        >
          {{ resolution }}
        </button>
      </div>

      <h3>Частота кадров</h3>
      <div class="browser-stream-modal-actions">
        <button
          v-for="fps in [30, 60]"
          :key="fps"
          type="button"
          class="btn-fps"
          :class="{ active: browserStreamOptions.fps === fps }"
          @click="updateOption('fps', fps)"
        >
          {{ fps }} fps
        </button>
      </div>

      <h3>Битрейт</h3>
      <div class="browser-stream-modal-actions">
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
          class="btn-bitrate"
          :class="{ active: browserStreamOptions.bitrate === option[0] }"
          @click="updateOption('bitrate', option[0])"
        >
          {{ option[1] }}
        </button>
      </div>

      <div class="browser-stream-modal-actions">
        <button class="btn-cancel" type="button" @click="emit('close')">Отмена</button>
      </div>
    </div>
  </div>
</template>
