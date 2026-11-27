/* =========================================================
   卡艺工坊 Card Studio — 卡牌图层编辑器
   ========================================================= */

const $ = (id) => document.getElementById(id);
const canvas = $('cardCanvas');
const ctx = canvas.getContext('2d');

let W = 420;
let H = 588;

const state = {
  cardName: '未命名卡牌',
  layers: [],
  selectedId: null
};

const imageCache = new Map();

const gradMotion = { raf: 0, last: 0, phase: 0, exportPhase: null, lastBucket: -1 };
function gradientPhase() {
  return gradMotion.exportPhase == null ? gradMotion.phase : gradMotion.exportPhase;
}

let uidSeed = 0;
const uid = () => `id_${Date.now().toString(36)}_${(uidSeed++).toString(36)}`;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* =========================================================
   图片加载
   ========================================================= */
function loadImage(src, onReady) {
  if (imageCache.has(src)) {
    const img = imageCache.get(src);
    if (img.complete && img.naturalWidth && onReady) onReady(img);
    return img;
  }
  const img = new Image();
  img.onload = () => { render(); if (onReady) onReady(img); };
  img.src = src;
  imageCache.set(src, img);
  return img;
}

/* =========================================================
   图层操作
   ========================================================= */
function defaultGradient() {
  return {
    enabled: false,
    mode: 'overlay',
    type: 'linear',
    angle: 90,
    opacity: 0.7,
    blendMode: 'source-over',
    animate: false,
    speed: 1,
    stops: [
      { id: uid(), color: '#8b7cf8', pos: 0 },
      { id: uid(), color: '#4ec9dc', pos: 100 }
    ]
  };
}

function defaultTexture() {
  return {
    enabled: false,
    src: '',
    fit: 'cover',
    scale: 1,
    opacity: 1,
    blendMode: 'source-over'
  };
}

function defaultSolid() {
  return {
    enabled: false,
    color: '#6c5ce7',
    opacity: 1,
    blendMode: 'source-over'
  };
}

const thumbCache = new Map();

function makeThumb(img, src) {
  if (thumbCache.has(src)) return thumbCache.get(src);
  const size = 76;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const cx = c.getContext('2d');
  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  cx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  const data = c.toDataURL('image/png');
  thumbCache.set(src, data);
  return data;
}

function addLayer(src, name, dimensions) {
  let img = imageCache.get(src);
  if (!img) img = loadImage(src);

  const place = (image) => {
    const iw = image.naturalWidth || dimensions?.w || 300;
    const ih = image.naturalHeight || dimensions?.h || 300;
    const isFirst = state.layers.length === 0;
    if (isFirst) {
      W = canvas.width = Math.round(iw);
      H = canvas.height = Math.round(ih);
      $('canvasSizeChip').textContent = `${W} × ${H} px`;
    }
    const w = Math.round(iw);
    const h = Math.round(ih);

    const layer = {
      id: uid(),
      name: name || '图层',
      src,
      thumb: makeThumb(image, src),
      x: Math.round((W - w) / 2),
      y: Math.round((H - h) / 2),
      w, h,
      rotation: 0,
      opacity: 1,
      blendMode: 'source-over',
      visible: true,
      lockRatio: true,
      gradient: defaultGradient(),
      texture: defaultTexture(),
      solid: defaultSolid()
    };
    state.layers.push(layer);
    state.selectedId = layer.id;
    saveSelectedId();
    renderLayerList();
    syncAllPanels();
    render();
    commit();
  };

  if (img.complete && img.naturalWidth) place(img);
  else img.onload = () => { render(); place(img); };
}

function getSelected() {
  return state.layers.find((l) => l.id === state.selectedId) || null;
}

function saveSelectedId() {
  try { localStorage.setItem('card-studio-selected', state.selectedId || ''); } catch (err) {}
}

function selectLayer(id) {
  if (state.selectedId === id) return;
  state.selectedId = id;
  saveSelectedId();
  renderLayerList();
  syncAllPanels();
  render();
}

function deleteLayer(id) {
  const index = state.layers.findIndex((l) => l.id === id);
  if (index < 0) return;
  state.layers.splice(index, 1);
  if (state.selectedId === id) state.selectedId = state.layers.length ? state.layers[Math.min(index, state.layers.length - 1)].id : null;
  saveSelectedId();
  renderLayerList();
  syncAllPanels();
  render();
  commit();
}

/* =========================================================
   图层列表 UI
   ========================================================= */
const eyeSvg = '<svg viewBox="0 0 24 24" fill="none"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.6"/></svg>';
const eyeOffSvg = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 4l16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9.7 5.9A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7M6.2 7.9A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1 0 1.9-.2 2.7-.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const trashSvg = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5M14 11v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderLayerList() {
  const list = $('layerList');
  $('emptyLayers').style.display = state.layers.length ? 'none' : 'flex';

  list.querySelectorAll('.layer-item').forEach((el) => el.remove());
  const reversed = [...state.layers].reverse();
  reversed.forEach((layer) => {
    const item = document.createElement('div');
    item.className = 'layer-item' + (layer.id === state.selectedId ? ' active' : '');
    item.dataset.id = layer.id;
    item.draggable = true;
    item.innerHTML = `
      <div class="layer-thumb"><img src="${layer.thumb || layer.src}" alt=""></div>
      <div class="layer-info">
        <div class="layer-name">${escapeHtml(layer.name)}</div>
        <div class="layer-meta"><span>${Math.round(layer.w)} × ${Math.round(layer.h)}</span>${layer.gradient.enabled ? '<span class="grad-tag">渐变</span>' : ''}${layer.texture && layer.texture.enabled && layer.texture.src ? '<span class="mat-tag">材质</span>' : ''}${layer.solid && layer.solid.enabled ? '<span class="solid-tag">单色</span>' : ''}</div>
      </div>
      <div class="layer-actions">
        <button class="layer-eye ${layer.visible ? '' : 'off'}" data-eye="${layer.id}" title="${layer.visible ? '隐藏' : '显示'}">${layer.visible ? eyeSvg : eyeOffSvg}</button>
        <button class="layer-del" data-del="${layer.id}" title="删除图层">${trashSvg}</button>
      </div>`;
    list.appendChild(item);
  });
}

$('layerList').addEventListener('click', (e) => {
  const delBtn = e.target.closest('[data-del]');
  if (delBtn) {
    deleteLayer(delBtn.dataset.del);
    return;
  }
  const eyeBtn = e.target.closest('[data-eye]');
  if (eyeBtn) {
    const layer = state.layers.find((l) => l.id === eyeBtn.dataset.eye);
    if (layer) {
      layer.visible = !layer.visible;
      renderLayerList();
      render();
      commit();
    }
    return;
  }
  const item = e.target.closest('.layer-item');
  if (item) selectLayer(item.dataset.id);
});

