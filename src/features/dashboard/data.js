(function initializeDashboardData() {
  const { dashboardState } = window.dashboardStateStore;
  const { hasRecordingApi, hasMeetingActionsApi } = window.dashboardHelpers;
  const { renderMeetings } = window.dashboardRender;

  async function loadMeetings() {
    if (!hasRecordingApi()) {
      dashboardState.meetings = [];
      dashboardState.loadErrorMessage = 'Recording bridge is unavailable.';
      renderMeetings();
      return;
    }

    try {
      const sessions = await window.recordingApi.listTranscriptSessions();
      dashboardState.meetings = Array.isArray(sessions) ? sessions : [];
      dashboardState.loadErrorMessage = '';
    } catch (_error) {
      dashboardState.meetings = [];
      dashboardState.loadErrorMessage = 'Unable to load recorded meetings.';
    }

    renderMeetings();
  }

  function getMeetingBySessionId(sessionId) {
    if (!sessionId) {
      return null;
    }

    return dashboardState.meetings.find((meeting) => meeting.sessionId === sessionId) || null;
  }

  function renameMeeting(sessionId) {
    if (!hasMeetingActionsApi()) {
      return;
    }

    const meeting = getMeetingBySessionId(sessionId);
    if (!meeting) {
      return;
    }

    window.dashboardModals.openRenameMeetingModal(sessionId);
  }

  function deleteMeeting(sessionId) {
    if (!hasMeetingActionsApi()) {
      return;
    }

    const meeting = getMeetingBySessionId(sessionId);
    if (!meeting) {
      return;
    }

    window.dashboardModals.openDeleteMeetingModal(sessionId);
  }

  window.dashboardData = {
    loadMeetings,
    getMeetingBySessionId,
    renameMeeting,
    deleteMeeting,
  };
})();
