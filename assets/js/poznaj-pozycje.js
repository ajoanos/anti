import { getJson, postJson, initThemeToggle } from './app.js';

const ACCESS_KEY = 'momenty.positions.access';
const ACCESS_PAGE = 'poznaj-wszystkie-pozycje.html';
const LIST_ENDPOINT = 'api/list_scratchcards.php';
const EMAIL_ENDPOINT = 'api/send_positions_email.php';
const EMAIL_SUBJECT = 'Poznaj wszystkie pozycje – nasze typy';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function normalizeId(path) {
  if (!path) {
    return '';
  }
  const segments = path.split('/');
  const filename = segments[segments.length - 1] || path;
  return filename.replace(/\.[^.]+$/, '');
}

function formatTitle(id) {
  if (!id) {
    return 'Pozycja';
  }
  const cleaned = id.replace(/[_-]+/g, ' ').trim();
  if (!cleaned) {
    return 'Pozycja';
  }
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normaliseAssetPath(path) {
  if (!path) {
    return '';
  }
  try {
    const decoded = decodeURI(path);
    return encodeURI(decoded);
  } catch (error) {
    return encodeURI(path);
  }
}

let imagePreviewInstance = null;

function createImagePreview() {
  if (!document.body) {
    return null;
  }

  const overlay = document.createElement('div');
  overlay.className = 'position-lightbox';
  overlay.hidden = true;
  overlay.dataset.open = 'false';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('aria-label', 'Podgląd pozycji');
  overlay.tabIndex = -1;

  const content = document.createElement('div');
  content.className = 'position-lightbox__content';

  const image = document.createElement('img');
  image.className = 'position-lightbox__image';
  image.alt = '';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'position-lightbox__close';
  closeButton.setAttribute('aria-label', 'Zamknij podgląd');
  closeButton.innerHTML = '<span aria-hidden="true">×</span><span class="visually-hidden">Zamknij podgląd</span>';

  content.appendChild(image);
  content.appendChild(closeButton);
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  let activeTrigger = null;

  const close = () => {
    if (overlay.dataset.open !== 'true') {
      return;
    }
    overlay.dataset.open = 'false';
    overlay.setAttribute('aria-hidden', 'true');
  };

  const open = (src, alt, trigger) => {
    if (!src) {
      return;
    }
    activeTrigger = trigger instanceof HTMLElement ? trigger : null;
    if (activeTrigger) {
      activeTrigger.setAttribute('aria-expanded', 'true');
    }
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    image.src = src;
    image.alt = alt || '';
    requestAnimationFrame(() => {
      overlay.dataset.open = 'true';
      overlay.focus({ preventScroll: true });
    });
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  closeButton.addEventListener('click', () => {
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.dataset.open === 'true') {
      event.preventDefault();
      close();
    }
  });

  overlay.addEventListener('transitionend', (event) => {
    if (event.target !== overlay || overlay.dataset.open === 'true') {
      return;
    }
    overlay.hidden = true;
    image.removeAttribute('src');
    image.alt = '';
    if (activeTrigger) {
      activeTrigger.setAttribute('aria-expanded', 'false');
      activeTrigger.focus({ preventScroll: true });
      activeTrigger = null;
    }
  });

  return {
    attach(imageElement, src, alt) {
      if (!imageElement || imageElement.dataset.previewBound === 'true') {
        return;
      }
      imageElement.dataset.previewBound = 'true';
      imageElement.classList.add('position-card__image--interactive');
      imageElement.setAttribute('tabindex', '0');
      imageElement.setAttribute('role', 'button');
      imageElement.setAttribute('aria-haspopup', 'dialog');
      imageElement.setAttribute('aria-expanded', 'false');
      if (alt) {
        imageElement.setAttribute('aria-label', `Powiększ: ${alt}`);
      }

      const openPreview = () => {
        const targetSrc = src || imageElement.currentSrc || imageElement.src;
        open(targetSrc, alt, imageElement);
      };

      imageElement.addEventListener('click', openPreview);
      imageElement.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          openPreview();
        }
      });
    },
    close,
  };
}

function getImagePreview() {
  if (!imagePreviewInstance) {
    imagePreviewInstance = createImagePreview();
  }
  return imagePreviewInstance;
}

