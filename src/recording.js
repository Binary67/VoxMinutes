const { renderDefaultTags, initializeSmartScrollbars, normalizeParticipantCount } = window.uiShared;

const DEFAULT_AUDIO_MIME_TYPE = 'audio/webm';
const DEFAULT_MEETING_TITLE = 'New Recording';
const DEFAULT_RECORDING_SUBTITLE = 'Prepare your mic and press Start when ready.';

const recordingModes = Object.freeze({
  IDLE: 'idle',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  READY: 'ready',
  ERROR: 'error',
});

const recordingUiByMode = Object.freeze({
  [recordingModes.IDLE]: {
    statusText: 'Ready',
    primaryActionText: 'Start',
    primaryActionLabel: 'Start recording',
    primaryActionIconClass: 'bi bi-record-circle',
  },
  [recordingModes.RECORDING]: {
    statusText: 'Recording...',
    primaryActionText: 'Recording',
    primaryActionLabel: 'Recording in progress',
    primaryActionIconClass: 'bi bi-record-circle-fill',
  },
  [recordingModes.PROCESSING]: {
    statusText: 'Processing transcription...',
    primaryActionText: 'Processing',
    primaryActionLabel: 'Transcription is processing',
    primaryActionIconClass: 'bi bi-hourglass-split',
  },
  [recordingModes.READY]: {
    statusText: 'Ready',
    primaryActionText: 'Start',
    primaryActionLabel: 'Start another recording segment',
    primaryActionIconClass: 'bi bi-record-circle',
  },
  [recordingModes.ERROR]: {
    statusText: 'Error',
    primaryActionText: 'Start',
    primaryActionLabel: 'Start recording',
    primaryActionIconClass: 'bi bi-record-circle',
  },
});

const tagList = document.getElementById('tag-list');
const recordingView = document.getElementById('recording-view');
const recordingTitle = document.getElementById('recording-title');
const recordingSubtitle = document.getElementById('recording-subtitle');
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
const renameSpeakerModalBackdrop = document.getElementById('rename-speaker-modal-backdrop');
const renameSpeakerModal = document.getElementById('rename-speaker-modal');
const renameSpeakerForm = document.getElementById('rename-speaker-form');
const renameSpeakerInput = document.getElementById('rename-speaker-input');
const renameSpeakerError = document.getElementById('rename-speaker-error');
const renameSpeakerCancelButton = document.getElementById('rename-speaker-cancel-btn');
const renameSpeakerSubmitButton = document.getElementById('rename-speaker-submit-btn');
const micToggleButtonIcon = micToggleButton.querySelector('i');
const startRecordingButtonIcon = startRecordingButton.querySelector('i');
const startRecordingButtonText = startRecordingButton.querySelector('span');
const transcriptRenderer = window.transcriptRenderer;

const recordingState = {
  mode: recordingModes.IDLE,
  isMicMuted: false,
  elapsedSeconds: 0,
  sessionId: null,
  transcriptDocument: null,
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
  mimeType: DEFAULT_AUDIO_MIME_TYPE,
  errorMessage: '',
  statusOverrideText: '',
  meetingTitle: DEFAULT_MEETING_TITLE,
  participantCount: 1,
  showParticipantSubtitle: false,
};

const renameSpeakerState = {
  isOpen: false,
  isSaving: false,
  speakerId: '',
  currentDisplayName: '',
};

let recordingTimerId = null;

function hasRecordingApi() {
  return Boolean(window.recordingApi);
}

function hasRenameSpeakerApi() {
  return Boolean(window.recordingApi && typeof window.recordingApi.renameSpeaker === 'function');
}

function normalizeMeetingTitle(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/gu, ' ');
}

function getRecordingContextFromQuery() {
  const searchParams = new URLSearchParams(window.location.search);
  const titleValue = searchParams.get('title');
  const participantValue = searchParams.get('participants');
  const meetingTitle = normalizeMeetingTitle(titleValue);
  const participantCount = normalizeParticipantCount(participantValue);

  return {
    meetingTitle,
    participantCount,
    showParticipantSubtitle: participantValue !== null,
  };
}

function getRecordingSubtitle(participantCount, showParticipantSubtitle) {
  if (!showParticipantSubtitle) {
    return DEFAULT_RECORDING_SUBTITLE;
  }

  if (participantCount === 1) {
    return '1 person in this meeting.';
  }

  if (participantCount > 1) {
    return `${participantCount} people in this meeting.`;
  }

  return DEFAULT_RECORDING_SUBTITLE;
}

