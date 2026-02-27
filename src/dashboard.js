const { escapeHtml, renderDefaultTags, initializeSmartScrollbars, refreshScrollableState } =
  window.uiShared;

const meetingVisuals = Object.freeze({
  accent: '#0a84ff',
  iconBg: '#eaf4ff',
  icon: 'bi-record-circle-fill',
  category: 'Recording',
});

const MAX_MEETING_TITLE_LENGTH = 160;

const dashboardState = {
  meetings: [],
  searchQuery: '',
  loadErrorMessage: '',
  openMenuSessionId: '',
};

const modalState = {
  activeModal: '',
  lastFocusedElement: null,
};

const renameMeetingState = {
  sessionId: '',
  isSaving: false,
};

const tagList = document.getElementById('tag-list');
const meetingsGrid = document.getElementById('meetings-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const totalRecordedTimeValue = document.getElementById('total-recorded-time-value');

const newRecordingButton = document.getElementById('new-recording-btn');
const modalBackdrop = document.getElementById('new-recording-modal-backdrop');
const modalElement = document.getElementById('new-recording-modal');
const newRecordingForm = document.getElementById('new-recording-form');
const meetingTitleInput = document.getElementById('meeting-title-input');
const meetingParticipantsInput = document.getElementById('meeting-participants-input');
const modalCancelButton = document.getElementById('meeting-modal-cancel-btn');
const renameMeetingModalBackdrop = document.getElementById('rename-meeting-modal-backdrop');
const renameMeetingModal = document.getElementById('rename-meeting-modal');
const renameMeetingForm = document.getElementById('rename-meeting-form');
const renameMeetingTitleInput = document.getElementById('rename-meeting-title-input');
const renameMeetingError = document.getElementById('rename-meeting-error');
const renameMeetingCancelButton = document.getElementById('rename-meeting-cancel-btn');
const renameMeetingSubmitButton = document.getElementById('rename-meeting-submit-btn');

function hasRecordingApi() {
  return Boolean(
    window.recordingApi && typeof window.recordingApi.listTranscriptSessions === 'function'
  );
}

function hasMeetingActionsApi() {
  return Boolean(
    hasRecordingApi() &&
      typeof window.recordingApi.renameTranscriptSession === 'function' &&
      typeof window.recordingApi.deleteTranscriptSession === 'function'
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

function toFiniteDurationSeconds(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function getTotalRecordedSeconds(meetings) {
  return meetings.reduce((totalSeconds, meeting) => {
    return totalSeconds + toFiniteDurationSeconds(meeting && meeting.durationSec);
  }, 0);
}

function formatTotalRecordedTime(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.round(totalSeconds) : 0;
  if (safeSeconds === 0) {
    return '0 min';
  }

  if (safeSeconds >= 3600) {
    const totalHours = safeSeconds / 3600;
    return `${totalHours.toFixed(1)} hrs`;
  }

  const totalMinutes = Math.max(1, Math.round(safeSeconds / 60));
  return `${totalMinutes} min`;
}

function getFallbackSummary() {
  return 'Transcript captured. Open to view details.';
}

function createMeetingCard(meeting) {
  const sessionId = String(meeting.sessionId || '').trim();
  const escapedSessionId = escapeHtml(sessionId);
  const isOptionsMenuOpen = sessionId && dashboardState.openMenuSessionId === sessionId;
  const title = escapeHtml(String(meeting.meetingTitle || 'Untitled meeting'));
  const date = escapeHtml(formatMeetingDate(meeting.updatedAt));
  const duration = escapeHtml(formatMeetingDuration(meeting.durationSec));
  const summary = escapeHtml(String(meeting.meetingSummary || '').trim() || getFallbackSummary());
  const participantLabel = escapeHtml(formatParticipantLabel(meeting.participantCount));
  const category = escapeHtml(meetingVisuals.category);
  const menuMarkup = sessionId
    ? `
        <div class="meeting-options">
          <button
            type="button"
            class="icon-button meeting-options-trigger"
            aria-label="Meeting options"
            aria-haspopup="menu"
            aria-expanded="${isOptionsMenuOpen ? 'true' : 'false'}"
            data-session-id="${escapedSessionId}"
          >
            <i class="bi bi-three-dots-vertical"></i>
          </button>
          <div class="meeting-options-menu" role="menu" ${isOptionsMenuOpen ? '' : 'hidden'}>
            <button type="button" class="meeting-menu-item" role="menuitem" data-action="rename" data-session-id="${escapedSessionId}">
              Rename
            </button>
            <button type="button" class="meeting-menu-item danger" role="menuitem" data-action="delete" data-session-id="${escapedSessionId}">
              Delete
            </button>
          </div>
        </div>
      `
    : `
        <button type="button" class="icon-button" aria-label="Meeting options" disabled>
          <i class="bi bi-three-dots-vertical"></i>
        </button>
      `;

  return `
    <article class="meeting-card" style="--accent: ${escapeHtml(meetingVisuals.accent)}; --icon-bg: ${escapeHtml(meetingVisuals.iconBg)};">
      <div class="meeting-top">
        <div class="meeting-icon">
          <i class="bi ${escapeHtml(meetingVisuals.icon)}"></i>
        </div>
        ${menuMarkup}
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

function renderStats() {
  if (!totalRecordedTimeValue) {
    return;
  }

  const totalRecordedSeconds = getTotalRecordedSeconds(dashboardState.meetings);
  totalRecordedTimeValue.textContent = formatTotalRecordedTime(totalRecordedSeconds);
}

function renderMeetings() {
  if (
    dashboardState.openMenuSessionId &&
    !dashboardState.meetings.some((meeting) => meeting.sessionId === dashboardState.openMenuSessionId)
  ) {
    dashboardState.openMenuSessionId = '';
  }

  renderStats();

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

function getMeetingBySessionId(sessionId) {
  if (!sessionId) {
    return null;
  }

  return dashboardState.meetings.find((meeting) => meeting.sessionId === sessionId) || null;
}

function closeMeetingOptionsMenu() {
  if (!dashboardState.openMenuSessionId) {
    return;
  }

  dashboardState.openMenuSessionId = '';
  renderMeetings();
}

function toggleMeetingOptionsMenu(sessionId) {
  if (!sessionId) {
    return;
  }

  dashboardState.openMenuSessionId =
    dashboardState.openMenuSessionId === sessionId ? '' : sessionId;
  renderMeetings();
}

function normalizeEditableMeetingTitle(value) {
  const normalizedTitle = String(value || '')
    .trim()
    .replace(/\s+/gu, ' ');

  if (!normalizedTitle) {
    throw new Error('Meeting title cannot be empty.');
  }

  if (normalizedTitle.length > MAX_MEETING_TITLE_LENGTH) {
    throw new Error(`Meeting title cannot exceed ${MAX_MEETING_TITLE_LENGTH} characters.`);
  }

  return normalizedTitle;
}

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return fallbackMessage;
}

function renameMeeting(sessionId) {
  if (!hasMeetingActionsApi()) {
    return;
  }

  const meeting = getMeetingBySessionId(sessionId);
  if (!meeting) {
    return;
  }

  openRenameMeetingModal(sessionId);
}

async function deleteMeeting(sessionId) {
  if (!hasMeetingActionsApi()) {
    return;
  }

  const meeting = getMeetingBySessionId(sessionId);
  if (!meeting) {
    return;
  }

  const meetingTitle = String(meeting.meetingTitle || 'Untitled meeting').trim() || 'Untitled meeting';
  const isDeleteConfirmed = window.confirm(
    `Delete "${meetingTitle}"?\n\nThis permanently deletes the transcript.`
  );
  if (!isDeleteConfirmed) {
    return;
  }

  try {
    await window.recordingApi.deleteTranscriptSession({ sessionId });
    await loadMeetings();
  } catch (error) {
    window.alert(getErrorMessage(error, 'Unable to delete meeting.'));
  }
}

function initializeMeetingActions() {
  meetingsGrid.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const optionsTriggerButton = event.target.closest('.meeting-options-trigger');
    if (optionsTriggerButton) {
      event.preventDefault();
      event.stopPropagation();
      const sessionId = String(optionsTriggerButton.dataset.sessionId || '').trim();
      toggleMeetingOptionsMenu(sessionId);
      return;
    }

    const menuActionButton = event.target.closest('.meeting-menu-item');
    if (!menuActionButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const action = String(menuActionButton.dataset.action || '').trim();
    const sessionId = String(menuActionButton.dataset.sessionId || '').trim();
    if (!action || !sessionId) {
      return;
    }

    closeMeetingOptionsMenu();

    if (action === 'rename') {
      void renameMeeting(sessionId);
      return;
    }

    if (action === 'delete') {
      void deleteMeeting(sessionId);
    }
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (!dashboardState.openMenuSessionId) {
      return;
    }

    if (event.target.closest('.meeting-options')) {
      return;
    }

    closeMeetingOptionsMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || modalState.activeModal || !dashboardState.openMenuSessionId) {
      return;
    }

    event.preventDefault();
    closeMeetingOptionsMenu();
  });
}

function initializeSearch() {
  searchInput.addEventListener('input', () => {
    dashboardState.searchQuery = searchInput.value.trim().toLowerCase();
    dashboardState.openMenuSessionId = '';
    renderMeetings();
  });
}

function getModalContext(modalId) {
  if (modalId === 'new-recording') {
    return {
      backdrop: modalBackdrop,
      modalElement,
    };
  }

  if (modalId === 'rename-meeting') {
    return {
      backdrop: renameMeetingModalBackdrop,
      modalElement: renameMeetingModal,
    };
  }

  return null;
}

function getActiveModalContext() {
  return getModalContext(modalState.activeModal);
}

function openModal(modalId) {
  const modalContext = getModalContext(modalId);
  if (!modalContext) {
    return false;
  }

  modalState.lastFocusedElement = document.activeElement;
  modalState.activeModal = modalId;
  modalContext.backdrop.hidden = false;
  document.body.classList.add('has-open-modal');
  return true;
}

function resetRenameMeetingModalState() {
  renameMeetingState.sessionId = '';
  renameMeetingState.isSaving = false;
  renameMeetingTitleInput.value = '';
  renameMeetingTitleInput.disabled = false;
  renameMeetingCancelButton.disabled = false;
  renameMeetingSubmitButton.disabled = false;
  setRenameMeetingError('');
}

function closeActiveModal() {
  if (!modalState.activeModal) {
    return;
  }

  const closedModalId = modalState.activeModal;
  const modalContext = getActiveModalContext();
  modalState.activeModal = '';

  if (modalContext) {
    modalContext.backdrop.hidden = true;
  }

  if (closedModalId === 'rename-meeting') {
    resetRenameMeetingModalState();
  }

  document.body.classList.remove('has-open-modal');

  if (modalState.lastFocusedElement instanceof HTMLElement) {
    modalState.lastFocusedElement.focus({ preventScroll: true });
  }

  modalState.lastFocusedElement = null;
}

function getModalFocusableElements() {
  const modalContext = getActiveModalContext();
  if (!modalContext) {
    return [];
  }

  return Array.from(
    modalContext.modalElement.querySelectorAll(
      'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
  );
}

function closeRecordingModal() {
  if (modalState.activeModal !== 'new-recording') {
    return;
  }

  closeActiveModal();
}

function openRecordingModal() {
  meetingTitleInput.value = '';
  meetingParticipantsInput.value = '1';

  if (!openModal('new-recording')) {
    return;
  }

  meetingTitleInput.focus({ preventScroll: true });
}

function setRenameMeetingError(message) {
  const errorMessage = String(message || '').trim();
  renameMeetingError.textContent = errorMessage;
  renameMeetingError.hidden = !errorMessage;
}

function setRenameMeetingFormDisabled(isDisabled) {
  renameMeetingState.isSaving = isDisabled;
  renameMeetingTitleInput.disabled = isDisabled;
  renameMeetingCancelButton.disabled = isDisabled;
  renameMeetingSubmitButton.disabled = isDisabled;
}

function openRenameMeetingModal(sessionId) {
  const meeting = getMeetingBySessionId(sessionId);
  if (!meeting) {
    return;
  }

  renameMeetingState.sessionId = sessionId;
  renameMeetingTitleInput.value = String(meeting.meetingTitle || '').trim();
  setRenameMeetingError('');
  setRenameMeetingFormDisabled(false);

  if (!openModal('rename-meeting')) {
    return;
  }

  renameMeetingTitleInput.focus({ preventScroll: true });
  renameMeetingTitleInput.select();
}

function closeRenameMeetingModal() {
  if (modalState.activeModal !== 'rename-meeting') {
    return;
  }

  closeActiveModal();
}

async function submitRenameMeetingForm(event) {
  event.preventDefault();

  if (!hasMeetingActionsApi()) {
    setRenameMeetingError('Meeting actions are unavailable.');
    return;
  }

  if (renameMeetingState.isSaving) {
    return;
  }

  const sessionId = String(renameMeetingState.sessionId || '').trim();
  if (!sessionId) {
    setRenameMeetingError('Meeting session is unavailable.');
    return;
  }

  let normalizedMeetingTitle;
  try {
    normalizedMeetingTitle = normalizeEditableMeetingTitle(renameMeetingTitleInput.value);
  } catch (error) {
    setRenameMeetingError(getErrorMessage(error, 'Unable to rename meeting.'));
    return;
  }

  const existingMeeting = getMeetingBySessionId(sessionId);
  const currentMeetingTitle = existingMeeting
    ? String(existingMeeting.meetingTitle || '')
        .trim()
        .replace(/\s+/gu, ' ')
    : '';
  if (currentMeetingTitle && normalizedMeetingTitle === currentMeetingTitle) {
    closeRenameMeetingModal();
    return;
  }

  setRenameMeetingError('');
  setRenameMeetingFormDisabled(true);

  try {
    await window.recordingApi.renameTranscriptSession({
      sessionId,
      meetingTitle: normalizedMeetingTitle,
    });
    closeRenameMeetingModal();
    await loadMeetings();
  } catch (error) {
    setRenameMeetingFormDisabled(false);
    setRenameMeetingError(getErrorMessage(error, 'Unable to rename meeting.'));
  }
}

function handleModalKeyboard(event) {
  if (!modalState.activeModal) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeActiveModal();
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

  renameMeetingCancelButton.addEventListener('click', () => {
    closeRenameMeetingModal();
  });

  renameMeetingModalBackdrop.addEventListener('click', (event) => {
    if (event.target === renameMeetingModalBackdrop) {
      closeRenameMeetingModal();
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

  renameMeetingForm.addEventListener('submit', (event) => {
    void submitRenameMeetingForm(event);
  });
}

async function initializeDashboard() {
  renderDefaultTags(tagList);
  initializeSearch();
  initializeMeetingActions();
  initializeModal();
  initializeSmartScrollbars();
  await loadMeetings();
  searchInput.focus({ preventScroll: true });
}

void initializeDashboard();
