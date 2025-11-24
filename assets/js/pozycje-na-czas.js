// Global error handler for this module
window.addEventListener('error', (e) => {
  const status = document.getElementById('timer-status');
  if (status) status.textContent = `Błąd krytyczny: ${e.message}`;
});

import { getJson, initThemeToggle } from './app.js';
import { STATIC_CARDS } from './pozycje-data.js';

// ... constants ...
const ACCESS_KEY = 'momenty.timer.access';
const ACCESS_PAGE = 'pozycje-na-czas.html';
const DEFAULT_DURATION = 60;
const ALERT_THRESHOLD = 10;
const FINAL_COUNTDOWN_START = 10;
const CELEBRATION_DURATION = 3000;
const CELEBRATION_DELAY = 400;

// ... ensureAccess and formatTime ...
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
  if (sessionStorage.getItem(ACCESS_KEY) === 'true') return true;
  window.location.replace(ACCESS_PAGE);
  return false;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const remaining = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

function selectRandomIndex(list, currentIndex) {
  if (!Array.isArray(list) || list.length === 0) return -1;
  if (list.length === 1) return 0;
  let index = Math.floor(Math.random() * list.length);
  if (index === currentIndex) index = (index + 1) % list.length;
  return index;
}

function initTimerGame() {
  const timerStatus = document.getElementById('timer-status');
  if (timerStatus) timerStatus.textContent = 'Inicjalizacja gry...';

  try {
    // Elements
    const timerCard = document.getElementById('game-card');
    const timerImage = document.getElementById('timer-image');
    const progressRing = document.getElementById('timer-progress-ring');
    const timerRemaining = document.getElementById('timer-remaining');
    const startButton = document.getElementById('start-timer');
    const skipButton = document.getElementById('skip-position');
    const durationRadios = document.querySelectorAll('input[name="timer_duration"]');
    const overlay = document.getElementById('timer-overlay');
    const countdownOverlay = document.getElementById('timer-countdown');

    if (!timerCard || !timerStatus || !timerImage || !progressRing || !timerRemaining || !startButton || !skipButton) {
      throw new Error('Brakuje elementów HTML. Odśwież stronę.');
    }

    // State
    let availableCards = [];
    let currentIndex = -1;
    let timerId = null;
    let timerEndsAt = 0;
    let timerTotal = DEFAULT_DURATION;
    let countdownActive = false;
    let lastFinalCountdownValue = null;
    let celebrationTimeoutId = null;
    let celebrationDelayId = null;
    const hasOverlaySupport = overlay && countdownOverlay;

    // Haptics Helper
    function vibrate(pattern) {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    }

    // Helper Functions
    function clearCelebrationDelay() {
      if (celebrationDelayId) { clearTimeout(celebrationDelayId); celebrationDelayId = null; }
    }

    function hideCelebration() {
      if (celebrationTimeoutId) { clearTimeout(celebrationTimeoutId); celebrationTimeoutId = null; }
      if (overlay?.dataset?.mode === 'celebration') overlay.dataset.mode = 'hidden';
    }

    function hideFinalCountdown() {
      lastFinalCountdownValue = null;
      if (overlay?.dataset?.mode === 'countdown') overlay.dataset.mode = 'hidden';
      if (countdownOverlay) countdownOverlay.textContent = '';
    }

    function showFinalCountdown(value) {
      if (!hasOverlaySupport) return;
      overlay.dataset.mode = 'countdown';
      countdownOverlay.textContent = String(value);
    }

    function triggerCelebration() {
      if (!overlay) return;
      hideFinalCountdown();
      hideCelebration();
      overlay.dataset.mode = 'celebration';
      vibrate([100, 50, 100, 50, 200]); // Celebration vibration
      celebrationTimeoutId = setTimeout(() => {
        if (overlay.dataset.mode === 'celebration') overlay.dataset.mode = 'hidden';
        celebrationTimeoutId = null;
      }, CELEBRATION_DURATION);
    }

    function getSelectedDuration() {
      for (const radio of durationRadios) {
        if (radio.checked) return Math.min(600, Math.max(10, Number(radio.value) || DEFAULT_DURATION));
      }
      return DEFAULT_DURATION;
    }

    function setProgress(percent) {
      // pathLength="1" in SVG makes this easy: 1 = full, 0 = empty
      // We want to go from 1 (full) to 0 (empty) or 0 (full) to 1 (empty) depending on stroke-dashoffset
      // Usually dasharray=1, dashoffset=0 is full. dashoffset=1 is empty.
      const offset = 1 - percent;
      progressRing.style.strokeDashoffset = offset;
    }

    function stopCountdown({ silent = false, preserveCountdownOverlay = false } = {}) {
      if (timerId) { clearInterval(timerId); timerId = null; }
      countdownActive = false;
      timerEndsAt = 0;

      setProgress(0); // Reset ring
      timerRemaining.textContent = formatTime(0);

      document.body.classList.remove('timer-alert');
      progressRing.classList.remove('danger');
      timerCard.classList.remove('pulse-danger');

      clearCelebrationDelay();
      hideCelebration();
      if (!preserveCountdownOverlay) hideFinalCountdown();

      if (!silent) {
        startButton.innerHTML = '<span class="icon">▶️</span> Start';
        timerStatus.textContent = 'Gotowi?';
      }
    }

    function updateCountdown() {
      if (!countdownActive || !timerEndsAt) return;
      const now = Date.now();
      const remainingMs = Math.max(0, timerEndsAt - now);
      const remainingSeconds = remainingMs / 1000;
      const elapsed = timerTotal - remainingSeconds;
      const percent = Math.max(0, remainingSeconds / timerTotal);

      setProgress(percent);
      timerRemaining.textContent = formatTime(Math.ceil(remainingSeconds));

      // Danger State (Last 10s)
      if (remainingSeconds <= ALERT_THRESHOLD && remainingSeconds > 0) {
        document.body.classList.add('timer-alert');
        progressRing.classList.add('danger');
        timerCard.classList.add('pulse-danger');
      } else {
        document.body.classList.remove('timer-alert');
        progressRing.classList.remove('danger');
        timerCard.classList.remove('pulse-danger');
      }

      // Final Countdown Overlay & Haptics
      if (remainingSeconds > 0 && remainingSeconds <= FINAL_COUNTDOWN_START) {
        const displayValue = Math.ceil(remainingSeconds);
        if (displayValue !== lastFinalCountdownValue) {
          lastFinalCountdownValue = displayValue;
          showFinalCountdown(displayValue);
          vibrate(50); // Tick vibration
        }
      } else if (lastFinalCountdownValue !== null) {
        hideFinalCountdown();
      }

      // Finish
      if (remainingMs <= 0) {
        stopCountdown({ silent: true, preserveCountdownOverlay: true });
        timerRemaining.textContent = '00:00';
        timerStatus.textContent = 'Czas minął!';
        startButton.innerHTML = '<span class="icon">🔄</span> Powtórz';

        countdownActive = false;
        lastFinalCountdownValue = 0;
        showFinalCountdown(0);

        clearCelebrationDelay();
        celebrationDelayId = setTimeout(triggerCelebration, CELEBRATION_DELAY);
      }
    }

    function startCountdown() {
      if (!availableCards.length) return;
      clearCelebrationDelay();
      hideCelebration();
      hideFinalCountdown();

      timerTotal = getSelectedDuration();
      setProgress(1); // Full ring
      timerRemaining.textContent = formatTime(timerTotal);

      timerEndsAt = Date.now() + timerTotal * 1000;
      countdownActive = true;

      document.body.classList.remove('timer-alert');
      progressRing.classList.remove('danger');
      timerCard.classList.remove('pulse-danger');

      timerStatus.textContent = 'Bawcie się dobrze!';
      startButton.innerHTML = '<span class="icon">⏹️</span> Stop';

      if (timerId) clearInterval(timerId);
      timerId = setInterval(updateCountdown, 50); // Smoother update
      updateCountdown();
    }



    // Roulette Logic
    let rouletteInterval = null;

    function startRoulette() {
      if (countdownActive) stopCountdown();
      if (rouletteInterval) clearInterval(rouletteInterval);

      timerStatus.textContent = 'Losowanie...';
      timerImage.classList.add('roulette-spin');

      let spins = 0;
      const maxSpins = 15;
      const speed = 80;

      rouletteInterval = setInterval(() => {
        showRandomCard({ silent: true });
        vibrate(10); // Light tick
        spins++;

        if (spins >= maxSpins) {
          clearInterval(rouletteInterval);
          timerImage.classList.remove('roulette-spin');
          timerStatus.textContent = 'Wylosowano! Zaczynamy?';
          vibrate([50, 50, 50]); // Success vibration
        }
      }, speed);
    }

    function showRandomCard({ silent = false } = {}) {
      if (!availableCards.length) return;
      const nextIndex = selectRandomIndex(availableCards, currentIndex);
      if (nextIndex < 0) {
        timerStatus.textContent = 'Brak dostępnych pozycji.';
        return;
      }
      currentIndex = nextIndex;
      const source = availableCards[nextIndex];

      // Preload next few images if possible? 
      // For now just set src
      timerImage.src = source;
      if (!silent) timerStatus.textContent = 'Nowa pozycja.';
    }

    function handleSkip() {
      startRoulette();
    }

    // Event Listeners
    timerImage.addEventListener('load', () => {
      // Optional: fade in effect
    });

    timerImage.addEventListener('error', (e) => {
      console.error('Image load error:', e);
      timerStatus.textContent = 'Błąd obrazka. Losuję inny...';
      setTimeout(() => showRandomCard(), 500);
    });

    startButton.addEventListener('click', () => {
      if (countdownActive) {
        stopCountdown();
      } else {
        startCountdown();
      }
    });

    skipButton.addEventListener('click', handleSkip);

    durationRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!countdownActive) {
          timerTotal = getSelectedDuration();
          timerRemaining.textContent = formatTime(timerTotal);
        }
      });
    });

    // Initial Setup
    availableCards = STATIC_CARDS;

    // Preload a few random images
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(Math.random() * availableCards.length);
      new Image().src = availableCards[idx];
    }

    timerStatus.textContent = 'Gotowi?';
    showRandomCard({ silent: true });
    startButton.disabled = false;
    skipButton.disabled = false;

  } catch (err) {
    console.error(err);
    if (timerStatus) timerStatus.textContent = `Błąd skryptu: ${err.message}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!ensureAccess()) return;
  initThemeToggle(document.getElementById('theme-toggle'));
  initTimerGame();
});
