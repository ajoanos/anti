import { initThemeToggle } from './app.js';
import { QUESTION_DECK } from './sekundy-data.js';

const ACCESS_KEY = 'momenty.timer.access';
const ACCESS_PAGE = '5-7-10.html';
const TIMER_OPTIONS = [5, 7, 10];

const elements = {
  themeToggle: document.getElementById('theme-toggle'),
  playersCard: document.getElementById('players-card'),
  gameCard: document.getElementById('game-card'),
  playersForm: document.getElementById('players-form'),
  playersFields: document.getElementById('players-fields'),
  playersError: document.getElementById('players-error'),
  addPlayerButton: document.getElementById('add-player'),
  playersList: document.getElementById('players-list'),
  playerLabel: document.getElementById('player-label'),
  categoryList: document.getElementById('category-list'),
  selectAllButton: document.getElementById('select-all'),
  timerOptions: document.getElementById('timer-options'),
  questionCard: document.getElementById('question-card'),
  questionCategory: document.getElementById('question-category'),
  questionText: document.getElementById('question-text'),
  questionActionButton: document.getElementById('question-action'),
  skipQuestionButton: document.getElementById('skip-question'),
  timerValue: document.getElementById('timer-value'),
  timerStatus: document.getElementById('timer-status'),
  timerStart: document.getElementById('start-timer'),
  timerProgress: document.getElementById('timer-progress'),
  timerVisual: document.querySelector('.timer-visual'),
  timerFocusOverlay: document.getElementById('timer-focus-overlay'),
  timerFocusValue: document.getElementById('timer-focus-value'),
  successButton: document.getElementById('mark-success'),
  failButton: document.getElementById('mark-fail'),
  gameMessage: document.getElementById('game-message'),
};

const state = {
  players: [],
  activePlayerIndex: 0,
  currentPlayerIndex: null,
  timerDuration: TIMER_OPTIONS[0],
  selectedCategories: new Set(),
  currentQuestion: null,
  readyForNext: true,
  awaitingResult: false,
  questionHistory: new Set(),
  hasDrawnQuestion: false,
};

const timerState = {
  running: false,
  duration: TIMER_OPTIONS[0],
  remaining: TIMER_OPTIONS[0],
  startTimestamp: 0,
  lastWholeSecond: null,
  rafId: null,
};

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 54;
let playerFieldCount = document.querySelectorAll('[data-player-field]').length || 0;
let audioCtx = null;

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle(elements.themeToggle);
  if (!ensureAccess()) {
    return;
  }
  renderCategoryList();
  renderTimerOptions();
  bindEvents();
  updateTimerVisual();
  setGameMessage('Najpierw dodajcie graczy, a potem losujcie pytania.', 'muted');
  updateQuestionActionLabel();
  updateControls();
});

function ensureAccess() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('auto')) {
    sessionStorage.setItem(ACCESS_KEY, 'true');
    if (window.history.replaceState) {
      params.delete('auto');
      const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
    }
  }
  if (sessionStorage.getItem(ACCESS_KEY) === 'true') {
    return true;
  }
  window.location.replace(ACCESS_PAGE);
  return false;
}

function bindEvents() {
  elements.addPlayerButton?.addEventListener('click', addPlayerField);
  elements.playersForm?.addEventListener('submit', handlePlayersSubmit);
  elements.selectAllButton?.addEventListener('click', selectAllCategories);
  elements.timerOptions?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-duration]');
    if (!button) return;
    const duration = Number(button.dataset.duration);
    if (!Number.isFinite(duration) || duration <= 0 || timerState.running) {
      return;
    }
    state.timerDuration = duration;
    timerState.duration = duration;
    timerState.remaining = duration;
    updateTimerOptions();
    updateTimerVisual();
    setGameMessage(`Ustawiono ${duration} sekund na odpowiedź.`, 'info');
  });
  const drawHandler = () => requestQuestionDraw();
  elements.questionActionButton?.addEventListener('click', drawHandler);
  elements.skipQuestionButton?.addEventListener('click', skipCurrentQuestion);
  elements.timerStart?.addEventListener('click', () => {
    if (!state.currentQuestion) {
      setGameMessage('Wylosuj pytanie, zanim uruchomisz licznik.', 'error');
      return;
    }
    if (timerState.running) {
      return;
    }
    startTimer();
  });
  elements.successButton?.addEventListener('click', () => markResult(true));
  elements.failButton?.addEventListener('click', () => markResult(false));
}

