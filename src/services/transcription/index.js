const { generateMeetingInsights } = require('./insights-service');
const {
  createTranscriptSession,
  deleteTranscriptSession,
  listTranscriptSessions,
  loadTranscript,
  renameTranscriptSession,
} = require('./session-service');
const { renameSpeaker } = require('./speaker-service');
const { appendTranscript, transcribeSegment } = require('./transcription-service');

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
