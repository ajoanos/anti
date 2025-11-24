import { postJson, getJson } from './app.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const localPlayerId = params.get('pid') || '';

if (!roomKey || !localPlayerId) {
  window.location.replace('trio-challenge.html');
}

const EMAIL_ENDPOINT = 'api/send_positions_email.php';
const SHARE_EMAIL_SUBJECT = 'Kółko i krzyżyk Wyzwanie – dołącz do mnie';

const elements = {
  roundLabel: document.getElementById('trio-round-label'),
  playersList: document.getElementById('trio-players'),
  waitingHint: document.getElementById('trio-waiting'),
  turnLabel: document.getElementById('trio-turn'),
  board: document.getElementById('trio-board'),
  boardTitle: document.getElementById('trio-board-title'),
  boardSubtitle: document.getElementById('trio-board-subtitle'),
  boardToggle: document.getElementById('trio-board-toggle'),
  moveHint: document.getElementById('trio-move-hint'),
  resultSection: document.getElementById('trio-result'),
  resultTitle: document.getElementById('trio-result-title'),
  resultText: document.getElementById('trio-result-text'),
  challengesList: document.getElementById('trio-challenges'),
  resetButton: document.getElementById('trio-reset'),
  modeCard: document.getElementById('trio-mode-card'),
  modeLabel: document.getElementById('trio-mode-label'),
  modeHint: document.getElementById('trio-mode-hint'),
  modeActions: document.getElementById('trio-mode-actions'),
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

const BOARD_SIZES = [3, 4];
const DEFAULT_BOARD_SIZE = 4;
const winningCombosCache = new Map();
const SOFT_TASKS = [
  'Zrób partnerowi/partnerce 30-sekundowy masaż karku.',
  'Powiedz partnerowi/partnerce 3 rzeczy, które w nim/niej uwielbiasz.',
  'Przytul partnera/partnerkę przez pełne 20 sekund.',
  'Pocałuj partnera/partnerkę w szyję.',
  'Usiądź na kolanach partnera/partnerki przez 30 sekund.',
  'Zrób partnerowi/partnerce delikatny masaż dłoni.',
  'Szepnij partnerowi/partnerce coś miłego do ucha.',
  'Pocałuj partnera/partnerkę w usta tak, jak chcesz.',
  'Połóż dłoń na miejscu ciała partnera/partnerki, które on/ona wybierze.',
  'Powiedz jedną fantazję, którą chciał(a)byś kiedyś spróbować.',
  'Pogłaszcz partnera/partnerkę po plecach przez 20 sekund.',
  'Powiedz partnerowi/partnerce, co najbardziej Cię w nim/niej pociąga.',
  'Daj partnerowi/partnerce „pocałunek w ciemno” — gdziekolwiek wybierze.',
  'Patrzcie sobie w oczy przez 15 sekund bez słów.',
  'Zrób partnerowi/partnerce masaż głowy.',
  'Zadaj partnerowi/partnerce jedno pytanie, które zawsze bałeś/aś się zadać.',
  'Przytul partnera/partnerkę od tyłu przez 15 sekund.',
  'Powiedz partnerowi/partnerce, co najbardziej lubisz w jego/jej dotyku.',
  'Pocałuj dłoń partnera/partnerki.',
  'Ułóżcie dłonie na sobie i nie odrywajcie ich przez 20 sekund.',
];

const EXTREME_TASKS = [
  'Szepcz erotyczną historię do ucha partnera/partnerki przez 15 sekund.',
  'Przyciśnij ciało do partnera/partnerki i poruszaj biodrami rytmicznie przez 30 sekund.',
  'Delikatnie masuj sutki partnera/partnerki palcami przez 20 sekund.',
  'Namiętnie całuj szyję partnera/partnerki, ssąc lekko przez 30 sekund.',
  'Prowadź językiem po dekolcie partnera/partnerki, schodząc niżej przez 15 sekund.',
  'Wsuń dłoń pod koszulkę i pieść sutek partnera/partnerki okrężnymi ruchami.',
  'Całuj dekolt partnera/partnerki, schodząc niżej z każdym pocałunkiem przez 25 sekund.',
  'Całuj wewnętrzne uda partnera/partnerki, zbliżając się do intymnych miejsc.',
  'Ssij delikatnie palec partnera/partnerki, patrząc mu w oczy przez 20 sekund.',
  'Masuj pośladki partnera/partnerki z czułością przez 25 sekund.',
  'Pocieraj krocze partnera/partnerki dłonią przez materiał 15 sekund.',
  'Gryź lekko dolną wargę partnera/partnerki, ciągnąc ją zębami z namiętnością.',
  'Liż ucha partnera, szepcząc mu miłosne słowa przez 20 sekund.',
  'Włóż rękę do bielizny i delikatnie dotykaj najczulszych miejsc partnera/partnerki.',
  'Masuj jądra lub łechtaczkę partnera/partnerki powoli i kusząco przez 20 sekund.',
  'Rozsuń nogi partnera/partnerki i całuj wewnętrzną stronę ud przez 25 sekund.',
  'Prowadź palcem po kręgosłupie partnera/partnerki w dół, aż do pośladków przez 20 sekund.',
  'Namiętnie całuj usta partnera/partnerki, wsuwając język przez 20 sekund.',
  'Delikatnie szczyp sutki partnera/partnerki, zwiększając intensywność stopniowo.',
  'Liż okolice pępka partnera, schodząc coraz niżej przez 15 sekund.',
  'Masuj krocze partnera/partnerki przez spodnie, budując napięcie powolnymi ruchami.',
  'Wsuń palec do ust partnera/partnerki i pozwól mu/jej ssać go z pasją.',
  'Klep lekko pośladki partnera/partnerki, mieszając z masażem przez 20 sekund.',
  'Całuj krocze partnera/partnerki przez bieliznę przez 20 sekund.',
  'Pieść ramiona partnera/partnerki, schodząc dłońmi do piersi lub pośladków.',
  'Liż szyję partnera/partnerki od ucha do obojczyka.',
  'Delikatnie pociągnij za włosy partnera podczas namiętnego pocałunku.',
  'Masuj całe ciało partnera skupiając się na intymnych strefach przez 30 sekund.',
];

const shareLinkUrl = buildShareUrl();

let currentParticipants = [];
let gameState = null;
let pollHandle = null;
let lastSnapshotSignature = '';
let shareSheetController = null;
let shareFeedbackTimer = null;
let isCurrentUserHost = false;
let selfInfo = null;
let renderedBoardSize = null;
let lastResultSignature = '';

renderBoardSkeleton(DEFAULT_BOARD_SIZE);
bindEvents();

shareSheetController = initializeShareSheet(shareElements);
initializeShareChannels();
initializeShareEmailForm();
updateShareVisibility();

init();

async function init() {
  await loadInitialState();
  startRealtimeBridge();
}

async function loadInitialState() {
  const snapshot = await requestBoardSnapshot();
  if (snapshot) {
    applySnapshot(snapshot);
  }
}

function applySnapshot(snapshot) {
  const participants = normalizeParticipants(snapshot.participants);
  currentParticipants = participants;
  isCurrentUserHost = Boolean(snapshot.self?.is_host);
  selfInfo = snapshot.self || null;
  const state = snapshot.state && typeof snapshot.state === 'object' ? snapshot.state : {};
  ensureTrioState(state);
  gameState = state;

  ensureAssignments();
  render();

  lastSnapshotSignature = JSON.stringify({
    state: gameState,
    participants: currentParticipants.map((p) => p.id),
  });
}

function ensureTrioState(state) {
  if (!state.trioChallenge || typeof state.trioChallenge !== 'object') {
    state.trioChallenge = defaultTrioState();
    return;
  }
  const trio = state.trioChallenge;
  const roundNumber = Number.isInteger(trio.round) && trio.round > 0 ? trio.round : 1;
  trio.round = roundNumber;
  const boardSize = sanitizeBoardSize(trio.boardSize);
  trio.boardSize = boardSize;
  const expectedCells = getBoardCellCount(boardSize);
  if (!Array.isArray(trio.board)) {
    trio.board = createEmptyBoard(boardSize);
  } else if (trio.board.length !== expectedCells) {
    trio.board = Array.from({ length: expectedCells }, (_, index) => String(trio.board[index] || ''));
  }
  trio.board = trio.board.map((value) => (value === 'X' || value === 'O' ? value : ''));
  const boardHasMoves = trio.board.some((value) => Boolean(value));
  if (!boardHasMoves) {
    trio.currentSymbol = startingSymbolForRound(roundNumber);
  } else {
    trio.currentSymbol = trio.currentSymbol === 'O' ? 'O' : 'X';
  }
  if (!trio.assignments || typeof trio.assignments !== 'object') {
    trio.assignments = { x: '', o: '' };
  } else {
    trio.assignments.x = validParticipantId(trio.assignments.x);
    trio.assignments.o = validParticipantId(trio.assignments.o);
  }
  trio.winningLine = Array.isArray(trio.winningLine)
    ? trio.winningLine
        .map((value) => clampIndex(value, boardSize))
        .filter((value) => value >= 0 && value < expectedCells)
    : [];
  trio.challenge = normalizeChallenge(trio.challenge);
  trio.drawChallenges = Array.isArray(trio.drawChallenges)
    ? trio.drawChallenges.map((text) => String(text || '')).filter(Boolean).slice(0, 2)
    : [];
  trio.mode = trio.mode === 'extreme' ? 'extreme' : 'soft';
  trio.lastMoveBy = validParticipantId(trio.lastMoveBy);
  trio.updatedAt = String(trio.updatedAt || '');
}

function defaultTrioState() {
  return {
    board: createEmptyBoard(DEFAULT_BOARD_SIZE),
    currentSymbol: 'X',
    assignments: { x: '', o: '' },
    winner: null,
    winningLine: [],
    challenge: null,
    drawChallenges: [],
    mode: 'soft',
    round: 1,
    lastMoveBy: '',
    updatedAt: '',
    boardSize: DEFAULT_BOARD_SIZE,
  };
}

function normalizeChallenge(challenge) {
  if (!challenge || typeof challenge !== 'object') {
    return null;
  }
  const type = challenge.type === 'draw' ? 'draw' : 'single';
  const assignedSymbol = challenge.assignedSymbol === 'O' ? 'O' : 'X';
  const tasks = Array.isArray(challenge.tasks)
    ? challenge.tasks.map((text) => String(text || '')).filter(Boolean)
    : [];
  if (!tasks.length) {
    return null;
  }
  return {
    type,
    assignedSymbol,
    tasks: tasks.slice(0, type === 'draw' ? 2 : 1),
  };
}

function render() {
  renderPlayers();
  renderBoard();
  renderMode();
  renderResult();
  updateShareVisibility();
}

function renderPlayers() {
  if (!elements.playersList) {
    return;
  }
  const trio = getTrioState();
  const roundNumber = Math.max(1, Number(trio.round) || 1);
  if (elements.roundLabel) {
    elements.roundLabel.textContent = String(roundNumber);
  }
  const assignments = trio.assignments || { x: '', o: '' };
  const items = [
    { symbol: 'X', label: 'Gracz X', playerId: assignments.x },
    { symbol: 'O', label: 'Gracz O', playerId: assignments.o },
  ];

  elements.playersList.innerHTML = '';
  items.forEach((slot) => {
    const li = document.createElement('li');
    li.className = 'trio-player';
    const player = currentParticipants.find((entry) => entry.id === slot.playerId);
    const name = player ? player.name : 'Oczekiwanie na gracza';
    li.innerHTML = `
      <div class="trio-player__symbol" data-symbol="${slot.symbol}">${slot.symbol}</div>
      <div>
        <p class="trio-player__label">${slot.label}</p>
        <p class="trio-player__name">${name}</p>
      </div>
    `;
    elements.playersList.appendChild(li);
  });

  const activeCount = currentParticipants.length;
  if (elements.waitingHint) {
    if (activeCount >= 2) {
      elements.waitingHint.hidden = true;
    } else {
      elements.waitingHint.hidden = false;
      elements.waitingHint.textContent = 'Użyj przycisku „Udostępnij pokój”, aby wysłać zaproszenie.';
    }
  }
  const boardHasMoves = Array.isArray(trio.board) && trio.board.some((value) => Boolean(value));
  if (elements.turnLabel) {
    if (trio.winner) {
      if (trio.winner === 'draw') {
        elements.turnLabel.textContent = 'Remis! Wylosujcie zadania.';
      } else {
        const winnerName = symbolName(trio.winner);
        elements.turnLabel.textContent = winnerName ? `${winnerName} wygrał(a)!` : 'Gra zakończona.';
      }
    } else if (activeCount < 2) {
      elements.turnLabel.textContent = 'Czekamy na graczy…';
    } else if (!boardHasMoves) {
      const starter = symbolName(trio.currentSymbol) || (trio.currentSymbol === 'X' ? 'Gospodarz' : 'Drugi gracz');
      elements.turnLabel.textContent = `${starter} rozpoczyna tę rundę (${trio.currentSymbol}).`;
    } else {
      const symbolOwner = symbolName(trio.currentSymbol);
      elements.turnLabel.textContent = symbolOwner
        ? `Teraz ruch: ${symbolOwner} (${trio.currentSymbol})`
        : 'Kto zaczyna?';
    }
  }
}

function renderBoard() {
  if (!elements.board) {
    return;
  }
  const trio = getTrioState();
  const boardSize = getBoardSize();
  renderBoardSkeleton(boardSize);
  const boardHasMoves = Array.isArray(trio.board) && trio.board.some((value) => Boolean(value));
  const boardElement = elements.board;
  const boardGoalText = boardSize === 4 ? 'cztery symbole w linii' : 'trzy symbole w linii';
  boardElement.dataset.size = String(boardSize);
  boardElement.setAttribute('aria-label', `Plansza ${boardSize}×${boardSize}. Aby wygrać, ułóż ${boardGoalText}.`);
  if (elements.boardTitle) {
    elements.boardTitle.textContent = `Plansza ${boardSize}×${boardSize}`;
  }
  if (elements.boardSubtitle) {
    elements.boardSubtitle.textContent = `Kliknij pole, aby postawić swój symbol. W tej wersji musisz ułożyć ${boardGoalText}.`;
  }
  const cells = boardElement.querySelectorAll('[data-index]');
  cells.forEach((cell) => {
    const index = Number(cell.dataset.index);
    const value = trio.board[index] || '';
    const symbol = cell.querySelector('.trio-cell__symbol');
    if (symbol) {
      symbol.textContent = value;
    }
    cell.setAttribute('aria-label', value ? `Pole z symbolem ${value}` : 'Puste pole planszy');
    cell.dataset.filled = value ? 'true' : 'false';
    cell.classList.toggle('trio-cell--x', value === 'X');
    cell.classList.toggle('trio-cell--o', value === 'O');
    cell.classList.toggle('trio-cell--winner', Array.isArray(trio.winningLine) && trio.winningLine.includes(index));
  });

  const canMove = canCurrentUserMove();
  const starterName = symbolName(trio.currentSymbol) || (trio.currentSymbol === 'X' ? 'Gospodarz' : 'Drugi gracz');
  if (elements.moveHint) {
    if (trio.winner) {
      elements.moveHint.textContent = 'Kliknij „Zacznij nową grę”, żeby rozpocząć kolejną rundę.';
    } else if (currentParticipants.length < 2) {
      elements.moveHint.textContent = 'Poczekaj, aż partner dołączy do pokoju.';
    } else if (!boardHasMoves) {
      if (canMove) {
        elements.moveHint.textContent = 'Rozpocznij rundę i wybierz dowolne wolne pole.';
      } else {
        elements.moveHint.textContent = `${starterName} rozpoczyna tę rundę. Zaczekaj na pierwszy ruch.`;
      }
    } else if (canMove) {
      elements.moveHint.textContent = 'Wybierz dowolne wolne pole i postaw swój symbol.';
    } else {
      const owner = symbolName(trio.currentSymbol);
      elements.moveHint.textContent = owner ? `Ruch: ${owner}.` : 'Czekamy na kolejny ruch.';
    }
  }

  const boardLocked = boardHasMoves && !trio.winner;
  updateBoardToggle(boardSize, boardLocked);

  if (elements.resetButton) {
    elements.resetButton.disabled = !trio.winner;
  }
}

function renderMode() {
  if (!elements.modeCard) {
    return;
  }
  const trio = getTrioState();
  if (isCurrentUserHost) {
    elements.modeCard.hidden = false;
    if (elements.modeActions) {
      elements.modeActions.hidden = false;
    }
    if (elements.modeLabel) {
      elements.modeLabel.textContent = trio.mode === 'extreme' ? 'Wybrano: Extreme 😈' : 'Wybrano: Soft 😌';
    }
    if (elements.modeHint) {
      elements.modeHint.textContent = 'Możesz zmienić tryb do czasu pierwszego ruchu w rundzie.';
    }
    elements.modeActions?.querySelectorAll('button').forEach((button) => {
      const { mode } = button.dataset;
      const isActive = mode === trio.mode;
      button.classList.toggle('btn--primary', isActive);
      button.classList.toggle('btn--ghost', !isActive);
      button.disabled = Boolean(trio.winner) ? false : Boolean(trio.board.some((value) => value));
    });
  } else {
    elements.modeCard.hidden = false;
    if (elements.modeLabel) {
      elements.modeLabel.textContent = 'Tryb ukryty';
    }
    if (elements.modeHint) {
      elements.modeHint.textContent = 'Gospodarz wybrał tryb. Poznasz go po zakończeniu rundy.';
    }
    if (elements.modeActions) {
      elements.modeActions.hidden = true;
    }
  }
}

function renderResult() {
  if (!elements.resultSection || !gameState) {
    return;
  }
  const trio = getTrioState();
  if (!trio.winner) {
    elements.resultSection.hidden = true;
    elements.challengesList.innerHTML = '';
    lastResultSignature = '';
    return;
  }
  elements.resultSection.hidden = false;
  const winnerName = symbolName(trio.winner);
  if (trio.winner === 'draw') {
    elements.resultTitle.textContent = 'Remis!';
    elements.resultText.textContent = 'Plansza jest pełna. Wykonajcie po jednym zadaniu.';
    renderChallenges(trio.drawChallenges || []);
  } else {
    elements.resultTitle.textContent = winnerName ? `${winnerName} wygrał(a)!` : 'Wygrana';
    const loserSymbol = trio.winner === 'X' ? 'O' : 'X';
    const loserName = symbolName(loserSymbol);
    elements.resultText.textContent = loserName
      ? `${loserName} losuje mini-wyzwanie.`
      : 'Przegrany losuje mini-wyzwanie.';
    const tasks = trio.challenge?.tasks || [];
    renderChallenges(tasks);
  }
  const signature = `${trio.round}-${trio.winner}`;
  if (signature && signature !== lastResultSignature) {
    scrollToResult();
  }
  lastResultSignature = signature;
}

function renderChallenges(tasks) {
  if (!elements.challengesList) {
    return;
  }
  elements.challengesList.innerHTML = '';
  tasks.forEach((task) => {
    const item = document.createElement('li');
    item.textContent = task;
    elements.challengesList.appendChild(item);
  });
}

function renderBoardSkeleton(size = DEFAULT_BOARD_SIZE) {
  if (!elements.board) {
    return;
  }
  const sanitizedSize = sanitizeBoardSize(size);
  const totalCells = getBoardCellCount(sanitizedSize);
  const currentCells = elements.board.querySelectorAll('[data-index]').length;
  elements.board.dataset.size = String(sanitizedSize);
  if (renderedBoardSize === sanitizedSize && currentCells === totalCells) {
    return;
  }
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < totalCells; index += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'trio-cell';
    button.dataset.index = String(index);
    button.setAttribute('aria-label', 'Puste pole planszy');
    button.innerHTML = '<span class="trio-cell__symbol" aria-hidden="true"></span>';
    fragment.appendChild(button);
  }
  elements.board.innerHTML = '';
  elements.board.appendChild(fragment);
  renderedBoardSize = sanitizedSize;
}

