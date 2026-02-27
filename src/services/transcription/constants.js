const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const TRANSCRIPTS_DIR = path.join(PROJECT_ROOT, 'transcripts');
const ENV_FILE_PATH = path.join(PROJECT_ROOT, '.env');

const DEFAULT_MIME_TYPE = 'audio/webm';
const DEFAULT_SOURCE_MODEL = 'gpt-4o-transcribe-diarize';
const DEFAULT_PARTICIPANT_COUNT = 1;
const MAX_MEETING_TITLE_LENGTH = 160;
const DASHBOARD_SUMMARY_MAX_LENGTH = 220;

module.exports = {
  DASHBOARD_SUMMARY_MAX_LENGTH,
  DEFAULT_MIME_TYPE,
  DEFAULT_PARTICIPANT_COUNT,
  DEFAULT_SOURCE_MODEL,
  ENV_FILE_PATH,
  MAX_MEETING_TITLE_LENGTH,
  PROJECT_ROOT,
  TRANSCRIPTS_DIR,
};
