(function initializeRecordingMediaModule() {
  const {
    normalizeInputSourceMode,
    getInputSourceModeLabel,
    INPUT_SOURCE_MODES,
    DEFAULT_INPUT_SOURCE_MODE,
  } = window.uiShared;
  const DEFAULT_AUDIO_MIME_TYPE = 'audio/webm';
  const modeFallbackOrder = Object.freeze({
    [INPUT_SOURCE_MODES.MIC]: [INPUT_SOURCE_MODES.MIC, INPUT_SOURCE_MODES.SYSTEM, INPUT_SOURCE_MODES.BOTH],
    [INPUT_SOURCE_MODES.SYSTEM]: [INPUT_SOURCE_MODES.SYSTEM, INPUT_SOURCE_MODES.MIC, INPUT_SOURCE_MODES.BOTH],
    [INPUT_SOURCE_MODES.BOTH]: [INPUT_SOURCE_MODES.BOTH, INPUT_SOURCE_MODES.MIC, INPUT_SOURCE_MODES.SYSTEM],
  });
  const captureErrorMessages = Object.freeze({
    NotFoundError: 'No compatible audio source was found.',
    NotAllowedError: 'Audio capture permission was denied.',
    NotReadableError: 'Audio device is busy or unavailable.',
    AbortError: 'Audio capture was interrupted.',
    SecurityError: 'Audio capture is blocked by browser security settings.',
  });

  function getErrorMessage(error, fallbackMessage) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }

    return fallbackMessage;
  }

  function getSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }

    const candidateMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    return candidateMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
  }

  function stopMediaRecorder(mediaRecorder, chunks, mimeType, defaultAudioMimeType) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const complete = () => {
        if (settled) {
          return;
        }

        settled = true;
        const outputMimeType = mediaRecorder.mimeType || mimeType || defaultAudioMimeType;
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

  function stopStreamTracks(stream) {
    if (!stream || typeof stream.getTracks !== 'function') {
      return;
    }

    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (_error) {
        // No-op: track may already be stopped.
      }
    });
  }

  function ensureAudioTracks(stream, sourceLabel) {
    if (!stream || typeof stream.getAudioTracks !== 'function') {
      throw new Error(`${sourceLabel} stream is unavailable.`);
    }

    const audioTracks = stream.getAudioTracks().filter((track) => track.readyState !== 'ended');
    if (audioTracks.length === 0) {
      throw new Error(`No audio track was available from ${sourceLabel}.`);
    }

    return audioTracks;
  }

  function getCaptureErrorMessage(error, fallbackMessage) {
    if (error && typeof error === 'object' && 'name' in error) {
      const errorName = String(error.name || '');
      if (captureErrorMessages[errorName]) {
        return captureErrorMessages[errorName];
      }
    }

    return getErrorMessage(error, fallbackMessage);
  }

  function buildAcquisitionPlan(selectedInputMode) {
    const normalizedMode = normalizeInputSourceMode(selectedInputMode || DEFAULT_INPUT_SOURCE_MODE);
    return modeFallbackOrder[normalizedMode] || modeFallbackOrder[DEFAULT_INPUT_SOURCE_MODE];
  }

  function createRecordingMedia(deps) {
    const safeDeps = deps && typeof deps === 'object' ? deps : {};
    const state = safeDeps.state;
    const modes = safeDeps.modes;
    const ui = safeDeps.ui;
    const closeRenameSpeakerModal = safeDeps.closeRenameSpeakerModal;
    const defaultAudioMimeType = safeDeps.defaultAudioMimeType || DEFAULT_AUDIO_MIME_TYPE;

    let activeCaptureCleanup = null;
    let activeMicTracks = [];

    function hasRecordingApi() {
      return Boolean(window.recordingApi);
    }

    function clearActiveCaptureDetails() {
      activeMicTracks = [];
      activeCaptureCleanup = null;
      state.activeInputMode = '';
    }

    function setActiveCaptureDetails(captureResult) {
      activeMicTracks = Array.isArray(captureResult.micTracks) ? captureResult.micTracks : [];
      activeCaptureCleanup =
        typeof captureResult.cleanup === 'function'
          ? captureResult.cleanup
          : null;
      state.activeInputMode = normalizeInputSourceMode(captureResult.activeMode);
    }

    function applyMutePreferenceToStream() {
      activeMicTracks.forEach((track) => {
        track.enabled = !state.isMicMuted;
      });
    }

    function releaseMediaResources() {
      if (state.mediaStream) {
        stopStreamTracks(state.mediaStream);
      }

      if (typeof activeCaptureCleanup === 'function') {
        try {
          activeCaptureCleanup();
        } catch (_error) {
          // No-op: release should never break user flow.
        }
      }

      clearActiveCaptureDetails();
      state.mediaStream = null;
      state.mediaRecorder = null;
      state.audioChunks = [];
      state.mimeType = defaultAudioMimeType;
    }

    async function ensureTranscriptSession() {
      if (state.sessionId) {
        return;
      }

      const sessionData = await window.recordingApi.createTranscriptSession({
        meetingTitle: state.meetingTitle,
        participantCount: state.participantCount,
      });
      state.sessionId = sessionData.sessionId;
      state.transcriptDocument = sessionData.document;
      state.meetingTitle = ui.normalizeMeetingTitle(sessionData.document.meetingTitle);
      ui.applyRecordingContext();
      ui.renderTranscriptFromDocument(sessionData.document);
    }

    async function acquireMicStream() {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('Microphone capture is not supported in this environment.');
      }

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const micTracks = ensureAudioTracks(micStream, 'microphone');

      return {
        activeMode: INPUT_SOURCE_MODES.MIC,
        stream: micStream,
        micTracks,
        cleanup: () => {
          stopStreamTracks(micStream);
        },
      };
    }

    async function acquireSystemStream() {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
        throw new Error('System audio capture is not supported in this environment.');
      }

      const systemDisplayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });

      try {
        const systemAudioTracks = ensureAudioTracks(systemDisplayStream, 'system audio');
        const systemAudioOnlyStream = new MediaStream(systemAudioTracks);

        return {
          activeMode: INPUT_SOURCE_MODES.SYSTEM,
          stream: systemAudioOnlyStream,
          micTracks: [],
          cleanup: () => {
            stopStreamTracks(systemAudioOnlyStream);
            stopStreamTracks(systemDisplayStream);
          },
        };
      } catch (error) {
        stopStreamTracks(systemDisplayStream);
        throw error;
      }
    }

    async function acquireBothMixedStream() {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('Microphone capture is not supported in this environment.');
      }
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
        throw new Error('System audio capture is not supported in this environment.');
      }

      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (typeof AudioContextConstructor !== 'function') {
        throw new Error('Audio mixing is not supported in this environment.');
      }

      let micStream = null;
      let systemDisplayStream = null;
      let audioContext = null;
      let mixedStream = null;
      let micSourceNode = null;
      let systemSourceNode = null;
      let mixedDestinationNode = null;

      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const micTracks = ensureAudioTracks(micStream, 'microphone');

        systemDisplayStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        });
        ensureAudioTracks(systemDisplayStream, 'system audio');

        audioContext = new AudioContextConstructor();
        mixedDestinationNode = audioContext.createMediaStreamDestination();
        micSourceNode = audioContext.createMediaStreamSource(micStream);
        systemSourceNode = audioContext.createMediaStreamSource(systemDisplayStream);
        micSourceNode.connect(mixedDestinationNode);
        systemSourceNode.connect(mixedDestinationNode);

        const mixedAudioTracks = ensureAudioTracks(mixedDestinationNode.stream, 'mixed audio');
        mixedStream = new MediaStream(mixedAudioTracks);

        return {
          activeMode: INPUT_SOURCE_MODES.BOTH,
          stream: mixedStream,
          micTracks,
          cleanup: () => {
            if (micSourceNode) {
              micSourceNode.disconnect();
            }
            if (systemSourceNode) {
              systemSourceNode.disconnect();
            }
            if (audioContext && audioContext.state !== 'closed') {
              void audioContext.close().catch(() => {});
            }

            stopStreamTracks(mixedStream);
            stopStreamTracks(micStream);
            stopStreamTracks(systemDisplayStream);
          },
        };
      } catch (error) {
        if (micSourceNode) {
          micSourceNode.disconnect();
        }
        if (systemSourceNode) {
          systemSourceNode.disconnect();
        }
        if (audioContext && audioContext.state !== 'closed') {
          void audioContext.close().catch(() => {});
        }
        stopStreamTracks(mixedStream);
        stopStreamTracks(micStream);
        stopStreamTracks(systemDisplayStream);
        throw error;
      }
    }

    async function acquireStreamForMode(mode) {
      if (mode === INPUT_SOURCE_MODES.MIC) {
        return acquireMicStream();
      }

      if (mode === INPUT_SOURCE_MODES.SYSTEM) {
        return acquireSystemStream();
      }

      if (mode === INPUT_SOURCE_MODES.BOTH) {
        return acquireBothMixedStream();
      }

      throw new Error('Unsupported recording input mode.');
    }

    async function acquireStreamWithFallback(selectedInputMode) {
      const requestedMode = normalizeInputSourceMode(selectedInputMode || DEFAULT_INPUT_SOURCE_MODE);
      const acquisitionPlan = buildAcquisitionPlan(requestedMode);
      const captureFailures = [];

      for (const mode of acquisitionPlan) {
        try {
          const captureResult = await acquireStreamForMode(mode);
          const fallbackNotice =
            mode !== requestedMode
              ? `${getInputSourceModeLabel(requestedMode)} was unavailable. Switched to ${getInputSourceModeLabel(mode)}.`
              : '';

          return {
            ...captureResult,
            fallbackNotice,
            requestedMode,
          };
        } catch (error) {
          captureFailures.push({ mode, error });
          console.warn(`Audio capture attempt failed for ${mode}.`, error);
        }
      }

      const triedModesLabel = acquisitionPlan.map((mode) => getInputSourceModeLabel(mode)).join(', ');
      const failureSummary = captureFailures
        .map(({ mode, error }) => `${getInputSourceModeLabel(mode)}: ${getCaptureErrorMessage(error, 'Unavailable')}`)
        .join(' ');
      const combinedMessage = failureSummary
        ? `Unable to start recording. Tried ${triedModesLabel}. ${failureSummary}`
        : `Unable to start recording. Tried ${triedModesLabel}.`;

      throw new Error(combinedMessage);
    }

    async function startRecording() {
      if (state.mode === modes.RECORDING || state.mode === modes.PROCESSING) {
        return;
      }

      if (typeof closeRenameSpeakerModal === 'function') {
        closeRenameSpeakerModal({ force: true });
      }
      ui.setMode(modes.PROCESSING);
      ui.setStatusOverride('Preparing recording...');
      ui.applyRecordingState();

      if (!hasRecordingApi()) {
        ui.clearStatusOverride();
        ui.setMode(modes.ERROR, { errorMessage: 'Recording bridge is unavailable.' });
        return;
      }

      if (typeof MediaRecorder === 'undefined') {
        ui.clearStatusOverride();
        ui.setMode(modes.ERROR, { errorMessage: 'Audio recording is not supported in this environment.' });
        return;
      }

      try {
        await ensureTranscriptSession();
        state.inputSourceNotice = '';
        releaseMediaResources();

        const selectedInputMode = normalizeInputSourceMode(state.selectedInputMode || DEFAULT_INPUT_SOURCE_MODE);
        const captureResult = await acquireStreamWithFallback(selectedInputMode);
        setActiveCaptureDetails(captureResult);

        const stream = captureResult.stream;
        const selectedMimeType = getSupportedMimeType();
        const mediaRecorder = selectedMimeType
          ? new MediaRecorder(stream, { mimeType: selectedMimeType })
          : new MediaRecorder(stream);

        state.mediaStream = stream;
        state.mediaRecorder = mediaRecorder;
        state.audioChunks = [];
        state.mimeType = mediaRecorder.mimeType || selectedMimeType || defaultAudioMimeType;
        state.elapsedSeconds = 0;
        state.inputSourceNotice = captureResult.fallbackNotice;

        mediaRecorder.addEventListener('dataavailable', (event) => {
          if (event.data && event.data.size > 0) {
            state.audioChunks.push(event.data);
          }
        });

        mediaRecorder.start(250);
        applyMutePreferenceToStream();
        ui.updateTimerDisplay();
        ui.clearStatusOverride();
        ui.setMode(modes.RECORDING);
        ui.startRecordingTimer();
      } catch (error) {
        ui.stopRecordingTimer();
        releaseMediaResources();
        ui.clearStatusOverride();
        ui.setMode(modes.ERROR, {
          errorMessage: getErrorMessage(error, 'Unable to start recording.'),
        });
      }
    }

    async function stopRecording() {
      if (state.mode !== modes.RECORDING || !state.mediaRecorder) {
        return;
      }

      ui.stopRecordingTimer();
      ui.setMode(modes.PROCESSING);
      ui.setStatusOverride('Finalizing recording...');
      ui.applyRecordingState();

      const activeRecorder = state.mediaRecorder;
      const activeChunks = state.audioChunks;
      const activeMimeType = state.mimeType;

      try {
        const audioBlob = await stopMediaRecorder(
          activeRecorder,
          activeChunks,
          activeMimeType,
          defaultAudioMimeType
        );
        releaseMediaResources();

        if (!audioBlob || audioBlob.size === 0) {
          throw new Error('No audio was captured. Please try recording again.');
        }

        ui.setStatusOverride('Processing transcription...');
        ui.applyRecordingState();

        const audioBase64 = await blobToBase64(audioBlob);
        const transcriptionResult = await window.recordingApi.transcribeSegment({
          sessionId: state.sessionId,
          audioBase64,
          mimeType: audioBlob.type || activeMimeType || defaultAudioMimeType,
        });

        const updatedTranscript = await window.recordingApi.appendTranscript({
          sessionId: state.sessionId,
          transcriptionResult,
        });

        state.transcriptDocument = updatedTranscript;
        ui.renderTranscriptFromDocument(updatedTranscript);

        ui.clearStatusOverride();
        ui.setMode(modes.READY);
      } catch (error) {
        releaseMediaResources();
        ui.clearStatusOverride();
        ui.setMode(modes.ERROR, {
          errorMessage: getErrorMessage(error, 'Unable to process transcription.'),
        });
      }
    }

    return {
      hasRecordingApi,
      applyMutePreferenceToStream,
      releaseMediaResources,
      startRecording,
      stopRecording,
    };
  }

  window.recordingMedia = {
    DEFAULT_AUDIO_MIME_TYPE,
    getErrorMessage,
    createRecordingMedia,
  };
})();
