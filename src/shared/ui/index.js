(function initializeUiShared() {
  const inputModes = window.uiInputModes || {};
  const formatters = window.uiFormatters || {};
  const navigation = window.uiNavigation || {};
  const dom = window.uiDom || {};
  const scroll = window.uiScroll || {};

  window.uiShared = {
    escapeHtml: formatters.escapeHtml,
    renderDefaultTags: formatters.renderDefaultTags,
    initializeSmartScrollbars: scroll.initializeSmartScrollbars,
    refreshScrollableState: scroll.refreshScrollableState,
    hasRecordingApi: dom.hasRecordingApi,
    getFallbackTranscriptSummary: formatters.getFallbackTranscriptSummary,
    buildMeetingSearchTarget: formatters.buildMeetingSearchTarget,
    normalizeParticipantCount: formatters.normalizeParticipantCount,
    normalizeInputSourceMode: inputModes.normalizeInputSourceMode,
    getInputSourceModeLabel: inputModes.getInputSourceModeLabel,
    INPUT_SOURCE_MODES: inputModes.INPUT_SOURCE_MODES,
    DEFAULT_INPUT_SOURCE_MODE: inputModes.DEFAULT_INPUT_SOURCE_MODE,
    formatParticipantLabel: formatters.formatParticipantLabel,
    formatMeetingDate: formatters.formatMeetingDate,
    formatMeetingDuration: formatters.formatMeetingDuration,
    toFiniteDurationSeconds: formatters.toFiniteDurationSeconds,
    buildDashboardHref: navigation.buildDashboardHref,
    buildMeetingsHref: navigation.buildMeetingsHref,
    buildRecordingHref: navigation.buildRecordingHref,
    buildMeetingDetailsHref: navigation.buildMeetingDetailsHref,
    parseSessionIdFromQuery: formatters.parseSessionIdFromQuery,
  };
})();
