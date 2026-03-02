(function initializeRecordingSpeakerRenameModule() {
  function createRecordingSpeakerRename(deps) {
    const safeDeps = deps && typeof deps === 'object' ? deps : {};
    const state = safeDeps.state;
    const modes = safeDeps.modes;
    const ui = safeDeps.ui;
    const elements = safeDeps.elements || {};
    const getErrorMessage = safeDeps.getErrorMessage;

    const renameSpeakerModalBackdrop = elements.renameSpeakerModalBackdrop;
    const renameSpeakerModal = elements.renameSpeakerModal;
    const renameSpeakerForm = elements.renameSpeakerForm;
    const renameSpeakerInput = elements.renameSpeakerInput;
    const renameSpeakerError = elements.renameSpeakerError;
    const renameSpeakerCancelButton = elements.renameSpeakerCancelButton;
    const renameSpeakerSubmitButton = elements.renameSpeakerSubmitButton;

    const renameSpeakerState = {
      isOpen: false,
      isSaving: false,
      speakerId: '',
      currentDisplayName: '',
    };

    function hasRenameSpeakerApi() {
      return Boolean(window.recordingApi && typeof window.recordingApi.renameSpeaker === 'function');
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

      if (!state.sessionId || !state.transcriptDocument) {
        return;
      }

      if (state.mode === modes.RECORDING || state.mode === modes.PROCESSING) {
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

      const currentSpeakerName = ui.getSpeakerDisplayName(state.transcriptDocument.speakerMap, speakerId);
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

      const sessionId = String(state.sessionId || '').trim();
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
        ui.setStatusOverride('Saving speaker name...');
        ui.applyRecordingState();

        const updatedTranscript = await window.recordingApi.renameSpeaker({
          sessionId,
          speakerId,
          displayName: trimmedSpeakerName,
        });

        state.transcriptDocument = updatedTranscript;
        ui.renderTranscriptFromDocument(updatedTranscript);

        closeRenameSpeakerModal({ force: true });
        ui.clearStatusOverride();
        if (state.mode === modes.ERROR) {
          ui.setMode(modes.READY);
        } else {
          ui.applyRecordingState();
        }
      } catch (error) {
        setRenameSpeakerFormDisabled(false);
        setRenameSpeakerError(getErrorMessage(error, 'Unable to rename speaker.'));
        ui.clearStatusOverride();
        ui.applyRecordingState();
      }
    }

    function initialize() {
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
    }

    function isOpen() {
      return renameSpeakerState.isOpen;
    }

    return {
      initialize,
      beginSpeakerRename,
      closeRenameSpeakerModal,
      isOpen,
    };
  }

  window.recordingSpeakerRename = {
    createRecordingSpeakerRename,
  };
})();
