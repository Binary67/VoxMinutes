# AI Note

AI Note is an Electron desktop app for recording meetings, transcribing speech with speaker separation, and turning transcripts into concise meeting intelligence.

## Functional Overview

The codebase is built around one core workflow:

1. Create a meeting session.
2. Capture one or more audio segments from the microphone.
3. Transcribe each segment with speaker-aware output.
4. Append segments to a persistent transcript document.
5. Generate and refresh AI summary metadata.
6. Review full transcript and insights in meeting details views.

## Core Functionality

### 1) Recording Session Lifecycle
- Starts a transcript session before first capture.
- Stores session metadata (`meetingTitle`, `participantCount`, `sourceModel`, timestamps).
- Supports multiple record/stop cycles that append to one session timeline.
- Persists everything as JSON under `transcripts/`.

### 2) Live Audio Capture and Processing
- Uses `navigator.mediaDevices.getUserMedia` and `MediaRecorder`.
- Detects a supported MIME type and falls back safely.
- Converts captured audio blobs to base64 and sends to main process.
- Applies mute/unmute preference to active audio tracks.

### 3) Transcription Pipeline
- Calls Azure OpenAI transcription endpoint with diarization-first strategy.
- Falls back from `diarized_json` to `json` when format compatibility fails.
- Normalizes many possible payload shapes (`segments`, `utterances`, `words`, nested outputs).
- Produces canonical transcript segments with:
  - stable `speakerId`
  - timeline offsets across chunks
  - per-segment IDs and timestamps

### 4) Speaker Mapping and Rename
- Auto-assigns readable speaker labels (`Speaker 1`, `Speaker 2`, ...).
- Supports in-transcript speaker renaming from the Recording view.
- Rebuilds transcript text after rename and saves immediately.

### 5) AI Summary and Insight Generation
- Auto-updates a concise meeting summary when transcript changes.
- Summary output is constrained to short dashboard-friendly text.
- Meeting Details can trigger structured insight generation:
  - summary sentence
  - key decisions list
  - action items list
- Includes retry gating for previous summary errors to avoid aggressive regeneration.

### 6) Meetings Management
- Dashboard shows recent meetings and derived productivity metrics.
- Meetings list supports filtering by title/summary text.
- Supports rename and delete actions on saved sessions.
- Meeting Details renders full transcript plus generated insights.

## UI Surface

### Dashboard (`src/dashboard.html`, `src/dashboard.js`)
- Recent meetings cards
- Search and quick filtering
- New recording modal (title + participant count)
- Rename/delete session actions
- Estimated time saved and productivity lift metrics

### Recording (`src/recording.html`, `src/recording.js`)
- Recording state machine (`idle`, `recording`, `processing`, `ready`, `error`)
- Timer, mute control, start/stop controls
- Transcript feed with interactive speaker rename

### Meetings (`src/meetings.html`, `src/meetings.js`)
- Full saved meeting index
- Searchable list with metadata and summaries

### Meeting Details (`src/meeting-details.html`, `src/meeting-details.js`)
- Transcript review view
- On-demand AI insights generation
- Status/error messaging for insight operations

## Architecture

### Main Process
- `src/index.js`
  - Creates BrowserWindow
  - Configures media permission handlers
  - Registers IPC handlers for recording and transcript actions

### Secure Renderer Bridge
- `src/preload.js`
  - Exposes `window.recordingApi`
  - Defines typed IPC entry points used by renderer pages

### Service Layer
- `src/services/transcription/service.js`
  - Orchestrates session create/load/list/delete
  - Handles transcription append, speaker rename, session rename
  - Generates summary and detailed insights

- `src/services/transcription/repository.js`
  - File-backed storage for transcript JSON documents
  - Session ID creation and sorted session listing

- `src/services/transcription/payload-normalizer.js`
  - Converts varied transcription payload formats to one canonical segment model

- `src/services/transcription/azure-client.js`
  - Low-level transcription API requests and error shaping

- `src/services/transcription/summary-client.js`
  - Low-level summary/insight chat completion requests and JSON parsing

- `src/services/transcription/document-utils.js`
  - Transcript document schema normalization
  - Derived fields (`fullText`, `durationSec`) and summary DTO shaping

## Transcript Document Model

Each session is stored as a JSON document in `transcripts/<sessionId>.json` with fields like:

- `sessionId`, `createdAt`, `updatedAt`
- `meetingTitle`, `participantCount`, `sourceModel`
- `durationSec`
- `meetingSummary`, `meetingSummarySource`, `meetingSummaryUpdatedAt`
- `meetingKeyDecisions[]`, `meetingActionItems[]`
- `speakerMap` (speakerId -> display label)
- `segments[]` with `id`, `chunkIndex`, `startSec`, `endSec`, `speakerId`, `text`, `createdAt`
- `fullText` (speaker-prefixed transcript text)

## Configuration

Runtime settings are read from `.env` and `process.env`.

Required transcription variables:
- `APP_AZURE_WHISPER_OPENAI_ENDPOINT`
- `APP_AZURE_WHISPER_API_KEY`
- `APP_AZURE_WHISPER_DEPLOYMENT_NAME`
- `APP_AZURE_WHISPER_API_VERSION`

Required summary/insight variables:
- `APP_AZURE_GPT_OPENAI_ENDPOINT`
- `APP_AZURE_GPT_OPENAI_API_KEY`
- `APP_AZURE_GPT_DEPLOYMENT_NAME`
- `APP_AZURE_GPT_OPENAI_API_VERSION`

## Project Structure

```
src/
  index.js                  # Electron main process
  preload.js                # secure API bridge to renderer
  dashboard|meetings|recording|meeting-details.*  # UI screens
  recording-ui.js           # recording state + visual updates
  recording-media.js        # media capture + transcription calls
  recording-speaker-rename.js
  transcript-renderer.js
  ui-shared.js
  services/transcription/
    service.js
    repository.js
    payload-normalizer.js
    document-utils.js
    azure-client.js
    summary-client.js
transcripts/                # persisted meeting transcript JSON files
```

## Minimal Run Notes

- Install dependencies with `npm install`
- Start desktop app with `npm start`

