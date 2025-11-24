import { initThemeToggle } from './app.js';
import { TRUTH_DARE_DECK } from './prawda-wyzwanie-data.js';

const ACCESS_KEY = 'momenty.truthdare.access';
const ACCESS_PAGE = 'prawda-wyzwanie.html';

const elements = {
  themeToggle: document.getElementById('theme-toggle'),
  introCard: document.getElementById('intro-card'),
  nameForm: document.getElementById('name-form'),
  nameInput: document.getElementById('player-name'),
  gameCard: document.getElementById('game-card'),
  categoryList: document.getElementById('category-list'),
  selectAllButton: document.getElementById('select-all'),
  truthCard: document.getElementById('truth-card'),
  truthText: document.getElementById('truth-text'),
  dareCard: document.getElementById('dare-card'),
  dareText: document.getElementById('dare-text'),
  statusMessage: document.getElementById('status-message'),
  resultSuccess: document.getElementById('mark-success'),
  resultFail: document.getElementById('mark-fail'),
  lastPickLabel: document.getElementById('last-pick-label'),
  reactionsList: document.getElementById('reactions-list'),
  shareButton: document.getElementById('share-room'),
  singleDeviceButton: document.getElementById('single-device'),
  shareBar: document.getElementById('share-bar'),
  shareFeedback: document.getElementById('share-feedback'),
};

const state = {
  playerName: '',
  selectedCategories: new Set(),
  history: new Set(),
  currentCard: null,
  reactions: [],
  singleDevice: false,
  revealed: {
    truth: false,
    dare: false,
  },
  awaitingResult: false,
};

const DEFAULT_CARD_TEXT = {
  truth: elements.truthText?.textContent?.trim() || 'Kliknij, aby odsłonić prawdę.',
  dare: elements.dareText?.textContent?.trim() || 'Kliknij, aby odsłonić wyzwanie.',
};

const CATEGORY_DEFAULT_COLOR = '#f8e8ff';

function ensureAccess() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('auto')) {
    sessionStorage.setItem(ACCESS_KEY, 'true');
  }
  if (sessionStorage.getItem(ACCESS_KEY) === 'true') {
    return true;
  }
  window.location.replace(ACCESS_PAGE);
  return false;
}

function renderCategories() {
  if (!elements.categoryList) return;
  elements.categoryList.innerHTML = '';
  const fragment = document.createDocumentFragment();
  TRUTH_DARE_DECK.forEach((category) => {
    const label = document.createElement('label');
    label.className = 'category-chip';
    label.style.setProperty('--category-color', category.color || CATEGORY_DEFAULT_COLOR);
    label.style.setProperty('--category-accent', category.accent || '#9b4dca');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'category';
    checkbox.value = category.id;
    checkbox.setAttribute('aria-label', category.name);

    const dot = document.createElement('span');
    dot.className = 'category-chip__dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = '•';

    const text = document.createElement('span');
    text.textContent = category.name;

    label.append(checkbox, dot, text);
    fragment.append(label);
  });
  elements.categoryList.append(fragment);
}

function bindEvents() {
  elements.nameForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = elements.nameInput?.value.trim();
    if (!name) {
      elements.nameInput?.focus();
      return;
    }
    state.playerName = name;
    elements.introCard?.setAttribute('hidden', '');
    elements.gameCard?.removeAttribute('hidden');
    setStatus(`Hej, ${state.playerName}! Wybierz kategorie i kliknij prawdę lub wyzwanie, aby odsłonić kartę.`, 'info');
  });

  elements.categoryList?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[type="checkbox"][name="category"]');
    if (!checkbox) return;
    if (checkbox.checked) {
      state.selectedCategories.add(checkbox.value);
    } else {
      state.selectedCategories.delete(checkbox.value);
    }
    setStatus(`Zaznaczone kategorie: ${state.selectedCategories.size || 'brak'}.`, 'muted');
  });

  elements.selectAllButton?.addEventListener('click', () => {
    const checkboxes = elements.categoryList?.querySelectorAll('input[type="checkbox"][name="category"]');
    checkboxes?.forEach((box) => {
      box.checked = true;
      state.selectedCategories.add(box.value);
    });
    setStatus('Wybrano wszystkie kategorie.', 'info');
  });

  elements.truthCard?.addEventListener('click', () => handleCardClick('truth'));
  elements.dareCard?.addEventListener('click', () => handleCardClick('dare'));

  elements.resultSuccess?.addEventListener('click', () => markResult(true));
  elements.resultFail?.addEventListener('click', () => markResult(false));

  elements.shareButton?.addEventListener('click', handleShare);
  elements.singleDeviceButton?.addEventListener('click', () => {
    state.singleDevice = true;
    elements.shareBar?.setAttribute('hidden', '');
    setStatus('Tryb jednego urządzenia włączony. Zarządzaj turami na tym ekranie.', 'info');
    if (elements.lastPickLabel) {
      if (state.currentCard) {
        const label = state.currentCard.type === 'truth' ? 'Prawda' : 'Wyzwanie';
        elements.lastPickLabel.textContent = `Wybrano: ${label}.`;
      } else {
        elements.lastPickLabel.textContent = 'Czekamy na wybór prawdy lub wyzwania.';
      }
    }
  });
}

