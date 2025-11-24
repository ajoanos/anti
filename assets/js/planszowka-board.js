import { postJson, getJson } from './app.js';
import { boardFields, finishIndex, boardConfig } from './board-data.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const localPlayerId = params.get('pid') || '';
const localPlayerName = (params.get('name') || '').trim() || 'Ty';

const accessPage = boardConfig && boardConfig.accessPage ? boardConfig.accessPage : 'planszowa.html';
if (!roomKey || !localPlayerId) {
  window.location.replace(accessPage);
}

const colorPalette = ['rose', 'mint', 'violet', 'sun', 'sea'];
const storagePrefix = boardConfig && boardConfig.storagePrefix ? boardConfig.storagePrefix : 'momenty.planszowka';
const fallbackStorageKey = `${storagePrefix}.state.${roomKey}`;
const shareLinkUrl = buildShareUrl();
const EMAIL_ENDPOINT = 'api/send_positions_email.php';
const boardVariantSlug = (document.body?.dataset?.boardVariant || '').toLowerCase();
const SHARE_EMAIL_SUBJECT =
  boardVariantSlug === 'romantic'
    ? 'Planszówka romantyczna – dołącz do mnie'
    : 'Planszówka dla dwojga – dołącz do mnie';

const rollButtons = Array.from(document.querySelectorAll('[data-role="roll-button"]'));
const floatingDiceMediaQuery = window.matchMedia('(min-width: 1024px)');
const MOVEMENT_INITIAL_DELAY_MS = 600;
const MOVEMENT_STEP_DELAY_MS = 450;
const MOVEMENT_RECENT_THRESHOLD_MS = 20000;

const visualPositions = {};
let movementAnimation = null;
let dicePositionFrame = null;
let suppressAutoFocusScroll = false;
let focusScrollReleaseHandle = null;
let lastDiceFloatingState = null;

const lastRollSignatureStorageKey = `${storagePrefix}.lastRollSignature.${roomKey}`;
let lastAnimatedRollSignature = loadAnimatedRollSignature();

const elements = {
  turnLabel: document.getElementById('planszowka-turn-label'),
  waitHint: document.getElementById('planszowka-wait-hint'),
  players: document.getElementById('planszowka-players'),
  diceButtons: rollButtons,
  diceContainer: document.querySelector('.planszowka-dice'),
  diceRollButton: document.getElementById('planszowka-dice-roll'),
  diceReviewActions: document.getElementById('planszowka-dice-review'),
  diceTaskContainer: document.getElementById('planszowka-dice-task'),
  diceTaskTitle: document.getElementById('planszowka-dice-task-title'),
  diceTaskBody: document.getElementById('planszowka-dice-task-body'),
  diceTaskNotice: document.getElementById('planszowka-dice-task-notice'),
  taskTitle: document.getElementById('planszowka-task-title'),
  taskBody: document.getElementById('planszowka-task-body'),
  taskActions: document.getElementById('planszowka-task-actions'),
  taskSection: document.querySelector('.planszowka-task'),
  board: document.getElementById('planszowka-board'),
  boardWrapper: document.getElementById('planszowka-board-wrapper'),
  finishPanel: document.getElementById('planszowka-finish'),
  finishScores: document.getElementById('planszowka-finish-scores'),
  resetButton: document.getElementById('planszowka-reset'),
  infoBanner: document.getElementById('planszowka-info'),
  taskNotice: document.getElementById('planszowka-task-notice'),
};

const shareElements = {
  bar: document.getElementById('share-bar'),
  openButton: document.getElementById('share-open'),
  layer: document.getElementById('share-layer'),
  card: document.getElementById('share-card'),
  closeButton: document.getElementById('share-close'),
  backdrop: document.getElementById('share-backdrop'),
  hint: document.getElementById('share-hint'),
  feedback: document.getElementById('share-feedback'),
  linksContainer: document.getElementById('share-links'),
  copyButton: document.getElementById('share-copy'),
  qrButton: document.getElementById('share-show-qr'),
  modal: document.getElementById('share-qr-modal'),
  modalImage: document.getElementById('share-qr-image'),
  modalUrl: document.getElementById('share-qr-url'),
  modalClose: document.getElementById('share-qr-close'),
  emailForm: document.getElementById('share-email'),
  emailInput: document.getElementById('share-email-input'),
  emailFeedback: document.getElementById('share-email-feedback'),
};

let gameState = createEmptyState();
let toastTimer = null;
let shareFeedbackTimer = null;
let currentParticipants = [];
let pollHandle = null;
let lastSnapshotSignature = '';
let lastParticipantsSignature = '';
let lastFocusedFieldIndex = null;
let isCurrentUserHost = false;
let shareSheetController = initializeShareSheet(shareElements);

setupFloatingDiceObservers();

initializeShareChannels();
initializeShareEmailForm();

updateShareVisibility();

init();

async function init() {
  renderBoardSkeleton();
  bindEvents();

  await loadInitialState();

  ensureParticipantRecord(localPlayerId, localPlayerName);
  ensureLocalPlayer();
  render();

  setupRealtimeBridge();
}

function createEmptyState() {
  return {
    players: {},
    turnOrder: [],
    positions: {},
    hearts: {},
    jail: {},
    notice: '',
    currentTurn: null,
    awaitingConfirmation: null,
    nextTurn: null,
    lastRoll: null,
    focusField: 0,
    finished: false,
    winnerId: null,
    version: 0,
    history: [],
  };
}

async function loadInitialState() {
  const remoteLoaded = await loadRemoteState();
  if (remoteLoaded) {
    return;
  }

  const stored = loadFallbackState();
  if (stored) {
    setCurrentParticipants(deriveParticipantsFromState(stored));
    applyState(stored, { skipBroadcast: true });
  } else {
    applyState(createEmptyState(), { skipBroadcast: true });
  }

}

async function loadRemoteState() {
  try {
    const snapshot = await requestBoardSnapshot();
    if (!snapshot) {
      return false;
    }
    isCurrentUserHost = Boolean(snapshot.self?.is_host);
    setCurrentParticipants(snapshot.participants);
    applyState(snapshot.state, { skipBroadcast: true });
    updateSnapshotSignature(snapshot.state, snapshot.participants);
    return true;
  } catch (error) {
    console.error('Nie udało się pobrać stanu planszówki z serwera.', error);
    return false;
  }
}

function deriveParticipantsFromState(state) {
  if (!state || typeof state !== 'object') {
    return [];
  }
  if (state.players && typeof state.players === 'object') {
    return Object.values(state.players)
      .map((player) => ({
        id: String(player?.id ?? ''),
        name: String(player?.name ?? '').trim() || 'Gracz',
      }))
      .filter((entry) => entry.id);
  }
  return [];
}

function ensureParticipantRecord(participantId, participantName) {
  const id = String(participantId || '').trim();
  if (!id) {
    return;
  }
  const name = (participantName || '').trim() || 'Ty';
  const existing = currentParticipants.find((entry) => String(entry.id) === id);
  if (existing) {
    existing.name = name;
  } else {
    currentParticipants.push({ id, name });
  }
}

async function requestBoardSnapshot() {
  if (!roomKey || !localPlayerId) {
    return null;
  }
  const query = new URLSearchParams({
    room_key: roomKey,
    participant_id: localPlayerId,
  });
  const url = `api/board_state.php?${query.toString()}`;
  const payload = await getJson(url);
  if (!payload || !payload.ok) {
    if (payload?.error) {
      console.warn(payload.error);
    }
    return null;
  }
  const participants = normalizeParticipants(payload.participants);
  const state = payload.board_state && typeof payload.board_state === 'object'
    ? payload.board_state
    : createEmptyState();
  const self = payload.self && typeof payload.self === 'object' ? payload.self : null;
  return { state, participants, self, updatedAt: payload.updated_at || '' };
}

function normalizeParticipants(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((item) => ({
      id: String(item?.id ?? item?.participant_id ?? ''),
      name: String(item?.display_name ?? item?.name ?? '').trim() || 'Gracz',
    }))
    .filter((entry) => entry.id);
}

