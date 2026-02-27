const {
  escapeHtml,
  renderDefaultTags,
  initializeSmartScrollbars,
  refreshScrollableState,
  formatParticipantLabel,
  formatMeetingDate,
  formatMeetingDuration,
  buildMeetingDetailsHref,
} = window.uiShared;

const meetingsState = {
  meetings: [],
  searchQuery: '',
  loadErrorMessage: '',
};

const tagList = document.getElementById('tag-list');
const meetingsSearchInput = document.getElementById('meetings-search-input');
const meetingsList = document.getElementById('meetings-list');
const meetingsEmptyState = document.getElementById('meetings-empty-state');
const meetingsCountValue = document.getElementById('meetings-count-value');

function hasRecordingApi() {
  return Boolean(
    window.recordingApi && typeof window.recordingApi.listTranscriptSessions === 'function'
  );
}

function getFallbackSummary() {
  return 'Transcript captured. Open meeting details to review the full transcript.';
}

function getMeetingSearchTarget(meeting) {
  return `${meeting.meetingTitle || ''} ${meeting.meetingSummary || ''}`.toLowerCase();
}

function getFilteredMeetings() {
  if (!meetingsState.searchQuery) {
    return meetingsState.meetings;
  }

  return meetingsState.meetings.filter((meeting) =>
    getMeetingSearchTarget(meeting).includes(meetingsState.searchQuery)
  );
}

function createMeetingRow(meeting) {
  const sessionId = String(meeting.sessionId || '').trim();
  const meetingTitle = escapeHtml(String(meeting.meetingTitle || 'Untitled meeting'));
  const dateLabel = escapeHtml(formatMeetingDate(meeting.updatedAt));
  const durationLabel = escapeHtml(formatMeetingDuration(meeting.durationSec));
  const participantLabel = escapeHtml(formatParticipantLabel(meeting.participantCount));
  const summaryText = escapeHtml(String(meeting.meetingSummary || '').trim() || getFallbackSummary());
  const disabledAttribute = sessionId ? '' : 'disabled';
  const sessionIdAttribute = sessionId ? `data-session-id="${escapeHtml(sessionId)}"` : '';

  return `
    <button type="button" class="meeting-list-item" ${sessionIdAttribute} ${disabledAttribute}>
      <div class="meeting-list-main">
        <h3 class="meeting-list-title">${meetingTitle}</h3>
        <p class="meeting-list-meta">${dateLabel} | ${durationLabel}</p>
        <p class="meeting-list-summary">${summaryText}</p>
      </div>
      <div class="meeting-list-side">
        <span class="meeting-list-participants">
          <i class="bi bi-people-fill" aria-hidden="true"></i>
          <span>${participantLabel}</span>
        </span>
        <span class="meeting-list-open">
          <span>Open details</span>
          <i class="bi bi-arrow-up-right"></i>
        </span>
      </div>
    </button>
  `;
}

function updateCount(filteredMeetings) {
  if (!meetingsCountValue) {
    return;
  }

  meetingsCountValue.textContent = String(filteredMeetings.length);
}

function updateEmptyState(filteredMeetings) {
  if (filteredMeetings.length > 0) {
    meetingsEmptyState.hidden = true;
    return;
  }

  if (meetingsState.loadErrorMessage) {
    meetingsEmptyState.textContent = meetingsState.loadErrorMessage;
  } else if (meetingsState.meetings.length === 0) {
    meetingsEmptyState.textContent = 'No recordings yet. Start a new recording from Dashboard.';
  } else {
    meetingsEmptyState.textContent = 'No meetings match your search.';
  }

  meetingsEmptyState.hidden = false;
}

function renderMeetings() {
  const filteredMeetings = getFilteredMeetings();
  const meetingsMarkup =
    filteredMeetings.length === 0 ? '' : filteredMeetings.map((meeting) => createMeetingRow(meeting)).join('');

  meetingsList.innerHTML = meetingsMarkup;
  updateCount(filteredMeetings);
  updateEmptyState(filteredMeetings);
  refreshScrollableState();
}

function navigateToMeetingDetails(sessionId) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return;
  }

  window.location.href = buildMeetingDetailsHref(normalizedSessionId);
}

function initializeMeetingsListNavigation() {
  meetingsList.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const meetingRow = event.target.closest('.meeting-list-item[data-session-id]');
    if (!meetingRow) {
      return;
    }

    const sessionId = String(meetingRow.dataset.sessionId || '').trim();
    navigateToMeetingDetails(sessionId);
  });
}

function initializeSearch() {
  meetingsSearchInput.addEventListener('input', () => {
    meetingsState.searchQuery = meetingsSearchInput.value.trim().toLowerCase();
    renderMeetings();
  });
}

async function loadMeetings() {
  if (!hasRecordingApi()) {
    meetingsState.meetings = [];
    meetingsState.loadErrorMessage = 'Recording bridge is unavailable.';
    renderMeetings();
    return;
  }

  try {
    const sessions = await window.recordingApi.listTranscriptSessions();
    meetingsState.meetings = Array.isArray(sessions) ? sessions : [];
    meetingsState.loadErrorMessage = '';
  } catch (_error) {
    meetingsState.meetings = [];
    meetingsState.loadErrorMessage = 'Unable to load meetings.';
  }

  renderMeetings();
}

async function initializeMeetingsPage() {
  renderDefaultTags(tagList);
  initializeSearch();
  initializeMeetingsListNavigation();
  initializeSmartScrollbars();
  await loadMeetings();
  meetingsSearchInput.focus({ preventScroll: true });
}

void initializeMeetingsPage();
