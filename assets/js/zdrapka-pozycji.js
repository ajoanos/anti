import { getJson, initThemeToggle } from './app.js';

const CARD_SELECTOR = '[data-role="scratch-card"]';
const SCRATCH_RADIUS = 35;
const ACCESS_KEY = 'momenty.scratch.access';
const ACCESS_PAGE = 'zdrapka-pozycji.html';
const LEGACY_KEY = 'pary.access.pdp';

function $(selector) {
  return document.querySelector(selector);
}

function setStatus(message) {
  const status = $('#scratch-status');
  if (!status) return;
  status.textContent = message || '';
  status.hidden = !message;
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

  if (sessionStorage.getItem(ACCESS_KEY) !== 'true' && sessionStorage.getItem(LEGACY_KEY) === 'true') {
    sessionStorage.setItem(ACCESS_KEY, 'true');
  }

  if (sessionStorage.getItem(ACCESS_KEY) === 'true') {
    return true;
  }

  window.location.replace(ACCESS_PAGE);
  return false;
}

function createScratchCard() {
  const container = document.querySelector(CARD_SELECTOR);
  const canvas = $('#scratch-canvas');
  const image = $('#scratch-image');
  const nextButton = $('#next-card');

  if (!container || !canvas || !image || !nextButton) {
    return;
  }

  nextButton.disabled = true;

  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) {
    console.error('Canvas API is not available.');
    return;
  }

  let dpr = window.devicePixelRatio || 1;
  let isDrawing = false;
  let availableCards = [];
  let currentIndex = -1;

  async function loadCards() {
    setStatus('Ładuję karty...');
    try {
      const payload = await getJson('api/list_scratchcards.php');
      if (!payload?.ok) {
        throw new Error(payload?.error || 'Nie udało się wczytać listy kart.');
      }
      if (!Array.isArray(payload.files) || payload.files.length === 0) {
        setStatus('Brak dostępnych kart. Spróbuj ponownie później.');
        nextButton.disabled = true;
        return;
      }
      availableCards = payload.files;
      setStatus('Dotknij i zdrapuj, aby odkryć kartę.');
      nextButton.disabled = false;
      showRandomCard();
    } catch (error) {
      console.error(error);
      setStatus('Nie udało się pobrać kart. Odśwież stronę i spróbuj ponownie.');
      nextButton.disabled = true;
    }
  }

  function pickRandomIndex() {
    if (availableCards.length === 1) {
      return 0;
    }
    let index = Math.floor(Math.random() * availableCards.length);
    if (index === currentIndex) {
      index = (index + 1) % availableCards.length;
    }
    return index;
  }

  function showRandomCard() {
    if (!availableCards.length) {
      return;
    }
    const nextIndex = pickRandomIndex();
    currentIndex = nextIndex;
    const source = availableCards[nextIndex];
    isDrawing = false;
    image.src = source;
  }

  function drawSteamLayer() {
    if (!image) return;

    // 1. Draw blurred image
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'blur(20px)';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    // 2. Draw steam overlay
    const gradient = ctx.createLinearGradient(
      0, 0, canvas.width, canvas.height
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(220, 230, 240, 1)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Reset for scratching
    ctx.globalCompositeOperation = 'destination-out';
  }

  function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    drawSteamLayer();
  }

  function scratch(event) {
    const rect = canvas.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) * dpr;
    const pointerY = (event.clientY - rect.top) * dpr;
    const radius = SCRATCH_RADIUS * dpr;

    const gradient = ctx.createRadialGradient(pointerX, pointerY, 0, pointerX, pointerY, radius);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(0.4, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(pointerX, pointerY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function startDrawing(event) {
    isDrawing = true;
    scratch(event);
    createDrops(event);
    event.preventDefault();
  }

  function continueDrawing(event) {
    if (!isDrawing) {
      return;
    }
    event.preventDefault();
    scratch(event);
    if (Math.random() > 0.85) {
      createDrops(event);
    }
  }

  function createDrops(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const drop = document.createElement('div');
    drop.className = 'steam-drop';

    // Randomize size and position slightly
    const size = Math.random() * 15 + 15; // 15px to 30px
    drop.style.width = `${size}px`;
    drop.style.height = `${size}px`;

    // Offset slightly so it doesn't look like it spawns EXACTLY under cursor
    const offsetX = (Math.random() - 0.5) * 20;
    drop.style.left = `${x + offsetX}px`;
    drop.style.top = `${y}px`;

    // Randomize fall duration (20% faster than 3-5s => ~2.4-4s)
    const duration = Math.random() * 1.6 + 2.4;
    drop.style.animationDuration = `${duration}s`;

    container.appendChild(drop);

    // Remove after animation
    setTimeout(() => drop.remove(), duration * 1000);
  }

  function stopDrawing() {
    isDrawing = false;
  }

  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', continueDrawing);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointerleave', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });

  window.addEventListener('resize', resizeCanvas);
  image.addEventListener('load', () => {
    drawSteamLayer();
  });
  image.addEventListener('error', () => {
    setStatus('Nie udało się wczytać tej karty. Sprawdź nazwę pliku i spróbuj ponownie.');
  });

  nextButton.addEventListener('click', () => {
    showRandomCard();
    resizeCanvas();
  });

  resizeCanvas();
  loadCards();
}

document.addEventListener('DOMContentLoaded', () => {
  if (!ensureAccess()) {
    return;
  }
  initThemeToggle(document.getElementById('theme-toggle'));
  createScratchCard();
});