function bindEvents() {
  elements.diceButtons?.forEach((button) => {
    button.addEventListener('click', handleRollRequest);
  });
  elements.resetButton?.addEventListener('click', () => {
    if (!confirm('Zresetować planszę i zacząć od nowa?')) {
      return;
    }
    updateState((draft) => {
      draft.positions = {};
      draft.hearts = {};
      draft.jail = {};
      draft.notice = '';
      draft.currentTurn = draft.turnOrder[0] || null;
      draft.awaitingConfirmation = null;
      draft.nextTurn = null;
      draft.lastRoll = null;
      draft.focusField = 0;
      draft.finished = false;
      draft.winnerId = null;
      draft.history = [];
      draft.turnOrder.forEach((id) => {
        draft.positions[id] = 0;
        draft.hearts[id] = 0;
        draft.jail[id] = 0;
      });
    });
  });

  elements.taskActions?.addEventListener('click', handleTaskActionClick);
  elements.diceReviewActions?.addEventListener('click', handleTaskActionClick);

  shareElements.copyButton?.addEventListener('click', () => {
    copyShareLink();
  });

  shareElements.qrButton?.addEventListener('click', () => {
    openQrModal();
  });

  shareElements.modalClose?.addEventListener('click', () => {
    closeQrModal();
  });

  shareElements.modal?.addEventListener('click', (event) => {
    if (event.target === shareElements.modal) {
      closeQrModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !shareElements.modal?.hidden) {
      closeQrModal();
    }
  });
}

function handleTaskActionClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest('button[data-action]');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  const action = button.dataset.action;
  if (action === 'confirm') {
    resolveTaskResult(true);
  } else if (action === 'skip') {
    resolveTaskResult(false);
  }
}

function setupRealtimeBridge() {
  if (pollHandle) {
    window.clearTimeout(pollHandle);
    pollHandle = null;
  }
  onGameStateFromServer((incoming, participants) => {
    if (!incoming) {
      return;
    }
    setCurrentParticipants(participants);
    applyState(incoming, { skipBroadcast: true });
  });
}

function ensureLocalPlayer() {
  const id = String(localPlayerId);
  ensureParticipantRecord(id, localPlayerName);
  const existing = gameState.players[id];
  if (existing) {
    if (existing.name !== localPlayerName) {
      updateState((draft) => {
        const player = draft.players[id];
        if (player) {
          player.name = localPlayerName;
        }
      });
    }
    return;
  }

  updateState((draft) => {
    const usedColors = new Set(Object.values(draft.players).map((player) => player.color));
    const color = colorPalette.find((item) => !usedColors.has(item)) || colorPalette[0];
    draft.players[id] = {
      id,
      name: localPlayerName,
      color,
    };
    draft.turnOrder.push(id);
    draft.positions[id] = 0;
    draft.hearts[id] = 0;
    draft.jail[id] = 0;
    if (!draft.currentTurn) {
      draft.currentTurn = id;
    }
  });
}

function handleRollRequest() {
  if (!canCurrentPlayerRoll()) {
    displayInfo('Teraz ruch partnera 😉');
    return;
  }

  updateState((draft) => {
    const roll = Math.floor(Math.random() * 6) + 1;
    const playerId = String(localPlayerId);
    const startIndex = draft.positions[playerId] ?? 0;
    let targetIndex = Math.min(startIndex + roll, finishIndex);
    const steps = [];

    const playerName = draft.players[playerId]?.name || 'Gracz';
    steps.push(`${playerName} wyrzucił(a) ${roll}.`);

    const specialResult = resolveSpecialTiles(draft, playerId, targetIndex);
    targetIndex = specialResult.index;
    steps.push(...specialResult.messages);

    draft.positions[playerId] = targetIndex;
    draft.focusField = targetIndex;
    const rollTimestamp = Date.now();
    const rollId = `${playerId}-${rollTimestamp}-${Math.floor(Math.random() * 1000)}`;
    draft.lastRoll = {
      value: roll,
      playerId,
      from: startIndex,
      to: targetIndex,
      id: rollId,
      createdAt: rollTimestamp,
    };

    if (specialResult.notice) {
      draft.notice = specialResult.notice;
    } else {
      draft.notice = '';
    }

    if (targetIndex >= finishIndex) {
      draft.finished = true;
      draft.winnerId = playerId;
      draft.currentTurn = null;
      draft.awaitingConfirmation = null;
      draft.nextTurn = null;
      draft.notice = '';
      steps.push(`${playerName} dotarł(a) na metę!`);
    } else {
      const field = boardFields[targetIndex];
      const awaitingMode = getAwaitingModeForField(field);
      const nextTurnCandidate = determineNextTurn(draft, playerId);
      const reviewerId = awaitingMode && nextTurnCandidate && nextTurnCandidate !== playerId
        ? nextTurnCandidate
        : null;

      if (awaitingMode && reviewerId) {
        draft.awaitingConfirmation = {
          playerId,
          fieldIndex: targetIndex,
          reviewerId,
          mode: awaitingMode,
        };
        draft.nextTurn = reviewerId;
      } else {
        draft.awaitingConfirmation = null;
        draft.nextTurn = null;
        draft.currentTurn = nextTurnCandidate || null;
        if (awaitingMode && !reviewerId) {
          const extraNotice = buildNoReviewerNotice(field);
          if (extraNotice) {
            draft.notice = [draft.notice, extraNotice].filter(Boolean).join(' ').trim();
          }
        }
      }
    }

    steps.forEach((message) => addHistoryEntry(draft, message));
  });
}

function getAwaitingModeForField(field) {
  if (!field) {
    return null;
  }
  if (field.type === 'task') {
    return 'task';
  }
  if (field.type === 'safe') {
    return 'safe';
  }
  return null;
}

function buildNoReviewerNotice(field) {
  if (!field) {
    return '';
  }
  if (field.type === 'safe') {
    return 'Partner pauzuje – serduszko z bezpiecznego pola dodacie, gdy wróci do gry.';
  }
  if (field.type === 'task') {
    return 'Partner jest w więzieniu, więc masz dwa rzuty z rzędu i możesz pominąć zadanie oraz serduszko.';
  }
  return '';
}

function resolveSpecialTiles(draft, playerId, startIndex) {
  let index = startIndex;
  const messages = [];
  let notice = '';
  const maxLoops = 5;
  let loopGuard = 0;

  while (loopGuard < maxLoops) {
    const field = boardFields[index];
    if (!field) {
      break;
    }
    if (field.type === 'moveForward') {
      const steps = Number.isFinite(field.steps) ? Math.max(1, Number(field.steps)) : 5;
      index = Math.min(index + steps, finishIndex);
      messages.push(field.label || `Przemieszczasz się ${describeSteps(steps)} do przodu.`);
      loopGuard += 1;
      continue;
    }
    if (field.type === 'moveBack') {
      const steps = Number.isFinite(field.steps) ? Math.max(1, Number(field.steps)) : 4;
      index = Math.max(index - steps, 0);
      messages.push(field.label || `Cofasz się o ${describeSteps(steps)}.`);
      loopGuard += 1;
      continue;
    }
    if (field.type === 'gotoNearestSafe') {
      const safeIndex = findPreviousSafeField(index);
      if (safeIndex !== index) {
        index = safeIndex;
        messages.push(field.label || 'Wracasz na najbliższe bezpieczne pole.');
        loopGuard += 1;
        continue;
      }
    }
    if (field.type === 'jail') {
      const penalty = Number.isFinite(field.penaltyTurns) ? Math.max(1, Number(field.penaltyTurns)) : 2;
      draft.jail[playerId] = penalty;
      messages.push(field.label || `Lądujesz w więzieniu – pauzujesz ${describeTurns(penalty)}.`);
      notice = 'Więzienie! Drugi partner rzuca teraz dwa razy i może pominąć zadania oraz serduszka, dopóki nie wrócisz do gry.';
    }
    if (field.type === 'safe') {
      const baseSafe = (field.label || 'Bezpieczne pole – chwilka oddechu 😌').trim();
      if (baseSafe.toLowerCase().includes('serdusz')) {
        notice = baseSafe;
      } else {
        const connector = baseSafe.endsWith('.') ? ' ' : '. ';
        notice = `${baseSafe}${connector}Partner może dodać Ci serduszko.`;
      }
    }
    break;
  }

  return { index, messages, notice };
}

