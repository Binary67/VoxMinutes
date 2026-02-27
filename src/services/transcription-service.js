const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TRANSCRIPTS_DIR = path.join(PROJECT_ROOT, 'transcripts');
const ENV_FILE_PATH = path.join(PROJECT_ROOT, '.env');

const DEFAULT_MIME_TYPE = 'audio/webm';
const DEFAULT_SOURCE_MODEL = 'gpt-4o-transcribe-diarize';
const DEFAULT_PARTICIPANT_COUNT = 1;
const DASHBOARD_SUMMARY_MAX_LENGTH = 220;

let cachedWhisperConfig = null;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseDateOrNull(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatDefaultMeetingTitle(dateValue) {
  const date = parseDateOrNull(dateValue) || new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `Meeting ${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeMeetingTitle(value, fallbackDateValue) {
  const normalizedTitle = String(value || '')
    .trim()
    .replace(/\s+/gu, ' ');

  if (normalizedTitle) {
    return normalizedTitle;
  }

  return formatDefaultMeetingTitle(fallbackDateValue);
}

function normalizeParticipantCount(value) {
  const numericValue = Number.parseInt(value, 10);
  if (!Number.isFinite(numericValue) || numericValue < DEFAULT_PARTICIPANT_COUNT) {
    return DEFAULT_PARTICIPANT_COUNT;
  }
  return numericValue;
}

function parseEnvContent(content) {
  const values = {};
  const lines = content.split(/\r?\n/u);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

async function loadWhisperConfig() {
  if (cachedWhisperConfig) {
    return cachedWhisperConfig;
  }

  let fileConfig = {};
  try {
    const envContent = await fs.readFile(ENV_FILE_PATH, 'utf8');
    fileConfig = parseEnvContent(envContent);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const mergedConfig = {
    ...fileConfig,
    ...process.env,
  };

  cachedWhisperConfig = {
    endpoint: String(mergedConfig.APP_AZURE_WHISPER_OPENAI_ENDPOINT || '').trim(),
    apiKey: String(mergedConfig.APP_AZURE_WHISPER_API_KEY || '').trim(),
    deploymentName: String(mergedConfig.APP_AZURE_WHISPER_DEPLOYMENT_NAME || '').trim(),
    apiVersion: String(mergedConfig.APP_AZURE_WHISPER_API_VERSION || '').trim(),
  };

  return cachedWhisperConfig;
}

function requireWhisperConfig(config) {
  const missingVariables = [];

  if (!config.endpoint) {
    missingVariables.push('APP_AZURE_WHISPER_OPENAI_ENDPOINT');
  }
  if (!config.apiKey) {
    missingVariables.push('APP_AZURE_WHISPER_API_KEY');
  }
  if (!config.deploymentName) {
    missingVariables.push('APP_AZURE_WHISPER_DEPLOYMENT_NAME');
  }
  if (!config.apiVersion) {
    missingVariables.push('APP_AZURE_WHISPER_API_VERSION');
  }

  if (missingVariables.length > 0) {
    throw new Error(`Missing transcription configuration: ${missingVariables.join(', ')}`);
  }
}

function normalizeEndpoint(endpoint) {
  return endpoint.replace(/\/+$/u, '');
}

function createSessionTimestamp(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function createSessionId() {
  const timestamp = createSessionTimestamp(new Date());
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${timestamp}-${suffix}`;
}

function assertValidSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !/^[0-9A-Za-z-]+$/u.test(sessionId)) {
    throw new Error('Invalid transcript session id.');
  }
}

function getTranscriptFilePath(sessionId) {
  assertValidSessionId(sessionId);
  return path.join(TRANSCRIPTS_DIR, `${sessionId}.json`);
}

async function ensureTranscriptsDirectory() {
  await fs.mkdir(TRANSCRIPTS_DIR, { recursive: true });
}

function createTranscriptDocument(sessionId, sourceModel, metadata = {}) {
  const nowIso = new Date().toISOString();
  return {
    sessionId,
    createdAt: nowIso,
    updatedAt: nowIso,
    sourceModel: sourceModel || DEFAULT_SOURCE_MODEL,
    meetingTitle: normalizeMeetingTitle(metadata.meetingTitle, nowIso),
    participantCount: normalizeParticipantCount(metadata.participantCount),
    durationSec: null,
    meetingSummary: '',
    speakerMap: {},
    segments: [],
    fullText: '',
  };
}