function bindEvents() {
  elements.board?.addEventListener('click', handleCellClick);
  elements.resetButton?.addEventListener('click', handleReset);
  elements.modeActions?.addEventListener('click', handleModeChange);
  elements.boardToggle?.addEventListener('click', handleBoardSizeChange);
  shareElements.copyButton?.addEventListener('click', copyShareLink);
  shareElements.qrButton?.addEventListener('click', openQrModal);
  shareElements.modalClose?.addEventListener('click', closeQrModal);
}

function handleCellClick(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest('.trio-cell') : null;
  if (!target) {
    return;
  }
  const index = Number(target.dataset.index);
  if (!Number.isInteger(index)) {
    return;
  }
  if (!canCurrentUserMove()) {
    return;
  }
  const trio = getTrioState();
  if (trio.board[index]) {
    return;
  }
  const nextState = cloneState(gameState);
  const nextTrio = nextState.trioChallenge;
  nextTrio.board[index] = nextTrio.currentSymbol;
  nextTrio.lastMoveBy = localPlayerId;
  nextTrio.updatedAt = new Date().toISOString();
  const boardSize = sanitizeBoardSize(nextTrio.boardSize);
  const victory = detectVictory(nextTrio.board, nextTrio.currentSymbol, boardSize);
  if (victory) {
    nextTrio.winner = nextTrio.currentSymbol;
    nextTrio.winningLine = victory;
    nextTrio.challenge = {
      type: 'single',
      assignedSymbol: nextTrio.currentSymbol === 'X' ? 'O' : 'X',
      tasks: [drawTask(nextTrio.mode)],
    };
    nextTrio.drawChallenges = [];
  } else if (nextTrio.board.every(Boolean)) {
    nextTrio.winner = 'draw';
    nextTrio.winningLine = [];
    nextTrio.challenge = null;
    nextTrio.drawChallenges = [drawTask(nextTrio.mode), drawTask(nextTrio.mode, true)];
  } else {
    nextTrio.currentSymbol = nextTrio.currentSymbol === 'X' ? 'O' : 'X';
  }
  persistState(nextState);
  applySnapshot({ state: nextState, participants: currentParticipants, self: { is_host: isCurrentUserHost } });
}

