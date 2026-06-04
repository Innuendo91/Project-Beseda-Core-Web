<script setup>
import { onMounted, onUnmounted, ref, watch } from "vue";

const emit = defineEmits(["cropped", "closed"]);

const props = defineProps({
  file: { type: File, default: null },
});

const canvasRef = ref(null);
const show = ref(false);

let ctxRaw = null;
let img = null;
let imgW = 0, imgH = 0;
let scale = 1;
let offsetX = 0, offsetY = 0;
let dragging = false;
let dragStartX = 0, dragStartY = 0;
const cropSize = 128;
let displayCrop = 0;

const zoomValue = ref(100);

watch(() => props.file, (f) => {
  if (f) {
    show.value = true;
    document.body.style.overflow = "hidden";
    loadImage(f);
  }
});

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    img = new Image();
    img.onload = () => {
      imgW = img.width;
      imgH = img.height;
      fitImage();
      draw();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function fitImage() {
  const canvasW = canvasRef.value.width;
  const canvasH = canvasRef.value.height;
  displayCrop = Math.min(canvasW, canvasH) * 0.85;
  const ratio = Math.max(canvasW / imgW, canvasH / imgH);
  scale = ratio;
  offsetX = (canvasW - imgW * scale) / 2;
  offsetY = (canvasH - imgH * scale) / 2;
  zoomValue.value = 100;
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas || !img) return;
  ctxRaw = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctxRaw.clearRect(0, 0, w, h);

  ctxRaw.drawImage(img, offsetX, offsetY, imgW * scale, imgH * scale);

  const cx = w / 2;
  const cy = h / 2;
  const half = displayCrop / 2;

  ctxRaw.save();
  ctxRaw.strokeStyle = "rgba(255,255,255,0.7)";
  ctxRaw.lineWidth = 2;
  ctxRaw.setLineDash([6, 4]);
  ctxRaw.strokeRect(cx - half, cy - half, displayCrop, displayCrop);
  ctxRaw.setLineDash([]);
  ctxRaw.restore();

  ctxRaw.fillStyle = "rgba(0,0,0,0.55)";
  ctxRaw.fillRect(0, 0, w, h);

  ctxRaw.save();
  ctxRaw.globalCompositeOperation = "destination-out";
  ctxRaw.beginPath();
  ctxRaw.rect(cx - half, cy - half, displayCrop, displayCrop);
  ctxRaw.fill();
  ctxRaw.restore();
}

function clampDrag() {
  const cw = canvasRef.value.width;
  const ch = canvasRef.value.height;
  const dw = imgW * scale;
  const dh = imgH * scale;
  if (dw < cw) offsetX = (cw - dw) / 2;
  if (dh < ch) offsetY = (ch - dh) / 2;
}

function onPointerDown(e) {
  if (!img) return;
  dragging = true;
  const pt = e.touches ? e.touches[0] : e;
  dragStartX = pt.clientX - offsetX;
  dragStartY = pt.clientY - offsetY;
  e.preventDefault();
}

function onPointerMove(e) {
  if (!dragging) return;
  const pt = e.touches ? e.touches[0] : e;
  offsetX = pt.clientX - dragStartX;
  offsetY = pt.clientY - dragStartY;
  clampDrag();
  draw();
}

function onPointerUp() {
  dragging = false;
}

function onWheel(e) {
  if (!img) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.92 : 1.08;
  const rect = canvasRef.value.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvasRef.value.width / rect.width);
  const my = (e.clientY - rect.top) * (canvasRef.value.height / rect.height);
  const oldScale = scale;
  scale = Math.max(0.1, Math.min(5, scale * delta));
  offsetX = mx - (mx - offsetX) * (scale / oldScale);
  offsetY = my - (my - offsetY) * (scale / oldScale);
  zoomValue.value = Math.round(scale / (Math.max(canvasRef.value.width / imgW, canvasRef.value.height / imgH)) * 100);
  clampDrag();
  draw();
}

