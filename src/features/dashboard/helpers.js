(function initializeDashboardHelpers() {
  const {
    buildRecordingHref,
    buildMeetingDetailsHref,
    hasRecordingApi,
    normalizeInputSourceMode,
    DEFAULT_INPUT_SOURCE_MODE,
  } = window.uiShared;
  const { MAX_MEETING_TITLE_LENGTH } = window.dashboardStateStore;

  function hasMeetingActionsApi() {
    return Boolean(
      hasRecordingApi() &&
        typeof window.recordingApi.renameTranscriptSession === 'function' &&
        typeof window.recordingApi.deleteTranscriptSession === 'function'
    );
  }

  function normalizeEditableMeetingTitle(value) {
    const normalizedTitle = String(value || '')
      .trim()
      .replace(/\s+/gu, ' ');

    if (!normalizedTitle) {
      throw new Error('Meeting title cannot be empty.');
    }

    if (normalizedTitle.length > MAX_MEETING_TITLE_LENGTH) {
      throw new Error(`Meeting title cannot exceed ${MAX_MEETING_TITLE_LENGTH} characters.`);
    }

    return normalizedTitle;
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

  function navigateToMeetingDetails(sessionId) {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) {
      return;
    }

    window.location.href = buildMeetingDetailsHref(normalizedSessionId);
  }

  function navigateToRecordingPage(meetingTitle, participantCount, inputSourceMode) {
    const queryParams = new URLSearchParams();
    if (meetingTitle) {
      queryParams.set('title', meetingTitle);
    }
    queryParams.set('participants', String(participantCount));
    queryParams.set('inputSourceMode', normalizeInputSourceMode(inputSourceMode || DEFAULT_INPUT_SOURCE_MODE));

    const queryString = queryParams.toString();
    const recordingHref = buildRecordingHref();
    window.location.href = queryString ? `${recordingHref}?${queryString}` : recordingHref;
  }

  window.dashboardHelpers = {
    hasRecordingApi,
    hasMeetingActionsApi,
    normalizeEditableMeetingTitle,
    getErrorMessage,
    navigateToMeetingDetails,
    navigateToRecordingPage,
  };
})();
