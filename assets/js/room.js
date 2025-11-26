import { appendTokenToUrl, postJson, getJson } from './app.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const participantId = params.get('pid');
const initialDeck = (params.get('deck') || '').toLowerCase();
const token = params.get('token') || '';

if (!roomKey || !participantId) {
  window.location.replace(appendTokenToUrl('index.html', token));
}

if (initialDeck) {
  document.body.dataset.deck = initialDeck;
}

const participantsList = document.getElementById('participants-list');
const questionCard = document.getElementById('question-card');
const questionEmpty = document.getElementById('question-empty');
const questionEmptyText = document.getElementById('question-empty-text');
const questionCategory = document.getElementById('question-category');
const questionId = document.getElementById('question-id');
const questionText = document.getElementById('question-text');
const questionContent = document.getElementById('question-content');
const nextQuestionButton = document.getElementById('next-question');
const questionFilter = document.getElementById('question-filter');
const categoryCard = document.getElementById('category-card');
const reactionButtons = document.getElementById('reaction-buttons');
const reactionsList = document.getElementById('reactions-list');
const participantsCard = document.querySelector('.card--participants');
const categorySelect = document.getElementById('category-select');
const categorySelectWrapper = document.getElementById('category-select-wrapper');
const categoryChipList = document.getElementById('category-chip-list');
const categoryChipActions = document.getElementById('category-chip-actions');
const categoryClearButton = document.getElementById('category-clear');
const categorySelectAllButton = document.getElementById('category-select-all');
const categoryFilterHeader = document.getElementById('question-filter-header');
const categoryFilterHint = document.getElementById('question-filter-hint');
const catalogContainer = document.getElementById('category-browser');
const catalogCategories = document.getElementById('catalog-categories');
const catalogQuestions = document.getElementById('catalog-questions');
const catalogCategoryTitle = document.getElementById('catalog-category-title');
const catalogList = document.getElementById('catalog-list');
const catalogEmpty = document.getElementById('catalog-empty');
const roomContent = document.getElementById('room-content');
const questionSection = document.querySelector('.card--question');
const chatCard = document.getElementById('chat-card');
const reactionsCard = document.querySelector('.card--reactions');
const hostRequestsOverlay = document.getElementById('host-requests-overlay');
const hostRequestsPanel = document.getElementById('host-requests');
const hostRequestsList = document.getElementById('host-requests-list');
const hostRequestsEmpty = document.getElementById('host-requests-empty');
const shareBar = document.getElementById('share-bar');
const shareOpenButton = document.getElementById('share-open');
const shareLayer = document.getElementById('share-layer');
const shareCard = document.getElementById('share-card');
const shareCloseButton = document.getElementById('share-close');
const shareBackdrop = document.getElementById('share-backdrop');
const shareHint = document.getElementById('share-hint');
const shareFeedback = document.getElementById('share-feedback');
const shareLinksContainer = document.getElementById('share-links');
const shareCopyButton = document.getElementById('share-copy');
const shareQrButton = document.getElementById('share-show-qr');
const shareQrModal = document.getElementById('share-qr-modal');
const shareQrImage = document.getElementById('share-qr-image');
const shareQrUrl = document.getElementById('share-qr-url');
const shareQrClose = document.getElementById('share-qr-close');
const heroTitle = document.getElementById('hero-title');
const heroSubtitle = document.getElementById('hero-subtitle');
const gameCardTitle = document.getElementById('game-card-title');
const chatMessagesList = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSendButton = chatForm?.querySelector('.chat__send');
const emojiToggle = document.getElementById('chat-emoji-toggle');
const emojiPanel = document.getElementById('chat-emoji-panel');
const defaultModuleOrder = roomContent ? Array.from(roomContent.children) : [];

const defaultTitle = document.title;
let selfInfo = null;
let previousPendingCount = 0;
let pulseTimer = null;
let pulseTarget = null;
let pulseClass = '';
let lastKnownStatus = '';
let hasRedirectedToWaiting = false;
let shareFeedbackTimer = null;
let chatMessagesState = [];
let emojiPanelOpen = false;
let shareSheetController = null;
let activeParticipantCount = 0;
let isCurrentUserHost = false;

const defaultWaitingRoomPath = document.body?.dataset.waitingPage || 'room-waiting.html';
const shareEmailForm = document.getElementById('share-email');
const shareEmailInput = document.getElementById('share-email-input');
const shareEmailFeedback = document.getElementById('share-email-feedback');
let shareLinkUrl = '';
const EMAIL_ENDPOINT = 'api/send_positions_email.php';
const SHARE_EMAIL_SUBJECTS = {
  default: 'Pytania dla par – dołącz do mnie',
  never: 'Nigdy przenigdy – dołącz do mnie',
  'jak-dobrze-mnie-znasz': 'Jak dobrze mnie znasz – dołącz do mnie',
};

const GAME_VARIANTS = {
  default: {
    id: 'default',
    title: 'Pytania dla par',
    subtitle: 'Losujcie pytania i rozmawiajcie, żeby zbliżyć się do siebie jeszcze bardziej.',
    cardTitle: 'Pytania dla par',
    questionPrompt: 'Wylosuj pytanie, aby rozpocząć rozmowę.',
    questionButtonLabel: 'Losuj pytanie',
    questionsPath: 'data/questions.json',
    showCatalog: true,
    enableCategoryFilter: true,
    categoryFilterLayout: 'select',
    multiCategoryFilter: false,
    reactionButtons: [
      { action: 'ok', label: 'Odpowiem Ci na nie', className: 'btn btn--ok' },
      { action: 'skip', label: 'Nie chcę tego pytania', className: 'btn btn--skip' },
      { action: 'fav', label: 'Bardzo lubię to pytanie', className: 'btn btn--fav' },
    ],
    reactionLabels: {
      ok: 'Odpowiem Ci na nie',
      skip: 'Nie chcę tego pytania',
      fav: 'Bardzo lubię to pytanie',
    },
    highlightClasses: {
      ok: 'question--reaction-ok',
      skip: 'question--reaction-skip',
      fav: 'question--reaction-fav',
    },
    pageTitle: 'Pytania dla par – Pokój',
    questionAnimation: 'blur',
    showQuestionIdentifier: false,
  },
  never: {
    id: 'never',
    title: 'Nigdy przenigdy',
    subtitle: 'Losuj zdania i przyznaj, czy już to zrobiłeś/aś.',
    cardTitle: 'Nigdy przenigdy',
    questionPrompt: 'Wylosuj zdanie i sprawdź, kto przyzna się pierwszy.',
    questionButtonLabel: 'Losuj zdanie',
    questionsPath: 'data/nigdy-przenigdy.json',
    showCatalog: false,
    enableCategoryFilter: true,
    categoryFilterLayout: 'select',
    multiCategoryFilter: false,
    reactionButtons: [
      { action: 'agree', label: '👍', className: 'btn btn--thumb', ariaLabel: 'Zgadzam się z odpowiedzią' },
      { action: 'disagree', label: '👎', className: 'btn btn--thumb btn--thumb-down', ariaLabel: 'Nie zgadzam się z odpowiedzią' },
    ],
    reactionLabels: {
      agree: '👍 Zgadzam się',
      disagree: '👎 Nie zgadzam się',
    },
    highlightClasses: {
      agree: 'question--reaction-agree',
      disagree: 'question--reaction-disagree',
    },
    pageTitle: 'Nigdy przenigdy – Pokój',
    questionAnimation: 'blur',
    showQuestionIdentifier: false,
  },
  'jak-dobrze-mnie-znasz': {
    id: 'jak-dobrze-mnie-znasz',
    title: 'Jak dobrze mnie znasz',
    subtitle: 'Losuj pytania i sprawdź, jak dobrze znacie się na co dzień.',
    cardTitle: 'Jak dobrze mnie znasz',
    questionPrompt: 'Wybierz kategorię i wylosuj pytanie, aby sprawdzić swoją wiedzę.',
    emptyCategoryPrompt: 'Wybierz przynajmniej jedną kategorię, aby wylosować pytanie.',
    questionButtonLabel: 'Losuj pytanie',
    questionButtonLabelNext: 'Losuj kolejne pytanie',
    questionsPath: 'data/jak-dobrze-mnie-znasz.json',
    showCatalog: true,
    enableCategoryFilter: true,
    categoryFilterLayout: 'chips',
    multiCategoryFilter: true,
    showReactions: false,
    reactionButtons: [],
    reactionLabels: {},
    highlightClasses: {},
    pageTitle: 'Jak dobrze mnie znasz – Pokój',
    questionAnimation: 'blur',
    showQuestionIdentifier: false,
  },
};