function handleReset() {
  if (!gameState) {
    return;
  }
  const nextState = cloneState(gameState);
  const nextTrio = nextState.trioChallenge;
  const boardSize = sanitizeBoardSize(nextTrio.boardSize);
  nextTrio.board = createEmptyBoard(boardSize);
  nextTrio.winner = null;
  nextTrio.winningLine = [];
  nextTrio.challenge = null;
  nextTrio.drawChallenges = [];
  nextTrio.round += 1;
  nextTrio.currentSymbol = startingSymbolForRound(nextTrio.round);
  nextTrio.lastMoveBy = '';
  nextTrio.updatedAt = new Date().toISOString();
  persistState(nextState);
  applySnapshot({ state: nextState, participants: currentParticipants, self: { is_host: isCurrentUserHost } });
}

function handleModeChange(event) {
  if (!isCurrentUserHost) {
    return;
  }
  const button = event.target instanceof HTMLElement ? event.target.closest('button[data-mode]') : null;
  if (!button) {
    return;
  }
  const mode = button.dataset.mode === 'extreme' ? 'extreme' : 'soft';
  const trio = getTrioState();
  if (trio.mode === mode) {
    return;
  }
  if (trio.board.some((value) => value)) {
    return;
  }
  const nextState = cloneState(gameState);
  nextState.trioChallenge.mode = mode;
  persistState(nextState);
  applySnapshot({ state: nextState, participants: currentParticipants, self: { is_host: isCurrentUserHost } });
}