let draggingLayerId = null;

$('layerList').addEventListener('dragstart', (e) => {
  const item = e.target.closest('.layer-item');
  if (!item) return;
  draggingLayerId = item.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggingLayerId);
  requestAnimationFrame(() => item.classList.add('dragging'));
});

$('layerList').addEventListener('dragend', () => {
  draggingLayerId = null;
  document.querySelectorAll('.layer-item').forEach((el) => el.classList.remove('dragging', 'drop-before', 'drop-after'));
});

$('layerList').addEventListener('dragover', (e) => {
  if (!draggingLayerId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.target.closest('.layer-item');
  document.querySelectorAll('.layer-item').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
  if (!target || target.dataset.id === draggingLayerId) return;
  const rect = target.getBoundingClientRect();
  target.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
});

$('layerList').addEventListener('drop', (e) => {
  e.preventDefault();
  if (!draggingLayerId) return;
  const target = e.target.closest('.layer-item');
  if (!target || target.dataset.id === draggingLayerId) return;
  const list = $('layerList');
  const ids = [...list.querySelectorAll('.layer-item')].map((el) => el.dataset.id);
  const rect = target.getBoundingClientRect();
  const from = ids.indexOf(draggingLayerId);
  let to = ids.indexOf(target.dataset.id) + (e.clientY > rect.top + rect.height / 2 ? 1 : 0);
  ids.splice(from, 1);
  if (from < to) to--;
  ids.splice(to, 0, draggingLayerId);
  const byId = new Map(state.layers.map((l) => [l.id, l]));
  state.layers = ids.reverse().map((id) => byId.get(id));
  draggingLayerId = null;
  list.querySelectorAll('.layer-item').forEach((el) => el.classList.remove('dragging', 'drop-before', 'drop-after'));
  renderLayerList();
  render();
  commit();
});

/* =========================================================
   绘制
   ========================================================= */
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildCyclicStops(g, cycles = 3) {
  const src = [...(g.stops || [])].sort((a, b) => a.pos - b.pos);
  if (!src.length) return [{ p: 0, color: '#ffffff' }, { p: 1, color: '#ffffff' }];
  const norm = src.map((s) => ({ u: clamp(Number(s.pos) || 0, 0, 100), color: s.color }));
  const seq = [];
  const push = (u, color) => {
    if (!seq.length || Math.abs(seq[seq.length - 1].u - u) > 1e-6) seq.push({ u, color });
  };
  push(0, norm[0].color);
  norm.forEach((s) => push(s.u, s.color));
  if (norm[norm.length - 1].u < 100) push(100, norm[norm.length - 1].color);
  for (let i = norm.length - 2; i >= 1; i--) push(200 - norm[i].u, norm[i].color);
  push(200, norm[0].color);
  const out = [];
  for (let k = 0; k < cycles; k++) {
    seq.forEach((s) => {
      const p = (k * 200 + s.u) / (cycles * 200);
      if (!out.length || Math.abs(out[out.length - 1].p - p) > 1e-6) out.push({ p, color: s.color });
    });
  }
  return out;
}

function parseHexColor(hex) {
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
}

function mixHexColor(a, b, t) {
  const ca = parseHexColor(a);
  const cb = parseHexColor(b);
  const mixed = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${mixed.map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function sampleCyclicColor(stops, x) {
  let i = 0;
  while (i < stops.length - 2 && stops[i + 1].p < x) i++;
  const a = stops[i];
  const b = stops[i + 1] || a;
  const t = b.p === a.p ? 0 : clamp((x - a.p) / (b.p - a.p), 0, 1);
  return mixHexColor(a.color, b.color, t);
}

function shiftedCyclicStops(g, phase, cycles) {
  const base = buildCyclicStops(g, cycles);
  const period = 1 / cycles;
  const start = (((phase % 1) + 1) % 1) * period;
  const ext = [...base, ...base.map((s) => ({ p: s.p + 1, color: s.color }))];
  const out = [{ p: 0, color: sampleCyclicColor(ext, start) }];
  ext.forEach((s) => {
    if (s.p > start && s.p < start + 1) out.push({ p: s.p - start, color: s.color });
  });
  out.push({ p: 1, color: sampleCyclicColor(ext, start + 1) });
  return out;
}

function makeGradient(c, w, h, g, phase = 0) {
  const cx = w / 2;
  const cy = h / 2;
  if (g.type === 'radial') {
    const base = Math.max(w, h) / 1.35;
    const pulse = g.animate ? 1 + 0.12 * Math.sin(phase * Math.PI * 2) : 1;
    return c.createRadialGradient(cx, cy, 0, cx, cy, base * pulse);
  }
  const rad = (g.angle * Math.PI) / 180;
  const len = Math.sqrt(w * w + h * h) / 2;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  if (g.animate) {
    const half = Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2;
    const span = 6 * half;
    const shift = phase * 2 * half;
    return c.createLinearGradient(
      cx - ux * span / 2 + ux * shift, cy - uy * span / 2 + uy * shift,
      cx + ux * span / 2 + ux * shift, cy + uy * span / 2 + uy * shift
    );
  }
  return c.createLinearGradient(
    cx - ux * len, cy - uy * len,
    cx + ux * len, cy + uy * len
  );
}

function drawGradientSheen(o, w, h, g, phase) {
  const cx = w / 2;
  const cy = h / 2;
  const rad = (g.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const half = Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2;
  const pos = (phase * 2 - 1) * half * 1.25;
  const band = Math.max(18, half * 0.5);
  const sheen = o.createLinearGradient(
    cx + dx * (pos - band), cy + dy * (pos - band),
    cx + dx * (pos + band), cy + dy * (pos + band)
  );
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.25, 'rgba(255,255,255,0.02)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.34)');
  sheen.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(0.75, 'rgba(255,255,255,0.02)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  o.save();
  o.globalCompositeOperation = 'screen';
  o.globalAlpha = 1;
  o.fillStyle = sheen;
  o.fillRect(0, 0, w, h);
  o.restore();
}

function animPhaseKey(g) {
  return g && g.enabled && g.animate ? Math.round(gradientPhase() * 90) : 'static';
}

function prepareLayerCanvas(layer, prop, w, h) {
  let off = layer[prop];
  if (!off || off.width !== w || off.height !== h) {
    off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    layer[prop] = off;
  }
  const o = off.getContext('2d');
  o.clearRect(0, 0, w, h);
  o.globalAlpha = 1;
  o.globalCompositeOperation = 'source-over';
  return off;
}

function getGradientCanvas(layer, img) {
  const w = Math.max(1, Math.round(layer.w));
  const h = Math.max(1, Math.round(layer.h));
  const g = layer.gradient;
  const key = `${JSON.stringify([g, w, h])}|${animPhaseKey(g)}`;
  if (layer._gradKey === key && layer._gradCanvas) return layer._gradCanvas;

  const off = prepareLayerCanvas(layer, '_gradCanvas', w, h);
  const o = off.getContext('2d');
  o.drawImage(img, 0, 0, w, h);

  const rawStops = [...g.stops].sort((a, b) => a.pos - b.pos);
  const animated = !!(g.enabled && g.animate);
  const phase = animated ? gradientPhase() : 0;
  const grad = makeGradient(o, w, h, g, phase);
  const stops = animated && g.mode !== 'mask'
    ? shiftedCyclicStops(g, phase, g.type === 'radial' ? 1 : 3)
    : rawStops.map((s) => ({ p: clamp(Number(s.pos) || 0, 0, 100) / 100, color: s.color }));

  if (g.mode === 'mask') {
    o.globalCompositeOperation = 'destination-in';
    stops.forEach((s) => {
      const alpha = clamp(1 - s.p * g.opacity, 0, 1);
      grad.addColorStop(s.p, `rgba(255,255,255,${alpha})`);
    });
    o.fillStyle = grad;
    o.fillRect(0, 0, w, h);
  } else {
    // 用原图的 alpha 作为遮罩，避免渐变填充到透明区域
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    mask.getContext('2d').drawImage(img, 0, 0, w, h);

    o.globalCompositeOperation = g.blendMode || 'source-over';
    stops.forEach((s) => grad.addColorStop(s.p, hexToRgba(s.color, g.opacity)));
    o.fillStyle = grad;
    o.fillRect(0, 0, w, h);

    if (g.enabled && g.animate) drawGradientSheen(o, w, h, g, phase);

    o.globalCompositeOperation = 'destination-in';
    o.drawImage(mask, 0, 0);
  }

  layer._gradKey = key;
  return off;
}

function drawTexturePattern(o, t, img, w, h) {
  const scale = clamp(t.scale || 1, 0.1, 8);
  const base = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const tw = Math.max(1, Math.round(img.naturalWidth * base * scale));
  const th = Math.max(1, Math.round(img.naturalHeight * base * scale));
  o.drawImage(img, (w - tw) / 2, (h - th) / 2, tw, th);
}

function getTextureCanvas(layer, source, img) {
  const w = Math.max(1, Math.round(layer.w));
  const h = Math.max(1, Math.round(layer.h));
  const t = layer.texture;
  const key = `${JSON.stringify([t, w, h, layer.gradient])}|${animPhaseKey(layer.gradient)}`;
  if (layer._texKey === key && layer._texCanvas) return layer._texCanvas;

  const texImg = t.src ? imageCache.get(t.src) : null;
  if (!texImg || !texImg.complete || !texImg.naturalWidth) return source;

  const off = prepareLayerCanvas(layer, '_texCanvas', w, h);
  const o = off.getContext('2d');
  o.drawImage(source, 0, 0, w, h);

  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  mask.getContext('2d').drawImage(img, 0, 0, w, h);

  o.globalCompositeOperation = t.blendMode || 'source-over';
  o.globalAlpha = clamp(t.opacity, 0, 1);
  drawTexturePattern(o, t, texImg, w, h);
  o.globalAlpha = 1;
  o.globalCompositeOperation = 'destination-in';
  o.drawImage(mask, 0, 0);

  layer._texKey = key;
  layer._texCanvas = off;
  return off;
}

function getSolidCanvas(layer, source, img) {
  const w = Math.max(1, Math.round(layer.w));
  const h = Math.max(1, Math.round(layer.h));
  const s = layer.solid;
  const key = `${JSON.stringify([s, w, h, layer.gradient, layer.texture])}|${animPhaseKey(layer.gradient)}`;
  if (layer._solidKey === key && layer._solidCanvas) return layer._solidCanvas;

  const off = prepareLayerCanvas(layer, '_solidCanvas', w, h);
  const o = off.getContext('2d');
  o.drawImage(source, 0, 0, w, h);

  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  mask.getContext('2d').drawImage(img, 0, 0, w, h);

  o.globalCompositeOperation = s.blendMode || 'source-over';
  o.globalAlpha = clamp(s.opacity, 0, 1);
  o.fillStyle = s.color || '#6c5ce7';
  o.fillRect(0, 0, w, h);
  o.globalAlpha = 1;
  o.globalCompositeOperation = 'destination-in';
  o.drawImage(mask, 0, 0);

  layer._solidKey = key;
  layer._solidCanvas = off;
  return off;
}

function drawLayer(c, layer) {
  const img = imageCache.get(layer.src);
  if (!img || !img.complete || !img.naturalWidth) return;
  let source = layer.gradient.enabled ? getGradientCanvas(layer, img) : img;
  if (layer.texture && layer.texture.enabled && layer.texture.src) {
    source = getTextureCanvas(layer, source, img);
  }
  if (layer.solid && layer.solid.enabled) {
    source = getSolidCanvas(layer, source, img);
  }

  c.save();
  c.globalAlpha = layer.opacity;
  c.globalCompositeOperation = layer.blendMode || 'source-over';
  c.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
  c.rotate((layer.rotation * Math.PI) / 180);
  c.drawImage(source, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
  c.restore();
}

function drawSelection(c) {
  const layer = getSelected();
  if (!layer || !layer.visible) return;
  c.save();
  c.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
  c.rotate((layer.rotation * Math.PI) / 180);
  c.strokeStyle = '#a597ff';
  c.lineWidth = 1.5;
  c.setLineDash([5, 4]);
  c.strokeRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h);
  c.restore();
}

function render(targetCtx = ctx, options = {}) {
  const c = targetCtx;
  c.clearRect(0, 0, W, H);
  state.layers.forEach((layer) => { if (layer.visible) drawLayer(c, layer); });
  if (!options.export && state.selectedId) drawSelection(c);
}

/* =========================================================
   属性面板
   ========================================================= */
function syncGradientPanel() {
  const layer = getSelected();
  if (!layer) return;
  const g = layer.gradient;
  $('gradEnabled').checked = g.enabled;
  $('gradBody').classList.toggle('disabled', !g.enabled);
  document.querySelectorAll('.seg').forEach((b) => b.classList.toggle('active', b.dataset.type === g.type));
  $('angleRow').style.display = 'block';
  const isRadial = g.type === 'radial';
  $('angleVal').style.visibility = isRadial ? 'hidden' : 'visible';
  $('angleDialWrap').hidden = isRadial;
  $('gradBlendRow').style.display = 'block';
  $('intensityLabel').textContent = '强度';
  $('gradAngle').value = g.angle;
  $('angleVal').textContent = `${g.angle}°`;
  $('angleAxis').style.transform = `rotate(${g.angle}deg)`;
  $('gradOpacity').value = Math.round(g.opacity * 100);
  $('gradOpacityVal').textContent = `${Math.round(g.opacity * 100)}%`;
  $('gradBlend').value = g.blendMode;
  $('gradAnim').checked = !!g.animate;
  $('gradSpeedRow').hidden = !g.animate;
  const speed = clamp(g.speed || 1, 0.2, 3);
  $('gradSpeed').value = Math.round(speed * 100);
  $('gradSpeedVal').textContent = `${speed.toFixed(1)}×`;
  renderStops();
  updateGradientPreview();
}

function switchSideTab(tab) {
  document.querySelectorAll('.side-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('paneGradient').hidden = tab !== 'gradient';
  $('paneTexture').hidden = tab !== 'texture';
  $('paneSolid').hidden = tab !== 'solid';
  try { localStorage.setItem('card-studio-side-tab', tab); } catch (err) {}
}

document.querySelectorAll('.side-tab').forEach((btn) => {
  btn.onclick = () => switchSideTab(btn.dataset.tab);
});

function syncTexturePanel() {
  const layer = getSelected();
  if (!layer) return;
  const t = layer.texture || defaultTexture();
  $('texEnabled').checked = t.enabled;
  $('texBody').classList.toggle('disabled', !t.enabled);
  $('texScale').value = Math.round((t.scale || 1) * 100);
  $('texScaleVal').textContent = `${Math.round((t.scale || 1) * 100)}%`;
  $('texOpacity').value = Math.round(t.opacity * 100);
  $('texOpacityVal').textContent = `${Math.round(t.opacity * 100)}%`;
  $('texBlend').value = t.blendMode;
  const hasSrc = !!t.src;
  $('texPreview').hidden = !hasSrc;
  $('texUploadBtn').style.display = hasSrc ? 'none' : 'flex';
  if (hasSrc) $('texPreviewImg').src = t.src;
}

function syncSolidPanel() {
  const layer = getSelected();
  if (!layer) return;
  const s = layer.solid || defaultSolid();
  $('solidEnabled').checked = s.enabled;
  $('solidBody').classList.toggle('disabled', !s.enabled);
  $('solidColor').value = s.color || '#6c5ce7';
  $('solidHex').value = (s.color || '#6c5ce7').toUpperCase();
  $('solidOpacity').value = Math.round(s.opacity * 100);
  $('solidOpacityVal').textContent = `${Math.round(s.opacity * 100)}%`;
  $('solidBlend').value = s.blendMode;
}

function syncAllPanels() {
  const layer = getSelected();
  $('gradNoLayer').style.display = layer ? 'none' : 'flex';
  $('texNoLayer').style.display = layer ? 'none' : 'flex';
  $('solidNoLayer').style.display = layer ? 'none' : 'flex';
  if (layer) {
    syncGradientPanel();
    syncTexturePanel();
    syncSolidPanel();
  }
}

/* =========================================================
   渐变面板
   ========================================================= */
function renderStops() {
  const layer = getSelected();
  if (!layer) return;
  const g = layer.gradient;
  const list = $('stopsList');
  list.innerHTML = '';
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos);
  stops.forEach((stop, index) => {
    const item = document.createElement('div');
    item.className = 'stop-item';
    item.innerHTML = `
      <input type="color" class="stop-color" value="${stop.color}" data-id="${stop.id}" title="颜色">
      <input type="text" class="stop-hex" value="${stop.color.toUpperCase()}" data-id="${stop.id}" maxlength="7" spellcheck="false" title="十六进制颜色值">
      <input type="range" class="range stop-pos" min="0" max="100" value="${stop.pos}" data-id="${stop.id}">
      <span class="stop-percent">${stop.pos}%</span>
      <button class="stop-del" data-id="${stop.id}" ${stops.length <= 2 ? 'disabled' : ''} title="删除节点">×</button>`;
    list.appendChild(item);
  });
}

$('stopsList').addEventListener('input', (e) => {
  const layer = getSelected();
  if (!layer) return;
  const id = e.target.dataset.id;
  const stop = layer.gradient.stops.find((s) => s.id === id);
  if (!stop) return;
  if (e.target.classList.contains('stop-color')) {
    stop.color = e.target.value;
    const hexInput = e.target.parentElement.querySelector('.stop-hex');
    if (hexInput) hexInput.value = e.target.value.toUpperCase();
  }
  if (e.target.classList.contains('stop-hex')) {
    const v = e.target.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      stop.color = v;
      const colorInput = e.target.parentElement.querySelector('.stop-color');
      if (colorInput) colorInput.value = v;
    }
  }
  if (e.target.classList.contains('stop-pos')) {
    stop.pos = parseInt(e.target.value, 10);
    e.target.nextElementSibling.textContent = `${stop.pos}%`;
    layer.gradient.stops.sort((a, b) => a.pos - b.pos);
  }
  layer._gradKey = null;
  render();
  updateGradientPreview();
  commitDebounced();
});

$('stopsList').addEventListener('click', (e) => {
  const btn = e.target.closest('.stop-del');
  if (!btn) return;
  const layer = getSelected();
  if (!layer) return;
  const g = layer.gradient;
  if (g.stops.length <= 2) return;
  g.stops = g.stops.filter((s) => s.id !== btn.dataset.id);
  layer._gradKey = null;
  renderStops();
  updateGradientPreview();
  render();
  commit();
});

$('addStopBtn').onclick = () => {
  const layer = getSelected();
  if (!layer) return;
  const stops = [...layer.gradient.stops].sort((a, b) => a.pos - b.pos);
  let gapIndex = 0;
  let maxGap = -1;
  for (let i = 0; i < stops.length - 1; i++) {
    const gap = stops[i + 1].pos - stops[i].pos;
    if (gap > maxGap) { maxGap = gap; gapIndex = i; }
  }
  if (maxGap < 2) return toast('节点已满，请先调整位置');
  const pos = Math.round((stops[gapIndex].pos + stops[gapIndex + 1].pos) / 2);
  layer.gradient.stops.push({ id: uid(), color: '#ffffff', pos });
  layer.gradient.stops.sort((a, b) => a.pos - b.pos);
  layer._gradKey = null;
  renderStops();
  updateGradientPreview();
  render();
  commit();
};

$('resetStopsBtn').onclick = () => {
  const layer = getSelected();
  if (!layer) return;
  const stops = [...layer.gradient.stops].sort((a, b) => a.pos - b.pos);
  if (stops.length < 2) return;
  stops.forEach((s, i) => {
    s.pos = Math.round((i * 100) / (stops.length - 1));
  });
  layer.gradient.stops = stops;
  layer._gradKey = null;
  renderStops();
  updateGradientPreview();
  render();
  commit();
};

function cssGradient(g, phase = 0) {
  const prefix = g.type === 'radial' ? 'radial-gradient(circle' : `linear-gradient(${g.angle + 90}deg`;
  if (g.mode === 'mask') {
    const stops = [...g.stops].sort((a, b) => a.pos - b.pos);
    const parts = stops.map((s) => `rgba(255,255,255,${clamp(1 - (Number(s.pos) || 0) / 100 * g.opacity, 0, 1)}) ${s.pos}%`);
    return `${prefix}, ${parts.join(', ')})`;
  }
  const animated = !!(g.enabled && g.animate);
  const stops = animated
    ? shiftedCyclicStops(g, phase, g.type === 'radial' ? 1 : 3)
    : [...g.stops].sort((a, b) => a.pos - b.pos).map((s) => ({ p: clamp(Number(s.pos) || 0, 0, 100) / 100, color: s.color }));
  const parts = stops.map((s) => `${hexToRgba(s.color, g.opacity)} ${(s.p * 100).toFixed(2)}%`);
  return `${prefix}, ${parts.join(', ')})`;
}

function updateAngleDialColors(g) {
  const dial = $('angleDial');
  if (!g || !Array.isArray(g.stops) || !g.stops.length) {
    dial.style.removeProperty('--dial-c1');
    dial.style.removeProperty('--dial-c2');
    return;
  }
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos);
  const setDialColor = (prop, color) => {
    if (/^#[0-9a-fA-F]{6}$/.test(color || '')) dial.style.setProperty(prop, color);
    else dial.style.removeProperty(prop);
  };
  setDialColor('--dial-c1', stops[0].color);
  setDialColor('--dial-c2', stops[stops.length - 1].color);
}

function updateGradientPreview() {
  const layer = getSelected();
  const preview = $('gradientPreview');
  const dial = $('angleDial');
  if (!layer) {
    preview.style.background = '#222';
    dial.style.removeProperty('--dial-c1');
    dial.style.removeProperty('--dial-c2');
    return;
  }
  updateAngleDialColors(layer.gradient);
  preview.style.background = layer.gradient.mode === 'mask'
    ? `${cssGradient(layer.gradient, gradientPhase())}, repeating-conic-gradient(#2a3042 0 25%, #1c2130 0 50%) 50% / 12px 12px`
    : cssGradient(layer.gradient, gradientPhase());
  applyPreviewPhase();
}

function applyPreviewPhase() {
  const layer = getSelected();
  const preview = $('gradientPreview');
  if (!layer || !layer.gradient.enabled || !layer.gradient.animate) {
    preview.classList.remove('is-animating');
    preview.style.removeProperty('--sheen-duration');
    preview.style.removeProperty('--sheen-rotate');
    return;
  }
  const speed = clamp(layer.gradient.speed || 1, 0.2, 3);
  preview.classList.add('is-animating');
  preview.style.setProperty('--sheen-duration', `${(6 / speed).toFixed(2)}s`);
  preview.style.setProperty('--sheen-rotate', `${layer.gradient.angle}deg`);
}

function anyGradientAnimating() {
  return state.layers.some((l) => l.visible && l.gradient && l.gradient.enabled && l.gradient.animate);
}

function animateTick(now) {
  gradMotion.raf = 0;
  if (!anyGradientAnimating() || document.hidden) return;
  if (!gradMotion.last) gradMotion.last = now;
  const dt = Math.min(now - gradMotion.last, 100);
  gradMotion.last = now;
  const speed = Math.max(...state.layers
    .filter((l) => l.visible && l.gradient && l.gradient.enabled && l.gradient.animate)
    .map((l) => clamp(l.gradient.speed || 1, 0.2, 3)));
  gradMotion.phase = (gradMotion.phase + (dt * speed) / 6000) % 1;
  const bucket = Math.round(gradMotion.phase * 90);
  if (bucket !== gradMotion.lastBucket) {
    gradMotion.lastBucket = bucket;
    render();
    updateGradientPreview();
  }
  gradMotion.raf = requestAnimationFrame(animateTick);
}

function syncAnimLoop() {
  if (document.hidden || !anyGradientAnimating()) {
    if (gradMotion.raf) cancelAnimationFrame(gradMotion.raf);
    gradMotion.raf = 0;
    gradMotion.last = 0;
    gradMotion.lastBucket = -1;
    return;
  }
  if (!gradMotion.raf) {
    gradMotion.last = 0;
    gradMotion.lastBucket = -1;
    gradMotion.raf = requestAnimationFrame(animateTick);
  }
}

document.addEventListener('visibilitychange', syncAnimLoop);

$('gradEnabled').addEventListener('change', (e) => {
  const layer = getSelected();
  if (!layer) return;
  layer.gradient.enabled = e.target.checked;
  $('gradBody').classList.toggle('disabled', !layer.gradient.enabled);
  renderLayerList();
  render();
  syncAnimLoop();
  commit();
});

document.querySelectorAll('.seg').forEach((btn) => {
  btn.onclick = () => {
    const layer = getSelected();
    if (!layer) return;
    layer.gradient.type = btn.dataset.type;
    layer._gradKey = null;
    syncGradientPanel();
    render();
    commit();
  };
});

$('gradAngle').addEventListener('input', (e) => {
  const layer = getSelected();
  if (!layer) return;
  const deg = parseInt(e.target.value, 10);
  layer.gradient.angle = deg;
  $('angleVal').textContent = `${deg}°`;
  $('angleAxis').style.transform = `rotate(${deg}deg)`;
  layer._gradKey = null;
  updateGradientPreview();
  render();
  commitDebounced();
});

let dialDragging = false;

function setAngleFromDial(e) {
  const layer = getSelected();
  if (!layer) return;
  const rect = $('angleDial').getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let deg = Math.round((Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI);
  if (deg < 0) deg += 360;
  const snapStep = 45;
  const snapThreshold = 8;
  const snapped = Math.round(deg / snapStep) * snapStep;
  if (Math.abs(deg - snapped) <= snapThreshold) deg = (snapped + 360) % 360;
  layer.gradient.angle = deg;
  $('gradAngle').value = deg;
  $('angleVal').textContent = `${deg}°`;
  $('angleAxis').style.transform = `rotate(${deg}deg)`;
  layer._gradKey = null;
  updateGradientPreview();
  render();
  commitDebounced();
}

$('angleDial').addEventListener('pointerdown', (e) => {
  dialDragging = true;
  $('angleDial').setPointerCapture(e.pointerId);
  setAngleFromDial(e);
});
$('angleDial').addEventListener('pointermove', (e) => {
  if (dialDragging) setAngleFromDial(e);
});
['pointerup', 'pointercancel'].forEach((evt) => {
  $('angleDial').addEventListener(evt, () => { dialDragging = false; });
});

$('gradOpacity').addEventListener('input', (e) => {
  const layer = getSelected();
  if (!layer) return;
  layer.gradient.opacity = parseInt(e.target.value, 10) / 100;
  $('gradOpacityVal').textContent = `${e.target.value}%`;
  layer._gradKey = null;
  updateGradientPreview();
  render();
  commitDebounced();
});

$('gradBlend').addEventListener('change', (e) => {
  const layer = getSelected();
  if (!layer) return;
  layer.gradient.blendMode = e.target.value;
  layer._gradKey = null;
  render();
  commit();
});

$('gradAnim').addEventListener('change', (e) => {
  const layer = getSelected();
  if (!layer) return;
  layer.gradient.animate = e.target.checked;
  $('gradSpeedRow').hidden = !e.target.checked;
  layer._gradKey = null;
  layer._texKey = null;
  layer._solidKey = null;
  render();
  syncAnimLoop();
  updateGradientPreview();
  commit();
});

$('gradSpeed').addEventListener('input', (e) => {
  const layer = getSelected();
  if (!layer) return;
  const speed = clamp(parseInt(e.target.value, 10) / 100, 0.2, 3);
  layer.gradient.speed = speed;
  $('gradSpeedVal').textContent = `${speed.toFixed(1)}×`;
  commitDebounced();
});

/* =========================================================
   材质面板
   ========================================================= */
function invalidateTexture(layer) {
  layer._texKey = null;
  layer._texCanvas = null;
}

function applyTextureSrc(src) {
  const layer = getSelected();
  if (!layer) return toast('请先选中一个图层');
  if (!src || !src.startsWith('data:image/')) return toast('请选择图片文件');
  if (!layer.texture) layer.texture = defaultTexture();
  layer.texture.src = src;
  layer.texture.enabled = true;
  loadImage(src, () => {
    invalidateTexture(layer);
    render();
  });
  invalidateTexture(layer);
  syncTexturePanel();
  renderLayerList();
  render();
  commit();
}

function applyTextureFile(file) {
  if (!file || !file.type.startsWith('image/')) return toast('请选择图片文件');
  const reader = new FileReader();
  reader.onload = (e) => applyTextureSrc(e.target.result);
  reader.readAsDataURL(file);
}

$('texUploadBtn').onclick = () => $('texFileInput').click();
$('texFileInput').addEventListener('change', (e) => {
  applyTextureFile(e.target.files[0]);
  e.target.value = '';
});

document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  let imageFile = null;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      imageFile = item.getAsFile();
      if (imageFile) break;
    }
  }
  if (!imageFile) return;
  e.preventDefault();
  applyTextureFile(imageFile);
});

