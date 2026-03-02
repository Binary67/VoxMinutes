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
    meetingInputSourceDropdown,
    meetingInputSourceTrigger,
    meetingInputSourceListbox,
    meetingInputSourceOptions,
    modalCancelButton,
    renameMeetingModalBackdrop,
    renameMeetingForm,
    renameMeetingCancelButton,
    deleteMeetingModalBackdrop,
    deleteMeetingForm,
    deleteMeetingCancelButton,
  } = window.dashboardStateStore;
  const { navigateToMeetingDetails } = window.dashboardHelpers;
  const { renderMeetings, closeMeetingOptionsMenu, toggleMeetingOptionsMenu } = window.dashboardRender;
  const { renameMeeting, deleteMeeting } = window.dashboardData;
  const {
    openRecordingModal,
    closeRecordingModal,
    isInputSourceListboxOpen,
    openInputSourceListbox,
    closeInputSourceListbox,
    toggleInputSourceListbox,
    setInputSourceValue,
    setActiveInputSourceOptionByIndex,
    moveActiveInputSourceOption,
    selectActiveInputSourceOption,
    findInputSourceOptionIndexByPrefix,
    getInputSourceOptionCount,
    getActiveInputSourceOptionIndex,
    closeRenameMeetingModal,
    closeDeleteMeetingModal,
    submitNewRecordingForm,
    submitRenameMeetingForm,
    submitDeleteMeetingForm,
    handleModalKeyboard,
  } = window.dashboardModals;
  const INPUT_SOURCE_TYPEAHEAD_RESET_MS = 500;
  let inputSourceTypeaheadBuffer = '';
  let inputSourceTypeaheadTimeoutId = 0;

  function clearInputSourceTypeaheadBuffer() {
    inputSourceTypeaheadBuffer = '';
    if (!inputSourceTypeaheadTimeoutId) {
      return;
    }

    window.clearTimeout(inputSourceTypeaheadTimeoutId);
    inputSourceTypeaheadTimeoutId = 0;
  }

  function pushInputSourceTypeaheadCharacter(character) {
    const normalizedCharacter = String(character || '').toLowerCase();
    if (!normalizedCharacter) {
      return '';
    }

    inputSourceTypeaheadBuffer += normalizedCharacter;
    if (inputSourceTypeaheadTimeoutId) {
      window.clearTimeout(inputSourceTypeaheadTimeoutId);
    }
    inputSourceTypeaheadTimeoutId = window.setTimeout(() => {
      clearInputSourceTypeaheadBuffer();
    }, INPUT_SOURCE_TYPEAHEAD_RESET_MS);
    return inputSourceTypeaheadBuffer;
  }

  function isTypeaheadCharacterEvent(event) {
    return (
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.key.trim().length === 1
    );
  }

  function getInputSourceOptionIndexFromElement(optionElement) {
    if (!Array.isArray(meetingInputSourceOptions) || !optionElement) {
      return -1;
    }

    return meetingInputSourceOptions.indexOf(optionElement);
  }

  function moveInputSourceTypeaheadSelection(character) {
    const optionCount = getInputSourceOptionCount();
    if (optionCount === 0) {
      return;
    }

    const searchPrefix = pushInputSourceTypeaheadCharacter(character);
    if (!searchPrefix) {
      return;
    }

    const searchStartIndex = (getActiveInputSourceOptionIndex() + 1) % optionCount;
    let matchedIndex = findInputSourceOptionIndexByPrefix(searchPrefix, searchStartIndex);
    if (matchedIndex < 0 && searchPrefix.length > 1) {
      matchedIndex = findInputSourceOptionIndexByPrefix(character, searchStartIndex);
    }

    if (matchedIndex >= 0) {
      setActiveInputSourceOptionByIndex(matchedIndex);
    }
  }

  function handleInputSourceTriggerKeydown(event) {
    if (!meetingInputSourceTrigger) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openInputSourceListbox();
      moveActiveInputSourceOption(1);
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      openInputSourceListbox();
      moveActiveInputSourceOption(-1);
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      openInputSourceListbox();
      setActiveInputSourceOptionByIndex(0);
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      openInputSourceListbox();
      setActiveInputSourceOptionByIndex(getInputSourceOptionCount() - 1);
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isInputSourceListboxOpen()) {
        selectActiveInputSourceOption();
        closeInputSourceListbox();
      } else {
        openInputSourceListbox();
      }
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (!isTypeaheadCharacterEvent(event)) {
      return;
    }

    event.preventDefault();
    openInputSourceListbox();
    moveInputSourceTypeaheadSelection(event.key);
  }

  function handleInputSourceListboxKeydown(event) {
    if (!meetingInputSourceListbox) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveInputSourceOption(1);
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveInputSourceOption(-1);
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveInputSourceOptionByIndex(0);
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveInputSourceOptionByIndex(getInputSourceOptionCount() - 1);
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectActiveInputSourceOption();
      closeInputSourceListbox();
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeInputSourceListbox();
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (event.key === 'Tab') {
      closeInputSourceListbox({ restoreFocus: false });
      clearInputSourceTypeaheadBuffer();
      return;
    }

    if (!isTypeaheadCharacterEvent(event)) {
      return;
    }

    event.preventDefault();
    moveInputSourceTypeaheadSelection(event.key);
  }

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
      clearInputSourceTypeaheadBuffer();
      openRecordingModal();
    });

    modalCancelButton.addEventListener('click', () => {
      clearInputSourceTypeaheadBuffer();
      closeRecordingModal();
    });

    modalBackdrop.addEventListener('click', (event) => {
      if (event.target === modalBackdrop) {
        clearInputSourceTypeaheadBuffer();
        closeRecordingModal();
      }
    });

    if (meetingInputSourceTrigger) {
      meetingInputSourceTrigger.addEventListener('click', (event) => {
        event.preventDefault();
        toggleInputSourceListbox();
        clearInputSourceTypeaheadBuffer();
      });

      meetingInputSourceTrigger.addEventListener('keydown', (event) => {
        handleInputSourceTriggerKeydown(event);
      });
    }

    if (meetingInputSourceListbox) {
      meetingInputSourceListbox.addEventListener('keydown', (event) => {
        handleInputSourceListboxKeydown(event);
      });

      meetingInputSourceListbox.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) {
          return;
        }

        const optionElement = event.target.closest('.meeting-input-source-option[data-value]');
        if (!optionElement) {
          return;
        }

        setInputSourceValue(optionElement.dataset.value);
        closeInputSourceListbox({ restoreFocus: false });
        clearInputSourceTypeaheadBuffer();
      });

      meetingInputSourceListbox.addEventListener('mouseover', (event) => {
        if (!(event.target instanceof Element)) {
          return;
        }

        const optionElement = event.target.closest('.meeting-input-source-option[data-value]');
        if (!optionElement) {
          return;
        }

        const optionIndex = getInputSourceOptionIndexFromElement(optionElement);
        if (optionIndex < 0) {
          return;
        }

        setActiveInputSourceOptionByIndex(optionIndex);
      });
    }

    renameMeetingCancelButton.addEventListener('click', () => {
      closeRenameMeetingModal();
    });

    renameMeetingModalBackdrop.addEventListener('click', (event) => {
      if (event.target === renameMeetingModalBackdrop) {
        closeRenameMeetingModal();
      }
    });

    deleteMeetingCancelButton.addEventListener('click', () => {
      closeDeleteMeetingModal();
    });

    deleteMeetingModalBackdrop.addEventListener('click', (event) => {
      if (event.target === deleteMeetingModalBackdrop) {
        closeDeleteMeetingModal();
      }
    });

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (
        modalState.activeModal !== 'new-recording' ||
        !isInputSourceListboxOpen() ||
        !meetingInputSourceDropdown
      ) {
        return;
      }

      if (event.target.closest('#meeting-input-source-dropdown')) {
        return;
      }

      closeInputSourceListbox({ restoreFocus: false });
      clearInputSourceTypeaheadBuffer();
    });

    document.addEventListener('keydown', (event) => {
      handleModalKeyboard(event);
      if (event.key === 'Escape') {
        clearInputSourceTypeaheadBuffer();
      }
    });

    newRecordingForm.addEventListener('submit', (event) => {
      submitNewRecordingForm(event);
    });

    renameMeetingForm.addEventListener('submit', (event) => {
      void submitRenameMeetingForm(event);
    });

    deleteMeetingForm.addEventListener('submit', (event) => {
      void submitDeleteMeetingForm(event);
    });
  }

  window.dashboardEvents = {
    initializeMeetingActions,
    initializeMeetingNavigation,
    initializeSearch,
    initializeModal,
  };
})();
