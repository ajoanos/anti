import { postJson } from './app.js';

const CONFIG_URL = 'assets/data/plan-wieczoru.json';
const ACCESS_KEY = 'momenty.planWieczoru.access';
const MAIL_ENDPOINT = 'api/send_plan_email.php';
const HISTORY_ENDPOINT = 'api/plan_history.php';

const state = {
  config: null,
  currentStepIndex: 0,
  selections: new Map(),
  randomNotes: new Map(),
  roomKey: '',
  participantId: null,
  displayName: '',
  baseUrl: '',
  origin: '',
  history: [],
};

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);

  if (params.has('auto')) {
    sessionStorage.setItem(ACCESS_KEY, 'true');
  }

  if (sessionStorage.getItem(ACCESS_KEY) !== 'true') {
    const legacyKey = 'pary.access.pdp';
    if (sessionStorage.getItem(legacyKey) === 'true') {
      sessionStorage.setItem(ACCESS_KEY, 'true');
    }
  }

  if (sessionStorage.getItem(ACCESS_KEY) !== 'true') {
    window.location.replace('plan-wieczoru.html');
    return;
  }

  const roomKeyParam = (params.get('room_key') || '').toUpperCase();
  const participantParam = params.get('pid') || '';
  const participantId = Number.parseInt(participantParam, 10);
  if (!roomKeyParam || Number.isNaN(participantId) || participantId <= 0) {
    window.location.replace('plan-wieczoru-room.html');
    return;
  }

  state.roomKey = roomKeyParam;
  state.participantId = participantId;
  state.displayName = (params.get('name') || '').trim();

  if (params.has('auto') && window.history.replaceState) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('auto');
    window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }

  try {
    const currentUrl = new URL(window.location.href);
    const basePath = currentUrl.pathname.replace(/[^/]*$/, '');
    state.baseUrl = `${currentUrl.origin}${basePath}`;
    state.origin = currentUrl.origin;
  } catch (error) {
    state.baseUrl = '';
    state.origin = '';
  }

  const loader = document.getElementById('plan-loader');
  const errorBox = document.getElementById('plan-error');

  try {
    const response = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Nie udało się pobrać konfiguracji zabawy.');
    }
    const config = await response.json();
    if (!config || !Array.isArray(config.steps)) {
      throw new Error('Niepoprawna struktura konfiguracji.');
    }
    state.config = config;
    loader?.setAttribute('hidden', '');
    initializePlan(config);
    loadPlanHistory();
  } catch (error) {
    console.error(error);
    loader?.setAttribute('hidden', '');
    if (errorBox) {
      errorBox.textContent = error.message || 'Wystąpił nieoczekiwany błąd.';
      errorBox.hidden = false;
    }
  }
});

