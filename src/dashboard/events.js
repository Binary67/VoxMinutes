(function initializeDashboardEvents() {
  const { buildMeetingsHref } = window.uiShared;
  const {
    dashboardState,
    modalState,
    meetingsGrid,
    searchInput,
    viewAllMeetingsButton,
    newRecordingButton,
    modalBackdrop,
    newRecordingForm,
    modalCancelButton,
    renameMeetingModalBackdrop,
    renameMeetingForm,
    renameMeetingCancelButton,
  } = window.dashboardStateStore;
  const { navigateToMeetingDetails } = window.dashboardHelpers;
  const { renderMeetings, closeMeetingOptionsMenu, toggleMeetingOptionsMenu } = window.dashboardRender;
  const { renameMeeting, deleteMeeting } = window.dashboardData;
  const {
    openRecordingModal,
    closeRecordingModal,
    closeRenameMeetingModal,
    submitNewRecordingForm,
    submitRenameMeetingForm,
    handleModalKeyboard,
  } = window.dashboardModals;

  function initializeMeetingActions() {
    meetingsGrid.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const optionsTriggerButton = event.target.closest('.meeting-options-trigger');
      if (optionsTriggerButton) {
        event.preventDefault();
        event.stopPropagation();
        const sessionId = String(optionsTriggerButton.dataset.sessionId || '').trim();
        toggleMeetingOptionsMenu(sessionId);
        return;
      }

      const menuActionButton = event.target.closest('.meeting-menu-item');
      if (menuActionButton) {
        event.preventDefault();
        event.stopPropagation();

        const action = String(menuActionButton.dataset.action || '').trim();
        const sessionId = String(menuActionButton.dataset.sessionId || '').trim();
        if (!action || !sessionId) {
          return;
        }

        closeMeetingOptionsMenu();

        if (action === 'rename') {
          void renameMeeting(sessionId);
          return;
        }

        if (action === 'delete') {
          void deleteMeeting(sessionId);
        }
        return;
      }

      const clickableMeetingCard = event.target.closest('.meeting-card[data-session-id]');
      if (!clickableMeetingCard || event.target.closest('.meeting-options')) {
        return;
      }

      const clickedSessionId = String(clickableMeetingCard.dataset.sessionId || '').trim();
      if (!clickedSessionId) {
        return;
      }

      navigateToMeetingDetails(clickedSessionId);
    });

    meetingsGrid.addEventListener('keydown', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      const clickableMeetingCard = event.target.closest('.meeting-card[data-session-id]');
      if (!clickableMeetingCard || event.target.closest('.meeting-options')) {
        return;
      }

      event.preventDefault();
      const clickedSessionId = String(clickableMeetingCard.dataset.sessionId || '').trim();
      if (!clickedSessionId) {
        return;
      }

      navigateToMeetingDetails(clickedSessionId);
    });

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (!dashboardState.openMenuSessionId) {
        return;
      }

      if (event.target.closest('.meeting-options')) {
        return;
      }

      closeMeetingOptionsMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || modalState.activeModal || !dashboardState.openMenuSessionId) {
        return;
      }

      event.preventDefault();
      closeMeetingOptionsMenu();
    });
  }

  function initializeMeetingNavigation() {
    if (!viewAllMeetingsButton) {
      return;
    }

    viewAllMeetingsButton.addEventListener('click', () => {
      window.location.href = buildMeetingsHref();
    });
  }

  function initializeSearch() {
    searchInput.addEventListener('input', () => {
      dashboardState.searchQuery = searchInput.value.trim().toLowerCase();
      dashboardState.openMenuSessionId = '';
      renderMeetings();
    });
  }

  function initializeModal() {
    newRecordingButton.addEventListener('click', () => {
      openRecordingModal();
    });

    modalCancelButton.addEventListener('click', () => {
      closeRecordingModal();
    });

    modalBackdrop.addEventListener('click', (event) => {
      if (event.target === modalBackdrop) {
        closeRecordingModal();
      }
    });

    renameMeetingCancelButton.addEventListener('click', () => {
      closeRenameMeetingModal();
    });

    renameMeetingModalBackdrop.addEventListener('click', (event) => {
      if (event.target === renameMeetingModalBackdrop) {
        closeRenameMeetingModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      handleModalKeyboard(event);
    });

    newRecordingForm.addEventListener('submit', (event) => {
      submitNewRecordingForm(event);
    });

    renameMeetingForm.addEventListener('submit', (event) => {
      void submitRenameMeetingForm(event);
    });
  }

  window.dashboardEvents = {
    initializeMeetingActions,
    initializeMeetingNavigation,
    initializeSearch,
    initializeModal,
  };
})();
