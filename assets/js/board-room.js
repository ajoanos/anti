import { appendTokenToUrl, getJson, postJson } from './app.js';
import { BOARD_TASKS, BOARD_LENGTH } from './board-data.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const participantId = params.get('pid');
const token = params.get('token') || '';

if (!roomKey || !participantId) {
  window.location.replace(appendTokenToUrl('planszowa.html', token));
}

const boardContent = document.getElementById('board-content');
const boardGrid = document.getElementById('board-grid');
const boardPlayers = document.getElementById('board-players');
const boardEmpty = document.getElementById('board-empty');
const boardTurn = document.getElementById('board-turn');
const boardLastRoll = document.getElementById('board-last-roll');
const rollButton = document.getElementById('board-roll');
const challengeTitle = document.getElementById('board-challenge-title');
const challengeDescription = document.getElementById('board-challenge-description');
const boardHistory = document.getElementById('board-history');
const boardRoomKey = document.getElementById('board-room-key');
const boardCopyButton = document.getElementById('board-copy-link');
const boardCopyFeedback = document.getElementById('board-copy-feedback');
const boardOpenInvite = document.getElementById('board-open-invite');
const boardPending = document.getElementById('board-pending');
const boardPendingList = document.getElementById('board-pending-list');
const boardPendingEmpty = document.getElementById('board-pending-empty');
const waitingPage = appendTokenToUrl(document.body?.dataset.waitingPage || 'planszowa-waiting.html', token);

const tileElements = new Map();
const tokenPalette = ['board-token--rose', 'board-token--mint', 'board-token--violet', 'board-token--sun'];
let participantsCache = [];
let selfInfo = null;
let displayedTile = null;
let pollTimer = null;
let presenceTimer = null;
let copyFeedbackTimer = null;

initializeBoard();
setupShareArea();
startPolling();
startPresencePing();

boardGrid?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const tile = target.closest('.board-tile');
  if (!(tile instanceof HTMLElement)) {
    return;
  }
  const index = Number.parseInt(tile.dataset.index || '', 10);
  if (!Number.isInteger(index)) {
    return;
  }
  displayedTile = index;
  highlightTile(index);
  updateChallenge(index);
});

boardPlayers?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (!selfInfo || !isSelfActive()) {
    return;
  }
  const button = target.closest('[data-action="heart"]');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  const targetId = Number.parseInt(button.dataset.targetId || '', 10);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return;
  }
  try {
    button.disabled = true;
    const payload = await postJson('api/board_action.php', {
      room_key: roomKey,
      participant_id: Number.parseInt(participantId, 10),
      action: 'add_heart',
      target_participant_id: targetId,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się zapisać serduszka.');
    }
    applyState(payload.board_state);
  } catch (error) {
    console.error(error);
    alert(error.message || 'Nie udało się zapisać serduszka.');
  } finally {
    button.disabled = false;
  }
});

rollButton?.addEventListener('click', async () => {
  if (!selfInfo || !isSelfActive()) {
    return;
  }
  try {
    rollButton.disabled = true;
    const payload = await postJson('api/board_action.php', {
      room_key: roomKey,
      participant_id: Number.parseInt(participantId, 10),
      action: 'roll',
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się wykonać ruchu.');
    }
    displayedTile = payload.board_state?.last_roll?.new_position || null;
    applyState(payload.board_state);
  } catch (error) {
    console.error(error);
    alert(error.message || 'Nie udało się wykonać ruchu.');
  } finally {
    rollButton.disabled = false;
  }
});

boardCopyButton?.addEventListener('click', async () => {
  const url = buildInviteUrl();
  if (!url) {
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showCopyFeedback('Skopiowano link do schowka. Miłej zabawy!');
  } catch (error) {
    console.error(error);
    showCopyFeedback('Nie udało się skopiować linku. Skopiuj ręcznie: ' + url);
  }
});

boardPendingList?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest('[data-action]');
  if (!(button instanceof HTMLButtonElement) || !selfInfo?.is_host) {
    return;
  }
  const decision = button.dataset.action;
  const requestId = Number.parseInt(button.dataset.requestId || '', 10);
  if (!requestId || (decision !== 'approve' && decision !== 'reject')) {
    return;
  }
  try {
    button.disabled = true;
    await postJson('api/respond_request.php', {
      room_key: roomKey,
      participant_id: Number.parseInt(participantId, 10),
      request_id: requestId,
      decision,
    });
    await refreshState();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Nie udało się przetworzyć zgłoszenia.');
  } finally {
    button.disabled = false;
  }
});