function onZoomInput() {
  const v = parseInt(zoomValue.value, 10) / 100;
  if (v < 0.1 || v > 5 || !img) return;
  const cw = canvasRef.value.width;
  const ch = canvasRef.value.height;
  const cx = cw / 2;
  const cy = ch / 2;
  const oldScale = scale;
  scale = Math.max(cw / imgW, ch / imgH) * v;
  offsetX = cx - (cx - offsetX) * (scale / oldScale);
  offsetY = cy - (cy - offsetY) * (scale / oldScale);
  clampDrag();
  draw();
}

function getCropped() {
  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = cropSize;
  tmpCanvas.height = cropSize;
  const tCtx = tmpCanvas.getContext("2d");
  const cw = canvasRef.value.width;
  const ch = canvasRef.value.height;
  const cx = cw / 2;
  const cy = ch / 2;
  const half = displayCrop / 2;

  const srcX = (cx - half - offsetX) / scale;
  const srcY = (cy - half - offsetY) / scale;
  const srcW = displayCrop / scale;
  const srcH = displayCrop / scale;

  tCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, cropSize, cropSize);
  return tmpCanvas.toDataURL("image/jpeg", 0.92);
}

function applyCrop() {
  const data = getCropped();
  show.value = false;
  document.body.style.overflow = "";
  emit("cropped", data);
}

function closeModal() {
  show.value = false;
  document.body.style.overflow = "";
  emit("closed");
}

function onOverlayClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

onMounted(() => {
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  window.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("touchend", onPointerUp);
});

onUnmounted(() => {
  window.removeEventListener("mousemove", onPointerMove);
  window.removeEventListener("mouseup", onPointerUp);
  window.removeEventListener("touchmove", onPointerMove);
  window.removeEventListener("touchend", onPointerUp);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="avatar-crop-overlay" @click="onOverlayClick">
      <div class="avatar-crop-card">
        <div class="avatar-crop-head">
          <span class="avatar-crop-title">Обрезка аватара</span>
          <button class="avatar-crop-close" @click="closeModal" type="button">&times;</button>
        </div>
        <div class="avatar-crop-body">
          <canvas
            ref="canvasRef"
            class="avatar-crop-canvas"
            width="380"
            height="380"
            @mousedown="onPointerDown"
            @touchstart="onPointerDown"
            @wheel="onWheel"
          ></canvas>
          <div class="avatar-crop-controls">
            <label>Масштаб</label>
            <input type="range" min="10" max="500" step="1" :value="zoomValue" @input="onZoomInput" />
          </div>
          <button class="avatar-crop-apply" @click="applyCrop" type="button">Применить</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.avatar-crop-overlay {
  display: flex;
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.75);
  justify-content: center;
  align-items: center;
  padding: 16px;
}
.avatar-crop-card {
  background: var(--card, #1e2226);
  border: 1px solid var(--border, #3a3f47);
  border-radius: 6px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.avatar-crop-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border, #3a3f47);
}
.avatar-crop-title {
  font-weight: 800;
  font-size: 14px;
}
.avatar-crop-close {
  background: none !important;
  border: none !important;
  color: var(--muted, #8b949e) !important;
  font-size: 20px;
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
.avatar-crop-close:hover {
  color: var(--text, #e6edf3) !important;
  background: var(--btn, #3a3f47) !important;
}
.avatar-crop-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.avatar-crop-canvas {
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1/1;
  border-radius: 4px;
  cursor: grab;
  background: #000;
  touch-action: none;
}
.avatar-crop-canvas:active {
  cursor: grabbing;
}
.avatar-crop-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.avatar-crop-controls label {
  font-size: 12px;
  color: var(--muted, #8b949e);
  white-space: nowrap;
}
.avatar-crop-controls input[type="range"] {
  flex: 1;
  accent-color: #22c55e;
}
.avatar-crop-apply {
  width: 100%;
  padding: 10px;
  margin-top: 4px;
  background: #22c55e;
  color: #fff;
  border: none;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  border-radius: 3px;
}
.avatar-crop-apply:hover {
  background: #16a34a;
}
</style>
