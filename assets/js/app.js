import { games } from './games-data.js';

const STORAGE_KEY_THEME = 'pary.theme';
const ACCESS_PASSWORD = 'wedwoje25';
const ACCESS_STORAGE_KEY = 'pary.access.pdp';
const PLAN_ACCESS_STORAGE_KEY = 'momenty.planWieczoru.access';

export async function postJson(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Błąd sieci ${response.status}`);
  }
  return response.json();
}

export async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Błąd sieci ${response.status}`);
  }
  return response.json();
}

async function requestNewRoomKey(options = {}) {
  const payload = await postJson('api/request_room.php', {
    deck: options.deck || undefined,
  });
  if (!payload || !payload.ok || !payload.room_key) {
    throw new Error(payload?.error || 'Nie udało się przygotować pokoju. Spróbuj ponownie.');
  }
  return payload.room_key;
}

export function initThemeToggle(button) {
  if (!button) return;

  const applyStoredTheme = () => {
    const stored = localStorage.getItem(STORAGE_KEY_THEME);
    if (stored) {
      document.body.dataset.theme = stored;
    } else if (!document.body.dataset.theme) {
      document.body.dataset.theme = 'light';
    }
  };

  const updateIcon = () => {
    if (document.body.dataset.theme === 'dark') {
      button.textContent = '☀️';
    } else {
      button.textContent = '🌙';
    }
  };

  applyStoredTheme();

  if (button.dataset.themeInit === 'true') {
    updateIcon();
    return;
  }

  button.dataset.themeInit = 'true';

  updateIcon();

  button.addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY_THEME, next);
    updateIcon();
  });
}

export function initGameSwitcher() {
  const switcherList = document.querySelector('.game-switcher__list');
  if (!switcherList) return;

  // Clear existing items
  switcherList.innerHTML = '';

  const currentPath = window.location.pathname.split('/').pop();

  games.forEach(game => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'game-switcher__link';
    a.href = game.link;
    a.textContent = game.title;

    if (currentPath === game.link) {
      a.setAttribute('aria-current', 'page');
    }

    li.appendChild(a);
    switcherList.appendChild(li);
  });
}