function encodeLikes(set) {
  if (!set || set.size === 0) {
    return '';
  }
  const payload = Array.from(set.values());
  const json = JSON.stringify(payload);
  const bytes = textEncoder.encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  let base64 = btoa(binary);
  base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
  return base64;
}

function decodeLikes(value) {
  if (!value) {
    return new Set();
  }
  try {
    let base64 = String(value).trim();
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = textDecoder.decode(bytes);
    const payload = JSON.parse(json);
    if (!Array.isArray(payload)) {
      return new Set();
    }
    return new Set(payload.map((entry) => String(entry)));
  } catch (error) {
    console.warn('Nie udało się odczytać listy polubionych pozycji.', error);
    return new Set();
  }
}

function pluralize(count, one, few, many) {
  const absolute = Math.abs(count);
  if (absolute === 1) {
    return one;
  }
  if (absolute % 10 >= 2 && absolute % 10 <= 4 && (absolute % 100 < 10 || absolute % 100 >= 20)) {
    return few;
  }
  return many;
}

function pluralizeSelections(count) {
  const label = pluralize(count, 'pozycję', 'pozycje', 'pozycji');
  return `${count} ${label}`;
}

function buildShareMessage(url, count) {
  const label = pluralize(count, 'pozycję', 'pozycje', 'pozycji');
  return `Wybrałem/Wybrałam ${count} ${label}. Zobacz i dołącz: ${url}`;
}