function findPreviousSafeField(startIndex) {
  for (let i = startIndex; i >= 0; i -= 1) {
    const field = boardFields[i];
    if (field?.type === 'safe') {
      return i;
    }
  }
  return startIndex;
}

function determineNextTurn(draft, currentId) {
  if (!Array.isArray(draft.turnOrder) || draft.turnOrder.length === 0) {
    return null;
  }
  if (draft.turnOrder.length === 1) {
    return currentId;
  }
  const order = draft.turnOrder;
  const startIndex = Math.max(order.indexOf(currentId), 0);
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(startIndex + offset) % order.length];
    if (!candidate) {
      continue;
    }
    const jailTurns = draft.jail[candidate] ?? 0;
    if (jailTurns > 0) {
      draft.jail[candidate] = Math.max(0, jailTurns - 1);
      const name = draft.players[candidate]?.name || 'Gracz';
      addHistoryEntry(draft, `${name} pauzuje jeszcze ${describeTurns(draft.jail[candidate])}.`);
      continue;
    }
    return candidate;
  }
  return currentId;
}

function resolveTaskResult(completed) {
  const awaiting = gameState.awaitingConfirmation;
  if (!awaiting) {
    return;
  }

  const reviewerId = awaiting.reviewerId ? String(awaiting.reviewerId) : null;
  const performerId = awaiting.playerId ? String(awaiting.playerId) : null;
  const localId = String(localPlayerId);

  if (reviewerId) {
    if (reviewerId !== localId) {
      const reviewerName = gameState.players[reviewerId]?.name || 'partner';
      displayInfo(`Na decyzję czeka ${reviewerName}.`);
      return;
    }
  } else if (performerId === localId) {
    displayInfo('Poczekaj, aż partner zatwierdzi zadanie.');
    return;
  }

  updateState((draft) => {
    const record = draft.awaitingConfirmation;
    if (!record || !record.playerId) {
      return;
    }

    const field = boardFields[record.fieldIndex];
    const performer = draft.players[record.playerId];
    const reviewer = record.reviewerId ? draft.players[record.reviewerId] : null;
    const performerName = performer?.name || 'Gracz';
    const reviewerName = reviewer?.name || 'Partner';
    const awaitingMode = record.mode === 'safe' ? 'safe' : 'task';
    const taskLabel = field?.label || (awaitingMode === 'safe' ? 'bezpieczne pole' : 'zadanie');

    draft.awaitingConfirmation = null;

    if (completed) {
      draft.hearts[record.playerId] = (draft.hearts[record.playerId] ?? 0) + 1;
      if (awaitingMode === 'safe') {
        addHistoryEntry(draft, `${reviewerName} przyznaje ${performerName} serduszko na bezpiecznym polu "${taskLabel}".`);
        draft.notice = `${performerName} zdobywa serduszko na bezpiecznym polu.`;
      } else {
        addHistoryEntry(draft, `${reviewerName} przyznaje ${performerName} serduszko za "${taskLabel}".`);
        draft.notice = `${performerName} zdobywa serduszko ❤️.`;
      }
    } else {
      if (awaitingMode === 'safe') {
        addHistoryEntry(draft, `${reviewerName} rezygnuje z serduszka dla ${performerName} na bezpiecznym polu "${taskLabel}".`);
        draft.notice = `${performerName} zostaje bez serduszka na bezpiecznym polu.`;
      } else {
        addHistoryEntry(draft, `${reviewerName} nie przyznaje serduszka ${performerName} za "${taskLabel}".`);
        draft.notice = `${performerName} nie zdobywa serduszka tym razem.`;
      }
    }

    const next = draft.nextTurn || determineNextTurn(draft, record.playerId);
    draft.currentTurn = next;
    draft.nextTurn = null;
  });
}

function addHistoryEntry(draft, message) {
  if (!draft.history) {
    draft.history = [];
  }
  draft.history.push({ message, timestamp: new Date().toISOString() });
  if (draft.history.length > 50) {
    draft.history = draft.history.slice(-50);
  }
}

function canCurrentPlayerRoll() {
  if (gameState.finished) {
    return false;
  }
  if (!gameState.currentTurn) {
    return false;
  }
  if (gameState.awaitingConfirmation) {
    return false;
  }
  if (gameState.turnOrder.length < 2) {
    return false;
  }
  return gameState.currentTurn === String(localPlayerId);
}

function applyState(newState, options = {}) {
  gameState = sanitizeState(newState, currentParticipants);
  render();
  updateSnapshotSignature(gameState, currentParticipants);
  if (!options.skipBroadcast) {
    persistState(gameState);
  }
}

function updateState(mutator, options = {}) {
  const draft = sanitizeState(JSON.parse(JSON.stringify(gameState)), currentParticipants);
  mutator(draft);
  const baseVersion = Number.isFinite(draft.version) ? Number(draft.version) : 0;
  draft.version = baseVersion + 1;
  gameState = sanitizeState(draft, currentParticipants);
  render();
  updateSnapshotSignature(gameState, currentParticipants);
  if (options.broadcast !== false) {
    persistState(gameState);
  }
}

