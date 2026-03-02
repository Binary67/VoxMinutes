(function initializeDashboardRender() {
  const {
    escapeHtml,
    formatParticipantLabel,
    formatMeetingDate,
    formatMeetingDuration,
    refreshScrollableState,
    buildMeetingSearchTarget,
    getFallbackTranscriptSummary,
  } = window.uiShared;
  const {
    meetingVisuals,
    MAX_RECENT_MEETINGS_ON_DASHBOARD,
    ESTIMATION_WINDOW_DAYS,
    dashboardState,
    meetingsGrid,
    emptyState,
    totalRecordedTimeValue,
    estimatedTimeSavedValue,
    estimatedTimeSavedMeta,
    estimatedProductivityLiftValue,
    estimatedProductivityLiftMeta,
  } = window.dashboardStateStore;
  const {
    getTotalRecordedSeconds,
    formatTotalRecordedTime,
    getEstimatedProductivityMetrics,
    formatEstimatedTimeSaved,
  } = window.dashboardMetrics;

  function createMeetingCard(meeting) {
    const sessionId = String(meeting.sessionId || '').trim();
    const escapedSessionId = escapeHtml(sessionId);
    const cardAttributes = sessionId
      ? `data-session-id="${escapedSessionId}" role="link" tabindex="0"`
      : '';
    const isOptionsMenuOpen = sessionId && dashboardState.openMenuSessionId === sessionId;
    const title = escapeHtml(String(meeting.meetingTitle || 'Untitled meeting'));
    const date = escapeHtml(formatMeetingDate(meeting.updatedAt));
    const duration = escapeHtml(formatMeetingDuration(meeting.durationSec));
    const summary = escapeHtml(
      String(meeting.meetingSummary || '').trim() || getFallbackTranscriptSummary('dashboard')
    );
    const participantLabel = escapeHtml(formatParticipantLabel(meeting.participantCount));
    const category = escapeHtml(meetingVisuals.category);
    const menuMarkup = sessionId
      ? `
          <div class="meeting-options">
            <button
              type="button"
              class="icon-button meeting-options-trigger"
              aria-label="Meeting options"
              aria-haspopup="menu"
              aria-expanded="${isOptionsMenuOpen ? 'true' : 'false'}"
              data-session-id="${escapedSessionId}"
            >
              <i class="bi bi-three-dots-vertical"></i>
            </button>
            <div class="meeting-options-menu" role="menu" ${isOptionsMenuOpen ? '' : 'hidden'}>
              <button type="button" class="meeting-menu-item" role="menuitem" data-action="rename" data-session-id="${escapedSessionId}">
                Rename
              </button>
              <button type="button" class="meeting-menu-item danger" role="menuitem" data-action="delete" data-session-id="${escapedSessionId}">
                Delete
              </button>
            </div>
          </div>
        `
      : `
          <button type="button" class="icon-button" aria-label="Meeting options" disabled>
            <i class="bi bi-three-dots-vertical"></i>
          </button>
        `;

    return `
      <article
        class="meeting-card${sessionId ? ' is-clickable' : ''}"
        ${cardAttributes}
        style="--accent: ${escapeHtml(meetingVisuals.accent)}; --icon-bg: ${escapeHtml(meetingVisuals.iconBg)};"
      >
        <div class="meeting-top">
          <div class="meeting-icon">
            <i class="bi ${escapeHtml(meetingVisuals.icon)}"></i>
          </div>
          ${menuMarkup}
        </div>

        <div>
          <h3 class="meeting-title">${title}</h3>
          <p class="meeting-meta">${date} | ${duration}</p>
        </div>

        <div class="summary-box">
          <p class="summary-badge">
            <i class="bi bi-stars"></i>
            <span>TRANSCRIPT SNAPSHOT</span>
          </p>
          <p class="summary-text">${summary}</p>
        </div>

        <div class="meeting-footer">
          <span class="participants-count">
            <i class="bi bi-people-fill" aria-hidden="true"></i>
            <span>${participantLabel}</span>
          </span>
          <span class="category-pill">${category}</span>
        </div>
      </article>
    `;
  }

  function getFilteredMeetings() {
    if (!dashboardState.searchQuery) {
      return dashboardState.meetings;
    }

    return dashboardState.meetings.filter((meeting) =>
      buildMeetingSearchTarget(meeting, meetingVisuals.category).includes(dashboardState.searchQuery)
    );
  }

  function getVisibleMeetings() {
    return getFilteredMeetings().slice(0, MAX_RECENT_MEETINGS_ON_DASHBOARD);
  }

  function updateEmptyState(filteredMeetings) {
    if (filteredMeetings.length > 0) {
      emptyState.hidden = true;
      return;
    }

    if (dashboardState.loadErrorMessage) {
      emptyState.textContent = dashboardState.loadErrorMessage;
    } else if (dashboardState.meetings.length === 0) {
      emptyState.textContent = 'No recordings yet. Start a new recording.';
    } else {
      emptyState.textContent = 'No meetings match your search.';
    }

    emptyState.hidden = false;
  }

  function renderStats() {
    if (totalRecordedTimeValue) {
      const totalRecordedSeconds = getTotalRecordedSeconds(dashboardState.meetings);
      totalRecordedTimeValue.textContent = formatTotalRecordedTime(totalRecordedSeconds);
    }

    const metrics = getEstimatedProductivityMetrics(dashboardState.meetings);

    if (estimatedTimeSavedValue) {
      estimatedTimeSavedValue.textContent = formatEstimatedTimeSaved(metrics.totalSavedMinutes);
    }

    if (estimatedProductivityLiftValue) {
      estimatedProductivityLiftValue.textContent = `${metrics.estimatedLiftPercent}%`;
    }

    const meetingLabel = metrics.recentMeetingCount === 1 ? 'meeting' : 'meetings';
    const estimateDescription =
      metrics.recentMeetingCount > 0
        ? `Estimated from ${metrics.recentMeetingCount} ${meetingLabel} in the last ${ESTIMATION_WINDOW_DAYS} days using duration bands.`
        : `Estimated from meeting activity in the last ${ESTIMATION_WINDOW_DAYS} days.`;

    if (estimatedTimeSavedMeta) {
      estimatedTimeSavedMeta.title = estimateDescription;
    }

    if (estimatedProductivityLiftMeta) {
      estimatedProductivityLiftMeta.title = estimateDescription;
    }
  }

  function renderMeetings() {
    const visibleMeetings = getVisibleMeetings();

    if (
      dashboardState.openMenuSessionId &&
      !visibleMeetings.some((meeting) => meeting.sessionId === dashboardState.openMenuSessionId)
    ) {
      dashboardState.openMenuSessionId = '';
    }

    renderStats();

    const cardsMarkup =
      visibleMeetings.length === 0
        ? ''
        : visibleMeetings.map((meeting) => createMeetingCard(meeting)).join('');

    meetingsGrid.innerHTML = cardsMarkup;
    updateEmptyState(visibleMeetings);
    refreshScrollableState();
  }

  function closeMeetingOptionsMenu() {
    if (!dashboardState.openMenuSessionId) {
      return;
    }

    dashboardState.openMenuSessionId = '';
    renderMeetings();
  }

  function toggleMeetingOptionsMenu(sessionId) {
    if (!sessionId) {
      return;
    }

    dashboardState.openMenuSessionId =
      dashboardState.openMenuSessionId === sessionId ? '' : sessionId;
    renderMeetings();
  }

  window.dashboardRender = {
    renderMeetings,
    closeMeetingOptionsMenu,
    toggleMeetingOptionsMenu,
  };
})();