function handleBoardSizeChange(event) {
  const button = event.target instanceof HTMLElement ? event.target.closest('button[data-size]') : null;
  if (!button || button.disabled) {
    return;
  }
  if (!gameState) {
    return;
  }
  const requestedSize = Number(button.dataset.size);
  if (!BOARD_SIZES.includes(requestedSize)) {
    return;
  }
  const trio = getTrioState();
  const boardLocked = Array.isArray(trio.board) && trio.board.some((value) => Boolean(value)) && !trio.winner;
  if (boardLocked) {
    return;
  }
  if (sanitizeBoardSize(trio.boardSize) === requestedSize) {
    return;
  }
  const nextState = cloneState(gameState);
  const nextTrio = nextState.trioChallenge;
  nextTrio.boardSize = requestedSize;
  nextTrio.board = createEmptyBoard(requestedSize);
  nextTrio.winner = null;
  nextTrio.winningLine = [];
  nextTrio.challenge = null;
  nextTrio.drawChallenges = [];
  nextTrio.round = 1;
  nextTrio.currentSymbol = startingSymbolForRound(nextTrio.round);
  nextTrio.lastMoveBy = '';
  nextTrio.updatedAt = new Date().toISOString();
  persistState(nextState);
  applySnapshot({ state: nextState, participants: currentParticipants, self: { is_host: isCurrentUserHost } });
}

