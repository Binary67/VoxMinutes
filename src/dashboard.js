const {
  escapeHtml,
  renderDefaultTags,
  initializeSmartScrollbars,
  refreshScrollableState,
  normalizeParticipantCount,
  formatParticipantLabel,
  formatMeetingDate,
  formatMeetingDuration,
  toFiniteDurationSeconds,
  buildMeetingsHref,
  buildMeetingDetailsHref,
} = window.uiShared;

const meetingVisuals = Object.freeze({
  accent: '#0a84ff',
  iconBg: '#eaf4ff',
  icon: 'bi-record-circle-fill',
  category: 'Recording',
});

const MAX_MEETING_TITLE_LENGTH = 160;
const MAX_RECENT_MEETINGS_ON_DASHBOARD = 3;
const ESTIMATION_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
const estimatedTimeSavedValue = document.getElementById('estimated-time-saved-value');
const estimatedTimeSavedMeta = document.getElementById('estimated-time-saved-meta');
const estimatedProductivityLiftValue = document.getElementById('estimated-productivity-lift-value');
const estimatedProductivityLiftMeta = document.getElementById('estimated-productivity-lift-meta');
const viewAllMeetingsButton = document.querySelector('.view-all-btn');

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

function toTimestampOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getMeetingTimestamp(meeting) {
  const updatedAtTimestamp = toTimestampOrNull(meeting && meeting.updatedAt);
  if (updatedAtTimestamp !== null) {
    return updatedAtTimestamp;
  }

  return toTimestampOrNull(meeting && meeting.createdAt);
}

function getRecentMeetings(meetings, nowTimestamp = Date.now()) {
  const windowStartTimestamp = nowTimestamp - ESTIMATION_WINDOW_DAYS * MS_PER_DAY;
  return meetings.filter((meeting) => {
    const meetingTimestamp = getMeetingTimestamp(meeting);
    if (meetingTimestamp === null) {
      return false;
    }

    return meetingTimestamp >= windowStartTimestamp && meetingTimestamp <= nowTimestamp;
  });
}

function getEstimatedMeetingEfficiency(durationSec) {
  const safeDurationSec = toFiniteDurationSeconds(durationSec);
  if (safeDurationSec <= 0) {
    return {
      savedMinutes: 6,
      baselineMinutes: 12,
    };
  }

  const durationMinutes = safeDurationSec / 60;
  if (durationMinutes < 5) {
    return {
      savedMinutes: 4,
      baselineMinutes: 8,
    };
  }

  if (durationMinutes <= 20) {
    return {
      savedMinutes: 8,
      baselineMinutes: 15,
    };
  }

  return {
    savedMinutes: 12,
    baselineMinutes: 25,
  };
}

function getEstimatedProductivityMetrics(meetings) {
  const recentMeetings = getRecentMeetings(meetings);
  const totals = recentMeetings.reduce(
    (accumulator, meeting) => {
      const efficiency = getEstimatedMeetingEfficiency(meeting && meeting.durationSec);
      return {
        totalSavedMinutes: accumulator.totalSavedMinutes + efficiency.savedMinutes,
        totalBaselineMinutes: accumulator.totalBaselineMinutes + efficiency.baselineMinutes,
      };
    },
    {
      totalSavedMinutes: 0,
      totalBaselineMinutes: 0,
    }
  );

  const rawLiftPercent =
    totals.totalBaselineMinutes > 0
      ? Math.round((totals.totalSavedMinutes / totals.totalBaselineMinutes) * 100)
      : 0;
  const estimatedLiftPercent = Math.max(0, Math.min(99, rawLiftPercent));

  return {
    totalSavedMinutes: totals.totalSavedMinutes,
    estimatedLiftPercent,
    recentMeetingCount: recentMeetings.length,
  };
}

function formatEstimatedTimeSaved(totalMinutes) {
  const safeMinutes = Number.isFinite(totalMinutes) && totalMinutes > 0 ? Math.round(totalMinutes) : 0;
  if (safeMinutes >= 60) {
    const totalHours = safeMinutes / 60;
    return `${totalHours.toFixed(1)} hrs`;
  }

  return `${safeMinutes} min`;
}

