(function initializeUiFormatters() {
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

  window.uiFormatters = {
    normalizeParticipantCount,
    formatParticipantLabel,
    formatMeetingDate,
    formatMeetingDuration,
    toFiniteDurationSeconds,
    getFallbackTranscriptSummary,
    buildMeetingSearchTarget,
    parseSessionIdFromQuery,
    escapeHtml,
    renderDefaultTags,
  };
})();