function coerceTranscriptDocument(value, fallbackSessionId) {
  if (!isPlainObject(value)) {
    throw new Error('Transcript file is not a valid JSON object.');
  }

  const nowIso = new Date().toISOString();
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : nowIso;
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : nowIso;
  const normalizedSegments = Array.isArray(value.segments) ? value.segments : [];
  const fullText = typeof value.fullText === 'string' ? value.fullText : '';
  const durationSec =
    typeof value.durationSec === 'number' && Number.isFinite(value.durationSec) && value.durationSec >= 0
      ? roundSeconds(value.durationSec)
      : getTranscriptDurationSeconds(normalizedSegments);
  const persistedMeetingSummary = typeof value.meetingSummary === 'string' ? value.meetingSummary.trim() : '';
  const meetingSummary = persistedMeetingSummary || buildMeetingSummaryFromSegments(normalizedSegments);

  return {
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : fallbackSessionId,
    createdAt,
    updatedAt,
    sourceModel:
      typeof value.sourceModel === 'string' && value.sourceModel
        ? value.sourceModel
        : DEFAULT_SOURCE_MODEL,
    meetingTitle: normalizeMeetingTitle(value.meetingTitle, createdAt),
    participantCount: normalizeParticipantCount(value.participantCount),
    durationSec,
    meetingSummary,
    speakerMap: isPlainObject(value.speakerMap) ? value.speakerMap : {},
    segments: normalizedSegments,
    fullText,
  };
}

async function readTranscriptDocument(sessionId) {
  const filePath = getTranscriptFilePath(sessionId);
  const fileContent = await fs.readFile(filePath, 'utf8');
  const parsedDocument = JSON.parse(fileContent);
  return coerceTranscriptDocument(parsedDocument, sessionId);
}

async function writeTranscriptDocument(sessionId, document) {
  await ensureTranscriptsDirectory();
  const filePath = getTranscriptFilePath(sessionId);
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  await fs.writeFile(filePath, serialized, 'utf8');
  return filePath;
}

function normalizeSpeakerId(rawSpeaker, index) {
  const speakerValue = String(rawSpeaker || '').trim();
  if (!speakerValue) {
    return `speaker_${index + 1}`;
  }

  const normalized = speakerValue
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '_')
    .replace(/^_+|_+$/gu, '');

  return normalized || `speaker_${index + 1}`;
}

function nextSpeakerLabelNumber(speakerMap) {
  const usedNumbers = new Set();

  for (const label of Object.values(speakerMap)) {
    if (typeof label !== 'string') {
      continue;
    }

    const match = label.match(/^speaker\s+(\d+)$/iu);
    if (!match) {
      continue;
    }

    const labelNumber = Number.parseInt(match[1], 10);
    if (Number.isFinite(labelNumber) && labelNumber > 0) {
      usedNumbers.add(labelNumber);
    }
  }

  let candidate = 1;
  while (usedNumbers.has(candidate)) {
    candidate += 1;
  }

  return candidate;
}

function ensureSpeakerLabel(speakerMap, speakerId) {
  if (typeof speakerMap[speakerId] === 'string' && speakerMap[speakerId].trim()) {
    return;
  }

  const nextNumber = nextSpeakerLabelNumber(speakerMap);
  speakerMap[speakerId] = `Speaker ${nextNumber}`;
}

function pickFirstString(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function pickFirstNumber(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }

    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  return null;
}

function roundSeconds(value) {
  return Math.round(value * 1000) / 1000;
}

function toSeconds(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  if (Math.abs(numericValue) > 1_000_000_000) {
    return roundSeconds(numericValue / 10_000_000);
  }

  if (Math.abs(numericValue) > 1_000_000) {
    return roundSeconds(numericValue / 1000);
  }

  return roundSeconds(numericValue);
}

function normalizeSegment(rawSegment, index) {
  if (!isPlainObject(rawSegment)) {
    return null;
  }

  const text = pickFirstString(rawSegment, ['text', 'transcript', 'utterance', 'display', 'value']);
  if (!text) {
    return null;
  }

  const speakerId = normalizeSpeakerId(
    pickFirstString(rawSegment, [
      'speakerId',
      'speaker_id',
      'speaker',
      'speakerLabel',
      'speaker_label',
      'participant',
      'channel',
      'role',
    ]),
    index
  );

  const startValue = pickFirstNumber(rawSegment, [
    'startSec',
    'start',
    'start_time',
    'startTime',
    'offset',
    'offsetSeconds',
  ]);

  const endValue = pickFirstNumber(rawSegment, ['endSec', 'end', 'end_time', 'endTime']);
  const durationValue = pickFirstNumber(rawSegment, ['durationSec', 'duration', 'durationSeconds']);

  const startSec = toSeconds(startValue);
  let endSec = toSeconds(endValue);

  if (endSec === null && startSec !== null && durationValue !== null) {
    endSec = roundSeconds(startSec + toSeconds(durationValue));
  }

  return {
    speakerId,
    startSec,
    endSec,
    text,
  };
}

