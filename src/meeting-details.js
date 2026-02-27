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
  meetingDocument: null,
  isGeneratingInsights: false,
};

const tagList = document.getElementById('tag-list');
const meetingTitle = document.getElementById('meeting-title');
const meetingMeta = document.getElementById('meeting-meta');
const meetingContentLayout = document.getElementById('meeting-content-layout');
const transcriptFeed = document.getElementById('meeting-transcript-feed');
const meetingDetailsEmptyState = document.getElementById('meeting-details-empty-state');
const generateInsightsButton = document.getElementById('generate-insights-btn');
const insightsPlaceholderStatus = document.getElementById('insights-placeholder-status');
const insightSummaryText = document.getElementById('insight-summary-text');
const insightDecisionsList = document.getElementById('insight-decisions-list');
const insightActionsList = document.getElementById('insight-actions-list');
const detailsBackLink = document.querySelector('.details-back-link');

function hasLoadTranscriptApi() {
  return Boolean(window.recordingApi && typeof window.recordingApi.loadTranscript === 'function');
}

function hasGenerateInsightsApi() {
  return Boolean(
    window.recordingApi && typeof window.recordingApi.generateMeetingInsights === 'function'
  );
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

function setInsightsStatus(message, statusType = 'neutral') {
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) {
    insightsPlaceholderStatus.hidden = true;
    insightsPlaceholderStatus.textContent = '';
    insightsPlaceholderStatus.removeAttribute('data-state');
    return;
  }

  insightsPlaceholderStatus.hidden = false;
  insightsPlaceholderStatus.textContent = normalizedMessage;
  insightsPlaceholderStatus.setAttribute('data-state', statusType);
}

function normalizeInsightItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedItems = [];
  const seenItems = new Set();

  for (const rawItem of value) {
    const normalizedItem = String(rawItem || '')
      .replace(/\s+/gu, ' ')
      .trim()
      .replace(/^[\-\u2022*]+\s*/u, '');

    if (!normalizedItem) {
      continue;
    }

    const dedupeKey = normalizedItem.toLowerCase();
    if (seenItems.has(dedupeKey)) {
      continue;
    }

    seenItems.add(dedupeKey);
    normalizedItems.push(normalizedItem);
  }

  return normalizedItems;
}

function renderInsightList(listElement, items, emptyMessage) {
  listElement.replaceChildren();

  const normalizedItems = normalizeInsightItems(items);
  if (normalizedItems.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'insight-list-empty';
    emptyItem.textContent = emptyMessage;
    listElement.appendChild(emptyItem);
    return;
  }

  for (const item of normalizedItems) {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    listElement.appendChild(listItem);
  }
}

function renderInsights(meetingDocument) {
  const summaryText = String(meetingDocument && meetingDocument.meetingSummary ? meetingDocument.meetingSummary : '').trim();
  insightSummaryText.textContent = summaryText || 'Not generated yet.';

  renderInsightList(
    insightDecisionsList,
    meetingDocument && meetingDocument.meetingKeyDecisions,
    'No key decisions identified.'
  );

  renderInsightList(
    insightActionsList,
    meetingDocument && meetingDocument.meetingActionItems,
    'No action items identified.'
  );

  refreshScrollableState();
}

function setGenerateInsightsButtonState(isLoading) {
  meetingDetailsState.isGeneratingInsights = isLoading;
  generateInsightsButton.disabled = isLoading;
  generateInsightsButton.textContent = isLoading ? 'Generating...' : 'Generate';
}

function formatInsightUpdatedAt(value) {
  const dateValue = String(value || '').trim();
  if (!dateValue) {
    return '';
  }

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function handleGenerateInsights() {
  if (meetingDetailsState.isGeneratingInsights) {
    return;
  }

  if (!meetingDetailsState.sessionId) {
    setInsightsStatus('Meeting session is missing. Open a meeting from the Meetings page.', 'error');
    return;
  }

  if (!hasGenerateInsightsApi()) {
    setInsightsStatus('AI insight generation bridge is unavailable.', 'error');
    return;
  }

  setGenerateInsightsButtonState(true);
  setInsightsStatus('Generating AI insights...', 'loading');

  try {
    const generatedInsights = await window.recordingApi.generateMeetingInsights({
      sessionId: meetingDetailsState.sessionId,
    });

    const currentDocument =
      meetingDetailsState.meetingDocument && typeof meetingDetailsState.meetingDocument === 'object'
        ? meetingDetailsState.meetingDocument
        : {};

    currentDocument.meetingSummary = String(generatedInsights.meetingSummary || '').trim();
    currentDocument.meetingKeyDecisions = Array.isArray(generatedInsights.meetingKeyDecisions)
      ? generatedInsights.meetingKeyDecisions
      : [];
    currentDocument.meetingActionItems = Array.isArray(generatedInsights.meetingActionItems)
      ? generatedInsights.meetingActionItems
      : [];
    currentDocument.meetingSummarySource = String(generatedInsights.meetingSummarySource || '').trim();
    currentDocument.meetingSummaryUpdatedAt = String(generatedInsights.meetingSummaryUpdatedAt || '').trim();

    meetingDetailsState.meetingDocument = currentDocument;
    renderInsights(currentDocument);

    const updatedLabel = formatInsightUpdatedAt(currentDocument.meetingSummaryUpdatedAt);
    setInsightsStatus(
      updatedLabel ? `AI insights generated on ${updatedLabel}.` : 'AI insights generated.',
      'success'
    );
  } catch (error) {
    setInsightsStatus(getErrorMessage(error, 'Unable to generate AI insights.'), 'error');
  } finally {
    setGenerateInsightsButtonState(false);
  }
}

function initializeInsightsGeneration() {
  if (!hasGenerateInsightsApi()) {
    generateInsightsButton.disabled = true;
    setInsightsStatus('AI insight generation bridge is unavailable.', 'error');
    return;
  }

  generateInsightsButton.addEventListener('click', () => {
    void handleGenerateInsights();
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
    meetingDetailsState.meetingDocument = meetingDocument;
    updateMeetingHeader(meetingDocument);
    showContentState();
    renderTranscript(meetingDocument);
    renderInsights(meetingDocument);
  } catch (error) {
    showErrorState(getErrorMessage(error, 'Unable to load meeting details.'));
  }
}

async function initializeMeetingDetailsPage() {
  renderDefaultTags(tagList);
  initializeInsightsGeneration();
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
