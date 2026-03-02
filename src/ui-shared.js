(function initializeUiShared() {
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  const defaultTags = [
    { label: 'Important', color: '#f44336' },
    { label: 'Brainstorming', color: '#f59e0b' },
    { label: 'Product', color: '#22c55e' },
  ];

  const SCROLL_HIDE_DELAY_MS = 700;
  const scrollHideTimeouts = new WeakMap();
  const fallbackTranscriptSummaries = Object.freeze({
    dashboard: 'Transcript captured. Open to view details.',
    meetings: 'Transcript captured. Open meeting details to review the full transcript.',
  });

  function normalizeParticipantCount(value) {
    const numericValue = Number.parseInt(value, 10);
    if (!Number.isFinite(numericValue) || numericValue < 1) {
      return 1;
    }
    return numericValue;
  }

  function formatParticipantLabel(participantCount) {
    const normalizedCount = normalizeParticipantCount(participantCount);
    return `${normalizedCount} ${normalizedCount === 1 ? 'person' : 'people'}`;
  }

  function formatMeetingDate(dateValue) {
    if (typeof dateValue === 'string') {
      const parsedDate = new Date(dateValue);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
    }

    return 'Unknown date';
  }

  function formatMeetingDuration(durationSec) {
    if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) {
      return '--';
    }

    const totalSeconds = Math.round(durationSec);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours} hr ${minutes} min`;
    }

    if (minutes > 0) {
      return `${minutes} min`;
    }

    return `${seconds} sec`;
  }

  function toFiniteDurationSeconds(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return 0;
    }

    return value;
  }

  function buildMeetingsHref() {
    return 'meetings.html';
  }

  function buildMeetingDetailsHref(sessionId) {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) {
      return 'meeting-details.html';
    }

    const queryParams = new URLSearchParams();
    queryParams.set('sessionId', normalizedSessionId);
    return `meeting-details.html?${queryParams.toString()}`;
  }

  function hasRecordingApi(recordingApi) {
    const api = typeof recordingApi === 'undefined' ? window.recordingApi : recordingApi;
    return Boolean(api && typeof api.listTranscriptSessions === 'function');
  }

  function getFallbackTranscriptSummary(context) {
    const normalizedContext = String(context || '').trim().toLowerCase();
    return fallbackTranscriptSummaries[normalizedContext] || fallbackTranscriptSummaries.dashboard;
  }

  function buildMeetingSearchTarget(meeting, extraTerms) {
    return `${meeting.meetingTitle || ''} ${meeting.meetingSummary || ''} ${extraTerms || ''}`.toLowerCase();
  }

  function parseSessionIdFromQuery(search) {
    const searchValue =
      typeof search === 'string'
        ? search
        : window.location && typeof window.location.search === 'string'
          ? window.location.search
          : '';

    const queryParams = new URLSearchParams(searchValue);
    return String(queryParams.get('sessionId') || '').trim();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => escapeMap[char]);
  }

  function renderDefaultTags(tagListElement) {
    if (!tagListElement) {
      return;
    }

    const tagMarkup = defaultTags
      .map(
        (tag) => `
          <li class="tag-item">
            <span class="tag-dot" style="--dot-color: ${escapeHtml(tag.color)}"></span>
            <span>${escapeHtml(tag.label)}</span>
          </li>
        `
      )
      .join('');

    tagListElement.innerHTML = tagMarkup;
  }

  function updateScrollableState(element) {
    const hasOverflow =
      element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
    element.classList.toggle('has-overflow', hasOverflow);
  }

  function refreshScrollableState() {
    document.querySelectorAll('.scroll-fade').forEach((element) => {
      updateScrollableState(element);
    });
  }

  function setScrollingClass(element) {
    element.classList.add('is-scrolling');

    const previousTimeout = scrollHideTimeouts.get(element);
    if (previousTimeout) {
      clearTimeout(previousTimeout);
    }

    const timeoutId = setTimeout(() => {
      element.classList.remove('is-scrolling');
      scrollHideTimeouts.delete(element);
    }, SCROLL_HIDE_DELAY_MS);

    scrollHideTimeouts.set(element, timeoutId);
  }

  function initializeSmartScrollbars() {
    const scrollableElements = document.querySelectorAll('.scroll-fade');

    scrollableElements.forEach((element) => {
      updateScrollableState(element);

      element.addEventListener(
        'scroll',
        () => {
          setScrollingClass(element);
        },
        { passive: true }
      );
    });

    window.addEventListener('resize', () => {
      refreshScrollableState();
    });
  }

  window.uiShared = {
    escapeHtml,
    renderDefaultTags,
    initializeSmartScrollbars,
    refreshScrollableState,
    hasRecordingApi,
    getFallbackTranscriptSummary,
    buildMeetingSearchTarget,
    normalizeParticipantCount,
    formatParticipantLabel,
    formatMeetingDate,
    formatMeetingDuration,
    toFiniteDurationSeconds,
    buildMeetingsHref,
    buildMeetingDetailsHref,
    parseSessionIdFromQuery,
  };
})();