function applyRecordingContext() {
  recordingTitle.textContent = recordingState.meetingTitle || DEFAULT_MEETING_TITLE;
  recordingSubtitle.textContent = getRecordingSubtitle(
    recordingState.participantCount,
    recordingState.showParticipantSubtitle
  );
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
    if (recordingState.mode !== recordingModes.RECORDING) {
      return;
    }

    recordingState.elapsedSeconds += 1;
    updateTimerDisplay();
  }, 1000);
}

function setStatusOverride(text = '') {
  recordingState.statusOverrideText = String(text || '').trim();
}

function clearStatusOverride() {
  recordingState.statusOverrideText = '';
}

function getStatusText(mode) {
  if (recordingState.statusOverrideText) {
    return recordingState.statusOverrideText;
  }

  if (mode === recordingModes.ERROR && recordingState.errorMessage) {
    return recordingState.errorMessage;
  }

  return recordingUiByMode[mode].statusText;
}

function updateInlineRecordingStatus(mode) {
  const isRecording = mode === recordingModes.RECORDING;

  recordingStatusTextInline.textContent = getStatusText(mode);
  recordingLiveDot.classList.toggle('is-active', isRecording);
  recordingLiveDot.classList.toggle('is-paused', false);
  tinySignalMeter.classList.toggle('is-active', isRecording);
  tinySignalMeter.classList.toggle('is-paused', false);
}

function updateMicButton(mode) {
  const isMuted = recordingState.isMicMuted;

  micToggleButtonIcon.className = isMuted ? 'bi bi-mic-mute-fill' : 'bi bi-mic-fill';
  micToggleButton.classList.toggle('is-muted', isMuted);
  micToggleButton.disabled = mode === recordingModes.PROCESSING;
  micToggleButton.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
  micToggleButton.setAttribute('aria-label', isMuted ? 'Unmute microphone' : 'Mute microphone');
}

function updatePrimaryActionButton(mode) {
  const modeMeta = recordingUiByMode[mode];
  const isBusy = mode === recordingModes.RECORDING || mode === recordingModes.PROCESSING;

  startRecordingButtonIcon.className = modeMeta.primaryActionIconClass;
  startRecordingButtonText.textContent = modeMeta.primaryActionText;
  startRecordingButton.setAttribute('aria-label', modeMeta.primaryActionLabel);
  startRecordingButton.disabled = isBusy;
}

function updateStopButton(mode) {
  const showStopButton = mode === recordingModes.RECORDING;
  stopRecordingButton.hidden = !showStopButton;
  stopRecordingButton.disabled = !showStopButton;
}

function updateRecordingViewClasses(mode) {
  recordingView.classList.toggle('is-live', mode === recordingModes.RECORDING);
  recordingView.classList.toggle('is-paused', mode === recordingModes.PROCESSING);
  recordingView.classList.toggle('is-stopped', mode !== recordingModes.RECORDING);
}

function applyRecordingState() {
  const mode = recordingState.mode;
  updateInlineRecordingStatus(mode);
  updateMicButton(mode);
  updatePrimaryActionButton(mode);
  updateStopButton(mode);

  recordingView.dataset.state = mode;
  updateRecordingViewClasses(mode);
  timerSeconds.classList.toggle('is-accent', mode === recordingModes.RECORDING);
}

function setMode(mode, options = {}) {
  recordingState.mode = mode;

  if (options && typeof options.errorMessage === 'string') {
    recordingState.errorMessage = options.errorMessage.trim();
  } else if (mode !== recordingModes.ERROR) {
    recordingState.errorMessage = '';
  }

  applyRecordingState();
}

function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  const candidateMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidateMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
}

function applyMutePreferenceToStream() {
  if (!recordingState.mediaStream) {
    return;
  }

  recordingState.mediaStream.getAudioTracks().forEach((track) => {
    track.enabled = !recordingState.isMicMuted;
  });
}

function releaseMediaResources() {
  if (recordingState.mediaStream) {
    recordingState.mediaStream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  recordingState.mediaStream = null;
  recordingState.mediaRecorder = null;
  recordingState.audioChunks = [];
  recordingState.mimeType = DEFAULT_AUDIO_MIME_TYPE;
}

function stopMediaRecorder(mediaRecorder, chunks, mimeType) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const complete = () => {
      if (settled) {
        return;
      }

      settled = true;
      const outputMimeType = mediaRecorder.mimeType || mimeType || DEFAULT_AUDIO_MIME_TYPE;
      resolve(new Blob(chunks, { type: outputMimeType }));
    };

    const fail = (event) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(event && event.error ? event.error : new Error('Failed to stop recording.'));
    };

    mediaRecorder.addEventListener('stop', complete, { once: true });
    mediaRecorder.addEventListener('error', fail, { once: true });

    if (mediaRecorder.state === 'inactive') {
      complete();
      return;
    }

    try {
      mediaRecorder.stop();
    } catch (error) {
      fail({ error });
    }
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const separatorIndex = dataUrl.indexOf(',');
      if (separatorIndex < 0) {
        reject(new Error('Unable to encode recorded audio.'));
        return;
      }

      resolve(dataUrl.slice(separatorIndex + 1));
    };

    reader.onerror = () => {
      reject(new Error('Unable to read recorded audio.'));
    };

    reader.readAsDataURL(blob);
  });
}

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return fallbackMessage;
}

