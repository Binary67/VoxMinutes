const { applyDerivedDocumentFields, toPublicTranscriptDocument } = require('./document-utils');
const { normalizeSpeakerId } = require('./payload-normalizer');
const { assertValidSessionId, readTranscriptDocument, writeTranscriptDocument } = require('./repository');

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
  renameSpeaker,
};
