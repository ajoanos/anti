import { getJson } from './app.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const participantId = params.get('pid');

const waitingTitle = document.getElementById('waiting-title');
const waitingMessage = document.getElementById('waiting-message');
const waitingLabel = document.getElementById('waiting-room-label');
const waitingLeave = document.getElementById('waiting-leave');
const hostSetupPage = document.body?.dataset.hostPage || 'pytania-dla-par-room.html';
const backToGames = document.body?.dataset.homePage || 'pytania-dla-par.html';
const activeRoomPage = document.body?.dataset.roomPage || 'room.html';
const datasetDeck = (document.body?.dataset.deck || '').toLowerCase();
const deckParam = (params.get('deck') || datasetDeck || '').toLowerCase();

if (deckParam) {
  document.body.dataset.deck = deckParam;
}

if (waitingLabel && roomKey) {
  waitingLabel.textContent = `Pokój ${roomKey}`;
}

if (!roomKey || !participantId) {
  window.location.replace(hostSetupPage);
} else {
  waitingLeave?.addEventListener('click', () => {
    window.location.href = backToGames;
  });

  let pollTimer = null;
  let lastStatus = '';

  async function refreshStatus() {
    try {
      const payload = await getJson(
        `api/state.php?room_key=${encodeURIComponent(roomKey)}&participant_id=${encodeURIComponent(participantId)}`,
      );
      if (!payload.ok) {
        throw new Error(payload.error || 'Nie udało się pobrać stanu pokoju.');
      }
      const participant = payload.self || null;
      if (!participant) {
        showErrorState(
          'Nie znaleziono zgłoszenia',
          'Twoje zgłoszenie nie jest już dostępne. Wróć i spróbuj dołączyć ponownie.',
        );
        stopPolling();
        return;
      }

      if (participant.is_host || participant.status === 'active') {
        redirectToRoom();
        return;
      }

      if (participant.status === 'rejected') {
        showErrorState(
          'Prośba została odrzucona',
          'Gospodarz odrzucił Twoją prośbę. Możesz wrócić i spróbować ponownie później.',
        );
        stopPolling();
        return;
      }

      if (participant.status !== lastStatus) {
        lastStatus = participant.status || '';
        showWaitingState();
      }
    } catch (error) {
      console.error(error);
    }
  }

  function showWaitingState() {
    if (waitingTitle) {
      waitingTitle.textContent = 'Oczekiwanie na dołączenie';
    }
    if (waitingMessage) {
      waitingMessage.textContent =
        'Twoja prośba została wysłana do gospodarza. Gdy tylko zaakceptuje zgłoszenie, od razu otrzymasz dostęp do pokoju.';
    }
  }

  function showErrorState(title, message) {
    if (waitingTitle) {
      waitingTitle.textContent = title;
    }
    if (waitingMessage) {
      waitingMessage.textContent = message;
    }
  }

  function redirectToRoom() {
    stopPolling();
    const targetUrl = new URL(activeRoomPage, window.location.href);
    targetUrl.searchParams.set('room_key', roomKey);
    targetUrl.searchParams.set('pid', participantId);
    if (deckParam) {
      targetUrl.searchParams.set('deck', deckParam);
    }
    window.location.replace(targetUrl.toString());
  }

  function startPolling() {
    refreshStatus().finally(() => {
      if (pollTimer !== null) { // Check if not stopped
        pollTimer = setTimeout(startPolling, 5000);
      }
    });
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  // Initial start
  pollTimer = setTimeout(startPolling, 0);

  window.addEventListener('beforeunload', () => {
    stopPolling();
  });
}