function getVariantConfig(deckId) {
  return GAME_VARIANTS[deckId] || GAME_VARIANTS.default;
}

let currentDeck = (document.body.dataset.deck || 'default').toLowerCase();
document.body.dataset.deck = currentDeck;
let activeVariant = getVariantConfig(currentDeck);
let shareEmailSubject = SHARE_EMAIL_SUBJECTS[currentDeck] || SHARE_EMAIL_SUBJECTS.default;
let questionsLoadedDeck = '';

let currentQuestion = null;
let pollTimer;
let presenceTimer;
let allQuestions = [];
let activeCategory = '';
let loadingCategories = false;
let questionAnimationQueue = Promise.resolve();
let hasShownBlurQuestion = false;
let selectedCategoryFilter = '';
let selectedCategorySet = new Set();

function shouldRequireCategorySelection() {
  return activeVariant.id === 'jak-dobrze-mnie-znasz' && activeVariant.multiCategoryFilter;
}

function areReactionsEnabled() {
  return activeVariant.showReactions !== false;
}

function getEmptyStatePrompt() {
  if (shouldRequireCategorySelection() && selectedCategorySet.size === 0) {
    return activeVariant.emptyCategoryPrompt || activeVariant.questionPrompt;
  }
  return activeVariant.questionPrompt;
}

function updateNextQuestionButtonLabel(hasQuestion) {
  if (!nextQuestionButton) {
    return;
  }
  if (hasQuestion && activeVariant.questionButtonLabelNext) {
    nextQuestionButton.textContent = activeVariant.questionButtonLabelNext;
    return;
  }
  nextQuestionButton.textContent = activeVariant.questionButtonLabel || 'Losuj pytanie';
}

function resetModuleOrder() {
  if (!roomContent || defaultModuleOrder.length === 0) {
    return;
  }
  defaultModuleOrder.forEach((section) => roomContent.append(section));
}

function reorderModulesForCurrentVariant() {
  if (!roomContent) {
    return;
  }
  if (activeVariant.id !== 'jak-dobrze-mnie-znasz') {
    resetModuleOrder();
    return;
  }

  const orderedSections = [
    participantsCard,
    categoryCard,
    questionSection,
    chatCard,
    catalogContainer,
  ];

  if (areReactionsEnabled()) {
    orderedSections.push(reactionsCard);
  }

  orderedSections.filter(Boolean).forEach((section) => roomContent.append(section));
}

async function applyVariant(deckId) {
  const normalizedDeck = (deckId || '').toLowerCase();
  const nextDeck = GAME_VARIANTS[normalizedDeck] ? normalizedDeck : 'default';
  activeVariant = getVariantConfig(nextDeck);
  currentDeck = nextDeck;
  document.body.dataset.deck = activeVariant.id;
  document.title = activeVariant.pageTitle || defaultTitle;
  resetQuestionAnimationState();
  selectedCategoryFilter = '';
  selectedCategorySet = new Set();
  if (heroTitle) {
    heroTitle.textContent = activeVariant.title;
  }
  if (heroSubtitle) {
    heroSubtitle.textContent = activeVariant.subtitle;
  }
  if (gameCardTitle) {
    gameCardTitle.textContent = activeVariant.cardTitle;
  }
  if (questionEmptyText && !currentQuestion) {
    questionEmptyText.textContent = getEmptyStatePrompt();
  }
  updateNextQuestionButtonLabel(Boolean(currentQuestion));
  shareEmailSubject = SHARE_EMAIL_SUBJECTS[activeVariant.id] || SHARE_EMAIL_SUBJECTS.default;
  renderReactionButtonsUI();
  await ensureQuestionsLoaded(activeVariant.id);
  updateQuestionFilterVisibility();
  updateCatalogVisibility();
  updateShareLink();
  const reactionsAllowed = areReactionsEnabled();
  if (reactionsCard) {
    reactionsCard.hidden = !reactionsAllowed;
    reactionsCard.setAttribute('aria-hidden', (!reactionsAllowed).toString());
  }
  if (!reactionsAllowed) {
    setQuestionHighlight(null);
    reactionsList && (reactionsList.innerHTML = '');
  }
  if (currentQuestion) {
    applyQuestion(currentQuestion);
  } else {
    updateQuestionEmptyState(false);
  }
  syncQuestionIdVisibility(currentQuestion?.id || '');
  reorderModulesForCurrentVariant();
}

function getSelectedCategoryFilter() {
  if (activeVariant.multiCategoryFilter) {
    return '';
  }
  if (activeVariant.categoryFilterLayout === 'chips') {
    return selectedCategoryFilter || '';
  }
  return categorySelect?.value || '';
}

function getCategoryFilterForRequest() {
  if (!activeVariant.enableCategoryFilter) {
    return '';
  }
  if (activeVariant.multiCategoryFilter) {
    const choices = [...selectedCategorySet];
    if (choices.length === 0) {
      return '';
    }
    const index = Math.floor(Math.random() * choices.length);
    return choices[index];
  }
  return getSelectedCategoryFilter();
}

function updateShareLink() {
  shareLinkUrl = buildShareUrl();
  initializeShareChannels();
}

function isActiveParticipant() {
  return (selfInfo?.status || '') === 'active';
}

function hasChatAccess() {
  if (!selfInfo) {
    return false;
  }
  return Boolean(selfInfo.is_host) || selfInfo.status === 'active';
}

shareSheetController = initializeShareSheet({
  bar: shareBar,
  openButton: shareOpenButton,
  layer: shareLayer,
  card: shareCard,
  closeButton: shareCloseButton,
  backdrop: shareBackdrop,
});

initializeShareEmailForm();
applyVariant(currentDeck);