function focusElement(element) {
  if (!element) return;
  // Check if device is mobile (coarse pointer or small screen)
  const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
  if (isMobile) return;

  setTimeout(() => element.focus(), 50);
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle(document.getElementById('theme-toggle'));
  initGameSwitcher();

  const productButtons = document.querySelectorAll('[data-action="open-product"]');
  productButtons.forEach((button) => {
    const target = button.dataset.target;
    if (!target) return;
    button.addEventListener('click', (event) => {
      if (button.tagName.toLowerCase() === 'a') {
        return;
      }
      event.preventDefault();
      window.location.href = target;
    });
  });

  const passwordForm = document.getElementById('password-form');
  const passwordInput = document.getElementById('access-password');
  const passwordError = document.getElementById('password-error');
  const passwordCancel = document.getElementById('password-cancel');

  if (passwordForm) {
    const formPassword = passwordForm.dataset.password || ACCESS_PASSWORD;
    const storageKey = passwordForm.dataset.storageKey || ACCESS_STORAGE_KEY;
    const successTarget = passwordForm.dataset.success || 'pytania-dla-par-room.html';
    const skipRoomKey = passwordForm.dataset.skipRoomKey === 'true';
    const requestedDeck = (passwordForm.dataset.deck || '').trim().toLowerCase();
    const defaultErrorMessage = passwordError?.textContent || 'Niepoprawne hasło. Spróbuj ponownie.';

    if (passwordInput) {
      passwordInput.value = '';
      focusElement(passwordInput);
      passwordInput.addEventListener('input', () => {
        if (passwordError) {
          passwordError.textContent = defaultErrorMessage;
          passwordError.hidden = true;
        }
      });
    }

    passwordCancel?.addEventListener('click', () => {
      const backTarget = passwordCancel.dataset.back;
      if (backTarget) {
        window.location.href = backTarget;
      }
    });

    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = passwordInput?.value.trim() || '';
      if (!value) {
        if (passwordError) {
          passwordError.textContent = defaultErrorMessage;
          passwordError.hidden = false;
        }
        return;
      }
      if (value !== formPassword) {
        if (passwordError) {
          passwordError.textContent = defaultErrorMessage;
          passwordError.hidden = false;
        }
        return;
      }

      const submitButton = passwordForm.querySelector('button[type="submit"]');
      try {
        if (submitButton) {
          submitButton.disabled = true;
        }
        let roomKey = '';
        if (!skipRoomKey) {
          roomKey = await requestNewRoomKey({ deck: requestedDeck });
        }
        sessionStorage.setItem(storageKey, 'true');
        const targetUrl = new URL(successTarget, window.location.href);
        if (!skipRoomKey && roomKey) {
          targetUrl.searchParams.set('room_key', roomKey);
        }
        if (requestedDeck) {
          targetUrl.searchParams.set('deck', requestedDeck);
        }
        window.location.href = targetUrl.toString();
      } catch (error) {
        console.error(error);
        if (passwordError) {
          passwordError.textContent = error.message || 'Nie udało się przygotować pokoju. Spróbuj ponownie.';
          passwordError.hidden = false;
        } else {
          alert(error.message || 'Nie udało się przygotować pokoju. Spróbuj ponownie.');
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }

  const joinForm = document.getElementById('join-form');
  if (joinForm) {
    const requiredAccessKey = joinForm.dataset.storageKey || ACCESS_STORAGE_KEY;
    const accessRedirect = joinForm.dataset.accessRedirect || 'pytania-dla-par.html';
    const params = new URLSearchParams(window.location.search);

    if (params.has('auto')) {
      sessionStorage.setItem(requiredAccessKey, 'true');
    }

    if (sessionStorage.getItem(requiredAccessKey) !== 'true') {
      window.location.replace(accessRedirect);
      return;
    }

    const roomKeyField = joinForm.elements.namedItem('room_key');
    const displayNameField = joinForm.elements.namedItem('display_name');
    const successActive = joinForm.dataset.successActive || 'room.html';
    const successPending = joinForm.dataset.successPending || 'room-waiting.html';
    const autoApprove = joinForm.dataset.autoApprove === 'true';
    const requireRoomKey = joinForm.dataset.requireRoomKey === 'true';
    const submitMode = (joinForm.dataset.submitMode || (autoApprove ? 'invite' : 'host')).trim().toLowerCase();

    const focusCandidate = Array.from(joinForm.querySelectorAll('input, select, textarea')).find(
      (element) => element instanceof HTMLElement && element.type !== 'hidden' && !element.disabled,
    );
    focusElement(focusCandidate);

    const presetRoomKey = (params.get('room_key') || '').trim().toUpperCase();
    const presetName = (params.get('display_name') || '').trim();
    const shouldAutoSubmit = params.has('auto');
    let activeRoomKey = presetRoomKey;

    if (roomKeyField instanceof HTMLInputElement || roomKeyField instanceof HTMLTextAreaElement) {
      if (presetRoomKey) {
        roomKeyField.value = presetRoomKey;
      } else if (joinForm.dataset.roomKey) {
        roomKeyField.value = joinForm.dataset.roomKey.trim().toUpperCase();
      }
      if (roomKeyField.value) {
        roomKeyField.value = roomKeyField.value.trim().toUpperCase();
        activeRoomKey = roomKeyField.value;
      }
    } else if (!activeRoomKey && joinForm.dataset.roomKey) {
      activeRoomKey = joinForm.dataset.roomKey.trim().toUpperCase();
    }

    const roomNotice = joinForm.querySelector('[data-role="room-ready"]');
    if (roomNotice instanceof HTMLElement) {
      const roomDisplay = roomNotice.querySelector('[data-role="generated-room-key"]');
      if (activeRoomKey) {
        if (roomDisplay instanceof HTMLElement) {
          roomDisplay.textContent = activeRoomKey;
        }
        roomNotice.hidden = false;
      } else {
        roomNotice.hidden = true;
      }
    }

    if (requireRoomKey) {
      const currentKey = activeRoomKey || roomKeyField?.value?.trim().toUpperCase() || presetRoomKey;
      if (!currentKey) {
        window.location.replace(accessRedirect);
        return;
      }
    }
    if (displayNameField instanceof HTMLInputElement || displayNameField instanceof HTMLTextAreaElement) {
      if (presetName) {
        displayNameField.value = presetName;
      }
    }
    joinForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = joinForm.querySelector('button[type="submit"]');
      const roomKey = (roomKeyField?.value || '').trim().toUpperCase();
      const displayName = (displayNameField?.value || '').trim();
      const mode = submitMode;
      if (!roomKey || !displayName) {
        alert('Uzupełnij wszystkie pola.');
        return;
      }
      try {
        if (submitButton) {
          submitButton.disabled = true;
        }
        const payload = await postJson('api/create_or_join.php', {
          room_key: roomKey,
          display_name: displayName,
          mode,
        });
        if (!payload.ok) {
          throw new Error(payload.error || 'Nie udało się dołączyć do pokoju.');
        }
        const nextParams = new URLSearchParams({
          room_key: payload.room_key,
          pid: payload.participant_id,
          name: displayName,
        });
        if (payload.deck) {
          nextParams.set('deck', payload.deck);
        }
        const target = payload.requires_approval ? successPending : successActive;
        const targetUrl = new URL(target, window.location.href);
        nextParams.forEach((value, key) => {
          targetUrl.searchParams.set(key, value);
        });
        window.location.href = targetUrl.toString();
      } catch (error) {
        console.error(error);
        alert(error.message);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });

    if (
      shouldAutoSubmit &&
      roomKeyField &&
      displayNameField &&
      roomKeyField.value &&
      displayNameField.value
    ) {
      setTimeout(() => {
        if (typeof joinForm.requestSubmit === 'function') {
          joinForm.requestSubmit();
        } else {
          joinForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }, 150);

      if (window.history.replaceState) {
        const cleanUrl = new URL(window.location.href);
        ['room_key', 'display_name', 'mode', 'auto'].forEach((key) => cleanUrl.searchParams.delete(key));
        const nextSearch = cleanUrl.searchParams.toString();
        const nextUrl = `${cleanUrl.pathname}${nextSearch ? `?${nextSearch}` : ''}${cleanUrl.hash}`;
        window.history.replaceState({}, '', nextUrl);
      }
    }
  }

  const declineForm = document.getElementById('decline-proposal-form');
  if (declineForm) {
    const nameInput = declineForm.querySelector('input[name="display_name"]');
    const errorBox = declineForm.querySelector('[data-role="error"]');
    const successTarget = declineForm.dataset.success || 'plan-wieczoru-play.html';
    const storageKey = declineForm.dataset.storageKey || PLAN_ACCESS_STORAGE_KEY;

    focusElement(nameInput);

    declineForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!(nameInput instanceof HTMLInputElement)) {
        return;
      }
      const submitButton = declineForm.querySelector('button[type="submit"]');
      const displayName = nameInput.value.trim();
      if (!displayName) {
        if (errorBox) {
          errorBox.textContent = 'Podaj swoje imię, aby kontynuować.';
          errorBox.hidden = false;
        }
        nameInput.focus();
        return;
      }
      try {
        if (errorBox) {
          errorBox.hidden = true;
          errorBox.textContent = '';
        }
        if (submitButton) {
          submitButton.disabled = true;
        }
        const roomKey = await requestNewRoomKey();
        const joinPayload = await postJson('api/create_or_join.php', {
          room_key: roomKey,
          display_name: displayName,
          mode: 'host',
        });
        if (!joinPayload || !joinPayload.ok) {
          throw new Error(joinPayload?.error || 'Nie udało się dołączyć do pokoju. Spróbuj ponownie.');
        }
        sessionStorage.setItem(storageKey, 'true');
        const params = new URLSearchParams({
          room_key: joinPayload.room_key,
          pid: joinPayload.participant_id,
          name: displayName,
          auto: '1',
        });
        if (joinPayload.deck) {
          params.set('deck', joinPayload.deck);
        }
        window.location.href = `${successTarget}?${params.toString()}`;
      } catch (error) {
        console.error(error);
        if (errorBox) {
          errorBox.textContent = error.message || 'Nie udało się rozpocząć zabawy. Spróbuj ponownie.';
          errorBox.hidden = false;
        } else {
          alert(error.message || 'Nie udało się rozpocząć zabawy. Spróbuj ponownie.');
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('SW registration failed', err);
    });
  });
}
