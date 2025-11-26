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
  shareBar: document.getElementById('share-bar'),
  shareOpenButton: document.getElementById('share-open'),
  shareLayer: document.getElementById('share-layer'),
  shareCard: document.getElementById('share-card'),
  shareCloseButton: document.getElementById('share-close'),
  shareBackdrop: document.getElementById('share-backdrop'),
  shareHint: document.getElementById('share-hint'),
  shareShareFeedback: document.getElementById('share-share-feedback'),
  shareLinksContainer: document.getElementById('share-links'),
  shareCopyButton: document.getElementById('share-copy'),
  shareQrButton: document.getElementById('share-show-qr'),
  shareQrModal: document.getElementById('share-qr-modal'),
  shareQrImage: document.getElementById('share-qr-image'),
  shareQrUrl: document.getElementById('share-qr-url'),
  shareQrClose: document.getElementById('share-qr-close'),
  shareEmailForm: document.getElementById('share-email'),
  shareEmailInput: document.getElementById('share-email-input'),
  shareEmailFeedback: document.getElementById('share-email-feedback'),
  singleDeviceButton: document.getElementById('single-device'),
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

const EMAIL_ENDPOINT = 'api/send_positions_email.php';
const SHARE_EMAIL_SUBJECT = 'Prawda czy Wyzwanie – dołącz do mnie';
let shareLinkUrl = '';
let shareFeedbackTimer = null;
let shareSheetController = null;

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

  elements.shareOpenButton?.addEventListener('click', () => {
    if (shareSheetController?.open) {
      shareSheetController.open();
    }
  });
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

function buildShareUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('auto', '1');
  return url.toString();
}

function buildShareMessage(url) {
  return `Dołącz do mojego pokoju w Momenty: ${url}`;
}

function buildShareLinks(url) {
  const message = buildShareMessage(url);
  const encoded = encodeURIComponent(message);
  return {
    messenger: `https://m.me/?text=${encoded}`,
    whatsapp: `https://wa.me/?text=${encoded}`,
    sms: `sms:&body=${encoded}`,
  };
}

function resetShareFeedback() {
  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = null;
  }
  if (elements.shareShareFeedback) {
    elements.shareShareFeedback.hidden = true;
    elements.shareShareFeedback.textContent = '';
    delete elements.shareShareFeedback.dataset.tone;
  }
  if (elements.shareEmailFeedback) {
    elements.shareEmailFeedback.hidden = true;
    elements.shareEmailFeedback.textContent = '';
    delete elements.shareEmailFeedback.dataset.tone;
  }
}

function initializeShareSheet({
  bar,
  openButton,
  layer,
  card,
  closeButton,
  backdrop,
}) {
  if (!layer || !card || !openButton || !closeButton) {
    if (bar) bar.hidden = true;
    return null;
  }

  layer.hidden = false;
  layer.dataset.open = 'false';
  layer.setAttribute('aria-hidden', 'true');
  if (!card.hasAttribute('tabindex')) {
    card.tabIndex = -1;
  }
  openButton.disabled = true;
  openButton.setAttribute('aria-expanded', 'false');
  openButton.setAttribute('tabindex', '-1');

  let activeTrigger = null;

  const close = () => {
    if (layer.dataset.open !== 'true') return;
    layer.dataset.open = 'false';
    layer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('share-layer-open');
    openButton.setAttribute('aria-expanded', 'false');
    resetShareFeedback();
    if (activeTrigger && typeof activeTrigger.focus === 'function') {
      activeTrigger.focus({ preventScroll: true });
    }
    activeTrigger = null;
  };

  const open = () => {
    if (layer.dataset.open === 'true' || openButton.disabled) return;
    activeTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : openButton;
    layer.dataset.open = 'true';
    layer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('share-layer-open');
    openButton.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => card.focus({ preventScroll: true }));
  };

  openButton.addEventListener('click', () => {
    if (layer.dataset.open === 'true') {
      close();
    } else {
      open();
    }
  });

  closeButton.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && layer.dataset.open === 'true') {
      event.preventDefault();
      close();
    }
  });

  return { open, close };
}

