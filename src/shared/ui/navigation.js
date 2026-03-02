(function initializeUiNavigation() {
  const DASHBOARD_HREF = '../dashboard/dashboard.html';
  const MEETINGS_HREF = '../meetings/meetings.html';
  const RECORDING_HREF = '../recording/recording.html';
  const MEETING_DETAILS_HREF = '../meeting-details/meeting-details.html';

  function buildDashboardHref() {
    return DASHBOARD_HREF;
  }

  function buildMeetingsHref() {
    return MEETINGS_HREF;
  }

  function buildRecordingHref() {
    return RECORDING_HREF;
  }

  function buildMeetingDetailsHref(sessionId) {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) {
      return MEETING_DETAILS_HREF;
    }

    const queryParams = new URLSearchParams();
    queryParams.set('sessionId', normalizedSessionId);
    return `${MEETING_DETAILS_HREF}?${queryParams.toString()}`;
  }

  window.uiNavigation = {
    buildDashboardHref,
    buildMeetingsHref,
    buildRecordingHref,
    buildMeetingDetailsHref,
  };
})();