function initializePlan(config) {
  const flow = document.getElementById('plan-flow');
  const summary = document.getElementById('plan-summary');
  const nextButton = document.getElementById('plan-next');
  const backButton = document.getElementById('plan-back');
  const summaryTitle = document.getElementById('plan-summary-title');
  const summarySubtitle = document.getElementById('plan-summary-subtitle');
  const summaryForm = document.getElementById('plan-summary-form');
  const resetButton = document.getElementById('plan-reset');
  const sendButton = document.getElementById('plan-send');

  if (!flow || !nextButton || !backButton || !summary || !summaryForm || !resetButton) {
    return;
  }

  if (config.summary?.title) {
    summaryTitle.textContent = config.summary.title;
  }
  if (config.summary?.subtitle) {
    summarySubtitle.textContent = config.summary.subtitle;
  }
  if (config.summary?.buttonLabel && sendButton instanceof HTMLButtonElement) {
    sendButton.textContent = config.summary.buttonLabel;
  }

  flow.hidden = false;
  summary.hidden = true;
  state.currentStepIndex = 0;
  state.selections.clear();
  state.randomNotes.clear();

  renderCurrentStep();
  updateNavigationButtons();

  nextButton.addEventListener('click', () => {
    if (isOnLastStep()) {
      showSummary();
      return;
    }
    state.currentStepIndex += 1;
    renderCurrentStep();
    updateNavigationButtons();
  });

  backButton.addEventListener('click', () => {
    if (state.currentStepIndex === 0) {
      return;
    }
    state.currentStepIndex -= 1;
    renderCurrentStep();
    updateNavigationButtons();
  });

  summaryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendPlanEmail(summaryForm);
  });

  resetButton.addEventListener('click', () => {
    flow.hidden = false;
    summary.hidden = true;
    state.currentStepIndex = 0;
    state.selections.clear();
    state.randomNotes.clear();
    const historyError = document.getElementById('plan-history-error');
    if (historyError) {
      historyError.hidden = true;
    }
    loadPlanHistory();
    const feedback = document.getElementById('plan-summary-feedback');
    if (feedback) {
      feedback.textContent = '';
    }
    const form = document.getElementById('plan-summary-form');
    if (form) {
      form.reset();
      form.querySelectorAll('input, button').forEach((element) => {
        element.disabled = false;
      });
    }
    renderCurrentStep();
    updateNavigationButtons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function renderCurrentStep() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const stepContainer = document.getElementById('plan-step');
  const progress = document.getElementById('plan-progress');
  const nextButton = document.getElementById('plan-next');

  if (!state.config || !stepContainer || !progress || !nextButton) {
    return;
  }

  const steps = state.config.steps;
  const step = steps[state.currentStepIndex];
  if (!step) {
    return;
  }

  progress.textContent = `Krok ${state.currentStepIndex + 1} z ${steps.length}`;

  const previouslySelected = state.selections.get(step.id);
  const note = state.randomNotes.get(step.id) || '';

  stepContainer.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'game-step__header';

  const title = document.createElement('h3');
  title.className = 'game-step__title';
  title.textContent = step.title;
  header.appendChild(title);
  stepContainer.appendChild(header);

  const optionsList = document.createElement('div');
  optionsList.className = 'game-options';
  optionsList.setAttribute('role', 'group');

  step.options.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game-option';
    button.dataset.optionId = option.id;
    button.textContent = option.label;
    button.setAttribute('aria-pressed', String(isOptionSelected(step, option, previouslySelected)));
    if (isOptionSelected(step, option, previouslySelected)) {
      button.classList.add('game-option--selected');
    }

    button.addEventListener('click', () => {
      handleOptionSelection(step, option);
    });

    optionsList.appendChild(button);
  });

  stepContainer.appendChild(optionsList);

  if (step.allowCustomInput) {
    const customWrapper = document.createElement('div');
    customWrapper.className = 'game-step__custom';

    const customLabel = document.createElement('label');
    customLabel.className = 'game-step__custom-label';
    customLabel.setAttribute('for', `plan-custom-${step.id}`);
    customLabel.textContent = 'Masz inną propozycję?';

    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.id = `plan-custom-${step.id}`;
    customInput.className = 'game-step__input';
    customInput.placeholder = step.inputPlaceholder || 'Wpisz własną odpowiedź';
    if (previouslySelected && previouslySelected.isCustom) {
      customInput.value = previouslySelected.label || '';
    }

    customInput.addEventListener('input', () => {
      handleCustomInput(step, customInput);
    });

    customWrapper.appendChild(customLabel);
    customWrapper.appendChild(customInput);
    stepContainer.appendChild(customWrapper);
  }

  const noteElement = document.createElement('p');
  noteElement.className = 'game-step__note';
  noteElement.id = `plan-step-note-${step.id}`;
  noteElement.textContent = note;
  noteElement.hidden = note === '';
  stepContainer.appendChild(noteElement);

  updateNextButtonState(step, nextButton);
}

function updateNextButtonState(step, button) {
  if (!button) return;
  const selection = state.selections.get(step.id);
  if (step.type === 'multi') {
    const values = Array.isArray(selection) ? selection : [];
    button.disabled = values.length === 0;
  } else {
    if (selection && selection.isCustom) {
      button.disabled = !selection.label;
    } else {
      button.disabled = !selection;
    }
  }
  button.textContent = isOnLastStep() ? 'Zakończ' : 'Dalej';
}

