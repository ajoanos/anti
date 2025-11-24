import { postJson } from './app.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();

const roomLabel = document.getElementById('invite-room-label');
const inviteForm = document.getElementById('invite-form');
const displayNameInput = document.getElementById('invite-display-name');
const inviteError = document.getElementById('invite-error');
const inviteHint = document.getElementById('invite-hint');
const successTarget = inviteForm?.dataset.success || 'room.html';
const deckParam = (params.get('deck') || '').toLowerCase();

if (deckParam) {
  document.body.dataset.deck = deckParam;
}

if (roomLabel) {
  roomLabel.textContent = roomKey
    ? `Pokój ${roomKey}`
    : 'Brak danych pokoju. Sprawdź, czy skopiowano poprawny link.';
}

if (!roomKey) {
  disableInviteForm('Brakuje kodu pokoju w linku. Poproś gospodarza o ponowne udostępnienie.');
}

inviteForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!inviteForm || !displayNameInput || !roomKey) {
    return;
  }
  const submitButton = inviteForm.querySelector('button[type="submit"]');
  const displayName = displayNameInput.value.trim();
  if (!displayName) {
    showInviteError('Podaj swoje imię, aby kontynuować.');
    displayNameInput.focus();
    return;
  }
  try {
    clearInviteError();
    if (submitButton) {
      submitButton.disabled = true;
    }
    const payload = await postJson('api/create_or_join.php', {
      room_key: roomKey,
      display_name: displayName,
      mode: 'invite',
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się dołączyć do pokoju.');
    }
    const targetUrl = new URL(successTarget, window.location.href);
    targetUrl.searchParams.set('room_key', payload.room_key);
    targetUrl.searchParams.set('pid', payload.participant_id);
    const redirectDeck = payload.deck || deckParam;
    if (redirectDeck) {
      targetUrl.searchParams.set('deck', redirectDeck);
    }
    window.location.href = targetUrl.toString();
  } catch (error) {
    console.error(error);
    showInviteError(error.message || 'Wystąpił błąd podczas dołączania do pokoju.');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});

function showInviteError(message) {
  if (!inviteError) {
    return;
  }
  inviteError.textContent = message;
  inviteError.hidden = false;
  inviteHint?.setAttribute('hidden', 'true');
}

function clearInviteError() {
  if (!inviteError) {
    return;
  }
  inviteError.hidden = true;
  inviteError.textContent = '';
  if (inviteHint) {
    inviteHint.hidden = false;
  }
}

function disableInviteForm(message) {
  if (inviteForm) {
    inviteForm.querySelectorAll('input, button').forEach((element) => {
      element.disabled = true;
    });
  }
  showInviteError(message);
}

if (displayNameInput && roomKey) {
  setTimeout(() => displayNameInput.focus(), 50);
}
