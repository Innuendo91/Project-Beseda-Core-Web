<script setup>
defineProps({
  streams: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  browserStreaming: { type: Boolean, default: false },
  browserStreamBusy: { type: Boolean, default: false },
});

const emit = defineEmits(["watch", "toggleBrowserStream"]);
</script>

<template>
  <div id="streamsBlock">
    <div class="streams-header">
      <span class="streams-header-icon">📡</span>
      <div class="streams-header-text">
        <div class="streams-header-title">Активные стримы</div>
      </div>
    </div>

    <div id="streamsGrid">
      <div v-if="loading" class="streams-empty-msg">Загрузка...</div>
      <div v-else-if="!streams.length" class="streams-empty-msg">Стримов в данный момент нет</div>
      <div v-for="path in streams" :key="path" class="stream-row">
        <div class="stream-info">
          <span class="room-icon">📡</span>
          <span class="stream-name">{{ path.replace(/^live\//, "") }}</span>
        </div>
        <button type="button" class="btn" @click="emit('watch', path)">
          Смотреть
        </button>
      </div>
    </div>

    <div class="browser-stream-btn">
      <button
        type="button"
        :class="{ streaming: browserStreaming }"
        :disabled="browserStreamBusy"
        @click="emit('toggleBrowserStream')"
      >
        {{ browserStreaming ? "Остановить трансляцию" : "Начать стрим" }}
      </button>
    </div>
  </div>
</template>
