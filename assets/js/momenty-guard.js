(function () {
  if (window.__momentyGuardLoaded) return;
  window.__momentyGuardLoaded = true;

  if (!document.documentElement.hasAttribute('data-guard-hidden')) {
    document.documentElement.setAttribute('data-guard-hidden', 'true');
  }
  const HOME_URL = 'https://sklep.allemedia.pl/anti15/index.html';
  const API_URL = 'https://sklep.allemedia.pl/wp-json/momenty/v1/check';
  const STORAGE_KEY = 'momenty_access';
  const DEVICE_KEY = 'momenty_device_id';

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) {
    renderMessage('Brak dostępu',
      'Brakuje parametru <strong>token</strong> w adresie URL. Dodaj go lub wróć na stronę główną.');
    return;
  }

  const stored = readStoredAccess();
  const now = Math.floor(Date.now() / 1000);

  if (stored && stored.token === token && Number(stored.expires) > now) {
    notifyAccess(Number(stored.expires));
    return;
  }

  if (stored && stored.token === token && Number(stored.expires) <= now) {
    clearStoredAccess();
  }

  if (stored && stored.token !== token) {
    clearStoredAccess();
  }

  fetchAccess(token)
    .then((expires) => {
      saveAccess(token, expires);
      notifyAccess(expires, true);
    })
    .catch((error) => {
      if (error?.type === 'access-denied') {
        renderDeniedMessage(error.reason);
        return;
      }
      const status = error?.message ? ` (${error.message})` : '';
      renderMessage(
        'Błąd połączenia',
        `Nie udało się zweryfikować dostępu${status}. Odśwież stronę i spróbuj ponownie.`
      );
    });

  function fetchAccess(currentToken) {
    const deviceId = getDeviceId();
    const requestUrl = new URL(API_URL);
    requestUrl.searchParams.set('token', currentToken);
    requestUrl.searchParams.set('device', deviceId);

    return fetch(requestUrl.toString())
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data?.access === true && typeof data.expires !== 'undefined') {
          return Number(data.expires);
        }

        const reason = data?.reason;
        const denial = new Error('Brak dostępu');
        denial.type = 'access-denied';
        denial.reason = reason;
        throw denial;
      });
  }

  function notifyAccess(expires, updatePendingFlag = true) {
    document.documentElement.removeAttribute('data-guard-hidden');

    const expiry = Number(expires);
    window.__momentyAccessConfirmed = true;
    window.__momentyAccessExpires = expiry;

    let handled = false;
    if (typeof window.momentyAccessOk === 'function') {
      window.momentyAccessOk(expiry);
      handled = true;
    }

    if (updatePendingFlag) {
      window.__momentyAccessPending = handled ? null : expiry;
    }
  }

  function readStoredAccess() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.token !== 'string') return null;
      if (typeof parsed.expires !== 'number' && typeof parsed.expires !== 'string') return null;
      return parsed;
    } catch (error) {
      console.warn('Nie udało się odczytać danych dostępu:', error);
      return null;
    }
  }

  function saveAccess(currentToken, expires) {
    try {
      const payload = { token: currentToken, expires: Number(expires) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Nie udało się zapisać danych dostępu:', error);
    }
  }

  function clearStoredAccess() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Nie udało się wyczyścić danych dostępu:', error);
    }
  }

  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (id) return id;

      if (window.crypto?.randomUUID) {
        id = window.crypto.randomUUID();
      } else {
        id = `${Math.random().toString(36).slice(2)}-${Date.now()}`;
      }

      localStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch (error) {
      console.warn('Nie udało się uzyskać ID urządzenia:', error);
      return 'device-unknown';
    }
  }

  function renderDeniedMessage(reason) {
    if (reason === 'expired') {
      renderMessage('Dostęp wygasł', 'Twój dostęp wygasł. Odnowisz go na stronie głównej.');
      return;
    }

    if (reason === 'too_many_devices') {
      renderMessage('Za dużo urządzeń', 'Limit urządzeń dla tego konta został wyczerpany.');
      return;
    }

    renderMessage('Brak dostępu', 'Nie udało się potwierdzić dostępu.');
  }

  function renderMessage(title, body) {
    document.documentElement.removeAttribute('data-guard-hidden');

    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => renderMessage(title, body), { once: true });
      return;
    }

    const container = document.createElement('main');
    container.style.maxWidth = '640px';
    container.style.margin = '48px auto';
    container.style.padding = '24px';
    container.style.fontFamily = 'Nunito, system-ui, -apple-system, sans-serif';
    container.style.lineHeight = '1.6';
    container.style.textAlign = 'center';

    const heading = document.createElement('h1');
    heading.textContent = title;
    heading.style.marginBottom = '12px';

    const paragraph = document.createElement('p');
    paragraph.innerHTML = body;
    paragraph.style.marginBottom = '16px';

    const link = document.createElement('a');
    link.href = HOME_URL;
    link.textContent = 'Wróć do strony gier';
    link.style.display = 'inline-block';
    link.style.padding = '10px 16px';
    link.style.borderRadius = '8px';
    link.style.background = '#7f5af0';
    link.style.color = '#fff';
    link.style.textDecoration = 'none';

    container.append(heading, paragraph, link);
    document.body.innerHTML = '';
    document.body.appendChild(container);
  }
})();
