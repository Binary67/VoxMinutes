# AI Note

AI Note is an Electron desktop app for recording meetings, transcribing speech with speaker separation, and turning transcripts into concise meeting intelligence.

## Functional Overview

The codebase is built around one core workflow:

1. Create a meeting session.
2. Capture one or more audio segments from microphone, system audio, or both.
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
- Uses `navigator.mediaDevices.getUserMedia`, display media capture, and `MediaRecorder`.
- Supports input modes: `Microphone`, `System Audio`, and `Mic + System` mixed capture.
- Falls back automatically to alternate sources when the requested mode is unavailable.
- Detects a supported MIME type and falls back safely.
- Converts captured audio blobs to base64 and sends to main process.
- Applies mute/unmute preference to microphone tracks when available.

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

### Dashboard (`src/features/dashboard/dashboard.html`, `src/features/dashboard/*.js`)
- Recent meetings cards
- Search and quick filtering
- New recording modal (title + participant count + input source mode)
- Rename/delete session actions
- Estimated time saved and productivity lift metrics

### Recording (`src/features/recording/recording.html`, `src/features/recording/index.js`)
- Recording state machine (`idle`, `recording`, `processing`, `ready`, `error`)
- Timer, mute control, start/stop controls
- Transcript feed with interactive speaker rename

### Meetings (`src/features/meetings/meetings.html`, `src/features/meetings/index.js`)
- Full saved meeting index
- Searchable list with metadata and summaries

### Meeting Details (`src/features/meeting-details/meeting-details.html`, `src/features/meeting-details/index.js`)
- Transcript review view
- On-demand AI insights generation
- Status/error messaging for insight operations

## Architecture

### Main Process
- `src/main/index.js`
  - Creates BrowserWindow
  - Configures media permission handlers
  - Registers IPC handlers for recording and transcript actions

### Secure Renderer Bridge
- `src/bridge/preload.js`
  - Exposes `window.recordingApi`
  - Defines typed IPC entry points used by renderer pages

### Service Layer
- `src/services/transcription/index.js`
  - Canonical service entrypoint exported to Electron main process

- `src/services/transcription/session-service.js`
  - Session create/load/list/delete and session title rename

- `src/services/transcription/transcription-service.js`
  - Audio transcription and transcript append orchestration

- `src/services/transcription/summary-service.js`
  - Meeting summary generation and legacy summary refresh policy

- `src/services/transcription/insights-service.js`
  - Structured meeting insights generation

- `src/services/transcription/speaker-service.js`
  - Speaker rename persistence

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
  main/
    index.js                # Electron main process
  bridge/
    preload.js              # secure API bridge to renderer
  features/
    dashboard/
      dashboard.html
      index.js
      state.js
      helpers.js
      metrics.js
      render.js
      data.js
      modals.js
      events.js
    recording/
      recording.html
      index.js
      ui.js
      media.js
      speaker-rename.js
    meetings/
      meetings.html
      index.js
    meeting-details/
      meeting-details.html
      index.js
  shared/
    constants/input-modes.js
    ui/
      formatters.js
      navigation.js
      dom.js
      scroll.js
      index.js
    transcript/renderer.js
  styles/
    base/
      foundation.css
      layout.css
    components/
      modal.css
      transcript-panel.css
    pages/
      dashboard.css
      recording.css
      meetings.css
      meeting-details.css
  services/transcription/
    index.js
    session-service.js
    transcription-service.js
    summary-service.js
    insights-service.js
    speaker-service.js
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