function addPlayerField() {
  playerFieldCount += 1;
  const label = document.createElement('label');
  label.className = 'form__field players-form__field';
  label.dataset.playerField = 'true';
  const span = document.createElement('span');
  span.textContent = `Gracz ${playerFieldCount}`;
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'player';
  input.placeholder = 'np. Alex';
  input.maxLength = 32;
  label.append(span, input);
  elements.playersFields?.append(label);
  input.focus();
}

function handlePlayersSubmit(event) {
  event.preventDefault();
  const inputs = Array.from(elements.playersFields?.querySelectorAll('input[name="player"]') || []);
  const names = inputs.map((input) => input.value.trim()).filter(Boolean);
  if (names.length < 2) {
    if (elements.playersError) {
      elements.playersError.hidden = false;
    }
    return;
  }
  elements.playersError?.setAttribute('hidden', '');
  state.players = names.map((name, index) => ({ id: `p-${index}`, name, score: 0 }));
  state.activePlayerIndex = 0;
  state.currentPlayerIndex = null;
  state.currentQuestion = null;
  state.readyForNext = true;
  state.awaitingResult = false;
  state.questionHistory.clear();
  state.hasDrawnQuestion = false;
  resetTimer();
  renderPlayers();
  updatePlayerLabel();
  // elements.playersCard?.setAttribute('hidden', '');
  elements.gameCard?.removeAttribute('hidden');
  setGameMessage('Gracze dodani! Wybierzcie kategorie, ustawcie czas i kliknijcie „Losuj pytanie”.', 'info');
  updateControls();
  updateQuestionActionLabel();
}

function renderPlayers() {
  if (!elements.playersList) return;
  elements.playersList.innerHTML = '';
  const fragment = document.createDocumentFragment();
  state.players.forEach((player, index) => {
    const item = document.createElement('li');
    item.className = 'player-chip';
    if (state.currentPlayerIndex !== null && index === state.currentPlayerIndex) {
      item.classList.add('player-chip--active');
    } else if (state.currentPlayerIndex === null && index === state.activePlayerIndex) {
      item.classList.add('player-chip--next');
    }
    const name = document.createElement('span');
    name.className = 'player-chip__name';
    name.textContent = player.name;
    const score = document.createElement('span');
    score.className = 'player-chip__score';
    const pointsLabel = player.score === 1 ? '1 pkt' : `${player.score} pkt`;
    score.textContent = pointsLabel;
    item.append(name, score);
    fragment.append(item);
  });
  elements.playersList.append(fragment);
}

function renderCategoryList() {
  if (!elements.categoryList) return;
  elements.categoryList.innerHTML = '';
  const fragment = document.createDocumentFragment();
  QUESTION_DECK.forEach((category) => {
    const label = document.createElement('label');
    label.className = 'category-chip';
    const baseColor = category.color || '#f5d7de';
    const accentColor = category.accent || baseColor;
    label.style.setProperty('--category-color', baseColor);
    label.style.setProperty('--category-accent', accentColor);
    const darkerShade = deriveDarkerShade(accentColor);
    if (darkerShade) {
      label.style.setProperty('--category-shade', darkerShade);
    }
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'category';
    input.value = category.id;
    input.checked = state.selectedCategories.has(category.id);
    input.addEventListener('change', () => toggleCategory(category.id, input.checked));
    const span = document.createElement('span');
    span.textContent = category.name;
    label.append(input, span);
    fragment.append(label);
  });
  elements.categoryList.append(fragment);
}

