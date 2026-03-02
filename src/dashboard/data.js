(function initializeDashboardData() {
  const { dashboardState } = window.dashboardStateStore;
  const { hasRecordingApi, hasMeetingActionsApi, getErrorMessage } = window.dashboardHelpers;
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

  async function deleteMeeting(sessionId) {
    if (!hasMeetingActionsApi()) {
      return;
    }

    const meeting = getMeetingBySessionId(sessionId);
    if (!meeting) {
      return;
    }

    const meetingTitle = String(meeting.meetingTitle || 'Untitled meeting').trim() || 'Untitled meeting';
    const isDeleteConfirmed = window.confirm(
      `Delete "${meetingTitle}"?\n\nThis permanently deletes the transcript.`
    );
    if (!isDeleteConfirmed) {
      return;
    }

    try {
      await window.recordingApi.deleteTranscriptSession({ sessionId });
      await loadMeetings();
    } catch (error) {
      window.alert(getErrorMessage(error, 'Unable to delete meeting.'));
    }
  }

  window.dashboardData = {
    loadMeetings,
    getMeetingBySessionId,
    renameMeeting,
    deleteMeeting,
  };
})();