function initializeBoard() {
  if (!boardGrid) {
    return;
  }
  boardGrid.innerHTML = '';
  const columns = 6;
  const rows = Math.ceil(BOARD_LENGTH / columns);
  let tileIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    const order = [];
    for (let col = 1; col <= columns; col += 1) {
      order.push(col);
    }
    if (row % 2 === 1) {
      order.reverse();
    }
    for (const column of order) {
      tileIndex += 1;
      if (tileIndex > BOARD_LENGTH) {
        break;
      }
      const task = BOARD_TASKS[tileIndex - 1] || { title: 'Pole', description: '' };
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'board-tile';
      tile.dataset.index = String(tileIndex);
      tile.setAttribute('role', 'listitem');
      tile.style.gridRowStart = String(row + 1);
      tile.style.gridColumnStart = String(column);
      tile.innerHTML = `
        <span class="board-tile__number">${tileIndex}</span>
        <span class="board-tile__title">${task.title}</span>
        <span class="board-tile__tokens" aria-hidden="true"></span>
      `;
      tile.title = task.description;
      boardGrid.appendChild(tile);
      tileElements.set(tileIndex, tile);
    }
  }
}

function setupShareArea() {
  if (boardRoomKey) {
    boardRoomKey.textContent = roomKey;
  }
  const inviteUrl = buildInviteUrl();
  if (boardOpenInvite && inviteUrl) {
    boardOpenInvite.href = inviteUrl;
  }
}

function buildInviteUrl() {
  const baseUrl = appendTokenToUrl('planszowa-invite.html', token);
  const url = new URL(baseUrl, window.location.href);
  url.searchParams.set('room_key', roomKey);
  if (token) {
    url.searchParams.set('token', token);
  }
  return url.toString();
}


let isPolling = true;

async function startPolling() {
  if (!isPolling) return;
  await refreshState();
  if (isPolling) {
    pollTimer = setTimeout(startPolling, 5000);
  }
}

function stopPolling() {
  isPolling = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function refreshState() {
  try {
    const payload = await getJson(
      `api/board_state.php?room_key=${encodeURIComponent(roomKey)}&participant_id=${encodeURIComponent(participantId || '')}`,
    );
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się pobrać stanu gry.');
    }
    selfInfo = payload.self || null;
    if (!selfInfo) {
      window.location.replace(appendTokenToUrl('planszowa.html', token));
      return;
    }
    if (selfInfo.status === 'pending') {
      const targetUrl = new URL(waitingPage, window.location.href);
      targetUrl.searchParams.set('room_key', roomKey);
      targetUrl.searchParams.set('pid', participantId || '');
      if (token) {
        targetUrl.searchParams.set('token', token);
      }
      window.location.replace(targetUrl.toString());
      return;
    }
    participantsCache = payload.participants || [];
    applyState(payload.board_state);
    updatePending(payload.pending_requests || []);
    if (boardContent?.hidden) {
      boardContent.hidden = false;
    }
  } catch (error) {
    console.error(error);
  }
}

function applyState(boardState) {
  if (!boardState) {
    return;
  }
  renderPlayers(boardState);
  renderBoard(boardState);
  renderHistory(boardState);
}