function toggleCategory(categoryId, isChecked) {
  if (isChecked) {
    state.selectedCategories.add(categoryId);
  } else {
    state.selectedCategories.delete(categoryId);
  }
  state.questionHistory.clear();
  if (!state.selectedCategories.size) {
    setGameMessage('Wybierz przynajmniej jedną kategorię.', 'error');
  }
}

function selectAllCategories() {
  QUESTION_DECK.forEach((category) => state.selectedCategories.add(category.id));
  state.questionHistory.clear();
  renderCategoryList();
  setGameMessage('Wszystkie kategorie zaznaczone.', 'info');
}

function requestQuestionDraw() {
  if (!state.players.length) {
    setGameMessage('Dodaj graczy, aby rozpocząć.', 'error');
    return;
  }
  if (timerState.running) {
    setGameMessage('Najpierw zatrzymaj aktualny licznik.', 'error');
    return;
  }
  if (!state.readyForNext && state.currentQuestion) {
    setGameMessage('Oceń poprzednie pytanie zanim losujesz kolejne.', 'error');
    return;
  }
  drawQuestion();
}

function skipCurrentQuestion() {
  if (!state.currentQuestion) {
    setGameMessage('Nie ma pytania do pominięcia. Najpierw je wylosuj.', 'error');
    return;
  }
  if (timerState.running) {
    setGameMessage('Najpierw zatrzymaj licznik, a potem pomiń pytanie.', 'error');
    return;
  }
  if (state.awaitingResult) {
    setGameMessage('Oceń aktualne pytanie zanim je pominiesz.', 'error');
    return;
  }
  if (state.currentQuestion?.id) {
    state.questionHistory.delete(state.currentQuestion.id);
  }
  state.currentQuestion = null;
  state.currentPlayerIndex = null;
  state.readyForNext = true;
  setGameMessage('Pytanie pominięte. Losuję nowe z wybranych kategorii.', 'info');
  updateControls();
  drawQuestion();
}

function renderTimerOptions() {
  if (!elements.timerOptions) return;
  const fragment = document.createDocumentFragment();
  TIMER_OPTIONS.forEach((duration) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'timer-option';
    button.dataset.duration = duration;
    button.textContent = `${duration} s`;
    if (duration === state.timerDuration) {
      button.classList.add('timer-option--active');
    }
    fragment.append(button);
  });
  elements.timerOptions.append(fragment);
}

function updateTimerOptions() {
  if (!elements.timerOptions) return;
  elements.timerOptions.querySelectorAll('button[data-duration]').forEach((button) => {
    const duration = Number(button.dataset.duration);
    if (duration === state.timerDuration) {
      button.classList.add('timer-option--active');
    } else {
      button.classList.remove('timer-option--active');
    }
    button.disabled = timerState.running;
  });
}

function drawQuestion() {
  const selectedCategories = QUESTION_DECK.filter((category) => state.selectedCategories.has(category.id));
  if (!selectedCategories.length) {
    setGameMessage('Najpierw zaznacz przynajmniej jedną kategorię.', 'error');
    return;
  }
  const pool = [];
  selectedCategories.forEach((category) => {
    category.questions.forEach((text, index) => {
      pool.push({ id: `${category.id}-${index}`, text, category });
    });
  });
  let availablePool = pool.filter((item) => !state.questionHistory.has(item.id));
  if (!availablePool.length) {
    state.questionHistory.clear();
    availablePool = pool;
  }
  const uniqueCategories = Array.from(
    new Map(availablePool.map((item) => [item.category.id, item.category])).values(),
  );
  if (!uniqueCategories.length) {
    setGameMessage('Brak pytań w zaznaczonych kategoriach.', 'error');
    return;
  }
  const chosenCategory = uniqueCategories[randomInt(uniqueCategories.length)];
  const categoryPool = availablePool.filter((item) => item.category.id === chosenCategory.id);
  const nextQuestion = categoryPool[randomInt(categoryPool.length)];
  state.questionHistory.add(nextQuestion.id);
  state.currentQuestion = nextQuestion;
  state.currentPlayerIndex = state.activePlayerIndex;
  state.readyForNext = false;
  state.awaitingResult = false;
  state.hasDrawnQuestion = true;
  resetTimer();
  updateQuestionCard(nextQuestion);
  renderPlayers();
  updatePlayerLabel();
  setGameMessage(`🔥 ${state.players[state.currentPlayerIndex]?.name || 'Gracz'} ma ${state.timerDuration} sekund na zadanie.`, 'info');
  updateControls();
  updateQuestionActionLabel();
}