function sanitizeState(state, participants = []) {
  const next = createEmptyState();
  const source = state && typeof state === 'object' ? state : {};

  const participantList = Array.isArray(participants)
    ? participants
        .map((entry) => ({
          id: String(entry?.id ?? ''),
          name: String(entry?.name ?? '').trim() || 'Gracz',
        }))
        .filter((entry) => entry.id)
    : [];

  const incomingPlayers = {};
  if (source.players && typeof source.players === 'object') {
    Object.entries(source.players).forEach(([key, value]) => {
      const id = String(value?.id ?? key);
      if (!id) {
        return;
      }
      incomingPlayers[id] = {
        id,
        name: String(value?.name ?? '').trim() || 'Gracz',
        color: String(value?.color ?? '').trim(),
      };
    });
  }

  const usedColors = new Set(
    Object.values(incomingPlayers)
      .map((player) => player.color)
      .filter((color) => Boolean(color)),
  );

  const players = {};
  participantList.forEach((participant) => {
    const id = participant.id;
    const existing = incomingPlayers[id] || {};
    const color = existing.color || pickColor(usedColors);
    usedColors.add(color);
    players[id] = {
      id,
      name: participant.name,
      color,
    };
  });

  Object.values(incomingPlayers).forEach((player) => {
    if (!players[player.id]) {
      const color = player.color || pickColor(usedColors);
      usedColors.add(color);
      players[player.id] = {
        id: player.id,
        name: player.name,
        color,
      };
    }
  });

  next.players = players;

  const desiredOrder = Array.isArray(source.turnOrder)
    ? source.turnOrder.map((id) => String(id))
    : [];
  const turnOrder = [];
  desiredOrder.forEach((id) => {
    if (players[id] && !turnOrder.includes(id)) {
      turnOrder.push(id);
    }
  });
  Object.keys(players).forEach((id) => {
    if (!turnOrder.includes(id)) {
      turnOrder.push(id);
    }
  });
  next.turnOrder = turnOrder;

  const rawPositions = source.positions && typeof source.positions === 'object' ? source.positions : {};
  const rawHearts = source.hearts && typeof source.hearts === 'object' ? source.hearts : {};
  const rawJail = source.jail && typeof source.jail === 'object' ? source.jail : {};

  next.positions = {};
  next.hearts = {};
  next.jail = {};

  next.turnOrder.forEach((id) => {
    next.positions[id] = clampFieldIndex(rawPositions[id]);
    next.hearts[id] = clampNonNegative(rawHearts[id]);
    next.jail[id] = clampNonNegative(rawJail[id]);
  });

  next.notice = typeof source.notice === 'string' ? source.notice : '';
  next.focusField = clampFieldIndex(source.focusField);
  next.finished = Boolean(source.finished);
  next.version = Number.isFinite(source.version) ? Number(source.version) : Number(next.version || 0);

  let currentTurn = source.currentTurn ? String(source.currentTurn) : null;
  if (currentTurn && !players[currentTurn]) {
    currentTurn = null;
  }
  next.currentTurn = currentTurn || (next.turnOrder[0] || null);

  const nextTurnCandidate = source.nextTurn ? String(source.nextTurn) : null;
  next.nextTurn = nextTurnCandidate && players[nextTurnCandidate] ? nextTurnCandidate : null;

  if (source.awaitingConfirmation && typeof source.awaitingConfirmation === 'object') {
    const awaiting = {
      playerId: String(source.awaitingConfirmation.playerId || ''),
      fieldIndex: clampFieldIndex(source.awaitingConfirmation.fieldIndex),
    };
    const awaitingMode = source.awaitingConfirmation.mode === 'safe' ? 'safe' : 'task';
    awaiting.mode = awaitingMode;
    const reviewerId = source.awaitingConfirmation.reviewerId
      ? String(source.awaitingConfirmation.reviewerId)
      : '';
    if (reviewerId && players[reviewerId]) {
      awaiting.reviewerId = reviewerId;
    }
    if (awaiting.playerId && players[awaiting.playerId]) {
      next.awaitingConfirmation = awaiting;
    }
  }

  if (source.lastRoll && typeof source.lastRoll === 'object') {
    const rollPlayerId = String(source.lastRoll.playerId || source.lastRoll.rolled_by || '');
    if (rollPlayerId) {
      const rollValue = clampDiceValue(source.lastRoll.value ?? source.lastRoll.roll);
      const rollId = String(source.lastRoll.id || source.lastRoll.roll_id || '');
      const rollCreatedAt = clampTimestamp(source.lastRoll.createdAt ?? source.lastRoll.created_at);
      next.lastRoll = {
        playerId: rollPlayerId,
        value: rollValue,
        from: clampFieldIndex(source.lastRoll.from ?? source.lastRoll.previous_position),
        to: clampFieldIndex(source.lastRoll.to ?? source.lastRoll.new_position),
        id: rollId || `${rollPlayerId}-${rollValue}-${rollCreatedAt || ''}`,
        createdAt: rollCreatedAt,
      };
    }
  }

  next.winnerId = source.winnerId ? String(source.winnerId) : null;
  if (next.winnerId && !players[next.winnerId]) {
    next.winnerId = null;
  }

  next.history = Array.isArray(source.history)
    ? source.history
        .map((entry) => ({
          message: String(entry?.message ?? '').trim(),
          timestamp: String(entry?.timestamp ?? ''),
        }))
        .filter((entry) => entry.message)
    : [];

  return next;
}

function updateSnapshotSignature(state, participants = []) {
  try {
    lastSnapshotSignature = JSON.stringify(state ?? {});
    lastParticipantsSignature = JSON.stringify(participantsSignature(participants));
  } catch (error) {
    console.warn('Nie udało się zapisać podpisu stanu planszówki.', error);
  }
}

function participantsSignature(participants) {
  if (!Array.isArray(participants)) {
    return [];
  }
  return participants.map((entry) => ({
    id: String(entry?.id ?? ''),
    name: String(entry?.name ?? '').trim(),
  }));
}

function clampFieldIndex(value) {
  const numeric = Number.isFinite(value) ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const bounded = Math.min(Math.max(0, Math.trunc(numeric)), finishIndex);
  return bounded;
}

function clampNonNegative(value) {
  const numeric = Number.isFinite(value) ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.trunc(numeric));
}

function clampTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.trunc(numeric);
}

function clampDiceValue(value) {
  const numeric = Number.isFinite(value) ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const bounded = Math.min(Math.max(1, Math.trunc(numeric)), 6);
  return bounded;
}

function pickColor(usedColors) {
  const palette = colorPalette;
  for (let index = 0; index < palette.length; index += 1) {
    const candidate = palette[index];
    if (!usedColors.has(candidate)) {
      return candidate;
    }
  }
  return palette[palette.length - 1];
}

window.addEventListener('beforeunload', () => {
  if (pollHandle) {
    window.clearTimeout(pollHandle);
    pollHandle = null;
  }
});

function renderBoardSkeleton() {
  if (!elements.board) {
    return;
  }
  elements.board.innerHTML = '';
  boardFields.forEach((field) => {
    const numberLabel = field.type === 'start' ? 'Start' : field.type === 'finish' ? 'Meta' : field.index;
    const item = document.createElement('li');
    item.className = `board-field board-field--${field.type}`;
    item.dataset.index = String(field.index);
    item.innerHTML = `
      <div class="board-field__number">${numberLabel}</div>
      <div class="board-field__label">${field.label}</div>
      <div class="board-field__tokens" aria-hidden="true"></div>
    `;
    item.title = field.label;
    elements.board.appendChild(item);
  });
}

function render() {
  renderTurn();
  renderPlayers();
  renderDice();
  renderTaskCard();
  syncVisualPositions();
  renderBoard();
  renderFinishPanel();
  renderInfo();
  maybeStartMovementAnimation();
}

function renderTurn() {
  if (!elements.turnLabel || !elements.waitHint) {
    return;
  }
  if (gameState.finished) {
    elements.turnLabel.textContent = 'Gra zakończona';
    elements.waitHint.textContent = 'Rozpocznij nową rozgrywkę lub ustal zadanie dla przegranego.';
    return;
  }
  if (!gameState.currentTurn) {
    elements.turnLabel.textContent = 'Czekamy na graczy';
    elements.waitHint.textContent = 'Dołączcie w dwójkę, aby zacząć zabawę.';
    return;
  }
  const viewer = gameState.players[String(localPlayerId)];

  if (gameState.awaitingConfirmation) {
    const awaiting = gameState.awaitingConfirmation;
    const performer = awaiting.playerId ? gameState.players[awaiting.playerId] : null;
    const reviewer = awaiting.reviewerId ? gameState.players[awaiting.reviewerId] : null;
    const performerName = performer?.name || 'partner';

    if (reviewer) {
      elements.turnLabel.textContent = `Decyzja: ${reviewer.name}`;
      if (reviewer.id === String(localPlayerId)) {
        elements.waitHint.textContent = `Zdecyduj, czy ${performerName} zdobywa serduszko.`;
      } else if (awaiting.playerId === String(localPlayerId)) {
        elements.waitHint.textContent = `Czekaj, aż ${reviewer.name} zdecyduje o serduszku.`;
      } else {
        elements.waitHint.textContent = `Czekamy na decyzję ${reviewer.name}.`;
      }
    } else {
      elements.turnLabel.textContent = performer
        ? `Czekamy na decyzję partnera ${performer.name}`
        : 'Czekamy na potwierdzenie zadania';
      if (awaiting.playerId === String(localPlayerId)) {
        elements.waitHint.textContent = 'Poczekaj na potwierdzenie zadania przez partnera.';
      } else {
        elements.waitHint.textContent = `Pomóż ${performerName} – dodaj serduszko lub pomiń.`;
      }
    }
    return;
  }

  const active = gameState.players[gameState.currentTurn];
  elements.turnLabel.textContent = active ? `Teraz ruch: ${active.name}` : 'Trwa ustalanie kolejki';
  if (viewer && viewer.id === gameState.currentTurn) {
    elements.waitHint.textContent = 'To Twoja kolej – rzuć kostką!';
  } else {
    elements.waitHint.textContent = 'Czekaj na ruch partnera.';
  }
}