function renderPlayers(boardState) {
  if (!boardPlayers) {
    return;
  }
  boardPlayers.innerHTML = '';
  if (!participantsCache.length) {
    boardEmpty?.removeAttribute('hidden');
    return;
  }
  if (boardEmpty) {
    boardEmpty.hidden = participantsCache.length >= 2 ? true : false;
  }

  const paletteMap = new Map();
  participantsCache.forEach((participant, index) => {
    paletteMap.set(participant.id, tokenPalette[index % tokenPalette.length]);
  });

  participantsCache.forEach((participant) => {
    const li = document.createElement('li');
    li.className = 'board-player';
    li.dataset.participantId = String(participant.id);
    if (boardState.current_turn && boardState.current_turn === participant.id) {
      li.classList.add('board-player--turn');
    }

    const points = Number.parseInt(boardState.hearts?.[participant.id] ?? 0, 10) || 0;
    const position = Number.parseInt(boardState.positions?.[participant.id] ?? 1, 10) || 1;
    const colorClass = paletteMap.get(participant.id) || tokenPalette[0];

    li.innerHTML = `
      <div class="board-player__header">
        <span class="board-player__token ${colorClass}" aria-hidden="true"></span>
        <div class="board-player__meta">
          <span class="board-player__name">${participant.display_name}</span>
          <span class="board-player__position">Pole ${position}</span>
        </div>
        <span class="board-player__points" aria-label="Serduszka">❤️ ${points}</span>
      </div>
      <div class="board-player__actions">
        <button type="button" class="btn btn--ghost board-player__heart" data-action="heart" data-target-id="${participant.id}">
          ❤️ Dodaj serduszko
        </button>
      </div>
    `;

    if (!isSelfActive()) {
      const heartButton = li.querySelector('.board-player__heart');
      if (heartButton instanceof HTMLButtonElement) {
        heartButton.disabled = true;
      }
    }

    boardPlayers.appendChild(li);
  });
}

function renderBoard(boardState) {
  if (!boardGrid) {
    return;
  }
  highlightTile(determineTile(boardState));
  updateChallenge(determineTile(boardState));
  updateTurn(boardState);
  updateTokens(boardState);
}

function determineTile(boardState) {
  if (displayedTile) {
    return displayedTile;
  }
  const lastRollTile = Number.parseInt(boardState.last_roll?.new_position ?? 0, 10);
  if (lastRollTile) {
    return lastRollTile;
  }
  if (participantsCache.length) {
    const firstParticipant = participantsCache[0];
    const current = Number.parseInt(boardState.positions?.[firstParticipant.id] ?? 1, 10);
    return current || 1;
  }
  return 1;
}

function updateTokens(boardState) {
  tileElements.forEach((tile) => {
    const holder = tile.querySelector('.board-tile__tokens');
    if (holder) {
      holder.innerHTML = '';
    }
  });
  if (!participantsCache.length) {
    return;
  }
  const paletteMap = new Map();
  participantsCache.forEach((participant, index) => {
    paletteMap.set(participant.id, tokenPalette[index % tokenPalette.length]);
  });

  participantsCache.forEach((participant) => {
    const position = Number.parseInt(boardState.positions?.[participant.id] ?? 1, 10) || 1;
    const tile = tileElements.get(position);
    if (!tile) {
      return;
    }
    const holder = tile.querySelector('.board-tile__tokens');
    if (!holder) {
      return;
    }
    const token = document.createElement('span');
    token.className = `board-token ${paletteMap.get(participant.id) || tokenPalette[0]}`;
    token.title = `Pionek gracza ${participant.display_name}`;
    holder.appendChild(token);
  });
}