nextQuestionButton?.addEventListener('click', async () => {
  try {
    if (!isActiveParticipant()) {
      alert('Musisz poczekać na akceptację gospodarza.');
      return;
    }
    if (shouldRequireCategorySelection() && selectedCategorySet.size === 0) {
      updateQuestionEmptyState(Boolean(currentQuestion));
      nextQuestionButton.disabled = false;
      return;
    }
    nextQuestionButton.disabled = true;
    const payload = await postJson('api/next_question.php', {
      room_key: roomKey,
      category: getCategoryFilterForRequest() || undefined,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się wylosować pytania.');
    }
    applyQuestion(payload.current_question);
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    nextQuestionButton.disabled = false;
  }
});

categoryChipList?.addEventListener('change', (event) => {
  const input = event.target.closest('input[name="question-category"]');
  if (!(input instanceof HTMLInputElement)) return;
  if (activeVariant.multiCategoryFilter) {
    if (input.checked) {
      selectedCategorySet.add(input.value);
    } else {
      selectedCategorySet.delete(input.value);
    }
  } else {
    selectedCategoryFilter = input.checked ? input.value : '';
  }
  updateQuestionEmptyState(Boolean(currentQuestion));
});

categorySelectAllButton?.addEventListener('click', () => {
  if (!activeVariant.multiCategoryFilter) return;
  const checkboxes = categoryChipList?.querySelectorAll('input[type="checkbox"][name="question-category"]');
  checkboxes?.forEach((box) => {
    box.checked = true;
    selectedCategorySet.add(box.value);
  });
  updateQuestionEmptyState(Boolean(currentQuestion));
});

categoryClearButton?.addEventListener('click', () => {
  clearCategorySelection();
  updateQuestionEmptyState(Boolean(currentQuestion));
});

catalogCategories?.addEventListener('click', (event) => {
  if (!activeVariant.showCatalog) {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('.catalog__category');
  if (!(button instanceof HTMLElement)) return;
  const { category } = button.dataset;
  if (!category) return;
  showCategoryQuestions(category);
});

catalogList?.addEventListener('click', async (event) => {
  if (!activeVariant.showCatalog) {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('.catalog__question');
  if (!(button instanceof HTMLButtonElement)) return;
  if (!isActiveParticipant()) {
    alert('Musisz poczekać na akceptację gospodarza.');
    return;
  }
  const questionId = button.dataset.questionId;
  if (!questionId) return;
  await chooseQuestionById(questionId, button);
});

reactionButtons?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('button[data-action]');
  if (!(button instanceof HTMLButtonElement)) return;
  const action = button.dataset.action;
  if (!action || !currentQuestion) return;
  if (!isActiveParticipant()) {
    alert('Musisz poczekać na akceptację gospodarza.');
    return;
  }
  try {
    button.disabled = true;
    const payload = await postJson('api/react.php', {
      room_key: roomKey,
      participant_id: participantId,
      question_id: currentQuestion.id,
      action,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się zapisać reakcji.');
    }
    setQuestionHighlight(action);
    await refreshState();
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

hostRequestsList?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('button[data-action]');
  if (!(button instanceof HTMLButtonElement)) return;
  const item = button.closest('.requests__item');
  const requestId = item?.dataset.requestId;
  const decision = button.dataset.action;
  if (!requestId || !decision) return;
  await respondToRequest(requestId, decision, button);
});

shareCopyButton?.addEventListener('click', () => {
  copyShareLink();
});

shareQrButton?.addEventListener('click', () => {
  openQrModal();
});

shareQrClose?.addEventListener('click', () => {
  closeQrModal();
});

shareQrModal?.addEventListener('click', (event) => {
  if (event.target === shareQrModal) {
    closeQrModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !shareQrModal?.hidden) {
    closeQrModal();
  }
});

chatForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!hasChatAccess()) {
    alert('Musisz poczekać, aż gospodarz przyzna dostęp do pokoju.');
    return;
  }
  const value = chatInput?.value.trim();
  if (!value) {
    return;
  }
  try {
    if (chatSendButton instanceof HTMLButtonElement) {
      chatSendButton.disabled = true;
    }
    await postJson('api/chat_send.php', {
      room_key: roomKey,
      participant_id: participantId,
      message: value,
    });
    if (chatInput instanceof HTMLTextAreaElement) {
      chatInput.value = '';
      adjustChatInputHeight();
    }
    closeEmojiPanel();
  } catch (error) {
    console.error(error);
    alert('Nie udało się wysłać wiadomości. Spróbuj ponownie.');
  } finally {
    if (chatSendButton instanceof HTMLButtonElement) {
      chatSendButton.disabled = false;
    }
  }
});

chatInput?.addEventListener('input', () => {
  adjustChatInputHeight();
});

chatInput?.addEventListener('focus', () => {
  adjustChatInputHeight();
});

chatInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey) {
    event.preventDefault();
    chatForm?.requestSubmit();
  }
});

emojiToggle?.addEventListener('click', (event) => {
  event.preventDefault();
  toggleEmojiPanel(!emojiPanelOpen);
});

emojiPanel?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('.chat__emoji-option');
  if (!(button instanceof HTMLButtonElement)) return;
  const emoji = button.dataset.emoji || button.textContent || '';
  if (!emoji || !(chatInput instanceof HTMLTextAreaElement)) return;
  const start = chatInput.selectionStart ?? chatInput.value.length;
  const end = chatInput.selectionEnd ?? chatInput.value.length;
  const before = chatInput.value.slice(0, start);
  const after = chatInput.value.slice(end);
  chatInput.value = `${before}${emoji}${after}`;
  const cursor = start + emoji.length;
  chatInput.setSelectionRange(cursor, cursor);
  chatInput.dispatchEvent(new Event('input', { bubbles: true }));
  chatInput.focus();
});

document.addEventListener('click', (event) => {
  if (!emojiPanelOpen) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (emojiPanel?.contains(target) || emojiToggle?.contains(target)) {
    return;
  }
  closeEmojiPanel();
});

async function refreshState() {
  try {
    const payload = await getJson(
      `api/state.php?room_key=${encodeURIComponent(roomKey)}&participant_id=${encodeURIComponent(participantId)}`,
    );
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się pobrać stanu.');
    }
    const incomingDeck = (payload.deck || '').toLowerCase();
    if (incomingDeck && incomingDeck !== currentDeck) {
      await applyVariant(incomingDeck);
    }
    selfInfo = payload.self || null;
    if (maybeRedirectToWaiting(selfInfo)) {
      return;
    }
    updateAccessState(selfInfo);
    const participants = Array.isArray(payload.participants) ? payload.participants : [];
    renderParticipants(participants);
    const reactionsAllowed = areReactionsEnabled();
    const reactions = reactionsAllowed ? payload.reactions || [] : [];
    if (payload.current_question) {
      applyQuestion(payload.current_question);
      if (reactionsAllowed) {
        updateQuestionHighlight(reactions);
      } else {
        setQuestionHighlight(null);
      }
    } else {
      clearQuestion();
      if (!reactionsAllowed) {
        setQuestionHighlight(null);
      }
    }
    if (reactionsAllowed) {
      renderReactions(reactions);
    } else if (reactionsList) {
      reactionsList.innerHTML = '';
    }
    renderChatMessages(payload.messages || []);
    renderHostRequests(payload.pending_requests || []);
  } catch (error) {
    console.error(error);
  }
}

function renderParticipants(participants) {
  activeParticipantCount = Array.isArray(participants) ? participants.length : 0;
  updateShareVisibility();

  if (!participantsList) {
    return;
  }

  const normalized = Array.isArray(participants) ? [...participants] : [];

  if (selfInfo && selfInfo.status === 'active') {
    const selfId = Number(selfInfo.id);
    const alreadyListed = normalized.some((participant) => Number(participant.id) === selfId);
    if (!alreadyListed) {
      normalized.unshift({
        id: selfId,
        display_name: selfInfo.display_name || 'Ty',
        last_seen: new Date().toISOString(),
      });
    }
  }

  participantsList.innerHTML = '';
  const now = Date.now();
  normalized.forEach((participant) => {
    const li = document.createElement('li');
    li.textContent = participant.display_name;
    const status = document.createElement('span');
    status.className = 'participants__status';
    const lastSeen = participant.last_seen ? Date.parse(participant.last_seen) : 0;
    const diff = now - lastSeen;
    status.textContent = diff < 20000 ? 'online' : 'offline';
    li.appendChild(status);
    participantsList.appendChild(li);
  });
}

function renderReactionButtonsUI() {
  if (!reactionButtons) {
    return;
  }
  reactionButtons.innerHTML = '';
  if (!areReactionsEnabled()) {
    reactionButtons.hidden = true;
    return;
  }
  const configs = activeVariant.reactionButtons || [];
  configs.forEach((config) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = config.className || 'btn';
    button.dataset.action = config.action;
    if (config.ariaLabel) {
      button.setAttribute('aria-label', config.ariaLabel);
    }
    button.textContent = config.label;
    reactionButtons.appendChild(button);
  });
  reactionButtons.hidden = !currentQuestion || configs.length === 0;
}