function renderPlayers() {
  if (!elements.players) {
    return;
  }
  elements.players.innerHTML = '';
  const entries = gameState.turnOrder.map((id) => gameState.players[id]).filter(Boolean);
  if (!entries.length) {
    const info = document.createElement('p');
    info.className = 'players-empty';
    info.textContent = 'Zaproszenie partnera znajdziesz w poprzednim kroku gry.';
    elements.players.appendChild(info);
    return;
  }

  entries.forEach((player) => {
    const card = document.createElement('article');
    const isActive = gameState.currentTurn === player.id;
    card.className = `player-card player-card--${player.color}`;
    if (isActive) {
      card.classList.add('player-card--active');
    }
    const hearts = gameState.hearts[player.id] ?? 0;
    const position = gameState.positions[player.id] ?? 0;
    const jail = gameState.jail[player.id] ?? 0;
    card.innerHTML = `
      <header class="player-card__header">
        <span class="player-card__token">${player.name.slice(0, 1).toUpperCase()}</span>
        <div class="player-card__meta">
          <h3>${player.name}</h3>
          <p>Pole ${position}</p>
        </div>
        <span class="player-card__hearts" aria-label="Serduszka">❤️ ${hearts}</span>
      </header>
      <footer class="player-card__footer">
        ${jail > 0 ? `<span class="player-card__status">Pauzuje ${describeTurns(jail)}</span>` : '<span class="player-card__status">Gotowy do gry</span>'}
      </footer>
    `;
    elements.players.appendChild(card);
  });
}

function renderDice() {
  const canRoll = canCurrentPlayerRoll();
  if (Array.isArray(elements.diceButtons)) {
    elements.diceButtons.forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = !canRoll;
      }
    });
  }
}

function getTaskActionButtons(action) {
  const containers = [elements.taskActions, elements.diceReviewActions];
  const buttons = [];
  containers.forEach((container) => {
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const button = container.querySelector(`button[data-action="${action}"]`);
    if (button instanceof HTMLButtonElement) {
      buttons.push(button);
    }
  });
  return buttons;
}

function renderTaskCard() {
  if (!elements.taskTitle || !elements.taskBody || !elements.taskActions || !elements.taskNotice) {
    return;
  }
  const awaiting = gameState.awaitingConfirmation;
  const focusIndex = awaiting?.fieldIndex ?? gameState.focusField ?? 0;
  const field = boardFields[focusIndex] || boardFields[0];
  const performer = awaiting ? gameState.players[awaiting.playerId] : null;
  const reviewer = awaiting?.reviewerId ? gameState.players[awaiting.reviewerId] : null;
  const confirmButtons = getTaskActionButtons('confirm');
  const skipButtons = getTaskActionButtons('skip');
  const floatingTasks = isFloatingDiceActive();
  let noticeText = '';
  let noticeHidden = true;

  if (elements.taskSection instanceof HTMLElement) {
    elements.taskSection.hidden = floatingTasks;
  }
  elements.taskActions.hidden = floatingTasks;
  if (elements.diceContainer instanceof HTMLElement) {
    elements.diceContainer.hidden = !floatingTasks;
  }
  if (elements.diceRollButton instanceof HTMLButtonElement) {
    elements.diceRollButton.hidden = !floatingTasks;
  }

  if (field) {
    elements.taskTitle.textContent = field.label;
  } else {
    elements.taskTitle.textContent = 'Wybierz pole na planszy';
  }

  elements.taskBody.textContent = getFieldDescription(field);

  if (awaiting) {
    const localId = String(localPlayerId);
    const isPerformer = awaiting.playerId === localId;
    const isReviewer = reviewer ? reviewer.id === localId : !isPerformer;
    const performerName = performer?.name || 'partner';

    confirmButtons.forEach((button) => {
      button.textContent = 'Dodaj serduszko ❤️';
      button.hidden = !isReviewer;
      button.disabled = !isReviewer;
    });
    skipButtons.forEach((button) => {
      button.textContent = 'Nie wykonał';
      button.hidden = !isReviewer;
      button.disabled = !isReviewer;
    });
    const showDiceReview = floatingTasks && isReviewer;
    if (elements.diceReviewActions) {
      elements.diceReviewActions.hidden = !showDiceReview;
    }

    noticeHidden = false;
    if (isReviewer) {
      noticeText = `${performerName} czeka na Twoją decyzję.`;
    } else if (isPerformer) {
      noticeText = reviewer
        ? `Czekaj, aż ${reviewer.name} zdecyduje o serduszku.`
        : 'Czekaj na potwierdzenie zadania przez partnera.';
    } else {
      noticeText = reviewer
        ? `Czekamy na decyzję ${reviewer.name}.`
        : 'Czekamy na decyzję partnera.';
    }
  } else {
    confirmButtons.forEach((button) => {
      button.textContent = 'Zrobione – dodaj serduszko ❤️';
      button.hidden = true;
      button.disabled = true;
    });
    skipButtons.forEach((button) => {
      button.textContent = 'Pomiń – bez punktu';
      button.hidden = true;
      button.disabled = true;
    });
    if (elements.diceReviewActions) {
      elements.diceReviewActions.hidden = true;
    }
    if (gameState.turnOrder.length < 2) {
      noticeText = 'Poczekajcie, aż dołączy druga osoba.';
      noticeHidden = false;
    } else if (gameState.finished || field?.type === 'finish') {
      noticeText = '';
      noticeHidden = true;
    } else {
      noticeText = 'Rzuć kostką i zobacz, co czeka na kolejnym polu.';
      noticeHidden = false;
    }
  }

  elements.taskNotice.hidden = noticeHidden;
  elements.taskNotice.textContent = noticeHidden ? '' : noticeText;

  updateDiceTaskDetails({
    title: elements.taskTitle.textContent,
    body: elements.taskBody.textContent,
    notice: noticeText,
    noticeHidden,
  });
}

function updateDiceTaskDetails({ title = '', body = '', notice = '', noticeHidden = true }) {
  const container = elements.diceTaskContainer;
  const titleEl = elements.diceTaskTitle;
  const bodyEl = elements.diceTaskBody;
  const noticeEl = elements.diceTaskNotice;
  const trimmedTitle = (title || '').trim();
  const trimmedBody = (body || '').trim();
  const trimmedNotice = (notice || '').trim();
  const shouldShow = Boolean(container) && isFloatingDiceActive() && Boolean(trimmedTitle || trimmedBody);

  if (container) {
    container.hidden = !shouldShow;
  }
  if (titleEl) {
    titleEl.textContent = shouldShow ? trimmedTitle : '';
    titleEl.hidden = !shouldShow || !trimmedTitle;
  }
  if (bodyEl) {
    bodyEl.textContent = shouldShow ? trimmedBody : '';
    bodyEl.hidden = !shouldShow || !trimmedBody;
  }

  const showNotice = shouldShow && !noticeHidden && Boolean(trimmedNotice);
  if (noticeEl) {
    noticeEl.hidden = !showNotice;
    noticeEl.textContent = showNotice ? trimmedNotice : '';
  }
}

function renderBoard() {
  if (!elements.board) {
    return;
  }
  const focusIndex = clampFieldIndex(gameState.focusField);
  const focusChanged = focusIndex !== lastFocusedFieldIndex;
  const tokens = new Map();
  const handledPlayers = new Set();
  (gameState.turnOrder || []).forEach((id) => {
    const player = gameState.players[id];
    if (!player) {
      return;
    }
    handledPlayers.add(id);
    const displayIndex = getDisplayPosition(id, gameState.positions[id]);
    const fieldTokens = tokens.get(displayIndex) || [];
    fieldTokens.push(player);
    tokens.set(displayIndex, fieldTokens);
  });
  Object.keys(gameState.players).forEach((id) => {
    if (handledPlayers.has(id)) {
      return;
    }
    const player = gameState.players[id];
    if (!player) {
      return;
    }
    const displayIndex = getDisplayPosition(id, gameState.positions[id]);
    const fieldTokens = tokens.get(displayIndex) || [];
    fieldTokens.push(player);
    tokens.set(displayIndex, fieldTokens);
  });

  elements.board.querySelectorAll('.board-field').forEach((tile) => {
    if (!(tile instanceof HTMLElement)) {
      return;
    }
    const index = Number(tile.dataset.index || '0');
    if (index === focusIndex) {
      tile.classList.add('board-field--active');
      if (focusChanged && !suppressAutoFocusScroll) {
        scrollFieldIntoView(tile);
      }
    } else {
      tile.classList.remove('board-field--active');
    }
    const holder = tile.querySelector('.board-field__tokens');
    if (!(holder instanceof HTMLElement)) {
      return;
    }
    holder.innerHTML = '';
    const occupantList = tokens.get(index) || [];
    occupantList.forEach((player) => {
      const chip = document.createElement('span');
      chip.className = `board-token board-token--${player.color}`;
      chip.textContent = player.name.slice(0, 1).toUpperCase();
      chip.title = player.name;
      holder.appendChild(chip);
    });
  });
  lastFocusedFieldIndex = focusIndex;
  scheduleDicePositionUpdate();
}

