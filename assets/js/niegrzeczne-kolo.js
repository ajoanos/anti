import { getJson, initThemeToggle } from './app.js';

const ACCESS_KEY = 'momenty.wheel.access';
const ACCESS_PAGE = 'niegrzeczne-kolo.html';
const POSITIONS_ENDPOINT = 'api/list_scratchcards.php';
const SEGMENT_COUNT = 12;
const SEGMENT_COLORS = ['#f72585', '#b5179e', '#7209b7', '#560bad'];
const POINTER_ANGLE_RAD = -Math.PI / 2;

function getCrypto() {
  if (typeof window !== 'undefined' && (window.crypto || window.msCrypto)) {
    return window.crypto || window.msCrypto;
  }
  return null;
}

function randomInt(maxExclusive) {
  const max = Math.floor(maxExclusive);
  if (!Number.isFinite(max) || max <= 0) {
    return 0;
  }
  const cryptoObj = getCrypto();
  if (cryptoObj && cryptoObj.getRandomValues) {
    const range = max;
    const maxUint = 0xffffffff;
    const limit = Math.floor((maxUint + 1) / range) * range;
    const buffer = new Uint32Array(1);
    do {
      cryptoObj.getRandomValues(buffer);
    } while (buffer[0] >= limit);
    return buffer[0] % range;
  }
  return Math.floor(Math.random() * max);
}

function $(selector) {
  return document.querySelector(selector);
}

function setStatus(message) {
  const status = $('#wheel-status');
  if (!status) return;
  status.textContent = message || '';
}

function setResult(message) {
  const result = $('#wheel-result');
  if (!result) return;
  result.textContent = message || '';
}