function getCandidateSegmentArrays(payload) {
  const candidates = [];

  if (Array.isArray(payload.segments)) {
    candidates.push(payload.segments);
  }
  if (Array.isArray(payload.diarized_segments)) {
    candidates.push(payload.diarized_segments);
  }
  if (isPlainObject(payload.results) && Array.isArray(payload.results.segments)) {
    candidates.push(payload.results.segments);
  }
  if (Array.isArray(payload.utterances)) {
    candidates.push(payload.utterances);
  }
  if (Array.isArray(payload.phrases)) {
    candidates.push(payload.phrases);
  }
  if (Array.isArray(payload.diarization_segments)) {
    candidates.push(payload.diarization_segments);
  }
  if (isPlainObject(payload.diarization) && Array.isArray(payload.diarization.segments)) {
    candidates.push(payload.diarization.segments);
  }
  if (isPlainObject(payload.output) && Array.isArray(payload.output.segments)) {
    candidates.push(payload.output.segments);
  }
  if (Array.isArray(payload.output)) {
    const outputSegments = payload.output
      .map((item) => (isPlainObject(item) && Array.isArray(item.segments) ? item.segments : null))
      .filter((value) => Array.isArray(value))
      .flat();

    if (outputSegments.length > 0) {
      candidates.push(outputSegments);
    }
  }

  return candidates;
}

function getCandidateWordArrays(payload) {
  const candidates = [];

  if (Array.isArray(payload.words)) {
    candidates.push(payload.words);
  }
  if (Array.isArray(payload.word_segments)) {
    candidates.push(payload.word_segments);
  }
  if (isPlainObject(payload.results) && Array.isArray(payload.results.words)) {
    candidates.push(payload.results.words);
  }
  if (isPlainObject(payload.output) && Array.isArray(payload.output.words)) {
    candidates.push(payload.output.words);
  }
  if (Array.isArray(payload.segments)) {
    const nestedWords = payload.segments
      .map((segment) => (isPlainObject(segment) && Array.isArray(segment.words) ? segment.words : null))
      .filter((value) => Array.isArray(value))
      .flat();

    if (nestedWords.length > 0) {
      candidates.push(nestedWords);
    }
  }

  return candidates;
}

function normalizeWord(rawWord, index) {
  if (!isPlainObject(rawWord)) {
    return null;
  }

  const text = pickFirstString(rawWord, ['word', 'text', 'token', 'value', 'display']);
  if (!text) {
    return null;
  }

  const speakerId = normalizeSpeakerId(
    pickFirstString(rawWord, [
      'speakerId',
      'speaker_id',
      'speaker',
      'speakerLabel',
      'speaker_label',
      'participant',
      'channel',
      'role',
    ]),
    index
  );

  const startValue = pickFirstNumber(rawWord, [
    'startSec',
    'start',
    'start_time',
    'startTime',
    'offset',
    'offsetSeconds',
  ]);

  const endValue = pickFirstNumber(rawWord, ['endSec', 'end', 'end_time', 'endTime']);
  const durationValue = pickFirstNumber(rawWord, ['durationSec', 'duration', 'durationSeconds']);

  const startSec = toSeconds(startValue);
  let endSec = toSeconds(endValue);
  if (endSec === null && startSec !== null && durationValue !== null) {
    endSec = roundSeconds(startSec + toSeconds(durationValue));
  }

  return {
    speakerId,
    startSec,
    endSec,
    text,
  };
}

function isPunctuationToken(token) {
  return /^[.,!?;:%)\]}]+$/u.test(token);
}

