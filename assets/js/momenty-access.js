(function(){
  const script = document.currentScript;
  const restEndpoint = script?.dataset.restEndpoint || '/wp-json/momenty/v1/check';
  const shopUrl = script?.dataset.shopUrl || '/';
  const renewalUrl = script?.dataset.renewalUrl || shopUrl;

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('game-root');
    if (!root) {
      return;
    }

    // Ensure content stays hidden until access is confirmed.
    root.style.display = 'none';

    const statusBox = createStatusBox();

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      showMessage(statusBox, `Brak tokenu. <a href="${shopUrl}">Kup dostęp</a>.`);
      return;
    }

    fetch(`${restEndpoint}?token=${encodeURIComponent(token)}&device=${encodeURIComponent(getDeviceId())}`)
      .then((response) => response.json())
      .then((data) => {
        if (!data || data.access !== true) {
          if (data && data.reason === 'expired') {
            showMessage(statusBox, `Dostęp wygasł. <a href="${renewalUrl}">Odnów dostęp</a>.`);
          } else if (data && data.reason === 'too_many_devices') {
            showMessage(statusBox, 'Za dużo urządzeń. Skontaktuj się z obsługą.');
          } else {
            showMessage(statusBox, `Brak dostępu. <a href="${shopUrl}">Kup dostęp</a>.`);
          }
          return;
        }
        statusBox.remove();
        root.style.display = '';
      })
      .catch(() => {
        showMessage(statusBox, 'Błąd połączenia. Odśwież stronę lub spróbuj ponownie później.');
      });
  });

  function getDeviceId() {
    const key = 'momenty_device_id';
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id = Math.random().toString(36).slice(2, 12);
        localStorage.setItem(key, id);
      }
      return id;
    } catch (e) {
      return 'device-unknown';
    }
  }

  function createStatusBox() {
    const box = document.createElement('div');
    box.id = 'momenty-access-status';
    box.setAttribute('role', 'status');
    box.style.padding = '16px';
    box.style.margin = '16px';
    box.style.background = '#fff5f5';
    box.style.border = '1px solid #f5b8b8';
    box.style.borderRadius = '8px';
    box.style.fontFamily = 'Nunito, sans-serif';
    box.style.fontSize = '16px';
    box.style.color = '#b00020';
    box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
    box.style.lineHeight = '1.5';
    box.style.display = 'none';
    document.body.prepend(box);
    return box;
  }

  function showMessage(box, message) {
    box.innerHTML = message;
    box.style.display = 'block';
  }
})();