function updateQuestionCard(question) {
  if (!elements.questionCard || !elements.questionCategory || !elements.questionText) {
    return;
  }
  elements.questionCategory.textContent = question.category.name;
  elements.questionText.textContent = question.text;
  elements.questionCard.style.setProperty('--question-bg', question.category.color);
  elements.questionCard.style.setProperty('--question-border', question.category.accent);
  elements.questionCard.classList.remove('question-card--animate');
  void elements.questionCard.offsetWidth;
  elements.questionCard.classList.add('question-card--animate');
}

function startTimer() {
  const ctx = ensureAudioContext();
  ctx?.resume?.();
  timerState.running = true;
  timerState.duration = state.timerDuration;
  timerState.remaining = state.timerDuration;
  timerState.startTimestamp = performance.now();
  timerState.lastWholeSecond = Math.ceil(state.timerDuration);
  elements.timerStart.disabled = true;
  elements.timerStart.textContent = 'Licznik w toku…';
  elements.timerStatus.textContent = 'Odpowiadajcie – licznik działa!';
  playTick();
  updateTimerOptions();
  updateTimerVisual();

  // Focus Mode Start
  if (elements.timerFocusOverlay) {
    elements.timerFocusOverlay.classList.add('is-active');
    updateFocusModeVisual();
  }

  timerState.rafId = requestAnimationFrame(handleTimerFrame);
}

function handleTimerFrame(now) {
  const elapsed = (now - timerState.startTimestamp) / 1000;
  const remaining = Math.max(timerState.duration - elapsed, 0);
  timerState.remaining = remaining;
  const wholeSeconds = Math.ceil(remaining);
  if (wholeSeconds !== timerState.lastWholeSecond) {
    timerState.lastWholeSecond = wholeSeconds;
    playTick();

    // Pulse animation for main timer
    if (elements.timerValue) {
      elements.timerValue.classList.remove('pulse-tick');
      void elements.timerValue.offsetWidth; // Trigger reflow
      elements.timerValue.classList.add('pulse-tick');
    }

    // Pulse animation for focus mode
    if (elements.timerFocusValue) {
      elements.timerFocusValue.classList.remove('pulse-tick');
      void elements.timerFocusValue.offsetWidth; // Trigger reflow
      elements.timerFocusValue.classList.add('pulse-tick');
    }
  }
  updateTimerVisual();
  updateFocusModeVisual();
  if (remaining <= 0.05) {
    finishTimer();
    return;
  }
  timerState.rafId = requestAnimationFrame(handleTimerFrame);
}

function finishTimer() {
  if (!timerState.running) return;
  cancelAnimationFrame(timerState.rafId || 0);
  timerState.running = false;
  timerState.remaining = 0;
  elements.timerStart.disabled = false;
  elements.timerStart.textContent = '🎙️ START CZASU';
  elements.timerStatus.textContent = 'Czas minął! Oceńcie zadanie.';
  state.awaitingResult = true;
  enableResultButtons(true);
  updateTimerOptions();
  updateTimerOptions();
  updateTimerVisual();

  // Focus Mode End
  if (elements.timerFocusOverlay) {
    elements.timerFocusOverlay.classList.remove('is-active');
  }

  setGameMessage('Kliknij Wykonane lub Niewykonane, aby przyznać punkt.', 'info');
  playFinalChime();
  updateControls();
  scrollToResultsPanel();
}