function isOpeningPunctuationToken(token) {
  return /^[(\[{]+$/u.test(token);
}

function joinWordTokens(tokens) {
  let output = '';

  for (const rawToken of tokens) {
    const token = String(rawToken || '').trim();
    if (!token) {
      continue;
    }

    if (!output) {
      output = token;
      continue;
    }

    if (isPunctuationToken(token)) {
      output += token;
      continue;
    }

    if (isOpeningPunctuationToken(token)) {
      output += ` ${token}`;
      continue;
    }

    output += ` ${token}`;
  }

  return output.trim();
}

function normalizeWordSegments(payload) {
  const candidateWordArrays = getCandidateWordArrays(payload);
  if (candidateWordArrays.length === 0) {
    return [];
  }

  const words = [];
  for (const candidate of candidateWordArrays) {
    for (let index = 0; index < candidate.length; index += 1) {
      const normalizedWord = normalizeWord(candidate[index], index);
      if (normalizedWord) {
        words.push(normalizedWord);
      }
    }

    if (words.length > 0) {
      break;
    }
  }

  if (words.length === 0) {
    return [];
  }

  const segments = [];
  let activeSegment = null;

  for (const word of words) {
    if (!activeSegment || activeSegment.speakerId !== word.speakerId) {
      if (activeSegment) {
        activeSegment.text = joinWordTokens(activeSegment.tokens);
        delete activeSegment.tokens;
        segments.push(activeSegment);
      }

      activeSegment = {
        speakerId: word.speakerId,
        startSec: word.startSec,
        endSec: word.endSec,
        tokens: [word.text],
      };
      continue;
    }

    activeSegment.tokens.push(word.text);
    if (activeSegment.startSec === null && word.startSec !== null) {
      activeSegment.startSec = word.startSec;
    }
    if (word.endSec !== null) {
      activeSegment.endSec = word.endSec;
    }
  }

  if (activeSegment) {
    activeSegment.text = joinWordTokens(activeSegment.tokens);
    delete activeSegment.tokens;
    segments.push(activeSegment);
  }

  return segments.filter((segment) => segment.text);
}

function normalizeTranscriptionPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('Transcription response was empty or invalid.');
  }

  const segments = [];
  const candidateSegmentArrays = getCandidateSegmentArrays(payload);

  for (const candidate of candidateSegmentArrays) {
    for (let index = 0; index < candidate.length; index += 1) {
      const normalized = normalizeSegment(candidate[index], index);
      if (normalized) {
        segments.push(normalized);
      }
    }

    if (segments.length > 0) {
      break;
    }
  }

  if (segments.length === 0) {
    segments.push(...normalizeWordSegments(payload));
  }

  const rawText = pickFirstString(payload, ['rawText', 'text', 'transcript']);
  if (segments.length === 0 && rawText) {
    segments.push({
      speakerId: 'speaker_1',
      startSec: null,
      endSec: null,
      text: rawText,
    });
  }

  if (segments.length === 0) {
    throw new Error('Transcription response did not include any text segments.');
  }

  return {
    rawText: rawText || segments.map((segment) => segment.text).join(' '),
    segments,
  };
}

function extractErrorMessage(payload) {
  if (!isPlainObject(payload)) {
    return '';
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }

  if (isPlainObject(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message.trim();
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  return '';
}

function createTranscriptionError(response, payloadBody) {
  const apiErrorMessage = extractErrorMessage(payloadBody);
  const statusMessage = `Transcription request failed with status ${response.status}.`;
  const error = new Error(apiErrorMessage || statusMessage);
  error.status = response.status;
  error.payloadBody = payloadBody;
  return error;
}

function isIncompatibleResponseFormatError(error) {
  if (!(error instanceof Error) || !error.message) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  if (!normalizedMessage.includes('response_format')) {
    return false;
  }

  return normalizedMessage.includes('not compatible');
}

async function requestTranscriptionFromAzure({
  requestUrl,
  apiKey,
  deploymentName,
  audioBuffer,
  mimeType,
  responseFormat,
}) {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([audioBuffer], { type: mimeType }),
    `recording.${getFileExtensionFromMime(mimeType)}`
  );
  formData.append('model', deploymentName);
  formData.append('response_format', responseFormat);
  formData.append('chunking_strategy', 'auto');

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
    },
    body: formData,
  });

  const rawResponseText = await response.text();
  let payloadBody = {};
  if (rawResponseText.trim()) {
    try {
      payloadBody = JSON.parse(rawResponseText);
    } catch (error) {
      payloadBody = { message: rawResponseText };
    }
  }

  if (!response.ok) {
    throw createTranscriptionError(response, payloadBody);
  }

  return payloadBody;
}