function renderEmptyTranscript(message = 'No transcription yet. Click Start and Stop to process audio.') {
  if (transcriptRenderer && typeof transcriptRenderer.renderEmptyTranscript === 'function') {
    transcriptRenderer.renderEmptyTranscript(transcriptFeed, message);
    return;
  }

  transcriptFeed.textContent = message;
}

function renderTranscriptFromDocument(document) {
  if (!transcriptRenderer || typeof transcriptRenderer.renderTranscriptFromDocument !== 'function') {
    renderEmptyTranscript();
    return;
  }

  transcriptRenderer.renderTranscriptFromDocument(transcriptFeed, document, {
    interactiveSpeakerNames: true,
    emptyMessage: 'No transcription yet. Click Start and Stop to process audio.',
  });
}

function getSpeakerDisplayName(speakerMap, speakerId) {
  if (transcriptRenderer && typeof transcriptRenderer.getSpeakerDisplayName === 'function') {
    return transcriptRenderer.getSpeakerDisplayName(speakerMap, speakerId);
  }

  if (speakerMap && typeof speakerMap[speakerId] === 'string' && speakerMap[speakerId].trim()) {
    return speakerMap[speakerId].trim();
  }

  return 'Speaker';
}

async function ensureTranscriptSession() {
  if (recordingState.sessionId) {
    return;
  }

  const sessionData = await window.recordingApi.createTranscriptSession({
    meetingTitle: recordingState.meetingTitle,
    participantCount: recordingState.participantCount,
  });
  recordingState.sessionId = sessionData.sessionId;
  recordingState.transcriptDocument = sessionData.document;
  recordingState.meetingTitle = normalizeMeetingTitle(sessionData.document.meetingTitle);
  applyRecordingContext();
  renderTranscriptFromDocument(sessionData.document);
}

async function startRecording() {
  if (recordingState.mode === recordingModes.RECORDING || recordingState.mode === recordingModes.PROCESSING) {
    return;
  }

  closeRenameSpeakerModal({ force: true });
  setMode(recordingModes.PROCESSING);
  setStatusOverride('Preparing recording...');
  applyRecordingState();

  if (!hasRecordingApi()) {
    clearStatusOverride();
    setMode(recordingModes.ERROR, { errorMessage: 'Recording bridge is unavailable.' });
    return;
  }

  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function' ||
    typeof MediaRecorder === 'undefined'
  ) {
    clearStatusOverride();
    setMode(recordingModes.ERROR, { errorMessage: 'Microphone recording is not supported in this environment.' });
    return;
  }

  try {
    await ensureTranscriptSession();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const selectedMimeType = getSupportedMimeType();
    const mediaRecorder = selectedMimeType
      ? new MediaRecorder(stream, { mimeType: selectedMimeType })
      : new MediaRecorder(stream);

    recordingState.mediaStream = stream;
    recordingState.mediaRecorder = mediaRecorder;
    recordingState.audioChunks = [];
    recordingState.mimeType = mediaRecorder.mimeType || selectedMimeType || DEFAULT_AUDIO_MIME_TYPE;
    recordingState.elapsedSeconds = 0;

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        recordingState.audioChunks.push(event.data);
      }
    });

    mediaRecorder.start(250);
    applyMutePreferenceToStream();
    updateTimerDisplay();
    clearStatusOverride();
    setMode(recordingModes.RECORDING);
    startRecordingTimer();
  } catch (error) {
    stopRecordingTimer();
    releaseMediaResources();
    clearStatusOverride();
    setMode(recordingModes.ERROR, {
      errorMessage: getErrorMessage(error, 'Unable to start recording.'),
    });
  }
}