function scrollFieldIntoView(tile, options = {}) {
  if (!tile || typeof tile.scrollIntoView !== 'function') {
    return;
  }
  const { behavior = 'smooth', block = 'center', inline = 'nearest' } = options;
  window.requestAnimationFrame(() => {
    tile.scrollIntoView({
      behavior,
      block,
      inline,
    });
  });
}

function renderFinishPanel() {
  if (!elements.finishPanel || !elements.finishScores) {
    return;
  }
  if (!gameState.finished) {
    elements.finishPanel.hidden = true;
    elements.finishScores.innerHTML = '';
    return;
  }
  elements.finishPanel.hidden = false;
  const winner = gameState.players[gameState.winnerId || ''];
  const message = winner
    ? `${winner.name} dociera pierwszy/a na metę! Wybierz zadanie dla partnera.`
    : 'Gra zakończona. Ustalcie zadanie dla przegranego.';
  elements.finishPanel.querySelector('p').textContent = message;
  elements.finishScores.innerHTML = '';
  gameState.turnOrder.forEach((id) => {
    const player = gameState.players[id];
    if (!player) {
      return;
    }
    const row = document.createElement('div');
    row.className = 'finish-score';
    row.innerHTML = `
      <span class="finish-score__name">${player.name}</span>
      <span class="finish-score__value">❤️ ${gameState.hearts[id] ?? 0}</span>
    `;
    elements.finishScores.appendChild(row);
  });
}

function renderInfo() {
  if (!elements.infoBanner) {
    return;
  }
  const message = gameState.notice || '';
  if (!message) {
    elements.infoBanner.hidden = true;
    elements.infoBanner.textContent = '';
    return;
  }
  elements.infoBanner.hidden = false;
  elements.infoBanner.textContent = message;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    if (elements.infoBanner) {
      elements.infoBanner.hidden = true;
      elements.infoBanner.textContent = '';
    }
  }, 4000);
}

function syncVisualPositions() {
  const positions = gameState.positions || {};
  const pendingRoll = hasPendingAnimatedMovement(gameState.lastRoll) ? gameState.lastRoll : null;
  Object.keys(gameState.players || {}).forEach((playerId) => {
    if (movementAnimation && movementAnimation.playerId === playerId) {
      return;
    }
    if (pendingRoll && pendingRoll.playerId === playerId) {
      if (!Number.isFinite(visualPositions[playerId])) {
        visualPositions[playerId] = clampFieldIndex(pendingRoll.from);
      }
      return;
    }
    const nextIndex = clampFieldIndex(positions[playerId]);
    visualPositions[playerId] = nextIndex;
  });
  Object.keys(visualPositions).forEach((playerId) => {
    if (!gameState.players[playerId]) {
      delete visualPositions[playerId];
    }
  });
}

function getDisplayPosition(playerId, fallbackIndex) {
  if (Number.isFinite(visualPositions[playerId])) {
    return clampFieldIndex(visualPositions[playerId]);
  }
  const fallback = clampFieldIndex(fallbackIndex);
  visualPositions[playerId] = fallback;
  return fallback;
}

function isFloatingDiceActive() {
  return Boolean(document.body?.classList?.contains('has-floating-dice'));
}

function scheduleDicePositionUpdate() {
  if (dicePositionFrame) {
    return;
  }
  dicePositionFrame = window.requestAnimationFrame(() => {
    dicePositionFrame = null;
    updateFloatingDicePosition();
  });
}

function updateFloatingDicePosition() {
  const dice = elements.diceContainer;
  const body = document.body;
  if (!dice || !body) {
    return;
  }
  const anchorTile = getActivePlayerTileElement();
  const shouldFloat = Boolean(anchorTile) && Boolean(floatingDiceMediaQuery?.matches);
  body.classList.toggle('has-floating-dice', shouldFloat);
  dice.dataset.floating = shouldFloat ? 'true' : 'false';
  if (lastDiceFloatingState !== shouldFloat) {
    lastDiceFloatingState = shouldFloat;
    renderTaskCard();
  }
  if (!shouldFloat || !anchorTile) {
    dice.style.removeProperty('top');
    dice.style.removeProperty('left');
    dice.style.removeProperty('opacity');
    return;
  }
  const rect = anchorTile.getBoundingClientRect();
  const width = dice.offsetWidth || 280;
  const height = dice.offsetHeight || 140;
  const margin = 16;
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
  let top = rect.top - height - margin;
  if (top < margin) {
    top = rect.bottom + margin;
  }
  dice.style.left = `${left}px`;
  dice.style.top = `${top}px`;
  dice.style.opacity = '1';
}

function setupFloatingDiceObservers() {
  if (typeof window === 'undefined') {
    return;
  }
  const handler = () => {
    scheduleDicePositionUpdate();
  };
  if (floatingDiceMediaQuery?.addEventListener) {
    floatingDiceMediaQuery.addEventListener('change', handler);
  } else if (floatingDiceMediaQuery?.addListener) {
    floatingDiceMediaQuery.addListener(handler);
  }
  window.addEventListener('resize', handler);
  window.addEventListener('scroll', handler, { passive: true });
  elements.boardWrapper?.addEventListener('scroll', handler, { passive: true });
  scheduleDicePositionUpdate();
}

function getActivePlayerTileElement() {
  if (!gameState.currentTurn) {
    return null;
  }
  const index = getDisplayPosition(gameState.currentTurn, gameState.positions[gameState.currentTurn]);
  return getBoardTileElement(index);
}

function getBoardTileElement(index) {
  if (!elements.board) {
    return null;
  }
  return elements.board.querySelector(`.board-field[data-index="${index}"]`);
}

function scrollPlayerIntoView(playerId, indexOverride) {
  const index = Number.isFinite(indexOverride)
    ? clampFieldIndex(indexOverride)
    : getDisplayPosition(playerId, gameState.positions[playerId]);
  const tile = getBoardTileElement(index);
  if (tile) {
    scrollFieldIntoView(tile);
  }
}

function setFocusScrollSuppressed(duration = 1200) {
  suppressAutoFocusScroll = true;
  if (focusScrollReleaseHandle) {
    window.clearTimeout(focusScrollReleaseHandle);
  }
  focusScrollReleaseHandle = window.setTimeout(() => {
    suppressAutoFocusScroll = false;
    focusScrollReleaseHandle = null;
  }, duration);
}

function releaseFocusScrollSuppression() {
  suppressAutoFocusScroll = false;
  if (focusScrollReleaseHandle) {
    window.clearTimeout(focusScrollReleaseHandle);
    focusScrollReleaseHandle = null;
  }
}

