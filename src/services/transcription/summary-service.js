const { loadSummaryModelConfig, requireSummaryModelConfig } = require('./config');
const {
  MEETING_SUMMARY_ERROR_MAX_CHARS,
  MEETING_SUMMARY_INPUT_MAX_CHARS,
  MEETING_SUMMARY_MAX_WORDS,
  SUMMARY_ERROR_RETRY_INTERVAL_MS,
  SUMMARY_SOURCE_AZURE_OPENAI,
  SUMMARY_SOURCE_ERROR,
} = require('./constants');
const { toSessionSummary } = require('./document-utils');
const { isPlainObject } = require('./payload-normalizer');
const { readTranscriptDocument, writeTranscriptDocument } = require('./repository');
const { requestMeetingSummaryFromAzure } = require('./summary-client');

function normalizeInlineText(value) {
  return String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function buildSummaryInputFromSegments(segments) {
  const combinedText = segments
    .map((segment) => (isPlainObject(segment) ? normalizeInlineText(segment.text) : ''))
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!combinedText) {
    return '';
  }

  if (combinedText.length <= MEETING_SUMMARY_INPUT_MAX_CHARS) {
    return combinedText;
  }

  const leadingLength = Math.floor(MEETING_SUMMARY_INPUT_MAX_CHARS * 0.55);
  const trailingLength = Math.max(0, MEETING_SUMMARY_INPUT_MAX_CHARS - leadingLength);
  const leadingText = combinedText.slice(0, leadingLength).trimEnd();
  const trailingText = combinedText.slice(combinedText.length - trailingLength).trimStart();

  return normalizeInlineText(`${leadingText} ${trailingText}`);
}

function normalizeSummaryText(summaryText) {
  const normalizedSummary = normalizeInlineText(summaryText)
    .replace(/^[\-\u2022*]+\s*/u, '')
    .replace(/^["'`]+|["'`]+$/gu, '');

  if (!normalizedSummary) {
    throw new Error('Summary response did not include text.');
  }

  const firstSentenceMatch = normalizedSummary.match(/^[^.!?]+[.!?]?/u);
  const firstSentence = normalizeInlineText(firstSentenceMatch ? firstSentenceMatch[0] : normalizedSummary);
  if (!firstSentence) {
    throw new Error('Summary response did not include text.');
  }

  const words = firstSentence.split(/\s+/u).filter(Boolean);
  const clippedWords = words.slice(0, MEETING_SUMMARY_MAX_WORDS);
  let conciseSummary = clippedWords.join(' ').replace(/[,:;]+$/u, '').trim();

  if (!conciseSummary) {
    throw new Error('Summary response did not include text.');
  }

  if (!/[.!?]$/u.test(conciseSummary)) {
    conciseSummary = `${conciseSummary}.`;
  }

  return conciseSummary;
}

function formatSummaryErrorMessage(error) {
  const defaultMessage = 'Summary unavailable: AI summary generation failed.';
  const normalizedErrorMessage =
    error instanceof Error ? normalizeInlineText(error.message) : normalizeInlineText(error);

  const summaryErrorMessage = normalizedErrorMessage
    ? `Summary unavailable: ${normalizedErrorMessage}`
    : defaultMessage;

  if (summaryErrorMessage.length <= MEETING_SUMMARY_ERROR_MAX_CHARS) {
    return summaryErrorMessage;
  }

  return `${summaryErrorMessage.slice(0, MEETING_SUMMARY_ERROR_MAX_CHARS - 3).trimEnd()}...`;
}

function assignMeetingSummary(document, summaryText, summarySource) {
  document.meetingSummary = summaryText;
  document.meetingSummarySource = summarySource;
  document.meetingSummaryUpdatedAt = new Date().toISOString();
}

async function generateMeetingSummary(document) {
  const config = await loadSummaryModelConfig();
  requireSummaryModelConfig(config);

  const transcriptText = buildSummaryInputFromSegments(document.segments);
  if (!transcriptText) {
    throw new Error('Transcript is empty.');
  }

  const rawSummary = await requestMeetingSummaryFromAzure({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    deploymentName: config.deploymentName,
    apiVersion: config.apiVersion,
    meetingTitle: document.meetingTitle,
    transcriptText,
    wordLimit: MEETING_SUMMARY_MAX_WORDS,
  });

  return normalizeSummaryText(rawSummary);
}

async function updateMeetingSummary(document) {
  try {
    const conciseSummary = await generateMeetingSummary(document);
    assignMeetingSummary(document, conciseSummary, SUMMARY_SOURCE_AZURE_OPENAI);
  } catch (error) {
    assignMeetingSummary(document, formatSummaryErrorMessage(error), SUMMARY_SOURCE_ERROR);
  }
}

function shouldRefreshLegacySummary(sessionSummary) {
  if (!isPlainObject(sessionSummary)) {
    return false;
  }

  const segmentCount = Number(sessionSummary.segmentCount);
  if (!Number.isFinite(segmentCount) || segmentCount <= 0) {
    return false;
  }

  const summarySource = normalizeInlineText(sessionSummary.meetingSummarySource);
  if (summarySource === SUMMARY_SOURCE_AZURE_OPENAI) {
    return false;
  }

  if (summarySource === SUMMARY_SOURCE_ERROR) {
    const summaryUpdatedAt = normalizeInlineText(sessionSummary.meetingSummaryUpdatedAt);
    const summaryUpdatedTimestamp = summaryUpdatedAt ? new Date(summaryUpdatedAt).getTime() : 0;
    if (!Number.isFinite(summaryUpdatedTimestamp) || summaryUpdatedTimestamp <= 0) {
      return true;
    }

    return Date.now() - summaryUpdatedTimestamp >= SUMMARY_ERROR_RETRY_INTERVAL_MS;
  }

  return true;
}

async function refreshLegacySummaryIfNeeded(sessionSummary) {
  if (!shouldRefreshLegacySummary(sessionSummary)) {
    return sessionSummary;
  }

  const sessionId = normalizeInlineText(sessionSummary.sessionId);
  if (!sessionId) {
    return sessionSummary;
  }

  let document;
  try {
    document = await readTranscriptDocument(sessionId);
  } catch (_error) {
    return sessionSummary;
  }

  if (!Array.isArray(document.segments) || document.segments.length === 0) {
    return sessionSummary;
  }

  await updateMeetingSummary(document);
  await writeTranscriptDocument(sessionId, document);
  return toSessionSummary(document);
}

module.exports = {
  buildSummaryInputFromSegments,
  normalizeInlineText,
  normalizeSummaryText,
  refreshLegacySummaryIfNeeded,
  updateMeetingSummary,
};
