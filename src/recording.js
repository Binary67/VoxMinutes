const { renderDefaultTags, initializeSmartScrollbars, normalizeParticipantCount } = window.uiShared;

const recordingUiModule = window.recordingUi;
const recordingMediaModule = window.recordingMedia;
const recordingSpeakerRenameModule = window.recordingSpeakerRename;

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

const recordingElements = {
  recordingView,
  recordingTitle,
  recordingSubtitle,
  recordingStatusTextInline,
  recordingLiveDot,
  tinySignalMeter,
  timerHours,
  timerMinutes,
  timerSeconds,
  micToggleButton,
  startRecordingButton,
  stopRecordingButton,
  transcriptFeed,
  renameSpeakerModalBackdrop,
  renameSpeakerModal,
  renameSpeakerForm,
  renameSpeakerInput,
  renameSpeakerError,
  renameSpeakerCancelButton,
  renameSpeakerSubmitButton,
  micToggleButtonIcon,
  startRecordingButtonIcon,
  startRecordingButtonText,
};

const recordingState = {
  mode: recordingUiModule.modes.IDLE,
  isMicMuted: false,
  elapsedSeconds: 0,
  sessionId: null,
  transcriptDocument: null,
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
  mimeType: recordingMediaModule.DEFAULT_AUDIO_MIME_TYPE,
  errorMessage: '',
  statusOverrideText: '',
  meetingTitle: recordingUiModule.DEFAULT_MEETING_TITLE,
  participantCount: 1,
  showParticipantSubtitle: false,
};

const recordingUi = recordingUiModule.createRecordingUi({
  state: recordingState,
  elements: recordingElements,
  transcriptRenderer: window.transcriptRenderer,
  normalizeParticipantCount,
});

let speakerRenameController = null;

const recordingMedia = recordingMediaModule.createRecordingMedia({
  state: recordingState,
  modes: recordingUiModule.modes,
  ui: recordingUi,
  closeRenameSpeakerModal: (options = {}) => {
    if (speakerRenameController) {
      speakerRenameController.closeRenameSpeakerModal(options);
    }
  },
  defaultAudioMimeType: recordingMediaModule.DEFAULT_AUDIO_MIME_TYPE,
});

speakerRenameController = recordingSpeakerRenameModule.createRecordingSpeakerRename({
  state: recordingState,
  modes: recordingUiModule.modes,
  ui: recordingUi,
  elements: recordingElements,
  getErrorMessage: recordingMediaModule.getErrorMessage,
});

function toggleMicrophone() {
  recordingState.isMicMuted = !recordingState.isMicMuted;
  recordingMedia.applyMutePreferenceToStream();
  recordingUi.applyRecordingState();
}

function initializeRecordingControls() {
  startRecordingButton.addEventListener('click', () => {
    void recordingMedia.startRecording();
  });

  stopRecordingButton.addEventListener('click', () => {
    void recordingMedia.stopRecording();
  });

  micToggleButton.addEventListener('click', () => {
    toggleMicrophone();
  });

  transcriptFeed.addEventListener('click', (event) => {
    speakerRenameController.beginSpeakerRename(event.target);
  });

  speakerRenameController.initialize();

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && speakerRenameController.isOpen()) {
      event.preventDefault();
      speakerRenameController.closeRenameSpeakerModal();
    }
  });

  window.addEventListener('beforeunload', () => {
    recordingUi.stopRecordingTimer();
    recordingMedia.releaseMediaResources();
  });
}

function initializeRecordingPage() {
  const recordingContext = recordingUi.getRecordingContextFromQuery(window.location.search);
  recordingState.meetingTitle = recordingContext.meetingTitle;
  recordingState.participantCount = recordingContext.participantCount;
  recordingState.showParticipantSubtitle = recordingContext.showParticipantSubtitle;

  renderDefaultTags(tagList);
  recordingUi.applyRecordingContext();
  recordingUi.renderEmptyTranscript();
  recordingUi.updateTimerDisplay();
  recordingUi.applyRecordingState();
  initializeRecordingControls();
  initializeSmartScrollbars();
  startRecordingButton.focus({ preventScroll: true });

  if (!recordingMedia.hasRecordingApi()) {
    recordingUi.setMode(recordingUiModule.modes.ERROR, { errorMessage: 'Recording bridge is unavailable.' });
  }
}

initializeRecordingPage();