function maybeStartMovementAnimation() {
  const roll = gameState.lastRoll;
  if (!roll || !roll.playerId) {
    return;
  }
  const signature = buildRollSignature(roll);
  if (!signature || signature === lastAnimatedRollSignature) {
    return;
  }
  if (!isRollRecent(roll)) {
    rememberAnimatedRoll(signature);
    return;
  }
  if (movementAnimation && movementAnimation.signature === signature) {
    return;
  }
  const startIndex = clampFieldIndex(roll.from);
  const targetIndex = clampFieldIndex(roll.to);
  if (startIndex === targetIndex) {
    setFocusScrollSuppressed(MOVEMENT_INITIAL_DELAY_MS + 200);
    scrollPlayerIntoView(roll.playerId, startIndex);
    rememberAnimatedRoll(signature);
    return;
  }
  startMovementAnimation(roll, signature);
}

function startMovementAnimation(roll, signature) {
  cancelMovementAnimation();
  const startIndex = clampFieldIndex(roll.from);
  const targetIndex = clampFieldIndex(roll.to);
  const path = buildMovementPath(startIndex, targetIndex);
  if (!path.length) {
    rememberAnimatedRoll(signature);
    return;
  }
  movementAnimation = {
    signature,
    playerId: roll.playerId,
    path,
    stepIndex: 0,
    timer: null,
  };
  setFocusScrollSuppressed(MOVEMENT_INITIAL_DELAY_MS + path.length * MOVEMENT_STEP_DELAY_MS + 600);
  visualPositions[roll.playerId] = startIndex;
  renderBoard();
  scrollPlayerIntoView(roll.playerId, startIndex);
  movementAnimation.timer = window.setTimeout(runNextMovementStep, MOVEMENT_INITIAL_DELAY_MS);
}

function runNextMovementStep() {
  if (!movementAnimation) {
    return;
  }
  const { path, stepIndex, playerId } = movementAnimation;
  visualPositions[playerId] = path[stepIndex];
  renderBoard();
  if (!isFloatingDiceActive()) {
    scrollPlayerIntoView(playerId, path[stepIndex]);
  }
  movementAnimation.stepIndex += 1;
  if (movementAnimation.stepIndex < path.length) {
    movementAnimation.timer = window.setTimeout(runNextMovementStep, MOVEMENT_STEP_DELAY_MS);
  } else {
    finishMovementAnimation();
  }
}

function finishMovementAnimation() {
  if (!movementAnimation) {
    return;
  }
  const { signature, path, playerId } = movementAnimation;
  visualPositions[playerId] = path[path.length - 1];
  movementAnimation = null;
  renderBoard();
  releaseFocusScrollSuppression();
  rememberAnimatedRoll(signature);
  const focusTile = getBoardTileElement(clampFieldIndex(gameState.focusField));
  if (focusTile) {
    scrollFieldIntoView(focusTile);
  }
}

function cancelMovementAnimation() {
  if (movementAnimation?.timer) {
    window.clearTimeout(movementAnimation.timer);
  }
  movementAnimation = null;
  releaseFocusScrollSuppression();
}

function buildMovementPath(startIndex, targetIndex) {
  const path = [];
  if (startIndex === targetIndex) {
    return path;
  }
  const step = startIndex < targetIndex ? 1 : -1;
  for (let index = startIndex + step; step > 0 ? index <= targetIndex : index >= targetIndex; index += step) {
    path.push(clampFieldIndex(index));
  }
  return path;
}

function hasPendingAnimatedMovement(roll) {
  if (!roll || !roll.playerId) {
    return false;
  }
  const startIndex = clampFieldIndex(roll.from);
  const targetIndex = clampFieldIndex(roll.to);
  if (startIndex === targetIndex) {
    return false;
  }
  if (!isRollRecent(roll)) {
    return false;
  }
  const signature = buildRollSignature(roll);
  if (!signature || signature === lastAnimatedRollSignature) {
    return false;
  }
  return true;
}

function isRollRecent(roll) {
  if (!roll?.createdAt) {
    return true;
  }
  const age = Date.now() - Number(roll.createdAt);
  return age <= MOVEMENT_RECENT_THRESHOLD_MS;
}

function buildRollSignature(roll) {
  if (!roll) {
    return '';
  }
  const parts = [
    String(roll.playerId || ''),
    String(clampFieldIndex(roll.from)),
    String(clampFieldIndex(roll.to)),
    String(roll.value ?? ''),
    String(roll.id || roll.createdAt || ''),
  ];
  return parts.join(':');
}

function rememberAnimatedRoll(signature) {
  if (!signature) {
    return;
  }
  lastAnimatedRollSignature = signature;
  try {
    sessionStorage.setItem(lastRollSignatureStorageKey, signature);
  } catch (error) {
    console.warn('Nie udało się zapisać informacji o ostatnim rzucie.', error);
  }
}

function loadAnimatedRollSignature() {
  try {
    return sessionStorage.getItem(lastRollSignatureStorageKey) || '';
  } catch (error) {
    console.warn('Nie udało się odczytać informacji o ostatnim rzucie.', error);
    return '';
  }
}

function displayInfo(message) {
  if (!elements.infoBanner) {
    return;
  }
  elements.infoBanner.hidden = false;
  elements.infoBanner.textContent = message;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    if (elements.infoBanner) {
      elements.infoBanner.hidden = true;
      elements.infoBanner.textContent = '';
    }
  }, 3500);
}

function getFieldDescription(field) {
  if (!field) {
    return 'Rzućcie kostką i przesuwajcie pionki, aby odkryć kolejne zadania.';
  }
  if (field.type === 'task') {
    return 'Wykonajcie zadanie, a partner może nagrodzić Cię serduszkiem.';
  }
  if (field.type === 'safe') {
    return field.label || 'Bezpieczne pole – złapcie oddech, a partner może przyznać Ci serduszko.';
  }
  if (field.type === 'jail') {
    const penalty = Number.isFinite(field.penaltyTurns) ? Math.max(1, Number(field.penaltyTurns)) : 2;
    return field.label || `Pauzujesz ${describeTurns(penalty)} lub wykonujesz polecenia partnera.`;
  }
  if (field.type === 'moveForward') {
    const steps = Number.isFinite(field.steps) ? Math.max(1, Number(field.steps)) : 5;
    return field.label || `Przesuń pionek o ${describeSteps(steps)} do przodu i wykonaj nowe zadanie.`;
  }
  if (field.type === 'moveBack') {
    const steps = Number.isFinite(field.steps) ? Math.max(1, Number(field.steps)) : 4;
    return field.label || `Cofasz się o ${describeSteps(steps)} i sprawdzasz nowe zadanie.`;
  }
  if (field.type === 'gotoNearestSafe') {
    return field.label || 'Wracasz na najbliższe bezpieczne pole.';
  }
  if (field.type === 'finish') {
    return 'Wygrany wybiera jedno czułe lub miłe zadanie dla przegranego.';
  }
  if (field.type === 'start') {
    if (field.label && field.label.trim() && field.label.trim().toLowerCase() !== 'start') {
      return field.label.trim();
    }
    return 'Przygotujcie się do wspólnej zabawy.';
  }
  return 'Rzućcie kostką i przesuwajcie pionki, aby odkryć kolejne zadania.';
}

function describeSteps(count) {
  return `${count} ${getPolishPlural(count, 'pole', 'pola', 'pól')}`;
}

function describeTurns(count) {
  return `${count} ${getPolishPlural(count, 'turę', 'tury', 'tur')}`;
}

