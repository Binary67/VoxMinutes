const { escapeHtml, renderDefaultTags, initializeSmartScrollbars, refreshScrollableState } =
  window.uiShared;

const meetingVisuals = Object.freeze({
  accent: '#0a84ff',
  iconBg: '#eaf4ff',
  icon: 'bi-record-circle-fill',
  category: 'Recording',
});

const dashboardState = {
  meetings: [],
  searchQuery: '',
  loadErrorMessage: '',
};

const modalState = {
  isOpen: false,
  lastFocusedElement: null,
};

const tagList = document.getElementById('tag-list');
const meetingsGrid = document.getElementById('meetings-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');

const newRecordingButton = document.getElementById('new-recording-btn');
const modalBackdrop = document.getElementById('new-recording-modal-backdrop');
const modalElement = document.getElementById('new-recording-modal');
const newRecordingForm = document.getElementById('new-recording-form');
const meetingTitleInput = document.getElementById('meeting-title-input');
const meetingParticipantsInput = document.getElementById('meeting-participants-input');
const modalCancelButton = document.getElementById('meeting-modal-cancel-btn');

function hasRecordingApi() {
  return Boolean(
    window.recordingApi && typeof window.recordingApi.listTranscriptSessions === 'function'
  );
}

function normalizeParticipantCount(value) {
  const numericValue = Number.parseInt(value, 10);
  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return 1;
  }
  return numericValue;
}

function formatParticipantLabel(participantCount) {
  const normalizedCount = normalizeParticipantCount(participantCount);
  return `${normalizedCount} ${normalizedCount === 1 ? 'person' : 'people'}`;
}

function formatMeetingDate(dateValue) {
  if (typeof dateValue === 'string') {
    const parsedDate = new Date(dateValue);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }

  return 'Unknown date';
}

function formatMeetingDuration(durationSec) {
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) {
    return '--';
  }

  const totalSeconds = Math.round(durationSec);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }

  if (minutes > 0) {
    return `${minutes} min`;
  }

  return `${seconds} sec`;
}

function getFallbackSummary() {
  return 'Transcript captured. Open to view details.';
}

function createMeetingCard(meeting) {
  const title = escapeHtml(String(meeting.meetingTitle || 'Untitled meeting'));
  const date = escapeHtml(formatMeetingDate(meeting.updatedAt));
  const duration = escapeHtml(formatMeetingDuration(meeting.durationSec));
  const summary = escapeHtml(String(meeting.meetingSummary || '').trim() || getFallbackSummary());
  const participantLabel = escapeHtml(formatParticipantLabel(meeting.participantCount));
  const category = escapeHtml(meetingVisuals.category);

  return `
    <article class="meeting-card" style="--accent: ${escapeHtml(meetingVisuals.accent)}; --icon-bg: ${escapeHtml(meetingVisuals.iconBg)};">
      <div class="meeting-top">
        <div class="meeting-icon">
          <i class="bi ${escapeHtml(meetingVisuals.icon)}"></i>
        </div>
        <button type="button" class="icon-button" aria-label="Meeting options">
          <i class="bi bi-three-dots-vertical"></i>
        </button>
      </div>

      <div>
        <h3 class="meeting-title">${title}</h3>
        <p class="meeting-meta">${date} | ${duration}</p>
      </div>

      <div class="summary-box">
        <p class="summary-badge">
          <i class="bi bi-stars"></i>
          <span>TRANSCRIPT SNAPSHOT</span>
        </p>
        <p class="summary-text">${summary}</p>
      </div>

      <div class="meeting-footer">
        <span class="participants-count">
          <i class="bi bi-people-fill" aria-hidden="true"></i>
          <span>${participantLabel}</span>
        </span>
        <span class="category-pill">${category}</span>
      </div>
    </article>
  `;
}

function getMeetingSearchTarget(meeting) {
  return `${meeting.meetingTitle || ''} ${meeting.meetingSummary || ''} ${meetingVisuals.category}`.toLowerCase();
}

function getFilteredMeetings() {
  if (!dashboardState.searchQuery) {
    return dashboardState.meetings;
  }

  return dashboardState.meetings.filter((meeting) =>
    getMeetingSearchTarget(meeting).includes(dashboardState.searchQuery)
  );
}

