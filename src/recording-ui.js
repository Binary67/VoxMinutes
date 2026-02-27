(function initializeRecordingUiModule() {
  const DEFAULT_MEETING_TITLE = 'New Recording';
  const DEFAULT_RECORDING_SUBTITLE = 'Prepare your mic and press Start when ready.';
  const EMPTY_TRANSCRIPT_MESSAGE = 'No transcription yet. Click Start and Stop to process audio.';

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

  function formatTimerPart(value) {
    return String(value).padStart(2, '0');
  }

  function createRecordingUi(deps) {
    const safeDeps = deps && typeof deps === 'object' ? deps : {};
    const state = safeDeps.state;
    const elements = safeDeps.elements || {};
    const transcriptRenderer = safeDeps.transcriptRenderer;
    const normalizeParticipants = safeDeps.normalizeParticipantCount;

    const recordingView = elements.recordingView;
    const recordingTitle = elements.recordingTitle;
    const recordingSubtitle = elements.recordingSubtitle;
    const recordingStatusTextInline = elements.recordingStatusTextInline;
    const recordingLiveDot = elements.recordingLiveDot;
    const tinySignalMeter = elements.tinySignalMeter;
    const timerHours = elements.timerHours;
    const timerMinutes = elements.timerMinutes;
    const timerSeconds = elements.timerSeconds;
    const micToggleButton = elements.micToggleButton;
    const micToggleButtonIcon = elements.micToggleButtonIcon;
    const startRecordingButton = elements.startRecordingButton;
    const startRecordingButtonIcon = elements.startRecordingButtonIcon;
    const startRecordingButtonText = elements.startRecordingButtonText;
    const stopRecordingButton = elements.stopRecordingButton;
    const transcriptFeed = elements.transcriptFeed;

    let recordingTimerId = null;

    function normalizeMeetingTitle(value) {
      return String(value || '')
        .trim()
        .replace(/\s+/gu, ' ');
    }

    function getRecordingContextFromQuery(search = window.location.search) {
      const searchParams = new URLSearchParams(search);
      const titleValue = searchParams.get('title');
      const participantValue = searchParams.get('participants');
      const meetingTitle = normalizeMeetingTitle(titleValue);
      const participantCount = normalizeParticipants(participantValue);

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
      recordingTitle.textContent = state.meetingTitle || DEFAULT_MEETING_TITLE;
      recordingSubtitle.textContent = getRecordingSubtitle(
        state.participantCount,
        state.showParticipantSubtitle
      );
    }

    function updateTimerDisplay() {
      const totalSeconds = state.elapsedSeconds;
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
        if (state.mode !== recordingModes.RECORDING) {
          return;
        }

        state.elapsedSeconds += 1;
        updateTimerDisplay();
      }, 1000);
    }

    function setStatusOverride(text = '') {
      state.statusOverrideText = String(text || '').trim();
    }

    function clearStatusOverride() {
      state.statusOverrideText = '';
    }

    function getStatusText(mode) {
      if (state.statusOverrideText) {
        return state.statusOverrideText;
      }

      if (mode === recordingModes.ERROR && state.errorMessage) {
        return state.errorMessage;
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
      const isMuted = state.isMicMuted;

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
      const mode = state.mode;
      updateInlineRecordingStatus(mode);
      updateMicButton(mode);
      updatePrimaryActionButton(mode);
      updateStopButton(mode);

      recordingView.dataset.state = mode;
      updateRecordingViewClasses(mode);
      timerSeconds.classList.toggle('is-accent', mode === recordingModes.RECORDING);
    }

    function setMode(mode, options = {}) {
      state.mode = mode;

      if (options && typeof options.errorMessage === 'string') {
        state.errorMessage = options.errorMessage.trim();
      } else if (mode !== recordingModes.ERROR) {
        state.errorMessage = '';
      }

      applyRecordingState();
    }

    function renderEmptyTranscript(message = EMPTY_TRANSCRIPT_MESSAGE) {
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
        emptyMessage: EMPTY_TRANSCRIPT_MESSAGE,
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

    return {
      normalizeMeetingTitle,
      getRecordingContextFromQuery,
      applyRecordingContext,
      updateTimerDisplay,
      stopRecordingTimer,
      startRecordingTimer,
      setStatusOverride,
      clearStatusOverride,
      applyRecordingState,
      setMode,
      renderEmptyTranscript,
      renderTranscriptFromDocument,
      getSpeakerDisplayName,
    };
  }

  window.recordingUi = {
    createRecordingUi,
    modes: recordingModes,
    DEFAULT_MEETING_TITLE,
    DEFAULT_RECORDING_SUBTITLE,
    EMPTY_TRANSCRIPT_MESSAGE,
  };
})();
