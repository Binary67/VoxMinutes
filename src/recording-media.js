(function initializeRecordingMediaModule() {
  const DEFAULT_AUDIO_MIME_TYPE = 'audio/webm';

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

  function createRecordingMedia(deps) {
    const safeDeps = deps && typeof deps === 'object' ? deps : {};
    const state = safeDeps.state;
    const modes = safeDeps.modes;
    const ui = safeDeps.ui;
    const closeRenameSpeakerModal = safeDeps.closeRenameSpeakerModal;
    const defaultAudioMimeType = safeDeps.defaultAudioMimeType || DEFAULT_AUDIO_MIME_TYPE;

    function hasRecordingApi() {
      return Boolean(window.recordingApi);
    }

    function applyMutePreferenceToStream() {
      if (!state.mediaStream) {
        return;
      }

      state.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !state.isMicMuted;
      });
    }

    function releaseMediaResources() {
      if (state.mediaStream) {
        state.mediaStream.getTracks().forEach((track) => {
          track.stop();
        });
      }

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

      if (
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function' ||
        typeof MediaRecorder === 'undefined'
      ) {
        ui.clearStatusOverride();
        ui.setMode(modes.ERROR, { errorMessage: 'Microphone recording is not supported in this environment.' });
        return;
      }

      try {
        await ensureTranscriptSession();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const selectedMimeType = getSupportedMimeType();
        const mediaRecorder = selectedMimeType
          ? new MediaRecorder(stream, { mimeType: selectedMimeType })
          : new MediaRecorder(stream);

        state.mediaStream = stream;
        state.mediaRecorder = mediaRecorder;
        state.audioChunks = [];
        state.mimeType = mediaRecorder.mimeType || selectedMimeType || defaultAudioMimeType;
        state.elapsedSeconds = 0;

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
