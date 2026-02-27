const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { TRANSCRIPTS_DIR } = require('./constants');
const { coerceTranscriptDocument, toSessionSummary, toTimestampOrZero } = require('./document-utils');

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

async function deleteTranscriptDocument(sessionId) {
  await fs.unlink(getTranscriptFilePath(sessionId));
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

module.exports = {
  assertValidSessionId,
  createSessionId,
  deleteTranscriptDocument,
  ensureTranscriptsDirectory,
  readTranscriptDocument,
  listTranscriptSessions,
  writeTranscriptDocument,
};