function resetTimer() {
  cancelAnimationFrame(timerState.rafId || 0);
  timerState.running = false;
  timerState.duration = state.timerDuration;
  timerState.remaining = state.timerDuration;
  timerState.lastWholeSecond = Math.ceil(state.timerDuration);
  elements.timerStart.disabled = false;
  elements.timerStart.textContent = '🎙️ START CZASU';
  elements.timerStatus.textContent = 'Gotowy do startu.';
  enableResultButtons(false);
  updateTimerOptions();
  updateTimerOptions();
  updateTimerVisual();

  // Focus Mode Reset
  if (elements.timerFocusOverlay) {
    elements.timerFocusOverlay.classList.remove('is-active');
  }
}

function updateTimerVisual() {
  if (!elements.timerValue || !elements.timerProgress) return;
  const duration = timerState.duration || state.timerDuration || 1;
  const progress = Math.min(1, Math.max(0, 1 - timerState.remaining / duration));
  const offset = TIMER_CIRCUMFERENCE * progress;
  elements.timerProgress.style.strokeDasharray = TIMER_CIRCUMFERENCE;
  elements.timerProgress.style.strokeDashoffset = offset;
  const labelValue = timerState.running ? Math.max(0, Math.ceil(timerState.remaining)) : Math.ceil(state.timerDuration);
  elements.timerValue.textContent = String(labelValue);

  // Toggle visibility class on the container
  // Toggle visibility class on the container
  if (elements.timerVisual) {
    elements.timerVisual.classList.remove('timer-visual--hidden');
  }
}

function enableResultButtons(enabled) {
  if (elements.successButton) {
    elements.successButton.disabled = !enabled;
  }
  if (elements.failButton) {
    elements.failButton.disabled = !enabled;
  }
}

function markResult(success) {
  if (!state.awaitingResult || state.currentPlayerIndex === null) {
    setGameMessage('Poczekaj na koniec licznika, aby ocenić zadanie.', 'error');
    return;
  }
  state.awaitingResult = false;
  state.readyForNext = true;
  if (success && state.players[state.currentPlayerIndex]) {
    state.players[state.currentPlayerIndex].score += 1;
  }
  const playerName = state.players[state.currentPlayerIndex]?.name || 'Gracz';
  const feedback = success
    ? `+1 punkt dla ${playerName}! Kliknij „Losuj pytanie” lub „Następne pytanie”.`
    : `${playerName} spróbuje następnym razem. Przejdź do kolejnego pytania przyciskiem „Losuj pytanie” lub „Następne pytanie”.`;
  setGameMessage(feedback, 'info');
  state.activePlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.currentPlayerIndex = null;
  enableResultButtons(false);
  renderPlayers();
  updatePlayerLabel();
  updateControls();
  scrollToQuestionPanel();
}

function updatePlayerLabel() {
  if (!elements.playerLabel) return;
  if (!state.players.length) {
    elements.playerLabel.textContent = 'Następny gracz: —';
    return;
  }
  if (state.currentPlayerIndex !== null) {
    elements.playerLabel.textContent = `Teraz gra: ${state.players[state.currentPlayerIndex].name}`;
  } else {
    elements.playerLabel.textContent = `Następny gracz: ${state.players[state.activePlayerIndex].name}`;
  }
}

function updateControls() {
  if (elements.questionActionButton) {
    const canDraw = !timerState.running && (!state.currentQuestion || state.readyForNext);
    elements.questionActionButton.disabled = !canDraw;
  }
  if (elements.timerStart) {
    const disableTimer = timerState.running || !state.currentQuestion || state.awaitingResult;
    elements.timerStart.disabled = disableTimer;
  }
  if (elements.skipQuestionButton) {
    const canSkip =
      Boolean(state.currentQuestion) && !timerState.running && !state.awaitingResult && !state.readyForNext;
    elements.skipQuestionButton.disabled = !canSkip;
  }
}

function updateQuestionActionLabel() {
  if (!elements.questionActionButton) return;
  const label = state.hasDrawnQuestion ? '➡️ Następne pytanie' : '🎲 Losuj pytanie';
  elements.questionActionButton.textContent = label;
}

function setGameMessage(text, tone = 'info') {
  if (!elements.gameMessage) return;
  elements.gameMessage.textContent = text || '';
  elements.gameMessage.dataset.tone = tone;
}

