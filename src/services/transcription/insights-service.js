const { loadSummaryModelConfig, requireSummaryModelConfig } = require('./config');
const { MEETING_SUMMARY_MAX_WORDS, SUMMARY_SOURCE_AZURE_OPENAI } = require('./constants');
const { assertValidSessionId, readTranscriptDocument, writeTranscriptDocument } = require('./repository');
const {
  buildSummaryInputFromSegments,
  normalizeInlineText,
  normalizeSummaryText,
} = require('./summary-service');
const { requestMeetingInsightsFromAzure } = require('./summary-client');

const MAX_INSIGHT_ITEMS = 6;

function normalizeInsightItemText(itemText) {
  return normalizeInlineText(itemText)
    .replace(/^[\-\u2022*]+\s*/u, '')
    .replace(/^["'`]+|["'`]+$/gu, '');
}

function normalizeInsightItems(items) {
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

function assignMeetingInsights(document, insights, summarySource) {
  const summaryText = normalizeSummaryText(insights.summary);
  document.meetingSummary = summaryText;
  document.meetingKeyDecisions = normalizeInsightItems(insights.keyDecisions);
  document.meetingActionItems = normalizeInsightItems(insights.actionItems);
  document.meetingSummarySource = summarySource;
  document.meetingSummaryUpdatedAt = new Date().toISOString();
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

  assignMeetingInsights(document, rawInsights, SUMMARY_SOURCE_AZURE_OPENAI);
}

async function generateMeetingInsights(payload) {
  const sessionId = payload && payload.sessionId;
  assertValidSessionId(sessionId);

  const document = await readTranscriptDocument(sessionId);
  await generateMeetingInsightsForDocument(document);
  await writeTranscriptDocument(sessionId, document);

  return {
    sessionId: document.sessionId,
    meetingSummary: document.meetingSummary,
    meetingKeyDecisions: document.meetingKeyDecisions,
    meetingActionItems: document.meetingActionItems,
    meetingSummarySource: document.meetingSummarySource,
    meetingSummaryUpdatedAt: document.meetingSummaryUpdatedAt,
  };
}

module.exports = {
  generateMeetingInsights,
};