function buildShareLinks(url, count) {
  const message = buildShareMessage(url, count);
  return {
    messenger: `https://m.me/?text=${encodeURIComponent(message)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    sms: `sms:&body=${encodeURIComponent(message)}`,
  };
}

function initializeShareSheet(elements) {
  const {
    shareLayer,
    shareCard,
    shareOpenButton,
    shareCloseButton,
    shareBackdrop,
    shareBar,
  } = elements;

  if (!shareLayer || !shareCard || !shareOpenButton || !shareCloseButton) {
    if (shareBar) {
      shareBar.hidden = true;
    }
    return null;
  }

  shareLayer.hidden = false;
  shareLayer.dataset.open = 'false';
  shareLayer.setAttribute('aria-hidden', 'true');

  if (!shareCard.hasAttribute('tabindex')) {
    shareCard.tabIndex = -1;
  }

  const baseLabel = shareOpenButton.dataset.baseLabel || shareOpenButton.textContent.trim() || 'Udostępnij';
  shareOpenButton.dataset.baseLabel = baseLabel;
  shareOpenButton.textContent = baseLabel;
  shareOpenButton.disabled = false;
  shareOpenButton.setAttribute('aria-expanded', 'false');

  if (shareBar) {
    shareBar.hidden = false;
  }

  let activeTrigger = null;

  const closeSheet = () => {
    if (shareLayer.dataset.open !== 'true') {
      return;
    }
    shareLayer.dataset.open = 'false';
    shareLayer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('share-layer-open');
    shareOpenButton.setAttribute('aria-expanded', 'false');
    if (activeTrigger) {
      activeTrigger.focus({ preventScroll: true });
      activeTrigger = null;
    }
  };

  const openSheet = () => {
    if (shareLayer.dataset.open === 'true') {
      return;
    }
    activeTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : shareOpenButton;
    shareLayer.dataset.open = 'true';
    shareLayer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('share-layer-open');
    shareOpenButton.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      shareCard.focus({ preventScroll: true });
    });
  };

  shareOpenButton.addEventListener('click', () => {
    if (shareLayer.dataset.open === 'true') {
      closeSheet();
    } else {
      openSheet();
    }
  });

  shareCloseButton.addEventListener('click', () => {
    closeSheet();
  });

  if (shareBackdrop) {
    shareBackdrop.addEventListener('click', () => {
      closeSheet();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && shareLayer.dataset.open === 'true') {
      event.preventDefault();
      closeSheet();
    }
  });

  return { openSheet, closeSheet };
}

async function copyToClipboard(text) {
  if (!text) {
    return false;
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('Nie udało się skopiować linku przez Clipboard API.', error);
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  document.body.appendChild(textarea);
  textarea.select();
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (error) {
    console.warn('Nie udało się skopiować linku przy użyciu execCommand.', error);
  }
  document.body.removeChild(textarea);
  return success;
}

function showShareFeedback(elements, message, tone = 'success') {
  const { shareFeedback } = elements;
  if (!shareFeedback) {
    return;
  }
  if (!message) {
    shareFeedback.hidden = true;
    shareFeedback.textContent = '';
    shareFeedback.removeAttribute('data-tone');
    return;
  }
  shareFeedback.textContent = message;
  shareFeedback.hidden = false;
  shareFeedback.dataset.tone = tone;
}

function ensureAccess(receivedLikesSize, previousLikesSize) {
  const hasStoredAccess = sessionStorage.getItem(ACCESS_KEY) === 'true';
  const hasShareAccess = receivedLikesSize > 0 || previousLikesSize > 0;
  if (!hasStoredAccess && !hasShareAccess) {
    window.location.replace(ACCESS_PAGE);
    return { allowed: false, fromShare: false };
  }
  if (!hasStoredAccess) {
    sessionStorage.setItem(ACCESS_KEY, 'true');
    return { allowed: true, fromShare: true };
  }
  sessionStorage.setItem(ACCESS_KEY, 'true');
  return { allowed: true, fromShare: false };
}

function createPositionCard(item) {
  const article = document.createElement('article');
  article.className = 'position-card';
  article.dataset.id = item.id;
  article.setAttribute('role', 'listitem');

  const figure = document.createElement('figure');
  figure.className = 'position-card__figure';
  const image = document.createElement('img');
  image.className = 'position-card__image';
  image.src = item.src;
  image.alt = item.title;
  image.loading = 'lazy';
  image.decoding = 'async';
  if (item.rawSrc && item.rawSrc !== item.src) {
    image.addEventListener(
      'error',
      () => {
        image.src = item.rawSrc;
      },
      { once: true },
    );
  }
  const preview = getImagePreview();
  if (preview) {
    preview.attach(image, item.rawSrc || item.src, item.title);
  }
  figure.appendChild(image);

  const caption = document.createElement('figcaption');
  caption.className = 'position-card__title';
  caption.textContent = item.title;
  figure.appendChild(caption);

  const footer = document.createElement('div');
  footer.className = 'position-card__footer';

  const likeButton = document.createElement('button');
  likeButton.className = 'position-card__like';
  likeButton.type = 'button';
  likeButton.dataset.role = 'like-button';
  likeButton.dataset.state = 'none';
  likeButton.setAttribute('aria-pressed', 'false');
  likeButton.innerHTML = `
    <span class="position-card__hearts" aria-hidden="true">
      <span class="position-card__heart position-card__heart--mine">❤</span>
      <span class="position-card__heart position-card__heart--partner">❤</span>
    </span>
    <span class="visually-hidden">Polub tę pozycję</span>
  `;

  const partnerNote = document.createElement('span');
  partnerNote.className = 'position-card__note';
  partnerNote.dataset.role = 'partner-note';
  partnerNote.textContent = 'Wybrane przez partnera';
  partnerNote.hidden = true;

  footer.appendChild(likeButton);
  footer.appendChild(partnerNote);

  article.appendChild(figure);
  article.appendChild(footer);

  return article;
}

function updateCardState(cardElements, id, state) {
  const entry = cardElements.get(id);
  if (!entry) {
    return;
  }
  const { likeButton, partnerNote, card } = entry;
  const likedByMe = state.myLikes.has(id);
  const likedByPartner = state.receivedLikes.has(id);

  let stateValue = 'none';
  if (likedByMe && likedByPartner) {
    stateValue = 'both';
  } else if (likedByMe) {
    stateValue = 'mine';
  } else if (likedByPartner) {
    stateValue = 'partner';
  }

  likeButton.dataset.state = stateValue;
  likeButton.setAttribute('aria-pressed', likedByMe ? 'true' : 'false');
  const label = likeButton.querySelector('.visually-hidden');
  if (label) {
    label.textContent = likedByMe ? 'Usuń polubienie tej pozycji' : 'Polub tę pozycję';
  }
  if (partnerNote) {
    partnerNote.hidden = !likedByPartner;
  }
  if (card) {
    card.dataset.partnerLiked = likedByPartner ? 'true' : 'false';
    card.dataset.myLiked = likedByMe ? 'true' : 'false';
  }
}

function buildShareUrl(state) {
  if (state.myLikes.size === 0) {
    return '';
  }
  const url = new URL(window.location.href);
  url.searchParams.set('likes', encodeLikes(state.myLikes));
  if (state.receivedLikes.size > 0) {
    url.searchParams.set('partner', encodeLikes(state.receivedLikes));
  } else {
    url.searchParams.delete('partner');
  }
  url.searchParams.set('view', 'shared');
  return url.toString();
}

function updateShareState(state, elements) {
  const count = state.myLikes.size;
  const {
    shareHint,
    shareCount,
    shareLinks,
    shareCopy,
    shareEmail,
    shareEmailInput,
    shareEmailFeedback,
    shareOpenButton,
    shareQrButton,
  } = elements;

  if (count > 0) {
    shareCount.hidden = false;
    shareCount.textContent = `Wybrane: ${pluralizeSelections(count)}`;
    if (shareHint) {
      shareHint.textContent = 'Wyślij partnerowi link ze swoimi propozycjami.';
    }
  } else {
    shareCount.hidden = true;
    if (shareHint) {
      shareHint.textContent = 'Polub przynajmniej jedną pozycję, aby udostępnić ją partnerowi.';
    }
  }

  const shareUrl = count > 0 ? buildShareUrl(state) : '';
  const shareMessage = shareUrl ? buildShareMessage(shareUrl, count) : '';
  const links = shareLinks ? shareLinks.querySelectorAll('[data-share-channel]') : [];
  const hrefs = shareUrl ? buildShareLinks(shareUrl, count) : null;

  if (shareOpenButton) {
    const baseLabel = shareOpenButton.dataset.baseLabel || 'Udostępnij';
    shareOpenButton.textContent = count > 0 ? `${baseLabel} (${count})` : baseLabel;
    shareOpenButton.dataset.hasLikes = count > 0 ? 'true' : 'false';
    shareOpenButton.disabled = false;
  }

  links.forEach((link) => {
    if (!shareUrl || !hrefs) {
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('tabindex', '-1');
      link.href = '#';
      link.classList.add('share-link--disabled');
      return;
    }
    const channel = link.dataset.shareChannel;
    const nextHref = hrefs[channel] || shareUrl;
    link.href = nextHref;
    link.removeAttribute('aria-disabled');
    link.removeAttribute('tabindex');
    link.classList.remove('share-link--disabled');
  });

  if (shareCopy) {
    if (shareUrl) {
      shareCopy.hidden = false;
      shareCopy.disabled = false;
      shareCopy.dataset.shareUrl = shareUrl;
    } else {
      shareCopy.hidden = true;
      shareCopy.disabled = true;
      delete shareCopy.dataset.shareUrl;
    }
  }

  if (shareQrButton) {
    if (shareUrl) {
      shareQrButton.hidden = false;
      shareQrButton.disabled = false;
      shareQrButton.dataset.shareUrl = shareUrl;
    } else {
      shareQrButton.hidden = true;
      shareQrButton.disabled = true;
      delete shareQrButton.dataset.shareUrl;
    }
  }

  if (shareEmail) {
    if (shareUrl) {
      shareEmail.hidden = false;
      shareEmail.dataset.shareUrl = shareUrl;
      shareEmail.dataset.shareMessage = shareMessage;
      shareEmail.dataset.shareCount = String(count);
      if (shareEmailFeedback) {
        shareEmailFeedback.hidden = true;
        shareEmailFeedback.textContent = '';
        shareEmailFeedback.removeAttribute('data-tone');
      }
    } else {
      shareEmail.hidden = true;
      delete shareEmail.dataset.shareUrl;
      delete shareEmail.dataset.shareMessage;
      delete shareEmail.dataset.shareCount;
      if (shareEmailInput) {
        shareEmailInput.value = '';
      }
      if (shareEmailFeedback) {
        shareEmailFeedback.hidden = true;
        shareEmailFeedback.textContent = '';
        shareEmailFeedback.removeAttribute('data-tone');
      }
    }
  }

  if (!shareUrl) {
    showShareFeedback(elements, '');
  }
}

function updateViewText(state, elements) {
  const { info, lead, showAllButton } = elements;
  if (!info || !lead || !showAllButton) {
    return;
  }

  if (state.viewMode === 'shared' && state.receivedLikes.size > 0) {
    info.textContent = 'Partner wybrał dla Was te pozycje na dziś.';
    lead.textContent = 'Kliknij poniższy przycisk, aby zobaczyć wszystkie propozycje i wysłać swoje typy.';
    showAllButton.hidden = false;
  } else {
    if (state.receivedLikes.size > 0 && state.previousLikes.size > 0) {
      info.textContent = 'Macie już swoje typy. Zaznacz, co podoba Ci się najbardziej i wyślij odpowiedź.';
    } else if (state.receivedLikes.size > 0) {
      info.textContent = 'Zobacz propozycje partnera i dodaj własne inspiracje.';
    } else {
      info.textContent = 'Zainspirujcie się i wybierzcie ulubione propozycje na wspólny wieczór.';
    }
    lead.textContent = 'Oglądajcie zdjęcia, klikajcie w serduszka i wybierzcie, co najbardziej Was kręci.';
    showAllButton.hidden = true;
  }
}

function updateSummary(state, elements) {
  const {
    summaryContainer,
    summaryCommon,
    summaryCommonList,
    summaryPartner,
    summaryPartnerList,
  } = elements;

  if (!summaryContainer || !summaryCommonList || !summaryPartnerList) {
    return;
  }

  const partnerLikes = state.receivedLikes || new Set();
  const myLikes = state.myLikes || new Set();

  if (partnerLikes.size === 0 || myLikes.size === 0) {
    summaryContainer.hidden = true;
    summaryCommonList.innerHTML = '';
    summaryPartnerList.innerHTML = '';
    return;
  }

  const partnerIds = Array.from(partnerLikes);
  const commonIds = partnerIds.filter((id) => myLikes.has(id));
  const partnerOnlyIds = partnerIds.filter((id) => !myLikes.has(id));

  if (commonIds.length === 0 && partnerOnlyIds.length === 0) {
    summaryContainer.hidden = true;
    summaryCommonList.innerHTML = '';
    summaryPartnerList.innerHTML = '';
    return;
  }

  const getTitle = (id) => state.positionById.get(id)?.title || formatTitle(id);

  const fillList = (target, ids) => {
    target.innerHTML = '';
    if (ids.length === 0) {
      return;
    }
    const fragment = document.createDocumentFragment();
    ids.forEach((entry) => {
      const item = document.createElement('li');
      item.textContent = getTitle(entry);
      fragment.appendChild(item);
    });
    target.appendChild(fragment);
  };

  summaryContainer.hidden = false;

  if (commonIds.length > 0) {
    summaryCommon.hidden = false;
    fillList(summaryCommonList, commonIds);
  } else {
    summaryCommon.hidden = true;
    summaryCommonList.innerHTML = '';
  }

  if (partnerOnlyIds.length > 0) {
    summaryPartner.hidden = false;
    fillList(summaryPartnerList, partnerOnlyIds);
  } else {
    summaryPartner.hidden = true;
    summaryPartnerList.innerHTML = '';
  }

  if (summaryCommon.hidden && summaryPartner.hidden) {
    summaryContainer.hidden = true;
  }
}

function renderPositions(state, elements) {
  const { grid, empty } = elements;
  const cardElements = new Map();
  let items;

  if (state.viewMode === 'shared' && state.receivedLikes.size > 0) {
    const partnerLiked = state.allPositions.filter((item) => state.receivedLikes.has(item.id));
    if (state.myLikes.size > 0) {
      const common = partnerLiked.filter((item) => state.myLikes.has(item.id));
      const partnerOnly = partnerLiked.filter((item) => !state.myLikes.has(item.id));
      items = [...common, ...partnerOnly];
    } else {
      items = partnerLiked;
    }
  } else {
    items = state.allPositions.slice();
  }

  grid.innerHTML = '';

  if (items.length === 0) {
    empty.hidden = false;
    return cardElements;
  }

  empty.hidden = true;
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const card = createPositionCard(item);
    fragment.appendChild(card);
    const likeButton = card.querySelector('[data-role="like-button"]');
    const partnerNote = card.querySelector('[data-role="partner-note"]');
    cardElements.set(item.id, { card, likeButton, partnerNote });
  });

  grid.appendChild(fragment);

  cardElements.forEach((entry, id) => {
    entry.likeButton.addEventListener('click', () => {
      if (state.myLikes.has(id)) {
        state.myLikes.delete(id);
      } else {
        state.myLikes.add(id);
      }
      updateCardState(cardElements, id, state);
      updateShareState(state, elements);
      updateSummary(state, elements);
    });
    updateCardState(cardElements, id, state);
  });

  return cardElements;
}

function initializeCopyButton(elements) {
  const { shareCopy } = elements;
  if (!shareCopy) {
    return;
  }
  shareCopy.addEventListener('click', async () => {
    const shareUrl = shareCopy.dataset.shareUrl;
    if (!shareUrl) {
      return;
    }
    const success = await copyToClipboard(shareUrl);
    if (success) {
      showShareFeedback(elements, 'Skopiowano link do schowka.');
    } else {
      showShareFeedback(
        elements,
        'Nie udało się skopiować linku. Skopiuj go ręcznie.',
        'error',
      );
    }
  });
}

function initializeQrControls(elements) {
  const { shareQrButton, shareQrModal, shareQrImage, shareQrUrl, shareQrClose } = elements;
  if (!shareQrModal || !shareQrImage || !shareQrUrl) {
    return;
  }

  const closeModal = () => {
    shareQrModal.hidden = true;
    shareQrModal.setAttribute('aria-hidden', 'true');
    shareQrImage.removeAttribute('src');
    shareQrUrl.removeAttribute('href');
  };

  const openModal = () => {
    const shareUrl = shareQrButton?.dataset.shareUrl;
    if (!shareUrl) {
      return;
    }
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}`;
    shareQrImage.src = qrSrc;
    shareQrUrl.href = shareUrl;
    shareQrModal.hidden = false;
    shareQrModal.setAttribute('aria-hidden', 'false');
  };

  shareQrButton?.addEventListener('click', () => {
    openModal();
  });

  shareQrClose?.addEventListener('click', () => {
    closeModal();
  });

  shareQrModal.addEventListener('click', (event) => {
    if (event.target === shareQrModal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !shareQrModal.hidden) {
      closeModal();
    }
  });
}