function updateEmptyState(filteredMeetings) {
  if (filteredMeetings.length > 0) {
    emptyState.hidden = true;
    return;
  }

  if (dashboardState.loadErrorMessage) {
    emptyState.textContent = dashboardState.loadErrorMessage;
  } else if (dashboardState.meetings.length === 0) {
    emptyState.textContent = 'No recordings yet. Start a new recording.';
  } else {
    emptyState.textContent = 'No meetings match your search.';
  }

  emptyState.hidden = false;
}

function renderMeetings() {
  const filteredMeetings = getFilteredMeetings();
  const cardsMarkup =
    filteredMeetings.length === 0 ? '' : filteredMeetings.map((meeting) => createMeetingCard(meeting)).join('');

  meetingsGrid.innerHTML = cardsMarkup;
  updateEmptyState(filteredMeetings);
  refreshScrollableState();
}

async function loadMeetings() {
  if (!hasRecordingApi()) {
    dashboardState.meetings = [];
    dashboardState.loadErrorMessage = 'Recording bridge is unavailable.';
    renderMeetings();
    return;
  }

  try {
    const sessions = await window.recordingApi.listTranscriptSessions();
    dashboardState.meetings = Array.isArray(sessions) ? sessions : [];
    dashboardState.loadErrorMessage = '';
  } catch (error) {
    dashboardState.meetings = [];
    dashboardState.loadErrorMessage = 'Unable to load recorded meetings.';
  }

  renderMeetings();
}

function initializeSearch() {
  searchInput.addEventListener('input', () => {
    dashboardState.searchQuery = searchInput.value.trim().toLowerCase();
    renderMeetings();
  });
}

function getModalFocusableElements() {
  return Array.from(
    modalElement.querySelectorAll(
      'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
  );
}

function closeRecordingModal() {
  if (!modalState.isOpen) {
    return;
  }

  modalState.isOpen = false;
  modalBackdrop.hidden = true;
  document.body.classList.remove('has-open-modal');

  if (modalState.lastFocusedElement instanceof HTMLElement) {
    modalState.lastFocusedElement.focus({ preventScroll: true });
  }
}

function openRecordingModal() {
  modalState.lastFocusedElement = document.activeElement;
  modalState.isOpen = true;
  modalBackdrop.hidden = false;
  document.body.classList.add('has-open-modal');

  meetingTitleInput.value = '';
  meetingParticipantsInput.value = '1';
  meetingTitleInput.focus({ preventScroll: true });
}

function handleModalKeyboard(event) {
  if (!modalState.isOpen) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeRecordingModal();
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const focusableElements = getModalFocusableElements();
  if (focusableElements.length === 0) {
    return;
  }

  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey && activeElement === firstFocusable) {
    event.preventDefault();
    lastFocusable.focus({ preventScroll: true });
    return;
  }

  if (!event.shiftKey && activeElement === lastFocusable) {
    event.preventDefault();
    firstFocusable.focus({ preventScroll: true });
  }
}

function navigateToRecordingPage(meetingTitle, participantCount) {
  const queryParams = new URLSearchParams();
  if (meetingTitle) {
    queryParams.set('title', meetingTitle);
  }
  queryParams.set('participants', String(participantCount));

  const queryString = queryParams.toString();
  window.location.href = queryString ? `recording.html?${queryString}` : 'recording.html';
}

function initializeModal() {
  newRecordingButton.addEventListener('click', () => {
    openRecordingModal();
  });

  modalCancelButton.addEventListener('click', () => {
    closeRecordingModal();
  });

  modalBackdrop.addEventListener('click', (event) => {
    if (event.target === modalBackdrop) {
      closeRecordingModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    handleModalKeyboard(event);
  });

  newRecordingForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const meetingTitle = String(meetingTitleInput.value || '')
      .trim()
      .replace(/\s+/gu, ' ');
    const participantCount = normalizeParticipantCount(meetingParticipantsInput.value);

    closeRecordingModal();
    navigateToRecordingPage(meetingTitle, participantCount);
  });
}

async function initializeDashboard() {
  renderDefaultTags(tagList);
  initializeSearch();
  initializeModal();
  initializeSmartScrollbars();
  await loadMeetings();
  searchInput.focus({ preventScroll: true });
}

void initializeDashboard();