function getFallbackSummary() {
  return 'Transcript captured. Open to view details.';
}

function createMeetingCard(meeting) {
  const sessionId = String(meeting.sessionId || '').trim();
  const escapedSessionId = escapeHtml(sessionId);
  const cardAttributes = sessionId
    ? `data-session-id="${escapedSessionId}" role="link" tabindex="0"`
    : '';
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
    <article
      class="meeting-card${sessionId ? ' is-clickable' : ''}"
      ${cardAttributes}
      style="--accent: ${escapeHtml(meetingVisuals.accent)}; --icon-bg: ${escapeHtml(meetingVisuals.iconBg)};"
    >
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

function getVisibleMeetings() {
  return getFilteredMeetings().slice(0, MAX_RECENT_MEETINGS_ON_DASHBOARD);
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
  if (totalRecordedTimeValue) {
    const totalRecordedSeconds = getTotalRecordedSeconds(dashboardState.meetings);
    totalRecordedTimeValue.textContent = formatTotalRecordedTime(totalRecordedSeconds);
  }

  const metrics = getEstimatedProductivityMetrics(dashboardState.meetings);

  if (estimatedTimeSavedValue) {
    estimatedTimeSavedValue.textContent = formatEstimatedTimeSaved(metrics.totalSavedMinutes);
  }

  if (estimatedProductivityLiftValue) {
    estimatedProductivityLiftValue.textContent = `${metrics.estimatedLiftPercent}%`;
  }

  const meetingLabel = metrics.recentMeetingCount === 1 ? 'meeting' : 'meetings';
  const estimateDescription =
    metrics.recentMeetingCount > 0
      ? `Estimated from ${metrics.recentMeetingCount} ${meetingLabel} in the last ${ESTIMATION_WINDOW_DAYS} days using duration bands.`
      : `Estimated from meeting activity in the last ${ESTIMATION_WINDOW_DAYS} days.`;

  if (estimatedTimeSavedMeta) {
    estimatedTimeSavedMeta.title = estimateDescription;
  }

  if (estimatedProductivityLiftMeta) {
    estimatedProductivityLiftMeta.title = estimateDescription;
  }
}

function renderMeetings() {
  const visibleMeetings = getVisibleMeetings();

  if (
    dashboardState.openMenuSessionId &&
    !visibleMeetings.some((meeting) => meeting.sessionId === dashboardState.openMenuSessionId)
  ) {
    dashboardState.openMenuSessionId = '';
  }

  renderStats();

  const cardsMarkup =
    visibleMeetings.length === 0 ? '' : visibleMeetings.map((meeting) => createMeetingCard(meeting)).join('');

  meetingsGrid.innerHTML = cardsMarkup;
  updateEmptyState(visibleMeetings);
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
    if (menuActionButton) {
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
      return;
    }

    const clickableMeetingCard = event.target.closest('.meeting-card[data-session-id]');
    if (!clickableMeetingCard || event.target.closest('.meeting-options')) {
      return;
    }

    const clickedSessionId = String(clickableMeetingCard.dataset.sessionId || '').trim();
    if (!clickedSessionId) {
      return;
    }

    navigateToMeetingDetails(clickedSessionId);
  });

  meetingsGrid.addEventListener('keydown', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const clickableMeetingCard = event.target.closest('.meeting-card[data-session-id]');
    if (!clickableMeetingCard || event.target.closest('.meeting-options')) {
      return;
    }

    event.preventDefault();
    const clickedSessionId = String(clickableMeetingCard.dataset.sessionId || '').trim();
    if (!clickedSessionId) {
      return;
    }

    navigateToMeetingDetails(clickedSessionId);
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

function initializeMeetingNavigation() {
  if (!viewAllMeetingsButton) {
    return;
  }

  viewAllMeetingsButton.addEventListener('click', () => {
    window.location.href = buildMeetingsHref();
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

function navigateToMeetingDetails(sessionId) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return;
  }

  window.location.href = buildMeetingDetailsHref(normalizedSessionId);
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
  initializeMeetingNavigation();
  initializeMeetingActions();
  initializeModal();
  initializeSmartScrollbars();
  await loadMeetings();
  searchInput.focus({ preventScroll: true });
}

void initializeDashboard();