function canCurrentUserMove() {
  const trio = getTrioState();
  if (!trio || trio.winner) {
    return false;
  }
  if (currentParticipants.length < 2) {
    return false;
  }
  const assignments = trio.assignments || {};
  const mySymbol = assignments.x === localPlayerId ? 'X' : assignments.o === localPlayerId ? 'O' : '';
  if (!mySymbol) {
    return false;
  }
  return mySymbol === trio.currentSymbol;
}

function detectVictory(board, symbol, size) {
  const combos = getWinningCombos(size);
  for (const combo of combos) {
    if (combo.every((index) => board[index] === symbol)) {
      return combo;
    }
  }
  return null;
}

function getWinningCombos(size) {
  const sanitizedSize = sanitizeBoardSize(size);
  const winLength = getWinLength(sanitizedSize);
  const cacheKey = `${sanitizedSize}-${winLength}`;
  if (!winningCombosCache.has(cacheKey)) {
    winningCombosCache.set(cacheKey, buildWinningCombos(sanitizedSize, winLength));
  }
  return winningCombosCache.get(cacheKey) || [];
}

function buildWinningCombos(size, winLength) {
  const combos = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col <= size - winLength; col += 1) {
      const line = [];
      for (let offset = 0; offset < winLength; offset += 1) {
        line.push(indexFromCoords(row, col + offset, size));
      }
      combos.push(line);
    }
  }
  for (let col = 0; col < size; col += 1) {
    for (let row = 0; row <= size - winLength; row += 1) {
      const line = [];
      for (let offset = 0; offset < winLength; offset += 1) {
        line.push(indexFromCoords(row + offset, col, size));
      }
      combos.push(line);
    }
  }
  for (let row = 0; row <= size - winLength; row += 1) {
    for (let col = 0; col <= size - winLength; col += 1) {
      const diagonal = [];
      const reverseDiagonal = [];
      for (let offset = 0; offset < winLength; offset += 1) {
        diagonal.push(indexFromCoords(row + offset, col + offset, size));
        reverseDiagonal.push(indexFromCoords(row + offset, col + winLength - 1 - offset, size));
      }
      combos.push(diagonal, reverseDiagonal);
    }
  }
  return combos;
}