$('texRemoveBtn').onclick = () => {
  const layer = getSelected();
  if (!layer || !layer.texture) return;
  layer.texture.src = '';
  layer.texture.enabled = false;
  invalidateTexture(layer);
  syncTexturePanel();
  renderLayerList();
  render();
  commit();
  toast('材质已移除');
};

$('texEnabled').addEventListener('change', (e) => {
  const layer = getSelected();
  if (!layer) return;
  if (!layer.texture) layer.texture = defaultTexture();
  layer.texture.enabled = e.target.checked;
  $('texBody').classList.toggle('disabled', !e.target.checked);
  invalidateTexture(layer);
  renderLayerList();
  render();
  commit();
});

$('texScale').addEventListener('input', (e) => {
  const layer = getSelected();
  if (!layer) return;
  if (!layer.texture) layer.texture = defaultTexture();
  const v = parseInt(e.target.value, 10);
  layer.texture.scale = v / 100;
  $('texScaleVal').textContent = `${v}%`;
  invalidateTexture(layer);
  render();
  commitDebounced();
});

$('texOpacity').addEventListener('input', (e) => {
  const layer = getSelected();
  if (!layer) return;
  if (!layer.texture) layer.texture = defaultTexture();
  const v = parseInt(e.target.value, 10);
  layer.texture.opacity = v / 100;
  $('texOpacityVal').textContent = `${v}%`;
  invalidateTexture(layer);
  render();
  commitDebounced();
});