function getFileExtensionFromMime(mimeType) {
  const normalized = String(mimeType || DEFAULT_MIME_TYPE).toLowerCase();
  if (normalized.includes('mp4')) {
    return 'mp4';
  }
  if (normalized.includes('mpeg')) {
    return 'mp3';
  }
  if (normalized.includes('ogg')) {
    return 'ogg';
  }
  if (normalized.includes('wav')) {
    return 'wav';
  }
  return 'webm';
}

function getLastTimelineSecond(segments) {
  let latestSecond = 0;

  for (const segment of segments) {
    if (!isPlainObject(segment)) {
      continue;
    }

    const segmentEnd = toSeconds(segment.endSec);
    const segmentStart = toSeconds(segment.startSec);
    if (segmentEnd !== null) {
      latestSecond = Math.max(latestSecond, segmentEnd);
      continue;
    }
    if (segmentStart !== null) {
      latestSecond = Math.max(latestSecond, segmentStart);
    }
  }

  return latestSecond;
}

function buildMeetingSummaryFromSegments(segments) {
  const combinedText = segments
    .map((segment) => (isPlainObject(segment) ? String(segment.text || '').trim() : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!combinedText) {
    return '';
  }

  if (combinedText.length <= DASHBOARD_SUMMARY_MAX_LENGTH) {
    return combinedText;
  }

  return `${combinedText.slice(0, DASHBOARD_SUMMARY_MAX_LENGTH - 3).trimEnd()}...`;
}

function getTranscriptDurationSeconds(segments) {
  const lastSecond = roundSeconds(getLastTimelineSecond(segments));
  return lastSecond > 0 ? lastSecond : null;
}

function buildFullText(document) {
  return document.segments
    .map((segment) => {
      const speakerName = document.speakerMap[segment.speakerId] || segment.speakerId;
      return `${speakerName}: ${segment.text}`;
    })
    .join('\n');
}

function applyDerivedDocumentFields(document) {
  document.fullText = buildFullText(document);
  document.durationSec = getTranscriptDurationSeconds(document.segments);
  document.meetingSummary = buildMeetingSummaryFromSegments(document.segments);
}

function createSegmentId(chunkIndex, segmentIndex) {
  return `${chunkIndex}-${segmentIndex + 1}-${crypto.randomBytes(4).toString('hex')}`;
}

function toPublicTranscriptDocument(document) {
  return {
    sessionId: document.sessionId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    sourceModel: document.sourceModel,
    meetingTitle: document.meetingTitle,
    participantCount: document.participantCount,
    durationSec: document.durationSec,
    meetingSummary: document.meetingSummary,
    speakerMap: document.speakerMap,
    segments: document.segments,
    fullText: document.fullText,
  };
}

function toSessionSummary(document) {
  const segmentCount = document.segments.reduce((count, segment) => {
    if (!isPlainObject(segment)) {
      return count;
    }
    const text = String(segment.text || '').trim();
    return text ? count + 1 : count;
  }, 0);

  return {
    sessionId: document.sessionId,
    meetingTitle: document.meetingTitle,
    participantCount: document.participantCount,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    durationSec: document.durationSec,
    meetingSummary: document.meetingSummary,
    segmentCount,
  };
}

function toTimestampOrZero(value) {
  const parsedDate = parseDateOrNull(value);
  if (!parsedDate) {
    return 0;
  }
  return parsedDate.getTime();
}

async function listTranscriptSessions() {
  let directoryEntries;
  try {
    directoryEntries = await fs.readdir(TRANSCRIPTS_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const transcriptFiles = directoryEntries.filter(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json')
  );

  const sessionSummaries = [];
  for (const transcriptFile of transcriptFiles) {
    const sessionId = path.parse(transcriptFile.name).name;
    try {
      const document = await readTranscriptDocument(sessionId);
      if (!Array.isArray(document.segments) || document.segments.length === 0) {
        continue;
      }
      const sessionSummary = toSessionSummary(document);
      if (sessionSummary.segmentCount === 0) {
        continue;
      }
      sessionSummaries.push(sessionSummary);
    } catch (_error) {
      // Skip malformed transcript files without failing dashboard load.
    }
  }

  sessionSummaries.sort((left, right) => {
    const rightTimestamp = toTimestampOrZero(right.updatedAt);
    const leftTimestamp = toTimestampOrZero(left.updatedAt);
    return rightTimestamp - leftTimestamp;
  });

  return sessionSummaries;
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

module.exports = {
  appendTranscript,
  createTranscriptSession,
  listTranscriptSessions,
  loadTranscript,
  renameSpeaker,
  transcribeSegment,
};
