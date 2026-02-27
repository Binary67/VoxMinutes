const crypto = require('node:crypto');

const { isIncompatibleResponseFormatError, requestTranscriptionFromAzure } = require('./azure-client');
const {
  loadSummaryModelConfig,
  loadWhisperConfig,
  normalizeEndpoint,
  requireSummaryModelConfig,
  requireWhisperConfig,
} = require('./config');
const {
  DEFAULT_MIME_TYPE,
  DEFAULT_SOURCE_MODEL,
  MEETING_SUMMARY_ERROR_MAX_CHARS,
  MEETING_SUMMARY_INPUT_MAX_CHARS,
  MEETING_SUMMARY_MAX_WORDS,
  SUMMARY_ERROR_RETRY_INTERVAL_MS,
  SUMMARY_SOURCE_AZURE_OPENAI,
  SUMMARY_SOURCE_ERROR,
} = require('./constants');
const {
  applyDerivedDocumentFields,
  createTranscriptDocument,
  ensureSpeakerLabel,
  normalizeEditableMeetingTitle,
  toPublicTranscriptDocument,
  toSessionSummary,
} = require('./document-utils');
const {
  getLastTimelineSecond,
  isPlainObject,
  normalizeSpeakerId,
  normalizeTranscriptionPayload,
  roundSeconds,
  toSeconds,
} = require('./payload-normalizer');
const {
  assertValidSessionId,
  createSessionId,
  deleteTranscriptDocument,
  ensureTranscriptsDirectory,
  listTranscriptSessions: listTranscriptSessionsFromRepository,
  readTranscriptDocument,
  writeTranscriptDocument,
} = require('./repository');
const { requestMeetingInsightsFromAzure, requestMeetingSummaryFromAzure } = require('./summary-client');

const MAX_INSIGHT_ITEMS = 6;

function createSegmentId(chunkIndex, segmentIndex) {
  return `${chunkIndex}-${segmentIndex + 1}-${crypto.randomBytes(4).toString('hex')}`;
}

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