function deriveDarkerShade(color) {
  if (typeof color !== 'string') {
    return '';
  }
  const trimmed = color.trim();
  const match = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return '';
  }
  const hex = match[1];
  const factor = 0.82;
  const r = Math.round(parseInt(hex.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(hex.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(hex.slice(4, 6), 16) * factor);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
}

function randomInt(maxExclusive) {
  const max = Math.floor(maxExclusive);
  if (!Number.isFinite(max) || max <= 0) {
    return 0;
  }
  const cryptoObj = window.crypto || window.msCrypto;
  if (cryptoObj?.getRandomValues) {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / max) * max;
    do {
      cryptoObj.getRandomValues(buffer);
    } while (buffer[0] >= limit);
    return buffer[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function ensureAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => { });
    }
    return audioCtx;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return null;
  }
  audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => { });
  }
  return audioCtx;
}

function playTick() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.value = 0.0001;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

function playFinalChime() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(0.7, now + 0.08);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
  master.connect(ctx.destination);

  const sweep = ctx.createOscillator();
  const sweepGain = ctx.createGain();
  sweep.type = 'triangle';
  sweep.frequency.setValueAtTime(520, now);
  sweep.frequency.exponentialRampToValueAtTime(1080, now + 0.45);
  sweepGain.gain.setValueAtTime(0.001, now);
  sweepGain.gain.linearRampToValueAtTime(0.5, now + 0.04);
  sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
  sweep.connect(sweepGain).connect(master);
  sweep.start(now);
  sweep.stop(now + 1.8);

  const sparkle = ctx.createOscillator();
  const sparkleGain = ctx.createGain();
  sparkle.type = 'sine';
  sparkle.frequency.setValueAtTime(660, now + 0.22);
  sparkle.frequency.exponentialRampToValueAtTime(1400, now + 0.9);
  sparkleGain.gain.setValueAtTime(0.0001, now);
  sparkleGain.gain.linearRampToValueAtTime(0.35, now + 0.35);
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
  sparkle.connect(sparkleGain).connect(master);
  sparkle.start(now + 0.22);
  sparkle.stop(now + 2.3);

  const lowBell = ctx.createOscillator();
  const lowGain = ctx.createGain();
  lowBell.type = 'sawtooth';
  lowBell.frequency.setValueAtTime(280, now);
  lowBell.frequency.linearRampToValueAtTime(420, now + 0.6);
  lowGain.gain.setValueAtTime(0.0001, now);
  lowGain.gain.linearRampToValueAtTime(0.25, now + 0.08);
  lowGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
  lowBell.connect(lowGain).connect(master);
  lowBell.start(now);
  lowBell.stop(now + 1.7);
}

function scrollToResultsPanel() {
  const panel = elements.successButton?.closest('.panel') || elements.successButton?.parentElement;
  smoothScrollIntoView(panel);
}

function scrollToQuestionPanel() {
  const panel = elements.questionCard?.closest('.panel') || elements.questionCard;
  smoothScrollIntoView(panel);
}

function updateFocusModeVisual() {
  if (!elements.timerFocusOverlay || !elements.timerFocusValue) return;

  const duration = timerState.duration || state.timerDuration || 1;
  const remaining = timerState.remaining;
  const progress = 1 - (remaining / duration); // 0 to 1

  // Update Value
  const labelValue = Math.ceil(remaining);
  elements.timerFocusValue.textContent = String(labelValue);

  // Interpolate Color: Sea (#63B9A6) to Red (#F26D6F)
  // Sea: RGB(99, 185, 166)
  // Red: RGB(242, 109, 111)

  const startColor = { r: 99, g: 185, b: 166 };
  const endColor = { r: 242, g: 109, b: 111 };

  const r = Math.round(startColor.r + (endColor.r - startColor.r) * progress);
  const g = Math.round(startColor.g + (endColor.g - startColor.g) * progress);
  const b = Math.round(startColor.b + (endColor.b - startColor.b) * progress);

  elements.timerFocusOverlay.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
}

function smoothScrollIntoView(target) {
  if (!target || typeof target.scrollIntoView !== 'function') {
    return;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
