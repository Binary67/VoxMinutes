(function initializeDashboardPage() {
  const { renderDefaultTags, initializeSmartScrollbars } = window.uiShared;
  const { tagList, searchInput } = window.dashboardStateStore;
  const { initializeSearch, initializeMeetingNavigation, initializeMeetingActions, initializeModal } =
    window.dashboardEvents;
  const { loadMeetings } = window.dashboardData;

  async function initializeDashboard() {
    renderDefaultTags(tagList);
    initializeSearch();
    initializeMeetingNavigation();
    initializeMeetingActions();
    initializeModal();
    initializeSmartScrollbars();
    await loadMeetings();
    searchInput.focus({ preventScroll: true });
  }

  void initializeDashboard();
})();
