(function initializeUiDom() {
  function hasRecordingApi(recordingApi) {
    const api = typeof recordingApi === 'undefined' ? window.recordingApi : recordingApi;
    return Boolean(api && typeof api.listTranscriptSessions === 'function');
  }

  window.uiDom = {
    hasRecordingApi,
  };
})();