function drawCard(type) {
  if (state.selectedCategories.size === 0) {
    setStatus('Najpierw wybierz przynajmniej jedną kategorię.', 'error');
    return false;
  }
  const selected = TRUTH_DARE_DECK.filter((cat) => state.selectedCategories.has(cat.id));
  if (!selected.length) {
    setStatus('Brak pasujących kategorii.', 'error');
    return false;
  }
  const category = selected[Math.floor(Math.random() * selected.length)];
  const pool = type === 'truth' ? category.truths : category.dares;
  if (!pool || pool.length === 0) {
    setStatus('Wybrana kategoria nie ma treści do wylosowania.', 'error');
    return false;
  }

  const seenKeyPrefix = `${category.id}:${type}:`;
  if (state.history.size >= TRUTH_DARE_DECK.length * 100) {
    state.history.clear();
  }

  let pick = null;
  let attempts = 0;
  while (attempts < 50) {
    const index = Math.floor(Math.random() * pool.length);
    const key = `${seenKeyPrefix}${index}`;
    attempts += 1;
    if (!state.history.has(key) || state.history.size > pool.length * selected.length * 0.8) {
      state.history.add(key);
      pick = pool[index];
      break;
    }
  }

  if (!pick) {
    pick = pool[Math.floor(Math.random() * pool.length)];
  }

  state.currentCard = {
    type,
    categoryId: category.id,
    categoryName: category.name,
    text: pick,
  };
  state.revealed[type] = false;
  setCardReveal(type, false);
  updateCurrentCard();
  setStatus(`Wylosowano ${type === 'truth' ? 'prawdę' : 'wyzwanie'}.`, 'info');
  return true;
}

function updateCurrentCard() {
  if (!state.currentCard) return;
  const { type, text } = state.currentCard;
  if (type === 'truth') {
    if (elements.truthText) elements.truthText.textContent = text;
  } else {
    if (elements.dareText) elements.dareText.textContent = text;
  }
  elements.resultSuccess?.removeAttribute('disabled');
  elements.resultFail?.removeAttribute('disabled');
  if (elements.lastPickLabel) {
    const label = type === 'truth' ? 'Prawda' : 'Wyzwanie';
    elements.lastPickLabel.textContent = state.singleDevice
      ? `Wybrano: ${label}.`
      : `${state.playerName || 'Gracz'} gra: ${label}.`;
  }
}

function setCardReveal(type, revealed) {
  const card = type === 'truth' ? elements.truthCard : elements.dareCard;
  if (!card) return;
  state.revealed[type] = revealed;
  card.classList.toggle('question-card--revealed', revealed);
}

function updateCardLocks(activeType = null) {
  const truthDisabled = state.awaitingResult && activeType === 'dare';
  const dareDisabled = state.awaitingResult && activeType === 'truth';

  if (elements.truthCard) {
    elements.truthCard.disabled = truthDisabled;
    elements.truthCard.classList.toggle('question-card--locked', truthDisabled);
  }

  if (elements.dareCard) {
    elements.dareCard.disabled = dareDisabled;
    elements.dareCard.classList.toggle('question-card--locked', dareDisabled);
  }
}