function renderReactions(reactions) {
  if (!reactionsList) {
    return;
  }
  reactionsList.innerHTML = '';
  reactions.forEach((reaction) => {
    const li = document.createElement('li');
    li.className = 'reactions__item';
    const label = getReactionLabel(reaction.action);
    const meta = document.createElement('div');
    meta.className = 'reactions__meta';

    const name = document.createElement('span');
    name.className = 'reactions__author';
    name.textContent = reaction.display_name || 'Ktoś';

    const action = document.createElement('span');
    action.className = 'reactions__label';
    action.textContent = label;

    meta.appendChild(name);
    meta.appendChild(action);
    li.appendChild(meta);

    const questionText = reaction.question_text || '';
    if (questionText) {
      const question = document.createElement('p');
      question.className = 'reactions__question';
      question.textContent = questionText;
      li.appendChild(question);
    }

    reactionsList.appendChild(li);
  });
}

function getReactionLabel(action) {
  if (!action) {
    return '';
  }
  return (
    (activeVariant.reactionLabels && activeVariant.reactionLabels[action]) ||
    (GAME_VARIANTS.default.reactionLabels && GAME_VARIANTS.default.reactionLabels[action]) ||
    action
  );
}

function getHighlightClass(action) {
  if (!action) {
    return '';
  }
  return (
    (activeVariant.highlightClasses && activeVariant.highlightClasses[action]) ||
    (GAME_VARIANTS.default.highlightClasses && GAME_VARIANTS.default.highlightClasses[action]) ||
    ''
  );
}

function renderChatMessages(messages) {
  if (!chatMessagesList) {
    chatMessagesState = [];
    return;
  }

  const normalized = Array.isArray(messages) ? [...messages] : [];
  normalized.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));

  const existingElements = new Map();
  chatMessagesList.querySelectorAll('.chat__message').forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    const id = Number(element.dataset.id || '');
    if (!Number.isNaN(id)) {
      existingElements.set(id, element);
    }
  });

  const shouldStick = isScrolledToBottom(chatMessagesList);

  normalized.forEach((message) => {
    const messageId = Number(message.id || 0);
    if (!messageId) {
      return;
    }
    const existing = existingElements.get(messageId);
    if (existing) {
      updateChatMessageElement(existing, message);
      existingElements.delete(messageId);
      return;
    }
    const element = createChatMessageElement(message);
    if (!element) {
      return;
    }
    element.dataset.id = String(messageId);
    element.classList.add('chat__message--appear');
    chatMessagesList.appendChild(element);
    requestAnimationFrame(() => {
      element.classList.remove('chat__message--appear');
    });
  });

  existingElements.forEach((element) => {
    element.remove();
  });

  chatMessagesState = normalized;

  if (normalized.length > 0 && shouldStick) {
    scrollChatToBottom();
  }
}

function createChatMessageElement(message) {
  const item = document.createElement('li');
  item.className = 'chat__message';
  applyChatAuthorState(item, message);

  const meta = document.createElement('div');
  meta.className = 'chat__meta';

  const author = document.createElement('span');
  author.className = 'chat__author';
  author.textContent = message.display_name || 'Gość';

  const time = document.createElement('time');
  time.className = 'chat__time';
  time.dateTime = message.created_at || '';
  time.textContent = formatMessageTime(message.created_at);

  meta.appendChild(author);
  meta.appendChild(time);
  item.appendChild(meta);

  const text = document.createElement('p');
  text.className = 'chat__text';
  text.textContent = message.text || '';
  item.appendChild(text);

  return item;
}

function updateChatMessageElement(element, message) {
  applyChatAuthorState(element, message);
  const author = element.querySelector('.chat__author');
  if (author) {
    author.textContent = message.display_name || 'Gość';
  }
  const time = element.querySelector('.chat__time');
  if (time instanceof HTMLTimeElement) {
    time.dateTime = message.created_at || '';
    time.textContent = formatMessageTime(message.created_at);
  }
  const text = element.querySelector('.chat__text');
  if (text) {
    text.textContent = message.text || '';
  }
}

function applyChatAuthorState(element, message) {
  const participantId = Number(message.participant_id || 0);
  const isSelf = selfInfo && Number(selfInfo.id) === participantId;
  element.classList.toggle('chat__message--self', Boolean(isSelf));
}

