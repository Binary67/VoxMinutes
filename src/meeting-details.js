const {
  renderDefaultTags,
  initializeSmartScrollbars,
  parseSessionIdFromQuery,
  formatMeetingDate,
  formatMeetingDuration,
  formatParticipantLabel,
  refreshScrollableState,
} = window.uiShared;

const transcriptRenderer = window.transcriptRenderer;

const meetingDetailsState = {
  sessionId: parseSessionIdFromQuery(window.location.search),
};

const tagList = document.getElementById('tag-list');
const meetingTitle = document.getElementById('meeting-title');
const meetingMeta = document.getElementById('meeting-meta');
const meetingContentLayout = document.getElementById('meeting-content-layout');
const transcriptFeed = document.getElementById('meeting-transcript-feed');
const meetingDetailsEmptyState = document.getElementById('meeting-details-empty-state');
const generateInsightsButton = document.getElementById('generate-insights-btn');
const insightsPlaceholderStatus = document.getElementById('insights-placeholder-status');
const detailsBackLink = document.querySelector('.details-back-link');

function hasLoadTranscriptApi() {
  return Boolean(window.recordingApi && typeof window.recordingApi.loadTranscript === 'function');
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

function updateMeetingHeader(meetingDocument) {
  const title = String(meetingDocument && meetingDocument.meetingTitle ? meetingDocument.meetingTitle : '').trim();
  const normalizedTitle = title || 'Untitled meeting';
  const dateLabel = formatMeetingDate(meetingDocument && (meetingDocument.updatedAt || meetingDocument.createdAt));
  const durationLabel = formatMeetingDuration(meetingDocument && meetingDocument.durationSec);
  const participantLabel = formatParticipantLabel(meetingDocument && meetingDocument.participantCount);

  meetingTitle.textContent = normalizedTitle;
  meetingMeta.textContent = `${dateLabel} | ${durationLabel} | ${participantLabel}`;
  window.document.title = `${normalizedTitle} | AI Notes`;
}

function showErrorState(message) {
  meetingContentLayout.hidden = true;
  meetingTitle.textContent = 'Meeting Details';
  meetingMeta.textContent = 'Unable to load meeting.';
  meetingDetailsEmptyState.textContent = String(message || 'Unable to load meeting details.');
  meetingDetailsEmptyState.hidden = false;
  refreshScrollableState();
}

function showContentState() {
  meetingDetailsEmptyState.hidden = true;
  meetingContentLayout.hidden = false;
  refreshScrollableState();
}

function renderTranscript(document) {
  if (!transcriptRenderer || typeof transcriptRenderer.renderTranscriptFromDocument !== 'function') {
    transcriptFeed.textContent = 'Transcript renderer is unavailable.';
    return;
  }

  transcriptRenderer.renderTranscriptFromDocument(transcriptFeed, document, {
    interactiveSpeakerNames: false,
    emptyMessage: 'No transcript available for this meeting.',
  });
}

function initializeInsightsPlaceholder() {
  generateInsightsButton.addEventListener('click', () => {
    insightsPlaceholderStatus.hidden = false;
    insightsPlaceholderStatus.textContent = 'AI insight generation is not available yet.';
  });
}

async function loadMeetingDetails() {
  if (!meetingDetailsState.sessionId) {
    showErrorState('Meeting session is missing. Open a meeting from the Meetings page.');
    return;
  }

  if (!hasLoadTranscriptApi()) {
    showErrorState('Recording bridge is unavailable.');
    return;
  }

  try {
    const meetingDocument = await window.recordingApi.loadTranscript({
      sessionId: meetingDetailsState.sessionId,
    });
    updateMeetingHeader(meetingDocument);
    showContentState();
    renderTranscript(meetingDocument);
  } catch (error) {
    showErrorState(getErrorMessage(error, 'Unable to load meeting details.'));
  }
}

async function initializeMeetingDetailsPage() {
  renderDefaultTags(tagList);
  initializeInsightsPlaceholder();
  initializeSmartScrollbars();
  await loadMeetingDetails();
  if (!meetingContentLayout.hidden) {
    generateInsightsButton.focus({ preventScroll: true });
    return;
  }

  if (detailsBackLink) {
    detailsBackLink.focus({ preventScroll: true });
  }
}

void initializeMeetingDetailsPage();