function getPolishPlural(count, singular, few, many) {
  const abs = Math.abs(Number(count)) % 100;
  const lastDigit = abs % 10;
  if (abs > 10 && abs < 20) {
    return many;
  }
  if (lastDigit === 1) {
    return singular;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}

function buildShareUrl() {
  if (!roomKey) {
    return '';
  }
  const invitePage = boardConfig && boardConfig.invitePage ? boardConfig.invitePage : 'planszowa-invite.html';
  const url = new URL(invitePage, window.location.href);
  url.searchParams.set('room_key', roomKey);
  return url.toString();
}

function buildShareMessage(url) {
  return `Dołącz do mojej planszówki w Momenty: ${url}`;
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

  if (shareElements.copyButton) {
    shareElements.copyButton.hidden = !hasLink;
    shareElements.copyButton.disabled = !hasLink;
  }

  if (shareElements.qrButton) {
    shareElements.qrButton.hidden = !hasLink;
    shareElements.qrButton.disabled = !hasLink;
  }

  if (shareElements.hint && !hasLink) {
    shareElements.hint.textContent = 'Nie udało się przygotować linku do udostępnienia. Odśwież stronę i spróbuj ponownie.';
  }

  const { linksContainer } = shareElements;
  if (!linksContainer) {
    return;
  }

  const links = linksContainer.querySelectorAll('[data-share-channel]');
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
  const { emailForm, emailInput } = shareElements;
  if (!emailForm || !(emailInput instanceof HTMLInputElement)) {
    return;
  }
  if (!hasLink) {
    emailForm.hidden = true;
    emailForm.dataset.shareUrl = '';
    emailForm.dataset.shareMessage = '';
    emailInput.value = '';
    resetShareEmailFeedback();
    return;
  }
  emailForm.hidden = false;
  emailForm.dataset.shareUrl = shareLinkUrl;
  emailForm.dataset.shareMessage = buildShareMessage(shareLinkUrl);
  resetShareEmailFeedback();
}

function resetShareEmailFeedback() {
  const { emailFeedback } = shareElements;
  if (!emailFeedback) {
    return;
  }
  emailFeedback.hidden = true;
  emailFeedback.textContent = '';
  delete emailFeedback.dataset.tone;
}

function initializeShareEmailForm() {
  const { emailForm, emailInput } = shareElements;
  if (!emailForm || !(emailInput instanceof HTMLInputElement)) {
    return;
  }
  const submitButton = emailForm.querySelector('button[type="submit"]');
  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!emailInput.checkValidity()) {
      emailInput.reportValidity();
      return;
    }
    const email = emailInput.value.trim();
    if (!email) {
      emailInput.reportValidity();
      return;
    }
    const shareUrl = emailForm.dataset.shareUrl || shareLinkUrl;
    if (!shareUrl) {
      resetShareEmailFeedback();
      if (shareElements.emailFeedback) {
        shareElements.emailFeedback.hidden = false;
        shareElements.emailFeedback.dataset.tone = 'error';
        shareElements.emailFeedback.textContent = 'Nie udało się przygotować linku do udostępnienia. Odśwież stronę.';
      }
      return;
    }
    const message = emailForm.dataset.shareMessage || buildShareMessage(shareUrl);
    const payload = {
      partner_email: email,
      share_url: shareUrl,
      subject: SHARE_EMAIL_SUBJECT,
      sender_name: localPlayerName,
      message,
    };
    if (submitButton) {
      submitButton.disabled = true;
    }
    if (shareElements.emailFeedback) {
      shareElements.emailFeedback.hidden = false;
      shareElements.emailFeedback.textContent = 'Wysyłamy wiadomość…';
      shareElements.emailFeedback.removeAttribute('data-tone');
    }
    try {
      const response = await postJson(EMAIL_ENDPOINT, payload);
      if (!response?.ok) {
        throw new Error(response?.error || 'Nie udało się wysłać wiadomości.');
      }
      if (shareElements.emailFeedback) {
        shareElements.emailFeedback.hidden = false;
        shareElements.emailFeedback.dataset.tone = 'success';
        shareElements.emailFeedback.textContent = 'Wiadomość wysłana! Powiedz partnerowi, żeby zajrzał do skrzynki.';
      }
      emailInput.value = '';
    } catch (error) {
      console.error(error);
      if (shareElements.emailFeedback) {
        shareElements.emailFeedback.hidden = false;
        shareElements.emailFeedback.dataset.tone = 'error';
        shareElements.emailFeedback.textContent =
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
  const { layer, openButton } = shareElements;
  if (!layer) {
    return;
  }
  layer.dataset.open = 'false';
  layer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('share-layer-open');
  openButton?.setAttribute('aria-expanded', 'false');
}

function updateShareVisibility() {
  const count = Array.isArray(currentParticipants) ? currentParticipants.length : 0;
  const shouldShow = isCurrentUserHost && count < 2;

  if (!shouldShow) {
    closeShareSheet();
    resetShareFeedback();
    closeQrModal();
  }

  if (shareElements.bar) {
    shareElements.bar.hidden = !shouldShow;
  }
  if (shareElements.openButton) {
    shareElements.openButton.disabled = !shouldShow;
    if (shouldShow) {
      shareElements.openButton.removeAttribute('tabindex');
    } else {
      shareElements.openButton.setAttribute('tabindex', '-1');
      shareElements.openButton.setAttribute('aria-expanded', 'false');
    }
  }
}

function setCurrentParticipants(list) {
  currentParticipants = Array.isArray(list) ? [...list] : [];
  updateShareVisibility();
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
  if (!shareLinkUrl || !shareElements.modal || !shareElements.modalImage || !shareElements.modalUrl) {
    return;
  }

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareLinkUrl)}`;
  shareElements.modalImage.src = qrSrc;
  shareElements.modalUrl.href = shareLinkUrl;
  shareElements.modal.hidden = false;
  shareElements.modal.setAttribute('aria-hidden', 'false');
}

function closeQrModal() {
  if (!shareElements.modal) {
    return;
  }
  shareElements.modal.hidden = true;
  shareElements.modal.setAttribute('aria-hidden', 'true');
}

function showShareFeedback(message, isError = false) {
  if (!shareElements.feedback) {
    return;
  }

  shareElements.feedback.hidden = false;
  shareElements.feedback.textContent = message;
  shareElements.feedback.dataset.tone = isError ? 'error' : 'success';

  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
  }

  shareFeedbackTimer = window.setTimeout(() => {
    resetShareFeedback();
  }, 4000);
}

function resetShareFeedback() {
  if (!shareElements.feedback) {
    return;
  }

  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = null;
  }

  shareElements.feedback.hidden = true;
  shareElements.feedback.textContent = '';
  delete shareElements.feedback.dataset.tone;
}

function persistState(state) {
  sendGameStateToServer(state);
  saveFallbackState(state);
}

function saveFallbackState(state) {
  try {
    const payload = JSON.stringify({ version: state.version, state });
    localStorage.setItem(fallbackStorageKey, payload);
  } catch (error) {
    console.error('Nie można zapisać stanu planszówki.', error);
  }
}

function loadFallbackState() {
  try {
    const stored = localStorage.getItem(fallbackStorageKey);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored);
    return parsed.state || null;
  } catch (error) {
    console.error('Nie można odczytać stanu planszówki.', error);
    return null;
  }
}

function sendGameStateToServer(state) {
  if (!roomKey || !localPlayerId) {
    return;
  }
  postJson('api/board_sync.php', {
    room_key: roomKey,
    participant_id: localPlayerId,
    state,
  })
    .then((response) => {
      if (!response || !response.ok) {
        throw new Error(response?.error || 'Nie udało się zsynchronizować planszówki.');
      }
      if (response.board_state && typeof response.board_state === 'object') {
        updateSnapshotSignature(response.board_state, currentParticipants);
      }
    })
    .catch((error) => {
      console.error('Nie udało się wysłać stanu planszówki.', error);
    });
}

function onGameStateFromServer(callback) {
  async function poll() {
    try {
      const snapshot = await requestBoardSnapshot();
      if (snapshot) {
        isCurrentUserHost = Boolean(snapshot.self?.is_host);
        setCurrentParticipants(snapshot.participants);
        const stateSignature = JSON.stringify(snapshot.state ?? {});
        const participantsSig = JSON.stringify(participantsSignature(snapshot.participants));
        const shouldUpdate =
          stateSignature !== lastSnapshotSignature || participantsSig !== lastParticipantsSignature;
        if (shouldUpdate) {
          updateSnapshotSignature(snapshot.state, snapshot.participants);
          callback(snapshot.state, snapshot.participants);
        }
      }
    } catch (error) {
      console.error('Nie udało się pobrać aktualnego stanu planszówki.', error);
    } finally {
      pollHandle = window.setTimeout(poll, 2500);
    }
  }

  poll();
}