function initializeEmailForm(elements) {
  const { shareEmail, shareEmailInput, shareEmailFeedback } = elements;
  if (!shareEmail || !shareEmailInput) {
    return;
  }

  const submitButton = shareEmail.querySelector('button[type="submit"]');

  shareEmail.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!shareEmailInput.checkValidity()) {
      shareEmailInput.reportValidity();
      return;
    }

    const email = shareEmailInput.value.trim();
    const shareUrl = shareEmail.dataset.shareUrl;
    const shareMessage = shareEmail.dataset.shareMessage || '';
    const shareCount = Number.parseInt(shareEmail.dataset.shareCount || '0', 10) || 0;

    if (!email || !shareUrl) {
      return;
    }

    if (shareEmailFeedback) {
      shareEmailFeedback.hidden = false;
      shareEmailFeedback.textContent = 'Wysyłamy wiadomość…';
      shareEmailFeedback.removeAttribute('data-tone');
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const response = await postJson(EMAIL_ENDPOINT, {
        partner_email: email,
        share_url: shareUrl,
        message: shareMessage,
        like_count: shareCount,
        subject: EMAIL_SUBJECT,
      });

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

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle(document.getElementById('theme-toggle'));

  const params = new URLSearchParams(window.location.search);
  const receivedLikes = decodeLikes(params.get('likes'));
  const previousLikes = decodeLikes(params.get('partner'));

  const accessResult = ensureAccess(receivedLikes.size, previousLikes.size);
  if (!accessResult.allowed) {
    return;
  }

  const state = {
    allPositions: [],
    positionById: new Map(),
    receivedLikes,
    previousLikes,
    myLikes: previousLikes.size > 0 ? new Set(previousLikes) : new Set(),
    viewMode: 'all',
  };

  const requestedView = params.get('view');
  if (requestedView === 'shared' && receivedLikes.size > 0) {
    state.viewMode = 'shared';
  } else if (accessResult.fromShare && receivedLikes.size > 0) {
    state.viewMode = 'shared';
  }

  const elements = {
    grid: document.getElementById('positions-grid'),
    empty: document.getElementById('positions-empty'),
    info: document.getElementById('positions-info'),
    lead: document.getElementById('positions-lead'),
    showAllButton: document.getElementById('show-all-button'),
    summaryContainer: document.getElementById('positions-summary'),
    summaryCommon: document.getElementById('positions-summary-common'),
    summaryCommonList: document.getElementById('positions-summary-common-list'),
    summaryPartner: document.getElementById('positions-summary-partner'),
    summaryPartnerList: document.getElementById('positions-summary-partner-list'),
    shareHint: document.getElementById('share-hint'),
    shareCount: document.getElementById('share-count'),
    shareLinks: document.getElementById('share-links'),
    shareFeedback: document.getElementById('share-feedback'),
    shareCopy: document.getElementById('share-copy'),
    shareEmail: document.getElementById('share-email'),
    shareEmailInput: document.getElementById('share-email-input'),
    shareEmailFeedback: document.getElementById('share-email-feedback'),
    shareBar: document.getElementById('share-bar'),
    shareOpenButton: document.getElementById('share-open'),
    shareLayer: document.getElementById('share-layer'),
    shareCard: document.getElementById('share-card'),
    shareCloseButton: document.getElementById('share-close'),
    shareBackdrop: document.getElementById('share-backdrop'),
    shareQrButton: document.getElementById('share-show-qr'),
    shareQrModal: document.getElementById('share-qr-modal'),
    shareQrImage: document.getElementById('share-qr-image'),
    shareQrUrl: document.getElementById('share-qr-url'),
    shareQrClose: document.getElementById('share-qr-close'),
  };

  if (!elements.grid || !elements.empty) {
    console.error('Brak elementów interfejsu gry.');
    return;
  }

  initializeShareSheet(elements);
  updateViewText(state, elements);
  initializeCopyButton(elements);
  initializeQrControls(elements);
  initializeEmailForm(elements);

  try {
    const payload = await getJson(LIST_ENDPOINT);
    if (!payload?.ok || !Array.isArray(payload.files)) {
      throw new Error(payload?.error || 'Nie udało się pobrać listy pozycji.');
    }
    state.allPositions = payload.files.map((src) => {
      const id = normalizeId(src);
      const encodedSrc = normaliseAssetPath(src);
      return {
        id,
        src: encodedSrc,
        rawSrc: src,
        title: formatTitle(id),
      };
    });
    state.positionById = new Map(state.allPositions.map((item) => [item.id, item]));
  } catch (error) {
    console.error(error);
    elements.empty.hidden = false;
    elements.empty.textContent = 'Nie udało się wczytać pozycji. Odśwież stronę i spróbuj ponownie.';
    return;
  }

  if (state.receivedLikes.size > 0 || state.previousLikes.size > 0) {
    const availableIds = new Set(state.allPositions.map((item) => item.id));
    if (state.receivedLikes.size > 0) {
      state.receivedLikes = new Set(Array.from(state.receivedLikes).filter((id) => availableIds.has(id)));
    }
    if (state.previousLikes.size > 0) {
      state.previousLikes = new Set(Array.from(state.previousLikes).filter((id) => availableIds.has(id)));
      if (state.myLikes.size > 0) {
        state.myLikes = new Set(Array.from(state.myLikes).filter((id) => availableIds.has(id)));
      }
    }
  }

  let cardElements = renderPositions(state, elements);
  updateShareState(state, elements);
  updateSummary(state, elements);

  if (elements.showAllButton) {
    elements.showAllButton.addEventListener('click', () => {
      state.viewMode = 'all';
      updateViewText(state, elements);
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'all');
      if (state.receivedLikes.size > 0) {
        url.searchParams.set('likes', encodeLikes(state.receivedLikes));
      } else {
        url.searchParams.delete('likes');
      }
      if (state.previousLikes.size > 0) {
        url.searchParams.set('partner', encodeLikes(state.previousLikes));
      } else {
        url.searchParams.delete('partner');
      }
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      cardElements = renderPositions(state, elements);
      updateShareState(state, elements);
      updateSummary(state, elements);
    });
  }
});
