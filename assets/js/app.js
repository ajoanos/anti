import { games } from './games-data.js';

const STORAGE_KEY_THEME = 'pary.theme';
const ACCESS_STORAGE_KEY = 'pary.access.pdp';
const PLAN_ACCESS_STORAGE_KEY = 'momenty.planWieczoru.access';
export const ACTIVE_TOKEN = new URLSearchParams(window.location.search).get('token') || '';

if (!window.__momentyAccessConfirmed && !document.documentElement.hasAttribute('data-guard-hidden')) {
  document.documentElement.setAttribute('data-guard-hidden', 'true');
}

ensureMomentyGuard().catch((error) => {
  console.warn('Nie udało się załadować weryfikacji tokenu:', error);
  document.documentElement.removeAttribute('data-guard-hidden');
});

setupDefaultAccessHandler();

function ensureMomentyGuard() {
  if (window.__momentyGuardLoaded) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'assets/js/momenty-guard.js';
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('momenty-guard.js nie został załadowany'));
    document.head.appendChild(script);
  });
}

export function appendTokenToUrl(value, token = ACTIVE_TOKEN) {
  if (!value) return value;
  if (!token) return value;

  try {
    const url = new URL(value, window.location.href);
    url.searchParams.set('token', token);
    return url.toString();
  } catch (error) {
    console.warn('Nie udało się zaktualizować adresu z tokenem:', error);
    return value;
  }
}

function propagateToken(token = ACTIVE_TOKEN) {
  if (!token) return;

  const mergeToken = (value) => appendTokenToUrl(value, token);

  document.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;
    const next = mergeToken(href);
    if (next !== href) {
      link.setAttribute('href', next);
    }
  });

  document.querySelectorAll('form[action]').forEach((form) => {
    const action = form.getAttribute('action');
    if (!action) return;
    const next = mergeToken(action);
    if (next !== action) {
      form.setAttribute('action', next);
    }
  });

  const guardedDataAttributes = [
    'data-success',
    'data-success-active',
    'data-success-pending',
    'data-access-redirect',
    'data-back',
  ];

  guardedDataAttributes.forEach((attr) => {
    document.querySelectorAll(`[${attr}]`).forEach((element) => {
      const current = element.getAttribute(attr);
      if (!current) return;
      const next = mergeToken(current);
      if (next !== current) {
        element.setAttribute(attr, next);
      }
    });
  });
}

function setupDefaultAccessHandler() {
  const handleAccess = () => {
    document.documentElement.removeAttribute('data-guard-hidden');

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => propagateToken(), { once: true });
      return;
    }

    propagateToken();
  };

  if (typeof window.momentyAccessOk !== 'function') {
    window.momentyAccessOk = handleAccess;
  }

  if (window.__momentyAccessConfirmed && window.__momentyAccessPending &&
    typeof window.momentyAccessOk === 'function') {
    window.momentyAccessOk(window.__momentyAccessPending);
    window.__momentyAccessPending = null;
  }
}

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
    a.href = appendTokenToUrl(game.link);
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

  const logoLink = document.querySelector('.hero__logo-link');
  if (logoLink instanceof HTMLAnchorElement) {
    const nextHref = appendTokenToUrl(logoLink.getAttribute('href'));
    if (nextHref) {
      logoLink.setAttribute('href', nextHref);
    }
  }

  const productButtons = document.querySelectorAll('[data-action="open-product"]');
  productButtons.forEach((button) => {
    const target = appendTokenToUrl(button.dataset.target || '');
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
  const passwordError = document.getElementById('password-error');
  const passwordCancel = document.getElementById('password-cancel');

  if (passwordForm) {
    const storageKey = passwordForm.dataset.storageKey || ACCESS_STORAGE_KEY;
    const successTarget = appendTokenToUrl(passwordForm.dataset.success || 'pytania-dla-par-room.html');
    const skipRoomKey = passwordForm.dataset.skipRoomKey === 'true';
    const requestedDeck = (passwordForm.dataset.deck || '').trim().toLowerCase();
    const defaultErrorMessage =
      passwordError?.textContent || 'Nie udało się przygotować pokoju. Spróbuj ponownie.';
    const submitButton = passwordForm.querySelector('button[type="submit"]');
    let isSubmitting = false;

    const handleError = (message) => {
      if (passwordError) {
        passwordError.textContent = message || defaultErrorMessage;
        passwordError.hidden = false;
      } else if (message) {
        alert(message);
      }
    };

    passwordCancel?.addEventListener('click', () => {
      const backTarget = appendTokenToUrl(passwordCancel.dataset.back || '');
      if (backTarget) {
        window.location.href = backTarget;
      }
    });

    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;
      try {
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.setAttribute('aria-busy', 'true');
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
        if (ACTIVE_TOKEN) {
          targetUrl.searchParams.set('token', ACTIVE_TOKEN);
        }
        window.location.href = targetUrl.toString();
      } catch (error) {
        console.error(error);
        if (passwordError) {
          handleError(error.message || defaultErrorMessage);
        } else if (error.message) {
          alert(error.message);
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.removeAttribute('aria-busy');
        }
        isSubmitting = false;
      }
    });

    if (passwordForm.dataset.autoStart !== 'false') {
      passwordForm.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  }

  const joinForm = document.getElementById('join-form');
  if (joinForm) {
    const requiredAccessKey = joinForm.dataset.storageKey || ACCESS_STORAGE_KEY;
    const params = new URLSearchParams(window.location.search);

    if (params.has('auto')) {
      sessionStorage.setItem(requiredAccessKey, 'true');
    }

    const roomKeyField = joinForm.elements.namedItem('room_key');
    const displayNameField = joinForm.elements.namedItem('display_name');
    const successActive = appendTokenToUrl(joinForm.dataset.successActive || 'room.html');
    const successPending = appendTokenToUrl(joinForm.dataset.successPending || 'room-waiting.html');
    const autoApprove = joinForm.dataset.autoApprove === 'true';
    const requireRoomKey = joinForm.dataset.requireRoomKey === 'true';
    const submitMode = (joinForm.dataset.submitMode || (autoApprove ? 'invite' : 'host')).trim().toLowerCase();
    const accessRedirect = appendTokenToUrl(joinForm.dataset.accessRedirect || 'pytania-dla-par.html');

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
        if (ACTIVE_TOKEN) {
          nextParams.set('token', ACTIVE_TOKEN);
        }
        const target = payload.requires_approval ? successPending : successActive;
        const targetUrl = new URL(target, window.location.href);
        nextParams.forEach((value, key) => {
          targetUrl.searchParams.set(key, value);
        });
        if (ACTIVE_TOKEN) {
          targetUrl.searchParams.set('token', ACTIVE_TOKEN);
        }
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
    const successTarget = appendTokenToUrl(declineForm.dataset.success || 'plan-wieczoru-play.html');
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
        if (ACTIVE_TOKEN) {
          params.set('token', ACTIVE_TOKEN);
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
