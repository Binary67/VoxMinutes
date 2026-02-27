const transcriptEntries = [
  {
    speaker: 'Sarah Jenkins',
    initials: 'SJ',
    time: '10:43 AM',
    text: 'Let us circle back to the interface changes from last week. Did we finalize the color palette?',
    isYou: false,
  },
  {
    speaker: 'You',
    initials: 'YU',
    time: '10:44 AM',
    text: 'Yes, I updated the Figma file. We are using primary blue #0a84ff as the main accent for readability.',
    isYou: true,
  },
  {
    speaker: 'Sarah Jenkins',
    initials: 'SJ',
    time: '10:45 AM',
    text: 'Great. Next, we should lock the button states for hover and disabled before handoff.',
    isYou: false,
  },
  {
    speaker: 'You',
    initials: 'YU',
    time: '10:46 AM',
    text: 'Agreed. I will document all interaction states in the design specs and send it after this call.',
    isYou: true,
  },
];

const { escapeHtml, renderDefaultTags, initializeSmartScrollbars, refreshScrollableState } =
  window.uiShared;

const tagList = document.getElementById('tag-list');
const recordingView = document.getElementById('recording-view');
const recordingStatusTextInline = document.getElementById('recording-status-text-inline');
const recordingLiveDot = document.getElementById('recording-live-dot');
const tinySignalMeter = document.getElementById('tiny-signal-meter');
const timerHours = document.getElementById('timer-hours');
const timerMinutes = document.getElementById('timer-minutes');
const timerSeconds = document.getElementById('timer-seconds');
const micToggleButton = document.getElementById('mic-toggle-btn');
const startRecordingButton = document.getElementById('start-recording-btn');
const stopRecordingButton = document.getElementById('stop-recording-btn');
const transcriptFeed = document.getElementById('transcript-feed');

const defaultRecordingState = {
  isRecording: false,
  isPaused: false,
  isMicMuted: false,
  elapsedSeconds: 0,
};

const recordingState = { ...defaultRecordingState };
let recordingTimerId = null;
const recordingModes = Object.freeze({
  STOPPED: 'stopped',
  LIVE: 'live',
  PAUSED: 'paused',
});

const recordingUiByMode = Object.freeze({
  [recordingModes.STOPPED]: {
    statusText: 'Ready',
    primaryActionText: 'Start',
    primaryActionLabel: 'Start recording',
    primaryActionIconClass: 'bi bi-record-circle',
  },
  [recordingModes.LIVE]: {
    statusText: 'Recording',
    primaryActionText: 'Pause',
    primaryActionLabel: 'Pause recording',
    primaryActionIconClass: 'bi bi-pause-fill',
  },
  [recordingModes.PAUSED]: {
    statusText: 'Paused',
    primaryActionText: 'Resume',
    primaryActionLabel: 'Resume recording',
    primaryActionIconClass: 'bi bi-play-fill',
  },
});

function getRecordingMode() {
  if (!recordingState.isRecording) {
    return recordingModes.STOPPED;
  }

  return recordingState.isPaused ? recordingModes.PAUSED : recordingModes.LIVE;
}

function formatTimerPart(value) {
  return String(value).padStart(2, '0');
}

function updateTimerDisplay() {
  const totalSeconds = recordingState.elapsedSeconds;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  timerHours.textContent = formatTimerPart(hours);
  timerMinutes.textContent = formatTimerPart(minutes);
  timerSeconds.textContent = formatTimerPart(seconds);
}

function stopRecordingTimer() {
  if (recordingTimerId !== null) {
    clearInterval(recordingTimerId);
    recordingTimerId = null;
  }
}

function startRecordingTimer() {
  stopRecordingTimer();
  recordingTimerId = setInterval(() => {
    if (!recordingState.isRecording || recordingState.isPaused) {
      return;
    }

    recordingState.elapsedSeconds += 1;
    updateTimerDisplay();
  }, 1000);
}

function updateInlineRecordingStatus(mode) {
  const statusMeta = recordingUiByMode[mode];
  const isLive = mode === recordingModes.LIVE;
  const isPaused = mode === recordingModes.PAUSED;

  recordingStatusTextInline.textContent = statusMeta.statusText;
  recordingLiveDot.classList.toggle('is-active', isLive);
  recordingLiveDot.classList.toggle('is-paused', isPaused);
  tinySignalMeter.classList.toggle('is-active', mode !== recordingModes.STOPPED);
  tinySignalMeter.classList.toggle('is-paused', isPaused);
}