async function stopRecording() {
  if (recordingState.mode !== recordingModes.RECORDING || !recordingState.mediaRecorder) {
    return;
  }

  stopRecordingTimer();
  setMode(recordingModes.PROCESSING);
  setStatusOverride('Finalizing recording...');
  applyRecordingState();

  const activeRecorder = recordingState.mediaRecorder;
  const activeChunks = recordingState.audioChunks;
  const activeMimeType = recordingState.mimeType;

  try {
    const audioBlob = await stopMediaRecorder(activeRecorder, activeChunks, activeMimeType);
    releaseMediaResources();

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('No audio was captured. Please try recording again.');
    }

    setStatusOverride('Processing transcription...');
    applyRecordingState();

    const audioBase64 = await blobToBase64(audioBlob);
    const transcriptionResult = await window.recordingApi.transcribeSegment({
      sessionId: recordingState.sessionId,
      audioBase64,
      mimeType: audioBlob.type || activeMimeType || DEFAULT_AUDIO_MIME_TYPE,
    });

    const updatedTranscript = await window.recordingApi.appendTranscript({
      sessionId: recordingState.sessionId,
      transcriptionResult,
    });

    recordingState.transcriptDocument = updatedTranscript;
    renderTranscriptFromDocument(updatedTranscript);

    clearStatusOverride();
    setMode(recordingModes.READY);
  } catch (error) {
    releaseMediaResources();
    clearStatusOverride();
    setMode(recordingModes.ERROR, {
      errorMessage: getErrorMessage(error, 'Unable to process transcription.'),
    });
  }
}

function toggleMicrophone() {
  recordingState.isMicMuted = !recordingState.isMicMuted;
  applyMutePreferenceToStream();
  updateMicButton(recordingState.mode);
}

function resetRenameSpeakerState() {
  renameSpeakerState.isOpen = false;
  renameSpeakerState.isSaving = false;
  renameSpeakerState.speakerId = '';
  renameSpeakerState.currentDisplayName = '';
}

function setRenameSpeakerError(message) {
  if (!renameSpeakerError) {
    return;
  }

  const normalizedMessage = String(message || '').trim();
  renameSpeakerError.textContent = normalizedMessage;
  renameSpeakerError.hidden = !normalizedMessage;
}

function setRenameSpeakerFormDisabled(isDisabled) {
  renameSpeakerState.isSaving = isDisabled;

  if (renameSpeakerInput) {
    renameSpeakerInput.disabled = isDisabled;
  }
  if (renameSpeakerCancelButton) {
    renameSpeakerCancelButton.disabled = isDisabled;
  }
  if (renameSpeakerSubmitButton) {
    renameSpeakerSubmitButton.disabled = isDisabled;
  }
}

function openRenameSpeakerModal(speakerId, currentSpeakerName) {
  if (!renameSpeakerModalBackdrop || !renameSpeakerModal || !renameSpeakerInput) {
    return false;
  }

  renameSpeakerState.isOpen = true;
  renameSpeakerState.speakerId = String(speakerId || '').trim();
  renameSpeakerState.currentDisplayName = String(currentSpeakerName || '').trim();
  setRenameSpeakerError('');
  setRenameSpeakerFormDisabled(false);
  renameSpeakerInput.value = renameSpeakerState.currentDisplayName;
  renameSpeakerModalBackdrop.hidden = false;
  document.body.classList.add('has-open-modal');
  renameSpeakerInput.focus({ preventScroll: true });
  renameSpeakerInput.select();
  return true;
}

function closeRenameSpeakerModal(options = {}) {
  const forceClose = Boolean(options.force);
  if (!renameSpeakerState.isOpen) {
    return;
  }

  if (renameSpeakerState.isSaving && !forceClose) {
    return;
  }

  if (renameSpeakerModalBackdrop) {
    renameSpeakerModalBackdrop.hidden = true;
  }
  document.body.classList.remove('has-open-modal');
  if (renameSpeakerInput) {
    renameSpeakerInput.value = '';
    renameSpeakerInput.disabled = false;
  }
  if (renameSpeakerCancelButton) {
    renameSpeakerCancelButton.disabled = false;
  }
  if (renameSpeakerSubmitButton) {
    renameSpeakerSubmitButton.disabled = false;
  }
  setRenameSpeakerError('');
  resetRenameSpeakerState();
}

function getRenameSpeakerButton(eventTarget) {
  if (eventTarget instanceof Element) {
    return eventTarget.closest('.transcript-speaker-btn');
  }

  if (eventTarget instanceof Node && eventTarget.parentElement instanceof Element) {
    return eventTarget.parentElement.closest('.transcript-speaker-btn');
  }

  return null;
}

