const crypto = require('node:crypto');

const { isIncompatibleResponseFormatError, requestTranscriptionFromAzure } = require('./azure-client');
const { loadWhisperConfig, normalizeEndpoint, requireWhisperConfig } = require('./config');
const { DEFAULT_MIME_TYPE, DEFAULT_SOURCE_MODEL } = require('./constants');
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

function createSegmentId(chunkIndex, segmentIndex) {
  return `${chunkIndex}-${segmentIndex + 1}-${crypto.randomBytes(4).toString('hex')}`;
}

async function listTranscriptSessions() {
  return listTranscriptSessionsFromRepository();
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
  listTranscriptSessions,
  loadTranscript,
  renameTranscriptSession,
  renameSpeaker,
  transcribeSegment,
};