function lockCards(activeType) {
  state.awaitingResult = true;
  updateCardLocks(activeType);
}

function unlockCards() {
  state.awaitingResult = false;
  updateCardLocks(null);
}

function resetCard(type) {
  const textElement = type === 'truth' ? elements.truthText : elements.dareText;
  if (textElement) {
    textElement.textContent = DEFAULT_CARD_TEXT[type];
  }
  setCardReveal(type, false);
}

function resetCards() {
  resetCard('truth');
  resetCard('dare');
}

function handleCardClick(type) {
  if (state.awaitingResult) {
    const sameType = state.currentCard?.type === type;
    const pendingLabel = state.currentCard?.type === 'truth' ? 'prawdę' : 'wyzwanie';
    const message = sameType
      ? 'Oceń bieżącą kartę, zanim wylosujesz następną.'
      : `Najpierw zakończ ${pendingLabel}, zanim wylosujesz kolejną kartę.`;
    setStatus(message, 'error');
    return;
  }
  const drawn = drawCard(type);
  if (!drawn) return;
  lockCards(type);
  requestAnimationFrame(() => setCardReveal(type, true));
}

function markResult(success) {
  if (!state.currentCard) {
    setStatus('Wylosuj pytanie lub wyzwanie, zanim ocenisz wynik.', 'error');
    return;
  }
  const entry = {
    ...state.currentCard,
    player: state.playerName || 'Gracz',
    outcome: success ? 'Wykonał' : 'Nie wykonał',
    timestamp: new Date(),
  };
  state.reactions.unshift(entry);
  if (state.reactions.length > 12) {
    state.reactions.pop();
  }
  renderReactions();
  setStatus(`${entry.player} ${success ? 'wykonał/a' : 'nie wykonał/a'} zadania.`, success ? 'success' : 'muted');
  state.currentCard = null;
  resetCards();
  if (elements.lastPickLabel) {
    elements.lastPickLabel.textContent = 'Czekamy na wybór prawdy lub wyzwania.';
  }
  elements.resultSuccess?.setAttribute('disabled', '');
  elements.resultFail?.setAttribute('disabled', '');
  unlockCards();
}

function renderReactions() {
  if (!elements.reactionsList) return;
  elements.reactionsList.innerHTML = '';
  const fragment = document.createDocumentFragment();
  state.reactions.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'reactions__item';

    const meta = document.createElement('div');
    meta.className = 'reactions__meta';

    const author = document.createElement('span');
    author.className = 'reactions__author';
    author.textContent = item.player;

    const label = document.createElement('span');
    label.className = 'reactions__label';
    label.textContent = `${item.outcome} • ${item.type === 'truth' ? 'Prawda' : 'Wyzwanie'}`;

    meta.append(author, label);

    const question = document.createElement('p');
    question.className = 'reactions__question';
    question.textContent = item.text;

    li.append(meta, question);
    fragment.append(li);
  });
  elements.reactionsList.append(fragment);
}

async function handleShare() {
  if (!elements.shareFeedback) return;
  const url = window.location.href;
  const title = 'Prawda czy Wyzwanie – pokój gry';
  const text = 'Dołącz do mojego pokoju i zagrajmy w Prawda czy Wyzwanie!';
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      elements.shareFeedback.textContent = 'Link wysłany przez system udostępniania.';
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      elements.shareFeedback.textContent = 'Skopiowano link do schowka.';
    } else {
      elements.shareFeedback.textContent = 'Skopiuj link z paska adresu, aby zaprosić znajomych.';
    }
    elements.shareFeedback.hidden = false;
  } catch (error) {
    console.error(error);
    elements.shareFeedback.textContent = 'Nie udało się udostępnić. Spróbuj ponownie.';
    elements.shareFeedback.hidden = false;
  }
}

function setStatus(message, tone = 'info') {
  if (!elements.statusMessage) return;
  elements.statusMessage.textContent = message;
  elements.statusMessage.dataset.tone = tone;
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle(elements.themeToggle);
  if (!ensureAccess()) return;
  renderCategories();
  bindEvents();
  setStatus('Najpierw zaznacz kategorie, potem kliknij prawdę lub wyzwanie, aby odsłonić kartę.', 'muted');
  resetCards();
  unlockCards();
});