$('texScaleReset').onclick = () => {
  const layer = getSelected();
  if (!layer) return;
  if (!layer.texture) layer.texture = defaultTexture();
  layer.texture.scale = 1;
  $('texScale').value = 100;
  $('texScaleVal').textContent = '100%';
  invalidateTexture(layer);
  render();
  commit();
};

$('texOpacityReset').onclick = () => {
  const layer = getSelected();
  if (!layer) return;
  if (!layer.texture) layer.texture = defaultTexture();
  layer.texture.opacity = 1;
  $('texOpacity').value = 100;
  $('texOpacityVal').textContent = '100%';
  invalidateTexture(layer);
  render();
  commit();
};

$('texBlend').addEventListener('change', (e) => {
  const layer = getSelected();
  if (!layer) return;
  if (!layer.texture) layer.texture = defaultTexture();
  layer.texture.blendMode = e.target.value;
  invalidateTexture(layer);
  render();
  commit();
});

/* =========================================================
   单色面板
   ========================================================= */
function invalidateSolid(layer) {
  layer._solidKey = null;
  layer._solidCanvas = null;
}

function ensureSolid(layer) {
  if (!layer.solid) layer.solid = defaultSolid();
  return layer.solid;
}

$('solidEnabled').addEventListener('change', (e) => {
  const layer = getSelected();
  if (!layer) return;
  ensureSolid(layer).enabled = e.target.checked;
  $('solidBody').classList.toggle('disabled', !e.target.checked);
  invalidateSolid(layer);
  renderLayerList();
  render();
  commit();
});