function beginSpeakerRename(eventTarget) {
  if (!hasRenameSpeakerApi()) {
    return;
  }

  if (!recordingState.sessionId || !recordingState.transcriptDocument) {
    return;
  }

  if (recordingState.mode === recordingModes.RECORDING || recordingState.mode === recordingModes.PROCESSING) {
    return;
  }

  const renameButton = getRenameSpeakerButton(eventTarget);
  if (!renameButton) {
    return;
  }

  const speakerId = String(renameButton.dataset.speakerId || '').trim();
  if (!speakerId) {
    return;
  }

  const currentSpeakerName = getSpeakerDisplayName(recordingState.transcriptDocument.speakerMap, speakerId);
  openRenameSpeakerModal(speakerId, currentSpeakerName);
}

async function submitSpeakerRename(event) {
  event.preventDefault();

  if (!hasRenameSpeakerApi()) {
    setRenameSpeakerError('Speaker rename is unavailable.');
    return;
  }

  if (renameSpeakerState.isSaving) {
    return;
  }

  const sessionId = String(recordingState.sessionId || '').trim();
  if (!sessionId) {
    setRenameSpeakerError('Transcript session is unavailable.');
    return;
  }

  const speakerId = String(renameSpeakerState.speakerId || '').trim();
  if (!speakerId) {
    setRenameSpeakerError('Speaker is unavailable.');
    return;
  }

  if (!renameSpeakerInput) {
    setRenameSpeakerError('Speaker input is unavailable.');
    return;
  }

  const trimmedSpeakerName = String(renameSpeakerInput.value || '').trim();
  if (!trimmedSpeakerName) {
    setRenameSpeakerError('Speaker name cannot be empty.');
    return;
  }

  if (trimmedSpeakerName === renameSpeakerState.currentDisplayName) {
    closeRenameSpeakerModal({ force: true });
    return;
  }

  setRenameSpeakerError('');
  setRenameSpeakerFormDisabled(true);

  try {
    setStatusOverride('Saving speaker name...');
    applyRecordingState();

    const updatedTranscript = await window.recordingApi.renameSpeaker({
      sessionId,
      speakerId,
      displayName: trimmedSpeakerName,
    });

    recordingState.transcriptDocument = updatedTranscript;
    renderTranscriptFromDocument(updatedTranscript);

    closeRenameSpeakerModal({ force: true });
    clearStatusOverride();
    if (recordingState.mode === recordingModes.ERROR) {
      setMode(recordingModes.READY);
    } else {
      applyRecordingState();
    }
  } catch (error) {
    setRenameSpeakerFormDisabled(false);
    setRenameSpeakerError(getErrorMessage(error, 'Unable to rename speaker.'));
    clearStatusOverride();
    applyRecordingState();
  }
}

function initializeRecordingControls() {
  startRecordingButton.addEventListener('click', () => {
    void startRecording();
  });

  stopRecordingButton.addEventListener('click', () => {
    void stopRecording();
  });

  micToggleButton.addEventListener('click', () => {
    toggleMicrophone();
  });

  transcriptFeed.addEventListener('click', (event) => {
    beginSpeakerRename(event.target);
  });

  if (renameSpeakerCancelButton) {
    renameSpeakerCancelButton.addEventListener('click', () => {
      closeRenameSpeakerModal();
    });
  }

  if (renameSpeakerModalBackdrop) {
    renameSpeakerModalBackdrop.addEventListener('click', (event) => {
      if (event.target === renameSpeakerModalBackdrop) {
        closeRenameSpeakerModal();
      }
    });
  }

  if (renameSpeakerForm) {
    renameSpeakerForm.addEventListener('submit', (event) => {
      void submitSpeakerRename(event);
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && renameSpeakerState.isOpen) {
      event.preventDefault();
      closeRenameSpeakerModal();
    }
  });

  window.addEventListener('beforeunload', () => {
    stopRecordingTimer();
    releaseMediaResources();
  });
}

function initializeRecordingPage() {
  const recordingContext = getRecordingContextFromQuery();
  recordingState.meetingTitle = recordingContext.meetingTitle;
  recordingState.participantCount = recordingContext.participantCount;
  recordingState.showParticipantSubtitle = recordingContext.showParticipantSubtitle;

  renderDefaultTags(tagList);
  applyRecordingContext();
  renderEmptyTranscript();
  updateTimerDisplay();
  applyRecordingState();
  initializeRecordingControls();
  initializeSmartScrollbars();
  startRecordingButton.focus({ preventScroll: true });

  if (!hasRecordingApi()) {
    setMode(recordingModes.ERROR, { errorMessage: 'Recording bridge is unavailable.' });
  }
}

initializeRecordingPage();
