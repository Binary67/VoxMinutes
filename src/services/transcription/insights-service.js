const { loadSummaryModelConfig, requireSummaryModelConfig } = require('./config');
const { MEETING_SUMMARY_MAX_WORDS, SUMMARY_SOURCE_AZURE_OPENAI } = require('./constants');
const { assertValidSessionId, readTranscriptDocument, writeTranscriptDocument } = require('./repository');
const { buildSummaryInputFromSegments, normalizeInlineText } = require('./summary-service');
const { requestMeetingInsightsFromAzure } = require('./summary-client');

const MAX_INSIGHT_ITEMS = 6;

function normalizeInsightItemText(itemText) {
  return normalizeInlineText(itemText)
    .replace(/^[\-\u2022*]+\s*/u, '')
    .replace(/^["'`]+|["'`]+$/gu, '');
}

function normalizeInsightEvidenceQuote(quoteText) {
  return normalizeInlineText(quoteText).replace(/^["'`]+|["'`]+$/gu, '');
}

function normalizeTranscriptSearchText(value) {
  return normalizeInlineText(value).toLowerCase();
}

function hasTranscriptEvidence(transcriptSearchText, evidenceQuote) {
  if (!transcriptSearchText) {
    return false;
  }

  const normalizedQuote = normalizeTranscriptSearchText(evidenceQuote);
  if (!normalizedQuote) {
    return false;
  }

  return transcriptSearchText.includes(normalizedQuote);
}

function normalizeSalientPoints(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const dedupedItems = [];
  const seenItems = new Set();

  for (const item of items) {
    const normalizedItem = normalizeInsightItemText(item);
    if (!normalizedItem) {
      continue;
    }

    const dedupeKey = normalizedItem.toLowerCase();
    if (seenItems.has(dedupeKey)) {
      continue;
    }

    seenItems.add(dedupeKey);
    dedupedItems.push(normalizedItem);
    if (dedupedItems.length >= MAX_INSIGHT_ITEMS) {
      break;
    }
  }

  return dedupedItems;
}

function normalizeActionItems(items, transcriptSearchText) {
  if (!Array.isArray(items)) {
    return [];
  }

  const dedupedItems = [];
  const seenItems = new Set();

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const task = normalizeInsightItemText(item.task);
    const evidenceQuote = normalizeInsightEvidenceQuote(item.evidenceQuote);
    if (!task || !evidenceQuote || !hasTranscriptEvidence(transcriptSearchText, evidenceQuote)) {
      continue;
    }

    const dedupeKey = `${task.toLowerCase()}|${evidenceQuote.toLowerCase()}`;
    if (seenItems.has(dedupeKey)) {
      continue;
    }

    seenItems.add(dedupeKey);
    dedupedItems.push({ task, evidenceQuote });
    if (dedupedItems.length >= MAX_INSIGHT_ITEMS) {
      break;
    }
  }

  return dedupedItems;
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

function normalizeImportantTimeline(items, transcriptSearchText) {
  if (!Array.isArray(items)) {
    return [];
  }

  const dedupedItems = [];
  const seenItems = new Set();

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const date = normalizeIsoDate(item.date);
    const task = normalizeInsightItemText(item.task);
    const evidenceQuote = normalizeInsightEvidenceQuote(item.evidenceQuote);

    if (!date || !task || !evidenceQuote || !hasTranscriptEvidence(transcriptSearchText, evidenceQuote)) {
      continue;
    }

    const dedupeKey = `${date}|${task.toLowerCase()}|${evidenceQuote.toLowerCase()}`;
    if (seenItems.has(dedupeKey)) {
      continue;
    }

    seenItems.add(dedupeKey);
    dedupedItems.push({ date, task, evidenceQuote });
  }

  dedupedItems.sort((left, right) => left.date.localeCompare(right.date));
  return dedupedItems.slice(0, MAX_INSIGHT_ITEMS);
}

function assignMeetingInsights(document, insights, summarySource, transcriptText) {
  const transcriptSearchText = normalizeTranscriptSearchText(transcriptText);

  document.meetingSalientPoints = normalizeSalientPoints(insights.salientPoints);
  document.meetingActionItems = normalizeActionItems(insights.actionItems, transcriptSearchText);
  document.meetingImportantTimeline = normalizeImportantTimeline(
    insights.importantTimeline,
    transcriptSearchText
  );
  document.meetingInsightsSource = summarySource;
  document.meetingInsightsUpdatedAt = new Date().toISOString();
}

async function generateMeetingInsightsForDocument(document) {
  const config = await loadSummaryModelConfig();
  requireSummaryModelConfig(config);

  const transcriptText = buildSummaryInputFromSegments(document.segments);
  if (!transcriptText) {
    throw new Error('Transcript is empty.');
  }

  const rawInsights = await requestMeetingInsightsFromAzure({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    deploymentName: config.deploymentName,
    apiVersion: config.apiVersion,
    meetingTitle: document.meetingTitle,
    transcriptText,
    wordLimit: MEETING_SUMMARY_MAX_WORDS,
    maxItems: MAX_INSIGHT_ITEMS,
  });

  assignMeetingInsights(document, rawInsights, SUMMARY_SOURCE_AZURE_OPENAI, transcriptText);
}

async function generateMeetingInsights(payload) {
  const sessionId = payload && payload.sessionId;
  assertValidSessionId(sessionId);

  const document = await readTranscriptDocument(sessionId);
  await generateMeetingInsightsForDocument(document);
  await writeTranscriptDocument(sessionId, document);

  return {
    sessionId: document.sessionId,
    meetingSalientPoints: document.meetingSalientPoints,
    meetingActionItems: document.meetingActionItems,
    meetingImportantTimeline: document.meetingImportantTimeline,
    meetingInsightsSource: document.meetingInsightsSource,
    meetingInsightsUpdatedAt: document.meetingInsightsUpdatedAt,
  };
}

module.exports = {
  generateMeetingInsights,
};