function indexFromCoords(row, col, size) {
  return row * size + col;
}

function drawTask(mode, allowDuplicate = false) {
  const pool = mode === 'extreme' ? EXTREME_TASKS : SOFT_TASKS;
  if (!pool.length) {
    return 'Wykonaj czułe zadanie dla partnera.';
  }
  const available = allowDuplicate ? pool : pool.filter(Boolean);
  const pick = Math.floor(Math.random() * available.length);
  return available[pick];
}

function getBoardSize() {
  const trio = getTrioState();
  return sanitizeBoardSize(trio.boardSize);
}

function getWinLength(size) {
  return size === 4 ? 4 : 3;
}

function sanitizeBoardSize(value) {
  const numeric = Number(value);
  return BOARD_SIZES.includes(numeric) ? numeric : DEFAULT_BOARD_SIZE;
}

function getBoardCellCount(size) {
  const sanitizedSize = sanitizeBoardSize(size);
  return sanitizedSize * sanitizedSize;
}

function createEmptyBoard(size) {
  const sanitizedSize = sanitizeBoardSize(size);
  return Array.from({ length: getBoardCellCount(sanitizedSize) }, () => '');
}

function startingSymbolForRound(roundNumber) {
  return roundNumber % 2 === 1 ? 'X' : 'O';
}

function updateBoardToggle(size, isLocked) {
  if (!elements.boardToggle) {
    return;
  }
  const buttons = elements.boardToggle.querySelectorAll('button[data-size]');
  buttons.forEach((button) => {
    const buttonSize = Number(button.dataset.size);
    const isActive = buttonSize === size;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (isLocked) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.title = 'Zmień rozmiar planszy po zakończeniu rundy.';
    } else {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
      button.removeAttribute('title');
    }
  });
}