function assignMeetingInsights(document, insights, summarySource) {
  const summaryText = normalizeSummaryText(insights.summary);
  document.meetingSummary = summaryText;
  document.meetingKeyDecisions = normalizeInsightItems(insights.keyDecisions);
  document.meetingActionItems = normalizeInsightItems(insights.actionItems);
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

async function listTranscriptSessions() {
  const sessionSummaries = await listTranscriptSessionsFromRepository();
  if (sessionSummaries.length === 0) {
    return sessionSummaries;
  }

  const refreshedSummaries = [];
  for (const sessionSummary of sessionSummaries) {
    const refreshedSummary = await refreshLegacySummaryIfNeeded(sessionSummary);
    refreshedSummaries.push(refreshedSummary);
  }

  return refreshedSummaries;
}

async function createTranscriptSession(payload) {
  await ensureTranscriptsDirectory();

  const config = await loadWhisperConfig();
  const sessionId = createSessionId();
  const sourceModel = config.deploymentName || DEFAULT_SOURCE_MODEL;
  const sessionMetadata = isPlainObject(payload) ? payload : {};
  const document = createTranscriptDocument(sessionId, sourceModel, sessionMetadata);
  const filePath = await writeTranscriptDocument(sessionId, document);

  return {
    sessionId,
    filePath,
    document: toPublicTranscriptDocument(document),
  };
}

async function loadTranscript(payload) {
  const sessionId = payload && payload.sessionId;
  assertValidSessionId(sessionId);
  const document = await readTranscriptDocument(sessionId);
  return toPublicTranscriptDocument(document);
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

async function transcribeSegment(payload) {
  const config = await loadWhisperConfig();
  requireWhisperConfig(config);

  const audioBase64 = payload && payload.audioBase64;
  if (typeof audioBase64 !== 'string' || !audioBase64.trim()) {
    throw new Error('Audio payload is required for transcription.');
  }

  const mimeType =
    payload && typeof payload.mimeType === 'string' && payload.mimeType.trim()
      ? payload.mimeType.trim()
      : DEFAULT_MIME_TYPE;

  const audioBuffer = Buffer.from(audioBase64, 'base64');
  if (!audioBuffer.length) {
    throw new Error('Audio payload is empty.');
  }

  if (typeof fetch !== 'function' || typeof FormData === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('Runtime does not support fetch/FormData required for transcription.');
  }

  const requestUrl =
    `${normalizeEndpoint(config.endpoint)}/openai/deployments/` +
    `${encodeURIComponent(config.deploymentName)}/audio/transcriptions` +
    `?api-version=${encodeURIComponent(config.apiVersion)}`;

  try {
    const diarizedResponse = await requestTranscriptionFromAzure({
      requestUrl,
      apiKey: config.apiKey,
      deploymentName: config.deploymentName,
      audioBuffer,
      mimeType,
      responseFormat: 'diarized_json',
    });

    return normalizeTranscriptionPayload(diarizedResponse);
  } catch (error) {
    if (!isIncompatibleResponseFormatError(error)) {
      throw error;
    }

    const jsonResponse = await requestTranscriptionFromAzure({
      requestUrl,
      apiKey: config.apiKey,
      deploymentName: config.deploymentName,
      audioBuffer,
      mimeType,
      responseFormat: 'json',
    });

    return normalizeTranscriptionPayload(jsonResponse);
  }
}

async function appendTranscript(payload) {
  const sessionId = payload && payload.sessionId;
  assertValidSessionId(sessionId);

  const transcriptionResult = payload && payload.transcriptionResult;
  const normalizedTranscription = normalizeTranscriptionPayload(transcriptionResult);
  const document = await readTranscriptDocument(sessionId);

  const currentChunkIndex = document.segments.reduce((maxValue, segment) => {
    if (!isPlainObject(segment)) {
      return maxValue;
    }
    const chunkIndex = Number(segment.chunkIndex);
    if (!Number.isFinite(chunkIndex)) {
      return maxValue;
    }
    return Math.max(maxValue, chunkIndex);
  }, 0);

  const nextChunkIndex = currentChunkIndex + 1;
  const timelineOffsetSec = getLastTimelineSecond(document.segments);
  const createdAt = new Date().toISOString();

  const appendedSegments = normalizedTranscription.segments
    .map((segment, index) => {
      const speakerId = normalizeSpeakerId(segment.speakerId, index);
      ensureSpeakerLabel(document.speakerMap, speakerId);

      const startSec = toSeconds(segment.startSec);
      const endSec = toSeconds(segment.endSec);

      return {
        id: createSegmentId(nextChunkIndex, index),
        chunkIndex: nextChunkIndex,
        startSec: startSec === null ? null : roundSeconds(startSec + timelineOffsetSec),
        endSec: endSec === null ? null : roundSeconds(endSec + timelineOffsetSec),
        speakerId,
        text: String(segment.text || '').trim(),
        createdAt,
      };
    })
    .filter((segment) => segment.text);

  if (appendedSegments.length === 0) {
    throw new Error('No transcript segments were available to append.');
  }

  document.segments.push(...appendedSegments);
  document.updatedAt = createdAt;
  applyDerivedDocumentFields(document);
  await updateMeetingSummary(document);

  await writeTranscriptDocument(sessionId, document);
  return toPublicTranscriptDocument(document);
}

async function renameSpeaker(payload) {
  const sessionId = payload && payload.sessionId;
  assertValidSessionId(sessionId);

  const speakerId = normalizeSpeakerId(payload && payload.speakerId, 0);
  const displayName = payload && typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
  if (!displayName) {
    throw new Error('Speaker name cannot be empty.');
  }

  const document = await readTranscriptDocument(sessionId);
  document.speakerMap[speakerId] = displayName;
  document.updatedAt = new Date().toISOString();
  applyDerivedDocumentFields(document);

  await writeTranscriptDocument(sessionId, document);
  return toPublicTranscriptDocument(document);
}

async function renameTranscriptSession(payload) {
  const sessionId = payload && payload.sessionId;
  assertValidSessionId(sessionId);

  const meetingTitle = normalizeEditableMeetingTitle(payload && payload.meetingTitle);
  let document;
  try {
    document = await readTranscriptDocument(sessionId);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Transcript session was not found.');
    }
    throw error;
  }
  document.meetingTitle = meetingTitle;
  document.updatedAt = new Date().toISOString();

  await writeTranscriptDocument(sessionId, document);
  return toSessionSummary(document);
}

async function deleteTranscriptSession(payload) {
  const sessionId = payload && payload.sessionId;
  assertValidSessionId(sessionId);

  try {
    await deleteTranscriptDocument(sessionId);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Transcript session was not found.');
    }
    throw error;
  }

  return {
    sessionId,
    deleted: true,
  };
}

module.exports = {
  appendTranscript,
  createTranscriptSession,
  deleteTranscriptSession,
  generateMeetingInsights,
  listTranscriptSessions,
  loadTranscript,
  renameTranscriptSession,
  renameSpeaker,
  transcribeSegment,
};