function formatMessageTime(timestamp) {
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isScrolledToBottom(element) {
  if (!element) {
    return true;
  }
  const threshold = 48;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

function scrollChatToBottom() {
  if (!chatMessagesList) {
    return;
  }
  chatMessagesList.scrollTo({ top: chatMessagesList.scrollHeight, behavior: 'smooth' });
}

function adjustChatInputHeight() {
  if (!(chatInput instanceof HTMLTextAreaElement)) {
    return;
  }
  chatInput.style.height = 'auto';
  const maxHeight = 160;
  const nextHeight = Math.min(chatInput.scrollHeight, maxHeight);
  chatInput.style.height = `${nextHeight}px`;
}

function toggleEmojiPanel(forceState) {
  const nextState = typeof forceState === 'boolean' ? forceState : !emojiPanelOpen;
  emojiPanelOpen = Boolean(nextState);
  if (emojiPanel) {
    emojiPanel.hidden = !emojiPanelOpen;
  }
  if (emojiToggle) {
    emojiToggle.setAttribute('aria-expanded', emojiPanelOpen ? 'true' : 'false');
  }
}

function closeEmojiPanel() {
  toggleEmojiPanel(false);
}

function renderHostRequests(requests) {
  if (!hostRequestsPanel || !selfInfo || !selfInfo.is_host) {
    hideHostRequests();
    return;
  }

  const pending = Array.isArray(requests) ? requests : [];
  if (pending.length === 0) {
    hideHostRequests();
    return;
  }

  const pendingCount = pending.length;
  const hasNewRequests = pendingCount > previousPendingCount;

  updateHostRequestsVisibility(pendingCount);

  if (hostRequestsEmpty) {
    hostRequestsEmpty.hidden = true;
  }
  if (hostRequestsList) {
    hostRequestsList.innerHTML = '';
  }

  pending.forEach((request) => {
    if (!hostRequestsList) return;
    const item = document.createElement('li');
    item.className = 'requests__item';
    item.dataset.requestId = String(request.id);

    const name = document.createElement('span');
    name.className = 'requests__name';
    name.textContent = request.display_name;

    const actions = document.createElement('div');
    actions.className = 'requests__actions';

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'btn btn--primary';
    approve.dataset.action = 'approve';
    approve.textContent = 'Akceptuj';

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'btn btn--ghost';
    reject.dataset.action = 'reject';
    reject.textContent = 'Odrzuć';

    actions.appendChild(approve);
    actions.appendChild(reject);
    item.appendChild(name);
    item.appendChild(actions);
    hostRequestsList.appendChild(item);
  });

  if (hasNewRequests) {
    triggerHostRequestsPulse();
    const firstAction = hostRequestsList?.querySelector('button');
    firstAction?.focus();
  }

  document.title = `(${pendingCount}) ${defaultTitle}`;
  previousPendingCount = pendingCount;
}

function hideHostRequests() {
  if (hostRequestsOverlay) {
    hostRequestsOverlay.hidden = true;
    hostRequestsOverlay.setAttribute('aria-hidden', 'true');
  }
  if (!hostRequestsPanel) {
    return;
  }
  hostRequestsPanel.hidden = true;
  hostRequestsPanel.classList.remove('host-requests--pulse');
  if (hostRequestsList) {
    hostRequestsList.innerHTML = '';
  }
  if (hostRequestsEmpty) {
    hostRequestsEmpty.hidden = false;
  }
  document.title = defaultTitle;
  previousPendingCount = 0;
  if (pulseTimer) {
    clearTimeout(pulseTimer);
    pulseTimer = null;
  }
  pulseTarget = null;
  pulseClass = '';
}

function triggerHostRequestsPulse() {
  const { element, className } = getPulseTarget();
  if (!element || !className) {
    return;
  }
  element.classList.remove(className);
  if (pulseTimer) {
    clearTimeout(pulseTimer);
  }
  // Force reflow so animation retriggers
  void element.offsetWidth;
  element.classList.add(className);
  pulseTarget = element;
  pulseClass = className;
  pulseTimer = setTimeout(() => {
    if (pulseTarget && pulseClass) {
      pulseTarget.classList.remove(pulseClass);
    }
    pulseTimer = null;
    pulseTarget = null;
    pulseClass = '';
  }, 600);
}

function updateHostRequestsVisibility(count) {
  if (!hostRequestsPanel) {
    return;
  }

  const hasRequests = count > 0;

  if (!hasRequests) {
    hideHostRequests();
    return;
  }

  if (hostRequestsOverlay) {
    hostRequestsOverlay.hidden = false;
    hostRequestsOverlay.setAttribute('aria-hidden', 'false');
  }
  hostRequestsPanel.hidden = false;
}

function getPulseTarget() {
  if (hostRequestsPanel && !hostRequestsPanel.hidden) {
    return { element: hostRequestsPanel, className: 'host-requests--pulse' };
  }
  return { element: null, className: '' };
}

function updateQuestionHighlight(reactions) {
  if (!currentQuestion) {
    setQuestionHighlight(null);
    return;
  }
  const highlight = reactions.find((reaction) => reaction.question_id === currentQuestion.id);
  setQuestionHighlight(highlight?.action || null);
}

function setQuestionHighlight(action) {
  if (!questionCard) return;
  const reactionClasses = Array.from(questionCard.classList).filter((className) =>
    className.startsWith('question--reaction-'),
  );
  reactionClasses.forEach((className) => questionCard.classList.remove(className));
  questionCard.classList.remove('question--reaction');
  if (!action) {
    return;
  }
  const className = getHighlightClass(action);
  if (className) {
    questionCard.classList.add('question--reaction', className);
  }
}

function shouldShowQuestionIdentifier() {
  return activeVariant?.showQuestionIdentifier ?? true;
}

function syncQuestionIdVisibility(identifier = '') {
  if (!questionId) {
    return;
  }
  const showId = shouldShowQuestionIdentifier();
  questionId.hidden = !showId;
  questionId.textContent = showId ? identifier : '';
}

function triggerQuestionFadeAnimation() {
  const animationTarget = getQuestionAnimationTarget();
  if (!animationTarget) {
    return;
  }
  animationTarget.classList.remove('question--fade-in', 'question--blur-in', 'question--blur-out');
  // Force reflow to allow the animation to restart.
  void animationTarget.offsetWidth;
  animationTarget.classList.add('question--fade-in');
}

function getQuestionAnimationTarget() {
  return questionContent || questionCard;
}

function isSameQuestion(prevQuestion, nextQuestion) {
  if (!prevQuestion || !nextQuestion) {
    return false;
  }
  if (prevQuestion.id && nextQuestion.id) {
    return prevQuestion.id === nextQuestion.id;
  }
  return (prevQuestion.text || '') === (nextQuestion.text || '');
}

function applyQuestion(question) {
  const isRepeatQuestion = isSameQuestion(currentQuestion, question);
  currentQuestion = question;
  if (shouldUseBlurTransitions()) {
    if (isRepeatQuestion) {
      updateQuestionContent(question);
      return;
    }
    queueBlurQuestionUpdate(question);
    return;
  }
  updateQuestionContent(question);
  if (!isRepeatQuestion) {
    triggerQuestionFadeAnimation();
  }
}

function updateQuestionContent(question) {
  if (questionCategory) {
    questionCategory.textContent = formatCategoryLabel(question.category || '');
  }
  syncQuestionIdVisibility(question.id || '');
  if (questionText) {
    questionText.textContent = question.text || '';
  }
  questionCard.hidden = false;
  questionCard.classList.add('question--active');
  updateQuestionEmptyState(true);
  setQuestionHighlight(null);
  updateNextQuestionButtonLabel(true);
  if (reactionButtons) {
    reactionButtons.hidden = reactionButtons.childElementCount === 0;
  }
}

function clearQuestion() {
  currentQuestion = null;
  questionCard.hidden = true;
  questionCard.classList.remove('question--active');
  if (questionCategory) {
    questionCategory.textContent = '';
  }
  syncQuestionIdVisibility('');
  if (questionText) {
    questionText.textContent = '';
  }
  updateQuestionEmptyState(false);
  setQuestionHighlight(null);
  updateNextQuestionButtonLabel(false);
  if (reactionButtons) {
    reactionButtons.hidden = true;
  }
  if (shouldUseBlurTransitions()) {
    resetQuestionAnimationState();
  }
}

function shouldUseBlurTransitions() {
  return (activeVariant?.questionAnimation || '') === 'blur';
}

function queueBlurQuestionUpdate(question) {
  questionAnimationQueue = questionAnimationQueue.then(() => runBlurQuestionTransition(question));
}

async function runBlurQuestionTransition(question) {
  const shouldAnimateOut = hasShownBlurQuestion && questionCard && !questionCard.hidden;
  if (shouldAnimateOut) {
    await playQuestionAnimation('question--blur-out');
  }
  if (!isSameQuestion(currentQuestion, question)) {
    return;
  }
  updateQuestionContent(question);
  await playQuestionAnimation('question--blur-in');
  if (isSameQuestion(currentQuestion, question)) {
    hasShownBlurQuestion = true;
  }
}

function playQuestionAnimation(className) {
  return new Promise((resolve) => {
    const animationTarget = getQuestionAnimationTarget();
    if (!animationTarget || !className) {
      resolve();
      return;
    }
    const animationClasses = ['question--fade-in', 'question--blur-in', 'question--blur-out'];
    animationClasses.forEach((name) => animationTarget.classList.remove(name));
    // Force reflow before applying the next animation class.
    void animationTarget.offsetWidth;
    animationTarget.classList.add(className);
    let resolved = false;
    const cleanup = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      animationTarget.removeEventListener('animationend', handleAnimationEnd);
      resolve();
    };
    const handleAnimationEnd = (event) => {
      if (event.target !== animationTarget) {
        return;
      }
      cleanup();
    };
    animationTarget.addEventListener('animationend', handleAnimationEnd);
    setTimeout(cleanup, 700);
  });
}

function resetQuestionAnimationState() {
  questionAnimationQueue = Promise.resolve();
  hasShownBlurQuestion = false;
  const animationTarget = getQuestionAnimationTarget();
  if (animationTarget) {
    animationTarget.classList.remove('question--blur-in', 'question--blur-out');
  }
}

function updateQuestionEmptyState(hasQuestion) {
  if (!questionEmpty) {
    return;
  }
  questionEmpty.classList.toggle('question__empty--has-question', hasQuestion);
  const shouldWarn = !hasQuestion && shouldRequireCategorySelection() && selectedCategorySet.size === 0;
  questionEmpty.classList.toggle('question__empty--warning', shouldWarn);
  if (questionEmptyText) {
    questionEmptyText.hidden = hasQuestion;
    if (!hasQuestion) {
      questionEmptyText.textContent = getEmptyStatePrompt();
    }
  }
}

function resolveWaitingRoomPath() {
  if (document.body?.dataset.waitingPage) {
    return document.body.dataset.waitingPage;
  }
  if (currentDeck === 'never') {
    return 'nigdy-przenigdy-waiting.html';
  }
  return defaultWaitingRoomPath;
}

function maybeRedirectToWaiting(participant) {
  if (hasRedirectedToWaiting) {
    return false;
  }
  if (!participant || participant.is_host) {
    return false;
  }
  const status = participant.status || 'unknown';
  if (status !== 'pending') {
    return false;
  }
  hasRedirectedToWaiting = true;
  const params = new URLSearchParams({
    room_key: roomKey,
    pid: participantId,
  });
  if (currentDeck && currentDeck !== 'default') {
    params.set('deck', currentDeck);
  }
  if (token) {
    params.set('token', token);
  }
  const targetUrl = new URL(resolveWaitingRoomPath(), window.location.href);
  targetUrl.search = `?${params.toString()}`;
  window.location.replace(targetUrl.toString());
  return true;
}

function updateAccessState(participant) {
  const status = participant?.status || 'unknown';
  const isActive = status === 'active';
  const isPending = status === 'pending';

  if (isActive && lastKnownStatus !== 'active') {
    sendPresence();
  }

  const hasFullAccess = Boolean(participant) && (status === 'active' || participant.is_host);
  if (roomContent) {
    roomContent.hidden = !hasFullAccess;
  }

  isCurrentUserHost = Boolean(participant?.is_host);
  updateShareVisibility();

  if (!hasFullAccess && !isPending && status !== lastKnownStatus) {
    let message = 'Trwa oczekiwanie na dostęp do pokoju.';
    if (!participant) {
      message = 'Nie znaleziono Twojego zgłoszenia w tym pokoju. Wróć do ekranu tworzenia pokoju.';
    } else if (status === 'rejected') {
      message = 'Gospodarz odrzucił Twoją prośbę o dołączenie. Możesz spróbować ponownie później.';
    }
    alert(message);
    window.location.replace(appendTokenToUrl('pytania-dla-par-room.html', token));
  }

  setInteractionEnabled(hasFullAccess && isActive);

  const allowChat = Boolean(participant) && (participant.is_host || status === 'active');
  if (chatInput instanceof HTMLTextAreaElement) {
    chatInput.disabled = !allowChat;
    chatInput.placeholder = allowChat
      ? 'Napisz wiadomość do partnera...'
      : 'Czekaj na dostęp do pokoju...';
    if (!allowChat) {
      chatInput.value = '';
      adjustChatInputHeight();
    }
  }
  if (chatSendButton instanceof HTMLButtonElement) {
    chatSendButton.disabled = !allowChat;
  }
  if (!allowChat) {
    closeEmojiPanel();
  }

  lastKnownStatus = status;
}

function buildShareUrl() {
  if (!roomKey) {
    return '';
  }
  const baseUrl = appendTokenToUrl('room-invite.html', token);
  const url = new URL(baseUrl, window.location.href);
  url.searchParams.set('room_key', roomKey);
  if (currentDeck && currentDeck !== 'default') {
    url.searchParams.set('deck', currentDeck);
  }
  if (token) {
    url.searchParams.set('token', token);
  }
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

function initializeShareChannels() {
  const hasLink = Boolean(shareLinkUrl);

  if (shareCopyButton) {
    shareCopyButton.hidden = !hasLink;
    shareCopyButton.disabled = !hasLink;
  }

  if (shareQrButton) {
    shareQrButton.hidden = !hasLink;
    shareQrButton.disabled = !hasLink;
  }

  if (shareHint) {
    shareHint.textContent = hasLink
      ? 'Wyślij partnerowi link, aby dołączył do pokoju.'
      : 'Przygotowujemy link do udostępnienia...';
  }

  if (!shareLinksContainer) {
    return;
  }

  const links = shareLinksContainer.querySelectorAll('[data-share-channel]');
  if (links.length === 0) {
    return;
  }

  if (!hasLink) {
    links.forEach((link) => {
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }
      link.href = '#';
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('tabindex', '-1');
      link.classList.add('share-link--disabled');
    });
    return;
  }

  const hrefs = buildShareLinks(shareLinkUrl);
  links.forEach((link) => {
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }
    const channel = link.dataset.shareChannel || '';
    const target = hrefs[channel] || shareLinkUrl;
    link.href = target;
    link.removeAttribute('aria-disabled');
    link.removeAttribute('tabindex');
    link.classList.remove('share-link--disabled');
  });

  configureShareEmailForm(hasLink);
}