function scrollToResult() {
  if (!elements.resultSection) {
    return;
  }
  window.requestAnimationFrame(() => {
    elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function symbolName(symbol) {
  const trio = getTrioState();
  const assignments = trio.assignments || {};
  if (symbol === 'X' && assignments.x) {
    return participantName(assignments.x);
  }
  if (symbol === 'O' && assignments.o) {
    return participantName(assignments.o);
  }
  return '';
}

function participantName(id) {
  const participant = currentParticipants.find((entry) => entry.id === id);
  return participant ? participant.name : '';
}

function ensureAssignments() {
  if (!gameState) {
    return;
  }
  const trio = getTrioState();
  const assignments = trio.assignments || { x: '', o: '' };
  let changed = false;
  if (isCurrentUserHost && localPlayerId && !assignments.x) {
    assignments.x = localPlayerId;
    changed = true;
  }
  if (!assignments.o) {
    const candidate = currentParticipants.find((entry) => entry.id !== assignments.x);
    if (candidate) {
      assignments.o = candidate.id;
      changed = true;
    }
  } else {
    const stillActive = currentParticipants.some((entry) => entry.id === assignments.o);
    if (!stillActive) {
      assignments.o = '';
      changed = true;
    }
  }
  trio.assignments = assignments;
  if (changed) {
    persistState(gameState);
  }
}

function getTrioState() {
  if (!gameState) {
    gameState = { trioChallenge: defaultTrioState() };
  }
  if (!gameState.trioChallenge) {
    gameState.trioChallenge = defaultTrioState();
  }
  return gameState.trioChallenge;
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state || {}));
}

function persistState(state) {
  if (!roomKey || !localPlayerId) {
    return;
  }
  postJson('api/board_sync.php', {
    room_key: roomKey,
    participant_id: localPlayerId,
    state,
  }).catch((error) => {
    console.error('Nie udało się zapisać stanu Kółko i krzyżyk Wyzwanie.', error);
  });
}

function requestBoardSnapshot() {
  if (!roomKey || !localPlayerId) {
    return null;
  }
  const query = new URLSearchParams({
    room_key: roomKey,
    participant_id: localPlayerId,
  });
  return getJson(`api/board_state.php?${query.toString()}`)
    .then((payload) => {
      if (!payload || !payload.ok) {
        return null;
      }
      return {
        state: payload.board_state || {},
        participants: payload.participants || [],
        self: payload.self || null,
      };
    })
    .catch((error) => {
      console.error('Nie udało się pobrać stanu Kółko i krzyżyk Wyzwanie.', error);
      return null;
    });
}

function startRealtimeBridge() {
  if (pollHandle) {
    window.clearTimeout(pollHandle);
    pollHandle = null;
  }
  const poll = async () => {
    try {
      const snapshot = await requestBoardSnapshot();
      if (snapshot) {
        const signature = JSON.stringify({
          state: snapshot.state,
          participants: (snapshot.participants || []).map((entry) => entry.id),
        });
        if (signature !== lastSnapshotSignature) {
          applySnapshot(snapshot);
        }
      }
    } finally {
      pollHandle = window.setTimeout(poll, 2500);
    }
  };
  poll();
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

function clampIndex(value, boardSize) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return 0;
  }
  const sanitizedSize = sanitizeBoardSize(boardSize);
  const maxIndex = getBoardCellCount(sanitizedSize) - 1;
  if (numeric < 0) {
    return 0;
  }
  if (numeric > maxIndex) {
    return maxIndex;
  }
  return numeric;
}

function validParticipantId(value) {
  const text = String(value || '').trim();
  return text && text !== '0' ? text : '';
}

function buildShareUrl() {
  if (!roomKey) {
    return '';
  }
  const url = new URL('trio-challenge-invite.html', window.location.href);
  url.searchParams.set('room_key', roomKey);
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
    window.clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = null;
  }
  if (shareElements.feedback) {
    shareElements.feedback.hidden = true;
    shareElements.feedback.textContent = '';
    delete shareElements.feedback.dataset.tone;
  }
  if (shareElements.emailFeedback) {
    shareElements.emailFeedback.hidden = true;
    shareElements.emailFeedback.textContent = '';
    delete shareElements.emailFeedback.dataset.tone;
  }
}