function setSolidColor(value) {
  const layer = getSelected();
  if (!layer) return;
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
  ensureSolid(layer).color = value;
  $('solidColor').value = value;
  $('solidHex').value = value.toUpperCase();
  invalidateSolid(layer);
  render();
  commitDebounced();
}

$('solidColor').addEventListener('input', (e) => setSolidColor(e.target.value));
$('solidHex').addEventListener('input', (e) => setSolidColor(e.target.value.trim()));

$('solidOpacity').addEventListener('input', (e) => {
  const layer = getSelected();
  if (!layer) return;
  const v = parseInt(e.target.value, 10);
  ensureSolid(layer).opacity = v / 100;
  $('solidOpacityVal').textContent = `${v}%`;
  invalidateSolid(layer);
  render();
  commitDebounced();
});

$('solidOpacityReset').onclick = () => {
  const layer = getSelected();
  if (!layer) return;
  ensureSolid(layer).opacity = 1;
  $('solidOpacity').value = 100;
  $('solidOpacityVal').textContent = '100%';
  invalidateSolid(layer);
  render();
  commit();
};

$('solidBlend').addEventListener('change', (e) => {
  const layer = getSelected();
  if (!layer) return;
  ensureSolid(layer).blendMode = e.target.value;
  invalidateSolid(layer);
  render();
  commit();
});

