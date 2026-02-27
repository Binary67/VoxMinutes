const {
  DEFAULT_PARTICIPANT_COUNT,
  DEFAULT_SOURCE_MODEL,
  MAX_MEETING_TITLE_LENGTH,
} = require('./constants');
const { getLastTimelineSecond, isPlainObject, roundSeconds } = require('./payload-normalizer');

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

function normalizeEditableMeetingTitle(value) {
  const normalizedTitle = String(value || '')
    .trim()
    .replace(/\s+/gu, ' ');

  if (!normalizedTitle) {
    throw new Error('Meeting title cannot be empty.');
  }

  if (normalizedTitle.length > MAX_MEETING_TITLE_LENGTH) {
    throw new Error(`Meeting title cannot exceed ${MAX_MEETING_TITLE_LENGTH} characters.`);
  }

  return normalizedTitle;
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
    meetingSummarySource: '',
    meetingSummaryUpdatedAt: '',
    speakerMap: {},
    segments: [],
    fullText: '',
  };
}

function getTranscriptDurationSeconds(segments) {
  const lastSecond = roundSeconds(getLastTimelineSecond(segments));
  return lastSecond > 0 ? lastSecond : null;
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
  const meetingSummary = typeof value.meetingSummary === 'string' ? value.meetingSummary.trim() : '';
  const meetingSummarySource =
    typeof value.meetingSummarySource === 'string' ? value.meetingSummarySource.trim() : '';
  const meetingSummaryUpdatedAt =
    typeof value.meetingSummaryUpdatedAt === 'string' ? value.meetingSummaryUpdatedAt : '';

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
    meetingSummarySource,
    meetingSummaryUpdatedAt,
    speakerMap: isPlainObject(value.speakerMap) ? value.speakerMap : {},
    segments: normalizedSegments,
    fullText,
  };
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
    meetingSummarySource: document.meetingSummarySource,
    meetingSummaryUpdatedAt: document.meetingSummaryUpdatedAt,
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
    meetingSummarySource: document.meetingSummarySource,
    meetingSummaryUpdatedAt: document.meetingSummaryUpdatedAt,
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

module.exports = {
  applyDerivedDocumentFields,
  coerceTranscriptDocument,
  createTranscriptDocument,
  ensureSpeakerLabel,
  normalizeEditableMeetingTitle,
  toPublicTranscriptDocument,
  toSessionSummary,
  toTimestampOrZero,
};