function initializeShareSheet(elementsMap) {
  const { bar, openButton, layer, card, closeButton, backdrop } = elementsMap || {};
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
  openButton.disabled = true;
  openButton.setAttribute('aria-expanded', 'false');
  openButton.setAttribute('tabindex', '-1');

  let activeTrigger = null;

  const close = () => {
    if (layer.dataset.open !== 'true') {
      return;
    }
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
    if (layer.dataset.open === 'true' || openButton.disabled) {
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
  if (shareSheetController && typeof shareSheetController.close === 'function') {
    shareSheetController.close();
    return;
  }
  if (!shareElements.layer) {
    return;
  }
  shareElements.layer.dataset.open = 'false';
  shareElements.layer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('share-layer-open');
  shareElements.openButton?.setAttribute('aria-expanded', 'false');
  resetShareFeedback();
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

  if (!shareElements.linksContainer) {
    configureShareEmailForm(hasLink);
    return;
  }

  const links = shareElements.linksContainer.querySelectorAll('[data-share-channel]');
  if (links.length === 0) {
    configureShareEmailForm(hasLink);
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
    configureShareEmailForm(hasLink);
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
    link.target = '_blank';
    link.rel = 'noopener';
    link.removeAttribute('aria-disabled');
    link.removeAttribute('tabindex');
    link.classList.remove('share-link--disabled');
  });

  configureShareEmailForm(hasLink);
}

function initializeShareEmailForm() {
  if (!shareElements.emailForm || !(shareElements.emailInput instanceof HTMLInputElement)) {
    return;
  }
  const submitButton = shareElements.emailForm.querySelector('button[type="submit"]');
  shareElements.emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!shareElements.emailInput.checkValidity()) {
      shareElements.emailInput.reportValidity();
      return;
    }
    const email = shareElements.emailInput.value.trim();
    if (!email) {
      shareElements.emailInput.reportValidity();
      return;
    }
    const shareUrl = shareElements.emailForm.dataset.shareUrl || shareLinkUrl;
    if (!shareUrl) {
      showShareEmailFeedback('Nie udało się przygotować linku do udostępnienia. Odśwież stronę.', true);
      return;
    }
    const message = shareElements.emailForm.dataset.shareMessage || buildShareMessage(shareUrl);
    const payload = {
      partner_email: email,
      share_url: shareUrl,
      subject: SHARE_EMAIL_SUBJECT,
      sender_name: (selfInfo?.display_name || '').trim(),
      message,
    };
    try {
      if (submitButton) {
        submitButton.disabled = true;
      }
      const response = await postJson(EMAIL_ENDPOINT, payload);
      if (!response || !response.ok) {
        throw new Error(response?.error || 'Nie udało się wysłać wiadomości.');
      }
      showShareEmailFeedback('Wiadomość wysłana! Powiedz partnerowi, by zajrzał do skrzynki.');
      shareElements.emailInput.value = '';
    } catch (error) {
      console.error(error);
      showShareEmailFeedback(error instanceof Error ? error.message : 'Nie udało się wysłać wiadomości.', true);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

function configureShareEmailForm(hasLink) {
  if (!shareElements.emailForm || !(shareElements.emailInput instanceof HTMLInputElement)) {
    return;
  }
  if (!hasLink) {
    shareElements.emailForm.hidden = true;
    shareElements.emailForm.dataset.shareUrl = '';
    shareElements.emailForm.dataset.shareMessage = '';
    shareElements.emailInput.value = '';
    resetShareEmailFeedback();
    return;
  }
  shareElements.emailForm.hidden = false;
  shareElements.emailForm.dataset.shareUrl = shareLinkUrl;
  shareElements.emailForm.dataset.shareMessage = buildShareMessage(shareLinkUrl);
  resetShareEmailFeedback();
}

function showShareEmailFeedback(message, isError = false) {
  if (!shareElements.emailFeedback) {
    return;
  }
  shareElements.emailFeedback.hidden = false;
  shareElements.emailFeedback.textContent = message;
  shareElements.emailFeedback.dataset.tone = isError ? 'error' : 'success';
  window.setTimeout(() => {
    resetShareEmailFeedback();
  }, 4000);
}

function resetShareEmailFeedback() {
  if (!shareElements.emailFeedback) {
    return;
  }
  shareElements.emailFeedback.hidden = true;
  shareElements.emailFeedback.textContent = '';
  delete shareElements.emailFeedback.dataset.tone;
}

function updateShareVisibility() {
  if (!shareElements.bar) {
    return;
  }
  const shouldShow = isCurrentUserHost && currentParticipants.length < 2;
  if (!shouldShow) {
    closeShareSheet();
    closeQrModal();
  }
  shareElements.bar.hidden = !shouldShow;
  if (shareElements.openButton) {
    shareElements.openButton.disabled = !shouldShow;
    shareElements.openButton.setAttribute('aria-expanded', 'false');
    if (shouldShow) {
      shareElements.openButton.removeAttribute('tabindex');
    } else {
      shareElements.openButton.setAttribute('tabindex', '-1');
    }
  }
  if (shareElements.hint) {
    shareElements.hint.textContent = shouldShow
      ? 'Skopiuj link, QR lub e-mail i wyślij go partnerowi. Pokój wygasa po 6 godzinach.'
      : 'Gdy tylko partner dołączy, przycisk udostępniania zniknie sam.';
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

function showShareFeedback(message, isError = false) {
  if (!shareElements.feedback) {
    return;
  }
  shareElements.feedback.hidden = false;
  shareElements.feedback.textContent = message;
  shareElements.feedback.dataset.tone = isError ? 'error' : 'success';
  if (shareFeedbackTimer) {
    window.clearTimeout(shareFeedbackTimer);
  }
  shareFeedbackTimer = window.setTimeout(() => {
    shareElements.feedback.hidden = true;
    shareElements.feedback.textContent = '';
    delete shareElements.feedback.dataset.tone;
  }, 4000);
}

function openQrModal() {
  if (!shareElements.modal || !shareElements.modalImage || !shareElements.modalUrl) {
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