/* =========================================================
   上传
   ========================================================= */
function handleFiles(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return toast('请选择图片文件');
  let chain = Promise.resolve();
  images.forEach((file) => {
    chain = chain.then(() => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => { addLayer(e.target.result, file.name.replace(/\.[^.]+$/, '')); resolve(); };
      reader.onerror = () => resolve();
      reader.readAsDataURL(file);
    }));
  });
  toast(`已添加 ${images.length} 个图层`);
}

const leftSidebar = document.querySelector('.sidebar-left');
let dragDepth = 0;

function dragHasFiles(e) {
  return e.dataTransfer && [...e.dataTransfer.types].includes('Files');
}
function clearDragHighlight() {
  dragDepth = 0;
  leftSidebar.classList.remove('drag-over');
}

leftSidebar.addEventListener('dragenter', (e) => {
  if (!dragHasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  leftSidebar.classList.add('drag-over');
});
leftSidebar.addEventListener('dragleave', (e) => {
  if (!dragHasFiles(e)) return;
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) leftSidebar.classList.remove('drag-over');
});

// 在 document 层统一拦截文件拖放，避免浏览器把图片当作页面直接打开
document.addEventListener('dragover', (e) => {
  if (dragHasFiles(e)) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
});
document.addEventListener('drop', (e) => {
  if (!dragHasFiles(e)) return;
  e.preventDefault();
  clearDragHighlight();
  if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

/* =========================================================
   历史记录
   ========================================================= */
const MAX_HISTORY = 40;
let history = [];
let historyIndex = -1;

function snapshot() {
  return {
    cardName: state.cardName,
    W, H,
    selectedId: state.selectedId,
    layers: state.layers.map((l) => ({
      id: l.id, name: l.name, src: l.src, thumb: l.thumb, x: l.x, y: l.y, w: l.w, h: l.h,
      rotation: l.rotation, opacity: l.opacity, blendMode: l.blendMode,
      visible: l.visible, lockRatio: l.lockRatio,
      gradient: JSON.parse(JSON.stringify(l.gradient)),
      texture: JSON.parse(JSON.stringify(l.texture || defaultTexture())),
      solid: JSON.parse(JSON.stringify(l.solid || defaultSolid()))
    }))
  };
}

const saveLocalDebounced = debounce(saveLocal, 400);
let packedImages = [];
let packedThumbs = [];
let packedTextures = [];
let imageRefMap = new Map();
let thumbRefMap = new Map();
let textureRefMap = new Map();

function commit() {
  const packed = packSnapshot(JSON.stringify(snapshot()));
  if (history[historyIndex] === packed) return;
  history = history.slice(0, historyIndex + 1);
  history.push(packed);
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;
  pruneAssets();
  updateHistoryButtons();
  saveLocalDebounced();
}

const commitDebounced = debounce(commit, 280);

function restore(packedStr) {
  const snap = JSON.parse(unpackSnapshot(packedStr));
  state.cardName = snap.cardName;
  W = canvas.width = snap.W || W;
  H = canvas.height = snap.H || H;
  $('canvasSizeChip').textContent = `${W} × ${H} px`;
  state.selectedId = snap.selectedId;
  state.layers = snap.layers.map((l) => {
    loadImage(l.src);
    const texture = JSON.parse(JSON.stringify(l.texture || defaultTexture()));
    const solid = JSON.parse(JSON.stringify(l.solid || defaultSolid()));
    const gradient = JSON.parse(JSON.stringify(l.gradient));
    gradient.mode = 'overlay';
    gradient.animate = !!gradient.animate;
    gradient.speed = clamp(Number(gradient.speed) || 1, 0.2, 3);
    if (texture.src) loadImage(texture.src);
    return { ...l, gradient, texture, solid };
  });
  renderLayerList();
  syncAllPanels();
  render();
  syncAnimLoop();
  pruneImageCache();
}

function updateHistoryButtons() {
  $('undoBtn').disabled = historyIndex <= 0;
  $('redoBtn').disabled = historyIndex >= history.length - 1;
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restore(history[historyIndex]);
  updateHistoryButtons();
  saveLocalDebounced();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restore(history[historyIndex]);
  updateHistoryButtons();
  saveLocalDebounced();
}

$('undoBtn').onclick = undo;
$('redoBtn').onclick = redo;

/* =========================================================
   本地保存 / 重置 / 导出
   ========================================================= */
const DB_NAME = 'card-studio-db';
const DB_STORE = 'state';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function packSnapshot(snapStr) {
  const snap = JSON.parse(snapStr);
  snap.layers = snap.layers.map((l) => {
    const out = { ...l };
    if (typeof l.src === 'string' && l.src.startsWith('data:')) {
      let idx = imageRefMap.get(l.src);
      if (idx === undefined) {
        idx = packedImages.length;
        packedImages.push(l.src);
        imageRefMap.set(l.src, idx);
      }
      out.src = `__img_${idx}__`;
    }
    if (typeof l.thumb === 'string' && l.thumb.startsWith('data:')) {
      let idx = thumbRefMap.get(l.thumb);
      if (idx === undefined) {
        idx = packedThumbs.length;
        packedThumbs.push(l.thumb);
        thumbRefMap.set(l.thumb, idx);
      }
      out.thumb = `__thumb_${idx}__`;
    }
    if (l.texture && typeof l.texture.src === 'string' && l.texture.src.startsWith('data:')) {
      out.texture = { ...l.texture };
      let idx = textureRefMap.get(l.texture.src);
      if (idx === undefined) {
        idx = packedTextures.length;
        packedTextures.push(l.texture.src);
        textureRefMap.set(l.texture.src, idx);
      }
      out.texture.src = `__tex_${idx}__`;
    }
    return out;
  });
  return JSON.stringify(snap);
}

function unpackSnapshot(packedStr) {
  const snap = JSON.parse(packedStr);
  snap.layers = snap.layers.map((l) => {
    const out = { ...l };
    if (typeof l.src === 'string' && l.src.startsWith('__img_')) {
      out.src = packedImages[parseInt(l.src.slice(6), 10)] || '';
    }
    if (typeof l.thumb === 'string' && l.thumb.startsWith('__thumb_')) {
      out.thumb = packedThumbs[parseInt(l.thumb.slice(8), 10)] || '';
    }
    if (l.texture && typeof l.texture.src === 'string' && l.texture.src.startsWith('__tex_')) {
      out.texture = { ...l.texture, src: packedTextures[parseInt(l.texture.src.slice(6), 10)] || '' };
    }
    return out;
  });
  return JSON.stringify(snap);
}

function unpackState(data) {
  const images = data.images || [];
  const thumbs = data.thumbs || [];
  const textures = data.textures || [];
  return (data.history || []).map((str) => {
    const snap = JSON.parse(str);
    snap.layers = snap.layers.map((l) => {
      const out = { ...l };
      if (typeof l.src === 'string' && l.src.startsWith('__img_')) {
        out.src = images[parseInt(l.src.slice(6), 10)] || '';
      }
      if (typeof l.thumb === 'string' && l.thumb.startsWith('__thumb_')) {
        out.thumb = thumbs[parseInt(l.thumb.slice(8), 10)] || '';
      }
      if (l.texture && typeof l.texture.src === 'string' && l.texture.src.startsWith('__tex_')) {
        out.texture = { ...l.texture, src: textures[parseInt(l.texture.src.slice(6), 10)] || '' };
      }
      return out;
    });
    return JSON.stringify(snap);
  });
}

function collectRefs() {
  const used = { img: new Set(), thumb: new Set(), tex: new Set() };
  history.forEach((p) => {
    let m;
    const reImg = /__img_(\d+)__/g;
    while ((m = reImg.exec(p))) used.img.add(parseInt(m[1], 10));
    const reThumb = /__thumb_(\d+)__/g;
    while ((m = reThumb.exec(p))) used.thumb.add(parseInt(m[1], 10));
    const reTex = /__tex_(\d+)__/g;
    while ((m = reTex.exec(p))) used.tex.add(parseInt(m[1], 10));
  });
  return used;
}

function pruneAssets() {
  const used = collectRefs();
  const remap = (arr, usedSet) => {
    const map = new Map();
    const next = [];
    [...usedSet].sort((a, b) => a - b).forEach((oldIdx) => {
      if (oldIdx >= 0 && oldIdx < arr.length) {
        map.set(oldIdx, next.length);
        next.push(arr[oldIdx]);
      }
    });
    return { next, map };
  };
  const im = remap(packedImages, used.img);
  const th = remap(packedThumbs, used.thumb);
  const tx = remap(packedTextures, used.tex);
  history = history.map((p) => p
    .replace(/__img_(\d+)__/g, (_, n) => `__img_${im.map.has(+n) ? im.map.get(+n) : 0}__`)
    .replace(/__thumb_(\d+)__/g, (_, n) => `__thumb_${th.map.has(+n) ? th.map.get(+n) : 0}__`)
    .replace(/__tex_(\d+)__/g, (_, n) => `__tex_${tx.map.has(+n) ? tx.map.get(+n) : 0}__`));
  packedImages = im.next;
  packedThumbs = th.next;
  packedTextures = tx.next;
  imageRefMap = new Map(packedImages.map((s, i) => [s, i]));
  thumbRefMap = new Map(packedThumbs.map((s, i) => [s, i]));
  textureRefMap = new Map(packedTextures.map((s, i) => [s, i]));
}

function pruneImageCache() {
  const keep = new Set();
  state.layers.forEach((l) => {
    keep.add(l.src);
    if (l.texture && l.texture.src) keep.add(l.texture.src);
  });
  imageCache.forEach((_, src) => { if (!keep.has(src)) imageCache.delete(src); });
  thumbCache.forEach((_, src) => { if (!keep.has(src)) thumbCache.delete(src); });
}

async function saveLocal() {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put({ history, images: packedImages, thumbs: packedThumbs, textures: packedTextures, historyIndex }, 'current');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) { /* 存储失败时忽略，不阻塞编辑 */ }
}

async function applySavedData(data) {
  if (!data) return false;
  if (Array.isArray(data.history)) {
    if (data.images) {
      history = data.history;
      packedImages = data.images || [];
      packedThumbs = data.thumbs || [];
      packedTextures = data.textures || [];
    } else {
      packedImages = [];
      packedThumbs = [];
      packedTextures = [];
      imageRefMap = new Map();
      thumbRefMap = new Map();
      textureRefMap = new Map();
      history = unpackState(data).map((snap) => packSnapshot(snap));
    }
    imageRefMap = new Map(packedImages.map((s, i) => [s, i]));
    thumbRefMap = new Map(packedThumbs.map((s, i) => [s, i]));
    textureRefMap = new Map(packedTextures.map((s, i) => [s, i]));
    let drop = 0;
    if (history.length > MAX_HISTORY) {
      drop = history.length - MAX_HISTORY;
      history = history.slice(drop);
      pruneAssets();
    }
    const savedIndex = data.historyIndex ?? history.length - 1;
    historyIndex = clamp(savedIndex - drop, 0, Math.max(0, history.length - 1));
    if (history.length) restore(history[historyIndex]);
    return true;
  }
  restore(packSnapshot(typeof data === 'string' ? data : JSON.stringify(data)));
  return true;
}

async function loadLocal() {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get('current');
    const data = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (await applySavedData(data)) return;
  } catch (err) { /* 忽略 IndexedDB 错误 */ }

  try {
    const raw = localStorage.getItem('card-studio-state');
    if (raw && await applySavedData(JSON.parse(raw))) return;
  } catch (err) { /* 忽略损坏的旧数据 */ }
}