function closeShareSheet() {
  if (shareSheetController?.close) {
    shareSheetController.close();
    return;
  }
  if (!elements.shareLayer) return;
  elements.shareLayer.dataset.open = 'false';
  elements.shareLayer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('share-layer-open');
  elements.shareOpenButton?.setAttribute('aria-expanded', 'false');
  resetShareFeedback();
}

function showShareFeedback(message, tone = 'success') {
  if (!elements.shareShareFeedback) return;
  elements.shareShareFeedback.hidden = false;
  elements.shareShareFeedback.dataset.tone = tone;
  elements.shareShareFeedback.textContent = message;
  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
  }
  shareFeedbackTimer = window.setTimeout(() => {
    if (!elements.shareShareFeedback) return;
    elements.shareShareFeedback.hidden = true;
    elements.shareShareFeedback.textContent = '';
    delete elements.shareShareFeedback.dataset.tone;
  }, 4000);
}

function initializeShareChannels() {
  const hasLink = Boolean(shareLinkUrl);

  if (elements.shareCopyButton) {
    elements.shareCopyButton.hidden = !hasLink;
    elements.shareCopyButton.disabled = !hasLink;
  }

  if (elements.shareQrButton) {
    elements.shareQrButton.hidden = !hasLink;
    elements.shareQrButton.disabled = !hasLink;
  }

  if (elements.shareHint && !hasLink) {
    elements.shareHint.textContent = 'Nie udało się przygotować linku do udostępnienia. Odśwież stronę i spróbuj ponownie.';
  }

  if (!elements.shareLinksContainer) {
    configureShareEmailForm(hasLink);
    return;
  }

  const links = elements.shareLinksContainer.querySelectorAll('[data-share-channel]');
  links.forEach((link) => {
    const anchor = link instanceof HTMLAnchorElement ? link : link.querySelector('a');
    if (!anchor) return;
    anchor.classList.add('share-link--disabled');
    anchor.setAttribute('tabindex', '-1');
    anchor.setAttribute('aria-disabled', 'true');
  });

  if (!hasLink) {
    configureShareEmailForm(false);
    return;
  }

  const hrefs = buildShareLinks(shareLinkUrl);
  links.forEach((link) => {
    const anchor = link instanceof HTMLAnchorElement ? link : link.querySelector('a');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const channel = anchor.dataset.shareChannel || '';
    const target = hrefs[channel] || shareLinkUrl;
    anchor.href = target;
    anchor.classList.remove('share-link--disabled');
    anchor.removeAttribute('aria-disabled');
    anchor.removeAttribute('tabindex');
  });

  configureShareEmailForm(true);
}

function configureShareEmailForm(enabled) {
  if (!elements.shareEmailForm || !(elements.shareEmailInput instanceof HTMLInputElement)) {
    return;
  }
  elements.shareEmailForm.hidden = !enabled;
  elements.shareEmailForm.dataset.shareUrl = enabled ? shareLinkUrl : '';
  elements.shareEmailForm.dataset.shareMessage = enabled ? buildShareMessage(shareLinkUrl) : '';
  if (!enabled) {
    elements.shareEmailInput.value = '';
  }
  if (elements.shareEmailFeedback) {
    elements.shareEmailFeedback.hidden = true;
    elements.shareEmailFeedback.textContent = '';
    delete elements.shareEmailFeedback.dataset.tone;
  }
}

function copyShareLink() {
  if (!shareLinkUrl) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(shareLinkUrl)
      .then(() => showShareFeedback('Skopiowano link do schowka.'))
      .catch(() => showShareFeedback('Nie udało się skopiować linku. Spróbuj ponownie.', 'error'));
  } else {
    const success = window.prompt('Skopiuj link do pokoju', shareLinkUrl);
    if (success !== null) {
      showShareFeedback('Skopiuj link z okna dialogowego.');
    }
  }
}