function updateMicButton() {
  const micIcon = micToggleButton.querySelector('i');
  const isMuted = recordingState.isMicMuted;

  micIcon.className = isMuted ? 'bi bi-mic-mute-fill' : 'bi bi-mic-fill';
  micToggleButton.classList.toggle('is-muted', isMuted);
  micToggleButton.setAttribute(
    'aria-pressed',
    isMuted ? 'true' : 'false'
  );
  micToggleButton.setAttribute(
    'aria-label',
    isMuted ? 'Unmute microphone' : 'Mute microphone'
  );
}

function updatePrimaryActionButton(mode) {
  const primaryActionIcon = startRecordingButton.querySelector('i');
  const primaryActionText = startRecordingButton.querySelector('span');
  const modeMeta = recordingUiByMode[mode];

  primaryActionIcon.className = modeMeta.primaryActionIconClass;
  primaryActionText.textContent = modeMeta.primaryActionText;
  startRecordingButton.setAttribute('aria-label', modeMeta.primaryActionLabel);
}

function updateStopButton(mode) {
  const isStopped = mode === recordingModes.STOPPED;
  stopRecordingButton.disabled = isStopped;
  stopRecordingButton.hidden = isStopped;
}

function applyRecordingState() {
  const mode = getRecordingMode();
  updateInlineRecordingStatus(mode);
  updateMicButton();
  updatePrimaryActionButton(mode);
  updateStopButton(mode);

  recordingView.dataset.state = mode;

  recordingView.classList.toggle('is-live', mode === recordingModes.LIVE);
  recordingView.classList.toggle('is-paused', mode === recordingModes.PAUSED);
  recordingView.classList.toggle('is-stopped', mode === recordingModes.STOPPED);

  timerSeconds.classList.toggle('is-accent', mode === recordingModes.LIVE);
}

function renderTranscript(entries) {
  const transcriptMarkup = entries
    .map((entry) => {
      const speaker = escapeHtml(entry.speaker);
      const initials = escapeHtml(entry.initials);
      const time = escapeHtml(entry.time);
      const text = escapeHtml(entry.text);
      const youClass = entry.isYou ? ' is-you' : '';

      return `
        <article class="transcript-entry${youClass}">
          <span class="transcript-avatar">${initials}</span>
          <div class="transcript-content">
            <p class="transcript-meta">
              <span class="transcript-speaker">${speaker}</span>
              <span class="transcript-time">${time}</span>
            </p>
            <p class="transcript-text">${text}</p>
          </div>
        </article>
      `;
    })
    .join('');

  transcriptFeed.innerHTML = transcriptMarkup;
  refreshScrollableState();
}

function startNewRecording() {
  Object.assign(recordingState, {
    isRecording: true,
    isPaused: false,
    isMicMuted: false,
    elapsedSeconds: 0,
  });

  updateTimerDisplay();
  applyRecordingState();
  startRecordingTimer();
}

function stopRecording() {
  Object.assign(recordingState, {
    isRecording: false,
    isPaused: false,
    isMicMuted: false,
    elapsedSeconds: 0,
  });

  stopRecordingTimer();
  updateTimerDisplay();
  applyRecordingState();
}

function initializeRecordingControls() {
  startRecordingButton.addEventListener('click', () => {
    if (!recordingState.isRecording) {
      startNewRecording();
      return;
    }

    recordingState.isPaused = !recordingState.isPaused;
    applyRecordingState();
  });

  micToggleButton.addEventListener('click', () => {
    recordingState.isMicMuted = !recordingState.isMicMuted;
    updateMicButton();
  });

  stopRecordingButton.addEventListener('click', () => {
    if (!recordingState.isRecording) {
      return;
    }

    stopRecording();
  });
}

function initializeRecordingPage() {
  renderDefaultTags(tagList);
  renderTranscript(transcriptEntries);
  updateTimerDisplay();
  applyRecordingState();
  initializeRecordingControls();
  initializeSmartScrollbars();
  startRecordingButton.focus({ preventScroll: true });
}

initializeRecordingPage();