function updateTurn(boardState) {
  if (boardTurn) {
    if (!participantsCache.length) {
      boardTurn.textContent = 'Oczekiwanie na graczy...';
    } else if (boardState.current_turn) {
      const active = participantsCache.find((participant) => participant.id === boardState.current_turn);
      if (active) {
        boardTurn.textContent = `Tura: ${active.display_name}`;
      } else {
        boardTurn.textContent = 'Trwa ustalanie kolejności tur...';
      }
    } else {
      boardTurn.textContent = 'Trwa ustalanie kolejności tur...';
    }
  }

  if (boardLastRoll) {
    const lastRoll = boardState.last_roll;
    if (lastRoll && lastRoll.value) {
      const player = participantsCache.find((participant) => participant.id === lastRoll.rolled_by);
      const name = player ? player.display_name : 'Gracz';
      boardLastRoll.hidden = false;
      boardLastRoll.textContent = `${name} wyrzucił(a) ${lastRoll.value} i przesunął(a) pionek na pole ${lastRoll.new_position}.`;
    } else {
      boardLastRoll.hidden = true;
      boardLastRoll.textContent = '';
    }
  }

  if (rollButton) {
    const isTurn = Boolean(boardState.current_turn && selfInfo && boardState.current_turn === selfInfo.id);
    rollButton.disabled = !(isTurn && isSelfActive());
  }
}

function highlightTile(tileIndex) {
  tileElements.forEach((tile, index) => {
    if (index === tileIndex) {
      tile.classList.add('board-tile--active');
    } else {
      tile.classList.remove('board-tile--active');
    }
  });
}

function updateChallenge(tileIndex) {
  const task = BOARD_TASKS[tileIndex - 1];
  if (!task) {
    return;
  }
  if (challengeTitle) {
    challengeTitle.textContent = task.title;
  }
  if (challengeDescription) {
    challengeDescription.textContent = task.description;
  }
}

function renderHistory(boardState) {
  if (!boardHistory) {
    return;
  }
  boardHistory.innerHTML = '';
  const history = Array.isArray(boardState.history) ? boardState.history : [];
  history.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'board-history__item';
    item.textContent = entry.message || '';
    if (entry.timestamp) {
      const time = document.createElement('time');
      time.dateTime = entry.timestamp;
      try {
        const date = new Date(entry.timestamp);
        time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (_error) {
        time.textContent = entry.timestamp;
      }
      item.appendChild(time);
    }
    boardHistory.appendChild(item);
  });
}

function updatePending(pendingRequests) {
  if (!boardPending || !boardPendingList) {
    return;
  }
  if (!selfInfo?.is_host) {
    boardPending.hidden = true;
    return;
  }
  const requests = Array.isArray(pendingRequests) ? pendingRequests : [];
  boardPending.hidden = requests.length === 0;
  boardPendingList.innerHTML = '';
  if (requests.length === 0) {
    if (boardPendingEmpty) {
      boardPendingEmpty.hidden = false;
    }
    return;
  }
  if (boardPendingEmpty) {
    boardPendingEmpty.hidden = true;
  }
  requests.forEach((request) => {
    const item = document.createElement('li');
    item.className = 'board-pending__item';
    item.innerHTML = `
      <span class="board-pending__name">${request.display_name}</span>
      <div class="board-pending__actions">
        <button type="button" class="btn btn--primary" data-action="approve" data-request-id="${request.id}">Akceptuj</button>
        <button type="button" class="btn btn--ghost" data-action="reject" data-request-id="${request.id}">Odrzuć</button>
      </div>
    `;
    boardPendingList.appendChild(item);
  });
}

function isSelfActive() {
  return Boolean(selfInfo && (selfInfo.is_host || selfInfo.status === 'active'));
}

function startPresencePing() {
  sendPresence();
  presenceTimer = window.setInterval(sendPresence, 20000);
}

async function sendPresence() {
  if (!selfInfo || !isSelfActive()) {
    return;
  }
  try {
    await postJson('api/presence.php', {
      room_key: roomKey,
      participant_id: Number.parseInt(participantId || '0', 10),
    });
  } catch (error) {
    console.error(error);
  }
}

function showCopyFeedback(message) {
  if (!boardCopyFeedback) {
    return;
  }
  boardCopyFeedback.textContent = message;
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer);
  }
  copyFeedbackTimer = window.setTimeout(() => {
    boardCopyFeedback.textContent = '';
  }, 4000);
}

window.addEventListener('beforeunload', () => {
  stopPolling();
  if (presenceTimer) {
    clearInterval(presenceTimer);
  }
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer);
  }
});
