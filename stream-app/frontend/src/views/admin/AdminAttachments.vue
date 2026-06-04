<script setup>
import { computed } from "vue";
import { getAdminInstance } from "../../composables/useAdmin.js";

const {
  attachmentStats, attachmentLoading, attachmentRetentionDays,
  adminStatus, adminError,
  loadAttachmentStats, saveRetentionDays, runCleanup,
} = getAdminInstance();

const categories = computed(() => attachmentStats.value?.categories || []);
const totalBytes = computed(() => attachmentStats.value?.totalBytes || 0);
const retentionDays = computed(() => attachmentRetentionDays.value ?? 0);

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

function pct(bytes) {
  const t = totalBytes.value;
  if (!t) return 0;
  return Math.round((bytes / t) * 100);
}
</script>

<template>
  <div>
    <div v-if="adminStatus" class="admin-ok">{{ adminStatus }}</div>
    <div v-if="adminError" class="admin-err">{{ adminError }}</div>

    <div v-if="attachmentLoading" class="muted">Загрузка...</div>
    <template v-else>
      <div class="admin-attach-header">
        <div class="admin-attach-total">{{ formatBytes(totalBytes) }}</div>
        <div class="admin-attach-sub">Общий объём вложений</div>
      </div>

      <div class="admin-attach-retention">
        <label class="admin-attach-retention-label">Хранить вложения (дней)</label>
        <div class="admin-attach-retention-row">
          <input
            type="number"
            class="box"
            min="0"
            max="365"
            :value="retentionDays"
            @change="saveRetentionDays(Number(($event.target).value))"
            placeholder="0 = без ограничения"
          />
          <span class="muted">0 = без ограничения</span>
        </div>
      </div>

      <div class="admin-attach-bars">
        <div v-for="cat in categories" :key="cat.key" class="admin-attach-bar-row">
          <div class="admin-attach-bar-label">
            <span>{{ cat.label }}</span>
            <span class="muted">{{ cat.count }} шт.</span>
          </div>
          <div class="admin-attach-bar-track">
            <div class="admin-attach-bar-fill" :style="{ width: pct(cat.bytes) + '%' }"></div>
          </div>
          <div class="admin-attach-bar-val">{{ formatBytes(cat.bytes) }}</div>
        </div>
      </div>

      <div class="admin-attach-cleanup">
        <button class="btn btn-danger" type="button" @click="runCleanup">
          Очистить старые вложения
        </button>
        <span class="muted" v-if="retentionDays">Удалит изображения и стикеры старше {{ retentionDays }} дн.</span>
        <span class="muted" v-else>Удалит изображения и стикеры старше 30 дн.</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.admin-attach-header {
  text-align: center;
  padding: 12px 0;
}
.admin-attach-total {
  font-size: 28px;
  font-weight: 700;
  color: #e2b000;
}
.admin-attach-sub {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}
.admin-attach-retention {
  margin: 12px 0;
  padding: 10px;
  background: #1a1a1a;
  border-radius: 6px;
}
.admin-attach-retention-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.admin-attach-retention-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.admin-attach-retention-row .box {
  width: 80px;
}
.admin-attach-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}
.admin-attach-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.admin-attach-bar-label {
  width: 140px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
}
.admin-attach-bar-track {
  flex: 1;
  height: 14px;
  background: #1a1a1a;
  border-radius: 4px;
  overflow: hidden;
}
.admin-attach-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #d4a017, #e2b000);
  border-radius: 4px;
  transition: width 0.3s;
}
.admin-attach-bar-val {
  width: 70px;
  font-size: 12px;
  text-align: right;
  font-weight: 600;
}
.admin-attach-cleanup {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.btn-danger {
  background: #8b0000;
  color: #fff;
}
.btn-danger:hover {
  background: #a50000;
}
</style>