$('resetBtn').onclick = () => {
  if (!confirm('确定要清空所有图层并重置画布吗？')) return;
  state.layers = [];
  state.selectedId = null;
  saveSelectedId();
  state.cardName = '未命名卡牌';
  W = canvas.width = 420;
  H = canvas.height = 588;
  $('canvasSizeChip').textContent = '上传图片后自动适配画布';
  restore(packSnapshot(JSON.stringify(snapshot())));
  commit();
  toast('画布已重置');
};

$('exportBtn').onclick = () => {
  const scale = 1;
  const out = document.createElement('canvas');
  out.width = W * scale;
  out.height = H * scale;
  const oc = out.getContext('2d');
  oc.scale(scale, scale);
  gradMotion.exportPhase = 0.5;
  try {
    render(oc, { export: true });
  } finally {
    gradMotion.exportPhase = null;
  }
  const a = document.createElement('a');
  a.download = `${(state.cardName || '卡牌').replace(/[\\/:*?"<>|]/g, '_')}.png`;
  a.href = out.toDataURL('image/png');
  a.click();
  toast('已导出原始尺寸 PNG');
};

/* =========================================================
   键盘快捷键
   ========================================================= */
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }
  if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
    e.preventDefault();
    if (state.selectedId) deleteLayer(state.selectedId);
    return;
  }
});

/* =========================================================
   初始化
   ========================================================= */
(async () => {
  await loadLocal();
  if (!history.length) commit();
  try {
    const savedSel = localStorage.getItem('card-studio-selected');
    if (savedSel && state.layers.some((l) => l.id === savedSel)) {
      state.selectedId = savedSel;
    }
  } catch (err) {}
  try {
    const savedTab = localStorage.getItem('card-studio-side-tab');
    if (savedTab && ['solid', 'gradient', 'texture'].includes(savedTab)) switchSideTab(savedTab);
  } catch (err) {}
  renderLayerList();
  syncAllPanels();
  render();
  syncAnimLoop();
  updateHistoryButtons();
})();
