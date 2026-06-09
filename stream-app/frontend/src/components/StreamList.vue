<script setup>
defineProps({
  streams: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  browserStreaming: { type: Boolean, default: false },
  browserStreamBusy: { type: Boolean, default: false },
});

const emit = defineEmits(["watch", "toggleBrowserStream"]);

function streamPath(stream) {
  return typeof stream === "string" ? stream : stream.path;
}

function streamName(stream) {
  if (typeof stream === "object" && stream.displayName) return stream.displayName;
  return streamPath(stream).replace(/^live\//, "");
}
</script>

<template>
  <div id="streamsBlock" class="stream-list-panel">
    <div class="streams-header panel-header-web">
      <span class="panel-title-web">Стримы</span>
      <span class="panel-count-web">{{ streams.length }}</span>
    </div>

    <div id="streamsGrid">
      <div v-if="loading" class="streams-empty-msg">Загрузка...</div>
      <div v-else-if="!streams.length" class="streams-empty-msg">Нет активных стримов</div>
      <button
        v-for="stream in streams"
        :key="streamPath(stream)"
        type="button"
        class="stream-row stream-item-web"
        @click="emit('watch', streamPath(stream))"
      >
        <span class="stream-thumb-web">
          <span class="live-badge-web">LIVE</span>
        </span>
        <span class="stream-name">@{{ streamName(stream) }}</span>
      </button>
    </div>

    <div class="browser-stream-btn">
      <button
        type="button"
        class="start-stream-btn-web"
        :class="{ streaming: browserStreaming }"
        :disabled="browserStreamBusy"
        @click="emit('toggleBrowserStream')"
      >
        {{ browserStreaming ? "Остановить" : "Начать стрим" }}
      </button>
    </div>
  </div>
</template>