function configureShareEmailForm(hasLink) {
  if (!shareEmailForm || !(shareEmailInput instanceof HTMLInputElement)) {
    return;
  }
  if (!hasLink) {
    shareEmailForm.hidden = true;
    shareEmailForm.dataset.shareUrl = '';
    shareEmailForm.dataset.shareMessage = '';
    shareEmailInput.value = '';
    resetShareEmailFeedback();
    return;
  }
  shareEmailForm.hidden = false;
  shareEmailForm.dataset.shareUrl = shareLinkUrl;
  shareEmailForm.dataset.shareMessage = buildShareMessage(shareLinkUrl);
  resetShareEmailFeedback();
}

function resetShareEmailFeedback() {
  if (!shareEmailFeedback) {
    return;
  }
  shareEmailFeedback.hidden = true;
  shareEmailFeedback.textContent = '';
  delete shareEmailFeedback.dataset.tone;
}

function initializeShareEmailForm() {
  if (!shareEmailForm || !(shareEmailInput instanceof HTMLInputElement)) {
    return;
  }
  const submitButton = shareEmailForm.querySelector('button[type="submit"]');
  shareEmailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!shareEmailInput.checkValidity()) {
      shareEmailInput.reportValidity();
      return;
    }
    const email = shareEmailInput.value.trim();
    if (!email) {
      shareEmailInput.reportValidity();
      return;
    }
    const shareUrl = shareEmailForm.dataset.shareUrl || shareLinkUrl;
    if (!shareUrl) {
      resetShareEmailFeedback();
      if (shareEmailFeedback) {
        shareEmailFeedback.hidden = false;
        shareEmailFeedback.dataset.tone = 'error';
        shareEmailFeedback.textContent = 'Nie udało się przygotować linku do udostępnienia. Odśwież stronę.';
      }
      return;
    }
    const message = shareEmailForm.dataset.shareMessage || buildShareMessage(shareUrl);
    const payload = {
      partner_email: email,
      share_url: shareUrl,
      subject: shareEmailSubject,
      sender_name: (selfInfo?.display_name || '').trim(),
      message,
    };
    if (submitButton) {
      submitButton.disabled = true;
    }
    if (shareEmailFeedback) {
      shareEmailFeedback.hidden = false;
      shareEmailFeedback.textContent = 'Wysyłamy wiadomość…';
      shareEmailFeedback.removeAttribute('data-tone');
    }
    try {
      const response = await postJson(EMAIL_ENDPOINT, payload);
      if (!response?.ok) {
        throw new Error(response?.error || 'Nie udało się wysłać wiadomości.');
      }
      if (shareEmailFeedback) {
        shareEmailFeedback.hidden = false;
        shareEmailFeedback.dataset.tone = 'success';
        shareEmailFeedback.textContent = 'Wiadomość wysłana! Powiedz partnerowi, żeby zajrzał do skrzynki.';
      }
      shareEmailInput.value = '';
    } catch (error) {
      console.error(error);
      if (shareEmailFeedback) {
        shareEmailFeedback.hidden = false;
        shareEmailFeedback.dataset.tone = 'error';
        shareEmailFeedback.textContent =
          error instanceof Error && error.message ? error.message : 'Nie udało się wysłać wiadomości.';
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

function initializeShareSheet(elements) {
  const { bar, openButton, layer, card, closeButton, backdrop } = elements || {};
  if (!layer || !card || !openButton || !closeButton) {
    if (bar) {
      bar.hidden = true;
    }
    return null;
  }

  layer.hidden = false;
  layer.dataset.open = 'false';
  layer.setAttribute('aria-hidden', 'true');

  if (!card.hasAttribute('tabindex')) {
    card.tabIndex = -1;
  }

  const baseLabel = openButton.dataset.baseLabel || openButton.textContent.trim() || 'Udostępnij pokój';
  openButton.dataset.baseLabel = baseLabel;
  openButton.textContent = baseLabel;
  openButton.disabled = true;
  openButton.setAttribute('aria-expanded', 'false');

  let activeTrigger = null;

  const close = () => {
    if (layer.dataset.open !== 'true') {
      return;
    }
    layer.dataset.open = 'false';
    layer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('share-layer-open');
    openButton.setAttribute('aria-expanded', 'false');
    if (activeTrigger) {
      activeTrigger.focus({ preventScroll: true });
      activeTrigger = null;
    }
  };

  const open = () => {
    if (layer.dataset.open === 'true') {
      return;
    }
    activeTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : openButton;
    layer.dataset.open = 'true';
    layer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('share-layer-open');
    openButton.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      card.focus({ preventScroll: true });
    });
  };

  openButton.addEventListener('click', () => {
    if (layer.dataset.open === 'true') {
      close();
    } else {
      open();
    }
  });

  closeButton.addEventListener('click', () => {
    close();
  });

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      close();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && layer.dataset.open === 'true') {
      event.preventDefault();
      close();
    }
  });

  return { open, close };
}

