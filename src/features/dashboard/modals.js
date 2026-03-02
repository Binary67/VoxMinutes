(function initializeDashboardModals() {
  const { normalizeParticipantCount, normalizeInputSourceMode, DEFAULT_INPUT_SOURCE_MODE } =
    window.uiShared;
  const {
    modalState,
    renameMeetingState,
    deleteMeetingState,
    modalBackdrop,
    modalElement,
    meetingTitleInput,
    meetingParticipantsInput,
    meetingInputSourceModeInput,
    renameMeetingModalBackdrop,
    renameMeetingModal,
    renameMeetingTitleInput,
    renameMeetingError,
    renameMeetingCancelButton,
    renameMeetingSubmitButton,
    deleteMeetingModalBackdrop,
    deleteMeetingModal,
    deleteMeetingTitle,
    deleteMeetingError,
    deleteMeetingCancelButton,
    deleteMeetingSubmitButton,
  } = window.dashboardStateStore;
  const {
    hasMeetingActionsApi,
    normalizeEditableMeetingTitle,
    getErrorMessage,
    navigateToRecordingPage,
  } = window.dashboardHelpers;
  const { getMeetingBySessionId, loadMeetings } = window.dashboardData;

  function getModalContext(modalId) {
    if (modalId === 'new-recording') {
      return {
        backdrop: modalBackdrop,
        modalElement,
      };
    }

    if (modalId === 'rename-meeting') {
      return {
        backdrop: renameMeetingModalBackdrop,
        modalElement: renameMeetingModal,
      };
    }

    if (modalId === 'delete-meeting') {
      return {
        backdrop: deleteMeetingModalBackdrop,
        modalElement: deleteMeetingModal,
      };
    }

    return null;
  }

  function getActiveModalContext() {
    return getModalContext(modalState.activeModal);
  }

  function openModal(modalId) {
    const modalContext = getModalContext(modalId);
    if (!modalContext) {
      return false;
    }

    modalState.lastFocusedElement = document.activeElement;
    modalState.activeModal = modalId;
    modalContext.backdrop.hidden = false;
    document.body.classList.add('has-open-modal');
    return true;
  }

  function setRenameMeetingError(message) {
    const errorMessage = String(message || '').trim();
    renameMeetingError.textContent = errorMessage;
    renameMeetingError.hidden = !errorMessage;
  }

  function setRenameMeetingFormDisabled(isDisabled) {
    renameMeetingState.isSaving = isDisabled;
    renameMeetingTitleInput.disabled = isDisabled;
    renameMeetingCancelButton.disabled = isDisabled;
    renameMeetingSubmitButton.disabled = isDisabled;
  }

  function resetRenameMeetingModalState() {
    renameMeetingState.sessionId = '';
    renameMeetingState.isSaving = false;
    renameMeetingTitleInput.value = '';
    renameMeetingTitleInput.disabled = false;
    renameMeetingCancelButton.disabled = false;
    renameMeetingSubmitButton.disabled = false;
    setRenameMeetingError('');
  }

  function setDeleteMeetingError(message) {
    const errorMessage = String(message || '').trim();
    deleteMeetingError.textContent = errorMessage;
    deleteMeetingError.hidden = !errorMessage;
  }

  function setDeleteMeetingFormDisabled(isDisabled) {
    deleteMeetingState.isDeleting = isDisabled;
    deleteMeetingCancelButton.disabled = isDisabled;
    deleteMeetingSubmitButton.disabled = isDisabled;
  }

  function resetDeleteMeetingModalState() {
    deleteMeetingState.sessionId = '';
    deleteMeetingState.isDeleting = false;
    deleteMeetingTitle.textContent = 'Untitled meeting';
    deleteMeetingCancelButton.disabled = false;
    deleteMeetingSubmitButton.disabled = false;
    setDeleteMeetingError('');
  }

  function closeActiveModal() {
    if (!modalState.activeModal) {
      return;
    }

    const closedModalId = modalState.activeModal;
    const modalContext = getActiveModalContext();
    modalState.activeModal = '';

    if (modalContext) {
      modalContext.backdrop.hidden = true;
    }

    if (closedModalId === 'rename-meeting') {
      resetRenameMeetingModalState();
    }

    if (closedModalId === 'delete-meeting') {
      resetDeleteMeetingModalState();
    }

    document.body.classList.remove('has-open-modal');

    if (modalState.lastFocusedElement instanceof HTMLElement) {
      modalState.lastFocusedElement.focus({ preventScroll: true });
    }

    modalState.lastFocusedElement = null;
  }

  function getModalFocusableElements() {
    const modalContext = getActiveModalContext();
    if (!modalContext) {
      return [];
    }

    return Array.from(
      modalContext.modalElement.querySelectorAll(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter(
      (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
    );
  }

  function closeRecordingModal() {
    if (modalState.activeModal !== 'new-recording') {
      return;
    }

    closeActiveModal();
  }

  function openRecordingModal() {
    meetingTitleInput.value = '';
    meetingParticipantsInput.value = '1';
    if (meetingInputSourceModeInput) {
      meetingInputSourceModeInput.value = DEFAULT_INPUT_SOURCE_MODE;
    }

    if (!openModal('new-recording')) {
      return;
    }

    meetingTitleInput.focus({ preventScroll: true });
  }

  function openRenameMeetingModal(sessionId) {
    const meeting = getMeetingBySessionId(sessionId);
    if (!meeting) {
      return;
    }

    renameMeetingState.sessionId = sessionId;
    renameMeetingTitleInput.value = String(meeting.meetingTitle || '').trim();
    setRenameMeetingError('');
    setRenameMeetingFormDisabled(false);

    if (!openModal('rename-meeting')) {
      return;
    }

    renameMeetingTitleInput.focus({ preventScroll: true });
    renameMeetingTitleInput.select();
  }

  function closeRenameMeetingModal() {
    if (modalState.activeModal !== 'rename-meeting') {
      return;
    }

    closeActiveModal();
  }

  function openDeleteMeetingModal(sessionId) {
    const meeting = getMeetingBySessionId(sessionId);
    if (!meeting) {
      return;
    }

    deleteMeetingState.sessionId = sessionId;
    deleteMeetingTitle.textContent =
      String(meeting.meetingTitle || '').trim() || 'Untitled meeting';
    setDeleteMeetingError('');
    setDeleteMeetingFormDisabled(false);

    if (!openModal('delete-meeting')) {
      return;
    }

    deleteMeetingCancelButton.focus({ preventScroll: true });
  }

  function closeDeleteMeetingModal() {
    if (modalState.activeModal !== 'delete-meeting') {
      return;
    }

    closeActiveModal();
  }

  function submitNewRecordingForm(event) {
    event.preventDefault();

    const meetingTitle = String(meetingTitleInput.value || '')
      .trim()
      .replace(/\s+/gu, ' ');
    const participantCount = normalizeParticipantCount(meetingParticipantsInput.value);
    const inputSourceMode = normalizeInputSourceMode(
      meetingInputSourceModeInput ? meetingInputSourceModeInput.value : DEFAULT_INPUT_SOURCE_MODE
    );

    closeRecordingModal();
    navigateToRecordingPage(meetingTitle, participantCount, inputSourceMode);
  }

  async function submitRenameMeetingForm(event) {
    event.preventDefault();

    if (!hasMeetingActionsApi()) {
      setRenameMeetingError('Meeting actions are unavailable.');
      return;
    }

    if (renameMeetingState.isSaving) {
      return;
    }

    const sessionId = String(renameMeetingState.sessionId || '').trim();
    if (!sessionId) {
      setRenameMeetingError('Meeting session is unavailable.');
      return;
    }

    let normalizedMeetingTitle;
    try {
      normalizedMeetingTitle = normalizeEditableMeetingTitle(renameMeetingTitleInput.value);
    } catch (error) {
      setRenameMeetingError(getErrorMessage(error, 'Unable to rename meeting.'));
      return;
    }

    const existingMeeting = getMeetingBySessionId(sessionId);
    const currentMeetingTitle = existingMeeting
      ? String(existingMeeting.meetingTitle || '')
          .trim()
          .replace(/\s+/gu, ' ')
      : '';
    if (currentMeetingTitle && normalizedMeetingTitle === currentMeetingTitle) {
      closeRenameMeetingModal();
      return;
    }

    setRenameMeetingError('');
    setRenameMeetingFormDisabled(true);

    try {
      await window.recordingApi.renameTranscriptSession({
        sessionId,
        meetingTitle: normalizedMeetingTitle,
      });
      closeRenameMeetingModal();
      await loadMeetings();
    } catch (error) {
      setRenameMeetingFormDisabled(false);
      setRenameMeetingError(getErrorMessage(error, 'Unable to rename meeting.'));
    }
  }

  async function submitDeleteMeetingForm(event) {
    event.preventDefault();

    if (!hasMeetingActionsApi()) {
      setDeleteMeetingError('Meeting actions are unavailable.');
      return;
    }

    if (deleteMeetingState.isDeleting) {
      return;
    }

    const sessionId = String(deleteMeetingState.sessionId || '').trim();
    if (!sessionId) {
      setDeleteMeetingError('Meeting session is unavailable.');
      return;
    }

    setDeleteMeetingError('');
    setDeleteMeetingFormDisabled(true);

    try {
      await window.recordingApi.deleteTranscriptSession({ sessionId });
      closeDeleteMeetingModal();
      await loadMeetings();
    } catch (error) {
      if (modalState.activeModal !== 'delete-meeting') {
        return;
      }

      setDeleteMeetingFormDisabled(false);
      setDeleteMeetingError(getErrorMessage(error, 'Unable to delete meeting.'));
    }
  }

  function handleModalKeyboard(event) {
    if (!modalState.activeModal) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeActiveModal();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getModalFocusableElements();
    if (focusableElements.length === 0) {
      return;
    }

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus({ preventScroll: true });
    }
  }

  window.dashboardModals = {
    closeActiveModal,
    closeRecordingModal,
    openRecordingModal,
    openRenameMeetingModal,
    closeRenameMeetingModal,
    openDeleteMeetingModal,
    closeDeleteMeetingModal,
    submitNewRecordingForm,
    submitRenameMeetingForm,
    submitDeleteMeetingForm,
    handleModalKeyboard,
  };
})();