function showShareQr() {
  if (!shareLinkUrl || !elements.shareQrModal || !elements.shareQrImage || !elements.shareQrUrl) {
    showShareFeedback('Nie udało się przygotować kodu QR.', 'error');
    return;
  }
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareLinkUrl)}`;
  elements.shareQrImage.src = qrSrc;
  elements.shareQrUrl.href = shareLinkUrl;
  elements.shareQrModal.hidden = false;
  elements.shareQrModal.setAttribute('aria-hidden', 'false');
}

function hideShareQr() {
  if (!elements.shareQrModal) return;
  elements.shareQrModal.hidden = true;
  elements.shareQrModal.setAttribute('aria-hidden', 'true');
}

function bindShareEvents() {
  if (elements.shareCopyButton) {
    elements.shareCopyButton.addEventListener('click', copyShareLink);
  }
  if (elements.shareQrButton) {
    elements.shareQrButton.addEventListener('click', showShareQr);
  }
  if (elements.shareQrClose) {
    elements.shareQrClose.addEventListener('click', () => {
      hideShareQr();
      elements.shareQrButton?.focus({ preventScroll: true });
    });
  }
  elements.shareQrModal?.addEventListener('click', (event) => {
    if (event.target === elements.shareQrModal) {
      hideShareQr();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.shareQrModal?.hidden) {
      hideShareQr();
    }
  });

  if (elements.shareEmailForm && elements.shareEmailInput instanceof HTMLInputElement) {
    elements.shareEmailForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!elements.shareEmailInput.checkValidity()) {
        elements.shareEmailInput.reportValidity();
        return;
      }
      const email = elements.shareEmailInput.value.trim();
      if (!email) {
        elements.shareEmailInput.reportValidity();
        return;
      }
      const shareUrl = elements.shareEmailForm.dataset.shareUrl || shareLinkUrl;
      const message = elements.shareEmailForm.dataset.shareMessage || buildShareMessage(shareUrl);
      try {
        if (elements.shareEmailFeedback) {
          elements.shareEmailFeedback.hidden = false;
          elements.shareEmailFeedback.textContent = 'Wysyłamy wiadomość…';
          delete elements.shareEmailFeedback.dataset.tone;
        }
        const response = await fetch(EMAIL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partner_email: email,
            share_url: shareUrl,
            subject: SHARE_EMAIL_SUBJECT,
            message,
          }),
        });
        if (!response.ok) {
          throw new Error('Nie udało się wysłać e-maila');
        }
        if (elements.shareEmailFeedback) {
          elements.shareEmailFeedback.hidden = false;
          elements.shareEmailFeedback.dataset.tone = 'success';
          elements.shareEmailFeedback.textContent = 'Wiadomość wysłana! Powiedz partnerowi, żeby zajrzał do skrzynki.';
        }
        elements.shareEmailInput.value = '';
      } catch (error) {
        console.error(error);
        if (elements.shareEmailFeedback) {
          elements.shareEmailFeedback.hidden = false;
          elements.shareEmailFeedback.dataset.tone = 'error';
          elements.shareEmailFeedback.textContent = 'Nie udało się wysłać wiadomości. Spróbuj ponownie.';
        }
      }
    });
  }

  elements.shareLayer?.addEventListener('transitionend', (event) => {
    if (event.target === elements.shareLayer && elements.shareLayer.dataset.open === 'false') {
      resetShareFeedback();
    }
  });
}

function setStatus(message, tone = 'info') {
  if (!elements.statusMessage) return;
  elements.statusMessage.textContent = message;
  elements.statusMessage.dataset.tone = tone;
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle(elements.themeToggle);
  if (!ensureAccess()) return;
  shareLinkUrl = buildShareUrl();
  shareSheetController = initializeShareSheet({
    bar: elements.shareBar,
    openButton: elements.shareOpenButton,
    layer: elements.shareLayer,
    card: elements.shareCard,
    closeButton: elements.shareCloseButton,
    backdrop: elements.shareBackdrop,
  });
  if (elements.shareOpenButton) {
    elements.shareOpenButton.disabled = false;
    elements.shareOpenButton.removeAttribute('tabindex');
  }
  initializeShareChannels();
  bindShareEvents();
  renderCategories();
  bindEvents();
  setStatus('Najpierw zaznacz kategorie, potem kliknij prawdę lub wyzwanie, aby odsłonić kartę.', 'muted');
  resetCards();
  unlockCards();
});