function closeShareSheet() {
  if (shareSheetController && typeof shareSheetController.close === 'function') {
    shareSheetController.close();
    return;
  }
  if (!shareLayer) {
    return;
  }
  shareLayer.dataset.open = 'false';
  shareLayer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('share-layer-open');
  shareOpenButton?.setAttribute('aria-expanded', 'false');
}

function updateShareVisibility() {
  const effectiveCount = activeParticipantCount > 0 ? activeParticipantCount : (isCurrentUserHost ? 1 : 0);
  const shouldShow = isCurrentUserHost && effectiveCount < 2;

  if (!shouldShow) {
    closeShareSheet();
    resetShareFeedback();
    closeQrModal();
  }

  if (shareBar) {
    shareBar.hidden = !shouldShow;
  }
  if (shareOpenButton) {
    shareOpenButton.disabled = !shouldShow;
    if (shouldShow) {
      shareOpenButton.removeAttribute('tabindex');
    } else {
      shareOpenButton.setAttribute('tabindex', '-1');
      shareOpenButton.setAttribute('aria-expanded', 'false');
    }
  }
}

async function copyShareLink() {
  if (!shareLinkUrl) {
    return;
  }
  let message = 'Skopiowano link do pokoju.';
  let isError = false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(shareLinkUrl);
    } else {
      throw new Error('Clipboard API unavailable');
    }
  } catch (error) {
    console.warn('Clipboard copy failed', error);
    isError = true;
    message = 'Skopiuj link ręcznie z wyświetlonego okna.';
    window.prompt('Skopiuj link do pokoju', shareLinkUrl);
  }
  showShareFeedback(message, isError);
}

