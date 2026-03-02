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
const insightMeetingPointsList = document.getElementById('insight-meeting-points-list');
const insightActionsList = document.getElementById('insight-actions-list');
const insightTimelineList = document.getElementById('insight-timeline-list');
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

function normalizeInsightItemText(value) {
  return String(value || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^[\-\u2022*]+\s*/u, '')
    .replace(/^["'`]+|["'`]+$/gu, '');
}

function normalizeInsightItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedItems = [];
  const seenItems = new Set();

  for (const rawItem of value) {
    const normalizedItem = normalizeInsightItemText(rawItem);

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

function normalizeActionItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedItems = [];
  const seenItems = new Set();

  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      continue;
    }

    const task = normalizeInsightItemText(rawItem.task);
    const evidenceQuote = normalizeInsightItemText(rawItem.evidenceQuote);
    if (!task || !evidenceQuote) {
      continue;
    }

    const dedupeKey = `${task.toLowerCase()}|${evidenceQuote.toLowerCase()}`;
    if (seenItems.has(dedupeKey)) {
      continue;
    }

    seenItems.add(dedupeKey);
    normalizedItems.push({ task, evidenceQuote });
  }

  return normalizedItems;
}

function normalizeIsoDate(value) {
  const normalizedValue = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalizedValue)) {
    return '';
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  if (parsedDate.toISOString().slice(0, 10) !== normalizedValue) {
    return '';
  }

  return normalizedValue;
}

function normalizeTimelineItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedItems = [];
  const seenItems = new Set();

  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      continue;
    }

    const date = normalizeIsoDate(rawItem.date);
    const task = normalizeInsightItemText(rawItem.task);
    const evidenceQuote = normalizeInsightItemText(rawItem.evidenceQuote);
    if (!date || !task || !evidenceQuote) {
      continue;
    }

    const dedupeKey = `${date}|${task.toLowerCase()}|${evidenceQuote.toLowerCase()}`;
    if (seenItems.has(dedupeKey)) {
      continue;
    }

    seenItems.add(dedupeKey);
    normalizedItems.push({ date, task, evidenceQuote });
  }

  normalizedItems.sort((left, right) => left.date.localeCompare(right.date));
  return normalizedItems;
}

function createEmptyInsightListItem(emptyMessage) {
  const emptyItem = document.createElement('li');
  emptyItem.className = 'insight-list-empty';
  emptyItem.textContent = emptyMessage;
  return emptyItem;
}

function renderTextInsightList(listElement, items, emptyMessage) {
  listElement.replaceChildren();

  const normalizedItems = normalizeInsightItems(items);
  if (normalizedItems.length === 0) {
    listElement.appendChild(createEmptyInsightListItem(emptyMessage));
    return;
  }

  for (const item of normalizedItems) {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    listElement.appendChild(listItem);
  }
}

function createEvidenceText(value) {
  return `"${String(value || '').trim()}"`;
}

function createRichInsightListItem(primaryText, evidenceQuote) {
  const listItem = document.createElement('li');
  listItem.className = 'insight-list-item-rich';

  const mainText = document.createElement('p');
  mainText.className = 'insight-item-main';
  mainText.textContent = primaryText;

  const evidenceText = document.createElement('p');
  evidenceText.className = 'insight-item-evidence';
  evidenceText.textContent = createEvidenceText(evidenceQuote);

  listItem.append(mainText, evidenceText);
  return listItem;
}

function renderActionItemsList(listElement, items, emptyMessage) {
  listElement.replaceChildren();

  const normalizedItems = normalizeActionItems(items);
  if (normalizedItems.length === 0) {
    listElement.appendChild(createEmptyInsightListItem(emptyMessage));
    return;
  }

  for (const item of normalizedItems) {
    listElement.appendChild(createRichInsightListItem(item.task, item.evidenceQuote));
  }
}

function renderTimelineList(listElement, items, emptyMessage) {
  listElement.replaceChildren();

  const normalizedItems = normalizeTimelineItems(items);
  if (normalizedItems.length === 0) {
    listElement.appendChild(createEmptyInsightListItem(emptyMessage));
    return;
  }

  for (const item of normalizedItems) {
    listElement.appendChild(createRichInsightListItem(`${item.date} - ${item.task}`, item.evidenceQuote));
  }
}

function renderInsights(meetingDocument) {
  renderTextInsightList(
    insightMeetingPointsList,
    meetingDocument && meetingDocument.meetingSalientPoints,
    'No meeting points identified from transcript.'
  );

  renderActionItemsList(
    insightActionsList,
    meetingDocument && meetingDocument.meetingActionItems,
    'No action items identified from transcript.'
  );

  renderTimelineList(
    insightTimelineList,
    meetingDocument && meetingDocument.meetingImportantTimeline,
    'No timeline commitments identified from transcript.'
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

    currentDocument.meetingSalientPoints = Array.isArray(generatedInsights.meetingSalientPoints)
      ? generatedInsights.meetingSalientPoints
      : [];
    currentDocument.meetingActionItems = Array.isArray(generatedInsights.meetingActionItems)
      ? generatedInsights.meetingActionItems
      : [];
    currentDocument.meetingImportantTimeline = Array.isArray(generatedInsights.meetingImportantTimeline)
      ? generatedInsights.meetingImportantTimeline
      : [];
    currentDocument.meetingInsightsSource = String(generatedInsights.meetingInsightsSource || '').trim();
    currentDocument.meetingInsightsUpdatedAt = String(generatedInsights.meetingInsightsUpdatedAt || '').trim();

    meetingDetailsState.meetingDocument = currentDocument;
    renderInsights(currentDocument);

    const updatedLabel = formatInsightUpdatedAt(currentDocument.meetingInsightsUpdatedAt);
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
