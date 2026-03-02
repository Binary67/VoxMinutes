const crypto = require('node:crypto');

const { isIncompatibleResponseFormatError, requestTranscriptionFromAzure } = require('./azure-client');
const { loadWhisperConfig, normalizeEndpoint, requireWhisperConfig } = require('./config');
const { DEFAULT_MIME_TYPE } = require('./constants');
const {
  applyDerivedDocumentFields,
  ensureSpeakerLabel,
  toPublicTranscriptDocument,
} = require('./document-utils');
const {
  getLastTimelineSecond,
  isPlainObject,
  normalizeSpeakerId,
  normalizeTranscriptionPayload,
  roundSeconds,
  toSeconds,
} = require('./payload-normalizer');
const { assertValidSessionId, readTranscriptDocument, writeTranscriptDocument } = require('./repository');
const { updateMeetingSummary } = require('./summary-service');

function createSegmentId(chunkIndex, segmentIndex) {
  return `${chunkIndex}-${segmentIndex + 1}-${crypto.randomBytes(4).toString('hex')}`;
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

module.exports = {
  appendTranscript,
  transcribeSegment,
};