function openQrModal() {
  if (!shareLinkUrl || !shareQrModal || !shareQrImage || !shareQrUrl) {
    return;
  }
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareLinkUrl)}`;
  shareQrImage.src = qrSrc;
  shareQrUrl.href = shareLinkUrl;
  shareQrModal.hidden = false;
  shareQrModal.setAttribute('aria-hidden', 'false');
}

function closeQrModal() {
  if (!shareQrModal) {
    return;
  }
  shareQrModal.hidden = true;
  shareQrModal.setAttribute('aria-hidden', 'true');
}

function showShareFeedback(message, isError = false) {
  if (!shareFeedback) {
    return;
  }
  shareFeedback.hidden = false;
  shareFeedback.textContent = message;
  shareFeedback.dataset.tone = isError ? 'error' : 'success';
  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
  }
  shareFeedbackTimer = window.setTimeout(() => {
    resetShareFeedback();
  }, 4000);
}

function resetShareFeedback() {
  if (!shareFeedback) {
    return;
  }
  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = null;
  }
  shareFeedback.hidden = true;
  shareFeedback.textContent = '';
  delete shareFeedback.dataset.tone;
}

function setInteractionEnabled(enabled) {
  if (nextQuestionButton) {
    nextQuestionButton.disabled = !enabled;
  }
  if (categorySelect) {
    categorySelect.disabled = !enabled;
  }
  if (reactionButtons) {
    reactionButtons.querySelectorAll('button').forEach((button) => {
      button.disabled = !enabled;
    });
  }
}

async function respondToRequest(requestId, decision, triggerButton) {
  if (!selfInfo || !selfInfo.is_host) {
    return;
  }
  try {
    if (triggerButton) {
      triggerButton.disabled = true;
    }
    const payload = await postJson('api/respond_request.php', {
      room_key: roomKey,
      participant_id: participantId,
      request_id: Number(requestId),
      decision,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się zaktualizować zgłoszenia.');
    }
    updateHostRequestsVisibility(Math.max(previousPendingCount - 1, 0));
    await refreshState();
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
    }
  }
}

const CATEGORY_LABELS = {
  LEKKIE_PYTANIA_NA_POCZATEK: 'Lekkie pytania na początek',
  PYTANIA_NA_LUZIE: 'Pytania na luzie',
  ROMANTYCZNE_PYTANIA: 'Romantyczne pytania',
  GLEBOKIE_PYTANIA: 'Głębokie pytania',
  PYTANIA_O_PRZYSZLOSC_MARZENIA: 'Pytania o przyszłość, marzenia',
  SZCZEROSC: 'Szczerość',
  NPN_CODZIENNE: 'Codzienne, uniwersalne',
  NPN_DZIECINSTWO: 'Powrót do dzieciństwa',
  NPN_PODROZE: 'Podróże małe i duże',
  NPN_PRZYPALY: 'Małe przypały',
  NPN_MOTYLKI: 'Motylki w brzuchu',
  NPN_SMIECH: 'Śmiech gwarantowany',
  NPN_RELACJE: 'Szczere relacje',
  NPN_LEKKI_FLIRT: 'Lekki flirt',
  NPN_ZMYSLOWE: 'Zmysłowe momenty 18+',
  NPN_ODWAZNE: 'Bardziej odważne 18+',
  NPN_EKSTRAWAGANCKIE: 'Ekstrawaganckie i zabawne 18+',
  PREFERENCJE_CODZIENNE: 'Preferencje codzienne',
  ULUBIONE_RZECZY: 'Ulubione rzeczy',
  PRZYZWYCZAJENIA_I_NAWYKI: 'Przyzwyczajenia i nawyki',
  WSPOMNIENIA_I_DOSWIADCZENIA: 'Wspomnienia i doświadczenia',
  MARZENIA_I_PLANY: 'Marzenia i plany',
  OPINIE_I_POGLEADY: 'Opinie i poglądy',
  RELACJE_I_EMOCJE: 'Relacje i emocje',
  DZIWNE_I_SMIESZNE: 'Dziwne i śmieszne',
  PYTANIA_EROTYCZNE_INTYMNE_18_PLUS: 'Pytania erotyczne/intymne 18+',
};

const CATEGORY_COLORS = {
  PREFERENCJE_CODZIENNE: { color: '#ffe0e6', accent: '#ff6f91' },
  ULUBIONE_RZECZY: { color: '#d2f3ff', accent: '#26c6da' },
  PRZYZWYCZAJENIA_I_NAWYKI: { color: '#fff3d6', accent: '#f4a261' },
  WSPOMNIENIA_I_DOSWIADCZENIA: { color: '#e7dcff', accent: '#7c6ff8' },
  MARZENIA_I_PLANY: { color: '#e2f7da', accent: '#52b788' },
  OPINIE_I_POGLEADY: { color: '#ffe3dd', accent: '#f28482' },
  RELACJE_I_EMOCJE: { color: '#ffe2ed', accent: '#f3722c' },
  DZIWNE_I_SMIESZNE: { color: '#fff9d9', accent: '#f6c344' },
  PYTANIA_EROTYCZNE_INTYMNE_18_PLUS: { color: '#ffd6e0', accent: '#f26d6f' },
};

function isAdultCategory(category) {
  const label = CATEGORY_LABELS[category];
  return typeof label === 'string' && label.includes('18+');
}

function formatCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category.replace(/_/g, ' ');
}

async function ensureQuestionsLoaded(deckId) {
  if (loadingCategories && questionsLoadedDeck === deckId) {
    return;
  }
  if (questionsLoadedDeck === deckId && allQuestions.length) {
    const categories = getUniqueCategories(allQuestions);
    populateCategoryOptions(categories);
    renderCategoryChips(categories);
    renderCategoryButtons(activeVariant.showCatalog ? categories : []);
    return;
  }
  loadingCategories = true;
  try {
    const variant = getVariantConfig(deckId);
    const response = await fetch(variant.questionsPath, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid data');
    }
    allQuestions = data;
    questionsLoadedDeck = deckId;
    const categories = getUniqueCategories(data);
    populateCategoryOptions(categories);
    renderCategoryChips(categories);
    renderCategoryButtons(variant.showCatalog ? categories : []);
  } catch (error) {
    console.warn('Nie udało się pobrać kategorii', error);
    allQuestions = [];
    questionsLoadedDeck = deckId;
    populateCategoryOptions([]);
    renderCategoryChips([]);
    renderCategoryButtons([]);
  } finally {
    loadingCategories = false;
  }
}

function getUniqueCategories(data) {
  const uniqueCategories = [...new Set(data.map((item) => item.category).filter(Boolean))];
  uniqueCategories.sort((a, b) => {
    const aAdult = isAdultCategory(a);
    const bAdult = isAdultCategory(b);
    if (aAdult && !bAdult) return 1;
    if (!aAdult && bAdult) return -1;
    return a.localeCompare(b);
  });
  return uniqueCategories;
}

function populateCategoryOptions(categories) {
  if (!categorySelect) {
    return;
  }
  categorySelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Dowolna';
  categorySelect.appendChild(defaultOption);
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = formatCategoryLabel(category);
    categorySelect.appendChild(option);
  });
}

function renderCategoryChips(categories) {
  if (!categoryChipList) {
    return;
  }
  categoryChipList.innerHTML = '';
  if (activeVariant.categoryFilterLayout !== 'chips') {
    categoryChipList.hidden = true;
    if (categoryChipActions) {
      categoryChipActions.hidden = true;
    }
    return;
  }
  categories.forEach((category) => {
    const label = document.createElement('label');
    label.className = 'category-chip';

    if (activeVariant.id === 'jak-dobrze-mnie-znasz') {
      const categoryStyle = CATEGORY_COLORS[category];
      if (categoryStyle?.color) {
        label.style.setProperty('--category-color', categoryStyle.color);
      }
      if (categoryStyle?.accent) {
        label.style.setProperty('--category-accent', categoryStyle.accent);
      }
      if (categoryStyle?.shade) {
        label.style.setProperty('--category-shade', categoryStyle.shade);
      }
    }

    const input = document.createElement('input');
    input.type = activeVariant.multiCategoryFilter ? 'checkbox' : 'radio';
    input.name = 'question-category';
    input.value = category;
    input.checked = activeVariant.multiCategoryFilter
      ? selectedCategorySet.has(category)
      : category === selectedCategoryFilter;

    const dot = document.createElement('span');
    dot.className = 'category-chip__dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = '•';

    const text = document.createElement('span');
    text.textContent = formatCategoryLabel(category);

    label.append(input, dot, text);
    categoryChipList.append(label);
  });
  categoryChipList.hidden = categories.length === 0;
  if (categoryChipActions) {
    categoryChipActions.hidden = categories.length === 0;
  }
}

function clearCategorySelection() {
  selectedCategoryFilter = '';
  selectedCategorySet = new Set();
  categoryChipList?.querySelectorAll('input[name="question-category"]').forEach((input) => {
    input.checked = false;
  });
  updateQuestionEmptyState(Boolean(currentQuestion));
}

function renderCategoryButtons(categories) {
  if (!catalogCategories) return;
  catalogCategories.innerHTML = '';
  if (!activeVariant.showCatalog || categories.length === 0) {
    activeCategory = '';
    updateCatalogVisibility();
    if (catalogQuestions) {
      catalogQuestions.hidden = true;
    }
    return;
  }
  categories.forEach((category) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog__category';
    button.dataset.category = category;
    button.textContent = formatCategoryLabel(category);
    if (category === activeCategory) {
      button.classList.add('catalog__category--active');
    }
    item.appendChild(button);
    catalogCategories.appendChild(item);
  });
  updateCatalogVisibility();
}

function updateCatalogVisibility() {
  if (!catalogContainer) {
    return;
  }
  const hasCategories = Boolean(
    activeVariant.showCatalog && catalogCategories && catalogCategories.childElementCount > 0,
  );
  catalogContainer.hidden = !hasCategories;
  if (!hasCategories && catalogQuestions) {
    catalogQuestions.hidden = true;
  }
}

function updateQuestionFilterVisibility() {
  if (!questionFilter) {
    return;
  }
  const shouldShow = activeVariant.enableCategoryFilter !== false;
  questionFilter.hidden = !shouldShow;
  if (categoryCard) {
    categoryCard.hidden = !shouldShow;
  }
  if (!shouldShow) {
    if (categorySelect) {
      categorySelect.value = '';
    }
    clearCategorySelection();
    return;
  }

  const useChips = activeVariant.categoryFilterLayout === 'chips';
  if (categorySelectWrapper) {
    categorySelectWrapper.hidden = useChips;
  }
  if (categoryFilterHeader) {
    categoryFilterHeader.hidden = !useChips;
  }
  if (categoryFilterHint) {
    categoryFilterHint.hidden = !useChips;
  }
  if (categoryChipList) {
    const hasChips = categoryChipList.childElementCount > 0;
    categoryChipList.hidden = !useChips || !hasChips;
    if (categoryChipActions) {
      categoryChipActions.hidden = categoryChipList.hidden;
    }
  }
  if (categoryClearButton) {
    categoryClearButton.hidden = activeVariant.multiCategoryFilter;
  }
  if (categorySelectAllButton) {
    categorySelectAllButton.hidden = !activeVariant.multiCategoryFilter;
  }
  if (!useChips && categorySelect) {
    categorySelect.value = '';
  }
}

function showCategoryQuestions(category) {
  if (!activeVariant.showCatalog) {
    return;
  }
  activeCategory = category;
  if (catalogCategories) {
    catalogCategories
      .querySelectorAll('.catalog__category')
      .forEach((btn) => btn.classList.toggle('catalog__category--active', btn.dataset.category === category));
  }
  if (catalogCategoryTitle) {
    catalogCategoryTitle.textContent = formatCategoryLabel(category);
  }
  if (catalogQuestions) {
    catalogQuestions.hidden = false;
  }
  const questions = allQuestions.filter((item) => item.category === category);
  renderCategoryQuestions(questions);
}

function renderCategoryQuestions(questions) {
  if (!catalogList) return;
  catalogList.innerHTML = '';
  if (catalogEmpty) {
    catalogEmpty.hidden = questions.length !== 0;
  }
  if (questions.length === 0) {
    return;
  }
  questions.forEach((question) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog__question';
    button.dataset.questionId = question.id;
    const text = document.createElement('span');
    text.className = 'catalog__question-text';
    text.textContent = question.text;
    button.appendChild(text);
    item.appendChild(button);
    catalogList.appendChild(item);
  });
}

async function chooseQuestionById(questionId, triggerButton) {
  try {
    if (triggerButton) {
      triggerButton.disabled = true;
    }
    const payload = await postJson('api/next_question.php', {
      room_key: roomKey,
      question_id: questionId,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się wybrać pytania.');
    }
    applyQuestion(payload.current_question);
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
    }
  }
}

async function sendPresence() {
  if (selfInfo && selfInfo.status !== 'active') {
    return;
  }
  try {
    await postJson('api/presence.php', {
      room_key: roomKey,
      participant_id: participantId,
    });
  } catch (error) {
    console.warn('Nie udało się zaktualizować obecności', error);
  }
}


let isPolling = true;

async function startPolling() {
  if (!isPolling) return;
  await refreshState();
  if (isPolling) {
    pollTimer = setTimeout(startPolling, 4000);
  }
}

startPolling();
presenceTimer = setInterval(sendPresence, 15000);
sendPresence();
adjustChatInputHeight();

window.addEventListener('beforeunload', () => {
  isPolling = false;
  if (pollTimer) clearTimeout(pollTimer);
  clearInterval(presenceTimer);
});