function ensureAccess() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('auto')) {
    sessionStorage.setItem(ACCESS_KEY, 'true');
    if (window.history.replaceState) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('auto');
      window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
  }

  if (sessionStorage.getItem(ACCESS_KEY) === 'true') {
    return true;
  }

  window.location.replace(ACCESS_PAGE);
  return false;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function formatLabel(path) {
  const fileName = path.split('/').pop() || '';
  const name = decodeURIComponent(fileName.replace(/\.[^.]+$/, ''));
  const spaced = name.replace(/[-_]+/g, ' ').trim();
  if (!spaced) {
    return 'Wybrana pozycja';
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Nie udało się wczytać obrazu: ${src}`));
    image.src = src;
  });
}

function createWheel() {
  const spinner = $('#wheel-spinner');
  const canvas = $('#wheel-canvas');
  const randomizeButton = $('#wheel-randomize');
  const spinButton = $('#wheel-spin');
  const placeholder = $('#wheel-placeholder');
  const selectedImage = $('#wheel-selected-image');
  const center = $('#wheel-center');

  if (!spinner || !canvas || !randomizeButton || !spinButton || !placeholder || !selectedImage) {
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Canvas API is not available.');
    return;
  }

  spinButton.disabled = true;

  const state = {
    allFiles: [],
    positions: [],
    images: [],
    currentRotation: 0,
    isSpinning: false,
    canvasSize: 0,
    devicePixelRatio: 0,
    spinOrder: [],
  };

  function resetSpinner() {
    state.currentRotation = 0;
    spinner.style.transition = 'none';
    spinner.style.transform = 'rotate(0deg)';
    void spinner.offsetWidth;
    spinner.style.removeProperty('transition');
  }

  function clearSelection() {
    placeholder.hidden = false;
    selectedImage.hidden = true;
    selectedImage.removeAttribute('src');
    selectedImage.alt = '';
    setResult('');
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = spinner.getBoundingClientRect();
    const baseSize = spinner.clientWidth || spinner.offsetWidth || rect.width || 0;
    const size = Math.max(baseSize, 240);

    if (size === state.canvasSize && dpr === state.devicePixelRatio) {
      return;
    }

    state.canvasSize = size;
    state.devicePixelRatio = dpr;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (center) {
      const centerSize = Math.min(size * 0.44, 220);
      center.style.width = `${centerSize}px`;
      center.style.height = `${centerSize}px`;
    }

    drawWheel();
  }

  function drawWheel() {
    const { positions, images } = state;
    const count = positions.length;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    ctx.clearRect(0, 0, width, height);
    if (!count) {
      return;
    }
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) * 0.92;
    const segmentAngle = (Math.PI * 2) / count;

    for (let index = 0; index < count; index += 1) {
      const start = POINTER_ANGLE_RAD - segmentAngle / 2 + index * segmentAngle;
      const end = start + segmentAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
      ctx.fill();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = radius * 0.025;
    for (let index = 0; index < count; index += 1) {
      const angle = POINTER_ANGLE_RAD - segmentAngle / 2 + index * segmentAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.lineWidth = radius * 0.04;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const imageRadius = radius * 0.2;
    for (let index = 0; index < count; index += 1) {
      const image = images[index];
      if (!image) {
        continue;
      }
      const angle = POINTER_ANGLE_RAD + index * segmentAngle;
      const distance = radius * 0.78;
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, imageRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
      ctx.closePath();
      ctx.clip();

      const scale = Math.min((imageRadius * 2) / image.width, (imageRadius * 2) / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      ctx.drawImage(image, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();
    }
  }

  async function loadAllFiles() {
    setStatus('Ładuję dostępne pozycje...');
    try {
      const payload = await getJson(POSITIONS_ENDPOINT);
      if (!payload?.ok) {
        throw new Error(payload?.error || 'Nie udało się pobrać listy pozycji.');
      }
      if (!Array.isArray(payload.files) || payload.files.length === 0) {
        throw new Error('Brak dostępnych pozycji w katalogu.');
      }
      state.allFiles = payload.files;
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Nie udało się pobrać listy pozycji.');
      throw error;
    }
  }

  function refillSpinOrder() {
    const count = state.positions.length;
    if (!count) {
      state.spinOrder = [];
      return;
    }
    const order = Array.from({ length: count }, (_, index) => index);
    state.spinOrder = shuffle(order);
  }

  function nextSpinIndex() {
    if (!state.spinOrder.length) {
      refillSpinOrder();
    }
    return state.spinOrder.pop() ?? 0;
  }

  async function preparePositions() {
    if (!state.allFiles.length) {
      await loadAllFiles();
    }
    if (!state.allFiles.length) {
      return;
    }

    setStatus('Losuję pozycje do koła...');
    spinButton.disabled = true;
    randomizeButton.disabled = true;
    clearSelection();
    resetSpinner();

    const pool = shuffle(state.allFiles.slice());
    const positions = [];
    if (pool.length >= SEGMENT_COUNT) {
      positions.push(...pool.slice(0, SEGMENT_COUNT));
    } else {
      while (positions.length < SEGMENT_COUNT) {
        const next = pool[positions.length % pool.length];
        positions.push(next);
      }
    }

    try {
      const images = await Promise.all(
        positions.map((src) =>
          preloadImage(src).catch((error) => {
            console.error(error);
            return null;
          })
        )
      );
      const filteredPositions = [];
      const filteredImages = [];
      positions.forEach((src, index) => {
        if (images[index]) {
          filteredPositions.push(src);
          filteredImages.push(images[index]);
        }
      });
      state.positions = filteredPositions;
      state.images = filteredImages;
      if (!state.positions.length) {
        throw new Error('Nie udało się wczytać żadnej pozycji. Sprawdź obrazy i spróbuj ponownie.');
      }
      if (state.positions.length < SEGMENT_COUNT) {
        const missing = SEGMENT_COUNT - state.positions.length;
        for (let i = 0; i < missing; i += 1) {
          const index = i % state.positions.length;
          state.positions.push(state.positions[index]);
          state.images.push(state.images[index]);
        }
      }
      refillSpinOrder();
      drawWheel();
      setStatus('Naciśnij „Zakręć kołem”, aby wylosować pozycję.');
      spinButton.disabled = false;
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Nie udało się przygotować koła.');
      state.positions = [];
      state.images = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      spinButton.disabled = true;
    } finally {
      randomizeButton.disabled = false;
    }
  }

  function showSelection(index) {
    const src = state.positions[index];
    const image = state.images[index];
    if (!src || !image) {
      setStatus('Nie udało się wyświetlić pozycji. Spróbuj ponownie.');
      return;
    }
    placeholder.hidden = true;
    selectedImage.hidden = false;
    selectedImage.src = src;
    const label = formatLabel(src);
    selectedImage.alt = label;
    setResult(`Wylosowana pozycja: ${label}`);
    setStatus('Miłej zabawy!');
  }

  function normalizeDegrees(value) {
    return ((value % 360) + 360) % 360;
  }

  function spinWheel() {
    if (state.isSpinning || !state.positions.length) {
      if (!state.positions.length) {
        setStatus('Najpierw wylosuj pozycje do koła.');
      }
      return;
    }

    const count = state.positions.length;
    const segmentAngle = 360 / count;
    const selectedIndex = nextSpinIndex();
    const extraSpins = 4 + randomInt(4);
    const desiredNormalized = normalizeDegrees(-selectedIndex * segmentAngle);
    const currentNormalized = normalizeDegrees(state.currentRotation);
    const rotationDelta = desiredNormalized - currentNormalized;
    const targetRotation = extraSpins * 360 + rotationDelta;

    state.isSpinning = true;
    spinButton.disabled = true;
    randomizeButton.disabled = true;
    setStatus('Koło się kręci...');

    state.currentRotation += targetRotation;
    spinner.style.transform = `rotate(${state.currentRotation}deg)`;

    const handleTransitionEnd = () => {
      spinner.removeEventListener('transitionend', handleTransitionEnd);
      state.isSpinning = false;
      spinButton.disabled = false;
      randomizeButton.disabled = false;
      showSelection(selectedIndex);
    };

    spinner.addEventListener('transitionend', handleTransitionEnd, { once: true });
  }

  randomizeButton.addEventListener('click', () => {
    preparePositions().catch(() => {
      // errors already handled in preparePositions
    });
  });

  spinButton.addEventListener('click', spinWheel);

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  preparePositions().catch(() => {
    // handled
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!ensureAccess()) {
    return;
  }
  initThemeToggle(document.getElementById('theme-toggle'));
  createWheel();
});