function handleOptionSelection(step, option) {
  const isRandom = Boolean(option.isRandom);
  const noteId = `plan-step-note-${step.id}`;
  const noteElement = document.getElementById(noteId);

  if (step.type === 'multi') {
    const current = state.selections.get(step.id) || [];
    const next = toggleMultiOption(current, option);
    state.selections.set(step.id, next);
    updateOptionButtons(step);
    const nextButton = document.getElementById('plan-next');
    if (nextButton) {
      updateNextButtonState(step, nextButton);
    }
    return;
  }

  if (isRandom) {
    const available = step.options.filter((item) => !item.isRandom);
    if (available.length === 0) {
      return;
    }
    const randomIndex = Math.floor(Math.random() * available.length);
    const selected = available[randomIndex];
    state.selections.set(step.id, {
      id: selected.id,
      label: selected.label,
      emailContext: selected.emailContext,
    });
    state.randomNotes.set(step.id, `Wylosowano: ${selected.label}`);
    if (noteElement) {
      noteElement.textContent = `Wylosowano: ${selected.label}`;
      noteElement.hidden = false;
    }
  } else {
    state.selections.set(step.id, {
      id: option.id,
      label: option.label,
      emailContext: option.emailContext,
    });
    state.randomNotes.delete(step.id);
    if (step.allowCustomInput) {
      const customInput = document.getElementById(`plan-custom-${step.id}`);
      if (customInput instanceof HTMLInputElement) {
        customInput.value = '';
      }
    }
    if (noteElement) {
      noteElement.textContent = '';
      noteElement.hidden = true;
    }
  }

  updateOptionButtons(step);
  const nextButton = document.getElementById('plan-next');
  if (nextButton) {
    updateNextButtonState(step, nextButton);
  }
}

function toggleMultiOption(current, option) {
  const list = Array.isArray(current) ? [...current] : [];
  const existingIndex = list.findIndex((item) => item.id === option.id);
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  } else {
    list.push({ id: option.id, label: option.label });
  }
  return list;
}

function updateOptionButtons(step) {
  const stepContainer = document.getElementById('plan-step');
  if (!stepContainer) return;
  const selection = state.selections.get(step.id);

  stepContainer.querySelectorAll('.game-option').forEach((button) => {
    const optionId = button.dataset.optionId;
    const isSelected = step.type === 'multi'
      ? Array.isArray(selection) && selection.some((item) => item.id === optionId)
      : selection && selection.id === optionId;

    button.classList.toggle('game-option--selected', Boolean(isSelected));
    button.setAttribute('aria-pressed', String(Boolean(isSelected)));
  });
}

function handleCustomInput(step, input) {
  const value = input.value.trim();

  if (step.type === 'multi') {
    const current = state.selections.get(step.id);
    const list = Array.isArray(current) ? [...current] : [];
    const existingIndex = list.findIndex((item) => item.isCustom);

    if (value !== '') {
      const customItem = {
        id: `${step.id}-custom`,
        label: value,
        isCustom: true,
      };
      if (existingIndex >= 0) {
        list[existingIndex] = customItem;
      } else {
        list.push(customItem);
      }
      state.selections.set(step.id, list);
    } else if (existingIndex >= 0) {
      list.splice(existingIndex, 1);
      state.selections.set(step.id, list);
    } else if (Array.isArray(current)) {
      state.selections.set(step.id, list);
    }
  } else if (value !== '') {
    state.selections.set(step.id, {
      id: `${step.id}-custom`,
      label: value,
      isCustom: true,
    });
    state.randomNotes.delete(step.id);
  } else {
    const current = state.selections.get(step.id);
    if (current && current.isCustom) {
      state.selections.delete(step.id);
    }
  }

  updateOptionButtons(step);
  const nextButton = document.getElementById('plan-next');
  if (nextButton) {
    updateNextButtonState(step, nextButton);
  }
}

function isOptionSelected(step, option, selection) {
  if (!selection) return false;
  if (step.type === 'multi') {
    return Array.isArray(selection) && selection.some((item) => item.id === option.id);
  }
  if (selection.id) {
    return selection.id === option.id;
  }
  return selection === option.id;
}

function updateNavigationButtons() {
  const backButton = document.getElementById('plan-back');
  const nextButton = document.getElementById('plan-next');
  if (!state.config || !backButton || !nextButton) {
    return;
  }
  backButton.disabled = state.currentStepIndex === 0;
  const step = state.config.steps[state.currentStepIndex];
  if (step) {
    updateNextButtonState(step, nextButton);
  }
}

function isOnLastStep() {
  if (!state.config) return false;
  return state.currentStepIndex === state.config.steps.length - 1;
}

