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
    text: 'Yes, I updated the Figma file. We are using primary blue #0066cc as the main accent for readability.',
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
const recordingStatusChip = document.getElementById('recording-status-chip');
const recordingStatusText = document.getElementById('recording-status-text');
const timerHours = document.getElementById('timer-hours');
const timerMinutes = document.getElementById('timer-minutes');
const timerSeconds = document.getElementById('timer-seconds');
const micToggleButton = document.getElementById('mic-toggle-btn');
const startRecordingButton = document.getElementById('start-recording-btn');
const pauseRecordingButton = document.getElementById('pause-recording-btn');
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

function updateRecordingStatus() {
  recordingStatusChip.classList.remove('is-live', 'is-paused', 'is-stopped');

  if (!recordingState.isRecording) {
    recordingStatusChip.classList.add('is-stopped');
    recordingStatusText.textContent = 'Ready to record';
  } else if (recordingState.isPaused) {
    recordingStatusChip.classList.add('is-paused');
    recordingStatusText.textContent = 'Recording paused';
  } else {
    recordingStatusChip.classList.add('is-live');
    recordingStatusText.textContent = 'Recording in progress';
  }
}

function updateMicButton() {
  const micIcon = micToggleButton.querySelector('i');
  micIcon.className = recordingState.isMicMuted ? 'bi bi-mic-mute-fill' : 'bi bi-mic-fill';
  micToggleButton.classList.toggle('is-muted', recordingState.isMicMuted);
  micToggleButton.setAttribute(
    'aria-pressed',
    recordingState.isMicMuted ? 'true' : 'false'
  );
}

function updatePauseButton() {
  const pauseIcon = pauseRecordingButton.querySelector('i');
  const pauseText = pauseRecordingButton.querySelector('span');
  const paused = recordingState.isPaused;

  pauseIcon.className = paused ? 'bi bi-play-fill' : 'bi bi-pause-fill';
  pauseText.textContent = paused ? 'Resume' : 'Pause';
  pauseRecordingButton.disabled = !recordingState.isRecording;
}

function updateActionButtons() {
  const isIdle = !recordingState.isRecording;
  startRecordingButton.hidden = !isIdle;
  pauseRecordingButton.hidden = isIdle;
  stopRecordingButton.disabled = isIdle;
}

function applyRecordingState() {
  updateRecordingStatus();
  updateMicButton();
  updatePauseButton();
  updateActionButtons();

  recordingView.classList.toggle(
    'is-live',
    recordingState.isRecording && !recordingState.isPaused
  );
  recordingView.classList.toggle('is-paused', recordingState.isPaused);
  recordingView.classList.toggle('is-stopped', !recordingState.isRecording);

  timerSeconds.classList.toggle(
    'is-accent',
    recordingState.isRecording && !recordingState.isPaused
  );
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
  startRecordingButton.addEventListener('click', startNewRecording);

  micToggleButton.addEventListener('click', () => {
    recordingState.isMicMuted = !recordingState.isMicMuted;
    updateMicButton();
  });

  pauseRecordingButton.addEventListener('click', () => {
    if (!recordingState.isRecording) {
      return;
    }

    recordingState.isPaused = !recordingState.isPaused;
    applyRecordingState();
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
