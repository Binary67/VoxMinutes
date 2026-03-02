const { loadWhisperConfig } = require('./config');
const { DEFAULT_SOURCE_MODEL } = require('./constants');
const {
  createTranscriptDocument,
  normalizeEditableMeetingTitle,
  toPublicTranscriptDocument,
  toSessionSummary,
} = require('./document-utils');
const { isPlainObject } = require('./payload-normalizer');
const {
  assertValidSessionId,
  createSessionId,
  deleteTranscriptDocument,
  ensureTranscriptsDirectory,
  listTranscriptSessions: listTranscriptSessionsFromRepository,
  readTranscriptDocument,
  writeTranscriptDocument,
} = require('./repository');
const { refreshLegacySummaryIfNeeded } = require('./summary-service');

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
  createTranscriptSession,
  deleteTranscriptSession,
  listTranscriptSessions,
  loadTranscript,
  renameTranscriptSession,
};