function showSummary() {
  const flow = document.getElementById('plan-flow');
  const summary = document.getElementById('plan-summary');
  const summaryList = document.getElementById('plan-summary-list');
  const summaryTitle = document.getElementById('plan-summary-title');
  const feedback = document.getElementById('plan-summary-feedback');
  const form = document.getElementById('plan-summary-form');

  if (!state.config || !flow || !summary || !summaryList || !summaryTitle) {
    return;
  }

  const summaryData = buildSummaryData();
  summaryList.innerHTML = '';

  summaryData.forEach((item) => {
    const dt = document.createElement('dt');
    dt.className = 'game-summary__term';
    dt.textContent = item.term;

    const dd = document.createElement('dd');
    dd.className = 'game-summary__description';
    dd.textContent = item.description;

    summaryList.appendChild(dt);
    summaryList.appendChild(dd);
  });

  flow.hidden = true;
  summary.hidden = false;
  if (feedback) {
    feedback.textContent = '';
  }
  if (form) {
    form.querySelectorAll('input, button').forEach((element) => {
      element.disabled = false;
    });
  }
  const scrollTarget = form || summary;
  if (scrollTarget) {
    requestAnimationFrame(() => {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function buildSummaryData() {
  const labels = {
    mood: 'Na jaki wieczór masz dziś ochotę?',
    closeness: 'Jakiej bliskości dziś potrzebujesz?',
    extras: 'Co stworzy idealny klimat?',
    energy: 'Jak tam dziś Twoja forma?',
    timing: 'Kiedy chcesz żebyśmy zaczęli?',
  };

  const summary = [];

  const mood = state.selections.get('mood');
  if (mood) {
    summary.push({ term: labels.mood, description: mood.label });
  }

  const closeness = state.selections.get('closeness');
  if (closeness) {
    summary.push({ term: labels.closeness, description: closeness.label });
  }

  const extras = state.selections.get('extras');
  if (Array.isArray(extras)) {
    summary.push({ term: labels.extras, description: extras.length ? extras.map((item) => item.label).join(', ') : 'Brak dodatków' });
  }

  const energy = state.selections.get('energy');
  if (energy) {
    summary.push({ term: labels.energy, description: energy.label });
  }

  const timing = state.selections.get('timing');
  if (timing) {
    summary.push({ term: labels.timing, description: timing.label });
  }

  return summary;
}

async function sendPlanEmail(form) {
  const emailInput = document.getElementById('plan-partner-email');
  const yourEmailInput = document.getElementById('plan-your-email');
  const sendButton = document.getElementById('plan-send');
  const feedback = document.getElementById('plan-summary-feedback');

  if (!emailInput || !yourEmailInput || !sendButton || !feedback || !state.config) {
    return;
  }

  const yourEmail = yourEmailInput.value.trim();
  const email = emailInput.value.trim();

  if (!yourEmail) {
    feedback.textContent = 'Podaj adres e-mail, na który chcesz otrzymywać odpowiedź partnera.';
    return;
  }

  if (!email) {
    feedback.textContent = 'Podaj adres e-mail partnera.';
    return;
  }

  if (!state.roomKey || !state.participantId) {
    feedback.textContent = 'Brakuje informacji o pokoju. Wróć do ekranu początkowego.';
    return;
  }

  sendButton.disabled = true;
  feedback.textContent = 'Wysyłamy wiadomość…';

  const baseDetailsLink = state.baseUrl
    ? `${state.baseUrl}plan-wieczoru-play.html`
    : `${window.location.origin}/pary-mvp/plan-wieczoru-play.html`;
  const baseProposalLink = state.baseUrl
    ? `${state.baseUrl}plan-wieczoru-room.html`
    : `${window.location.origin}/pary-mvp/plan-wieczoru-room.html`;
  const origin = state.origin || window.location.origin;

  const payload = {
    partner_email: email,
    sender_email: yourEmail,
    sender_name: state.displayName,
    room_key: state.roomKey,
    participant_id: state.participantId,
    mood: state.selections.get('mood')?.label || '',
    closeness: state.selections.get('closeness')?.label || '',
    extras: (state.selections.get('extras') || []).map((item) => item.label),
    energy: state.selections.get('energy')?.label || '',
    energyContext: state.selections.get('energy')?.emailContext || '',
    timing: state.selections.get('timing')?.label || '',
    link: state.config.email?.detailsLink || state.config.email?.link || baseDetailsLink,
    proposal_link: state.config.email?.proposalLink || baseProposalLink,
    subject: state.config.email?.subject || 'Wieczór we dwoje – krótki plan 💛',
    origin,
    base_url: state.baseUrl,
  };

  try {
    const response = await postJson(MAIL_ENDPOINT, payload);
    if (!response.ok) {
      throw new Error(response.error || 'Nie udało się wysłać wiadomości.');
    }
    feedback.textContent = 'Plan wysłany! Partner otrzyma linki „Zgadzam się” i „Nie zgadzam się”. Powiadomimy Cię e-mailem, gdy odpowie.';
    sendButton.disabled = true;
    form.querySelectorAll('input, button').forEach((element) => {
      if (element instanceof HTMLButtonElement && element.id === 'plan-reset') {
        element.disabled = false;
        return;
      }
      if (element instanceof HTMLButtonElement) {
        element.disabled = true;
      }
      if (element instanceof HTMLInputElement) {
        element.disabled = true;
      }
    });
    loadPlanHistory();
  } catch (error) {
    console.error(error);
    feedback.textContent = error.message || 'Nie udało się wysłać wiadomości.';
    sendButton.disabled = false;
  }
}

async function loadPlanHistory() {
  if (!state.roomKey || !state.participantId) {
    return;
  }

  const section = document.getElementById('plan-history');
  const list = document.getElementById('plan-history-list');
  const emptyState = document.getElementById('plan-history-empty');
  const errorState = document.getElementById('plan-history-error');

  if (!section || !list || !emptyState || !errorState) {
    return;
  }

  errorState.hidden = true;

  try {
    const response = await postJson(HISTORY_ENDPOINT, {
      room_key: state.roomKey,
      participant_id: state.participantId,
    });

    if (!response.ok) {
      throw new Error(response.error || 'Nie udało się pobrać historii.');
    }

    const invites = Array.isArray(response.invites) ? response.invites : [];
    state.history = invites;
    renderPlanHistory(invites, { section, list, emptyState });
  } catch (error) {
    console.error(error);
    list.innerHTML = '';
    emptyState.hidden = true;
    errorState.hidden = false;
    section.hidden = false;
  }
}

function renderPlanHistory(invites, elements) {
  const { section, list, emptyState } = elements;
  list.innerHTML = '';

  if (!invites.length) {
    emptyState.hidden = false;
    section.hidden = false;
    return;
  }

  emptyState.hidden = true;

  invites.forEach((invite) => {
    const item = document.createElement('li');
    item.className = 'plan-history__item';

    const status = document.createElement('div');
    status.className = `plan-history__status plan-history__status--${invite.status || 'pending'}`;
    status.textContent = historyStatusLabel(invite.status);

    const meta = document.createElement('div');
    meta.className = 'plan-history__meta';
    const sender = document.createElement('span');
    sender.textContent = invite.sender || 'Nieznana osoba';
    const createdAt = document.createElement('span');
    createdAt.textContent = formatHistoryDate(invite.created_at);
    meta.appendChild(sender);
    if (invite.created_at) {
      meta.appendChild(createdAt);
    }

    item.appendChild(status);
    item.appendChild(meta);

    const summary = document.createElement('ul');
    summary.className = 'plan-history__summary';
    summary.appendChild(buildSummaryRow('Na jaki wieczór masz dziś ochotę?', invite.mood));
    summary.appendChild(buildSummaryRow('Jakiej bliskości dziś potrzebujesz?', invite.closeness));
    summary.appendChild(buildSummaryRow('Co stworzy idealny klimat?', formatExtras(invite.extras)));
    summary.appendChild(buildSummaryRow('Jak tam dziś Twoja forma?', invite.energy));
    summary.appendChild(buildSummaryRow('Kiedy chcesz żebyśmy zaczęli?', invite.start_time));

    item.appendChild(summary);

    if (invite.energy_context) {
      const note = document.createElement('p');
      note.className = 'plan-history__note';
      note.textContent = invite.energy_context;
      item.appendChild(note);
    }

    list.appendChild(item);
  });

  section.hidden = false;
}

function buildSummaryRow(label, value) {
  const row = document.createElement('li');
  const labelEl = document.createElement('span');
  labelEl.className = 'plan-history__label';
  labelEl.textContent = `${label}:`;
  const valueEl = document.createElement('span');
  valueEl.textContent = value && value.length ? value : '—';
  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

function historyStatusLabel(status) {
  switch (status) {
    case 'accepted':
      return 'Plan zaakceptowany';
    case 'declined':
      return 'Plan do poprawy';
    default:
      return 'Oczekuje na odpowiedź';
  }
}

function formatExtras(extras) {
  if (Array.isArray(extras) && extras.length) {
    return extras.join(', ');
  }
  return 'Brak dodatków';
}

function formatHistoryDate(value) {
  if (!value) {
    return '';
  }
  try {
    const isoCandidate = value.includes('T') ? value : value.replace(' ', 'T');
    const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(isoCandidate);
    const normalized = hasOffset ? isoCandidate : `${isoCandidate}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat('pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch (error) {
    console.error(error);
    return '';
  }
}
