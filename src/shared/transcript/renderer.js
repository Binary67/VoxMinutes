(function initializeTranscriptRenderer() {
  const mergeSpeakerGapSeconds = 1.5;

  function escapeHtml(value) {
    if (window.uiShared && typeof window.uiShared.escapeHtml === 'function') {
      return window.uiShared.escapeHtml(value);
    }
    return String(value);
  }

  function refreshScrollableState() {
    if (window.uiShared && typeof window.uiShared.refreshScrollableState === 'function') {
      window.uiShared.refreshScrollableState();
    }
  }

  function formatTimerPart(value) {
    return String(value).padStart(2, '0');
  }

  function toFiniteSecond(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  function formatTranscriptOffset(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
      return '';
    }

    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;

    if (hours > 0) {
      return `${formatTimerPart(hours)}:${formatTimerPart(minutes)}:${formatTimerPart(remainder)}`;
    }

    return `${formatTimerPart(minutes)}:${formatTimerPart(remainder)}`;
  }

  function formatTranscriptTime(seconds, createdAt) {
    const transcriptOffset = formatTranscriptOffset(seconds);
    if (transcriptOffset) {
      return transcriptOffset;
    }

    if (typeof createdAt === 'string') {
      const parsedDate = new Date(createdAt);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    return '--:--';
  }

  function formatTranscriptTimeRange(startSec, endSec, createdAt) {
    const startLabel = formatTranscriptTime(startSec, createdAt);
    const startOffset = formatTranscriptOffset(startSec);
    const endOffset = formatTranscriptOffset(endSec);

    if (startOffset && endOffset && startOffset !== endOffset) {
      return `${startOffset}-${endOffset}`;
    }

    return startLabel;
  }

  function getSpeakerDisplayName(speakerMap, speakerId) {
    if (speakerMap && typeof speakerMap[speakerId] === 'string' && speakerMap[speakerId].trim()) {
      return speakerMap[speakerId].trim();
    }

    return 'Speaker';
  }

  function buildSpeakerInitials(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/u)
      .filter(Boolean);

    if (parts.length === 0) {
      return 'SP';
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  function joinTranscriptText(currentText, nextText) {
    const left = String(currentText || '').trim();
    const right = String(nextText || '').trim();

    if (!left) {
      return right;
    }
    if (!right) {
      return left;
    }

    if (/^[.,!?;:%)\]}]+/u.test(right)) {
      return `${left}${right}`;
    }

    return `${left} ${right}`;
  }

  function canMergeAdjacentSegments(previousSegment, nextSegment) {
    if (!previousSegment || !nextSegment) {
      return false;
    }

    if (previousSegment.speakerId !== nextSegment.speakerId) {
      return false;
    }

    const previousEnd = previousSegment.endSec;
    const nextStart = nextSegment.startSec;

    if (previousEnd !== null && nextStart !== null) {
      return nextStart - previousEnd <= mergeSpeakerGapSeconds;
    }

    return true;
  }

  function mergeDisplaySegments(segments) {
    const mergedSegments = [];

    segments.forEach((segment) => {
      const text = String(segment && segment.text ? segment.text : '').trim();
      if (!text) {
        return;
      }

      const normalizedSpeakerId = String(segment && segment.speakerId ? segment.speakerId : '').trim() || 'speaker_1';
      const normalizedSegment = {
        speakerId: normalizedSpeakerId,
        startSec: toFiniteSecond(segment && segment.startSec),
        endSec: toFiniteSecond(segment && segment.endSec),
        text,
        createdAt: segment && typeof segment.createdAt === 'string' ? segment.createdAt : null,
      };

      const previousSegment = mergedSegments[mergedSegments.length - 1];
      if (!canMergeAdjacentSegments(previousSegment, normalizedSegment)) {
        mergedSegments.push(normalizedSegment);
        return;
      }

      previousSegment.text = joinTranscriptText(previousSegment.text, normalizedSegment.text);
      if (previousSegment.startSec === null && normalizedSegment.startSec !== null) {
        previousSegment.startSec = normalizedSegment.startSec;
      }
      if (normalizedSegment.endSec !== null) {
        previousSegment.endSec = normalizedSegment.endSec;
      }
    });

    return mergedSegments;
  }

  function renderEmptyTranscript(containerElement, message) {
    if (!(containerElement instanceof HTMLElement)) {
      return;
    }

    const emptyMessage = String(message || 'No transcription yet.').trim() || 'No transcription yet.';
    containerElement.innerHTML = `<p class="transcript-empty">${escapeHtml(emptyMessage)}</p>`;
    refreshScrollableState();
  }

  function renderTranscriptFromDocument(containerElement, document, options) {
    if (!(containerElement instanceof HTMLElement)) {
      return;
    }

    const safeOptions = options && typeof options === 'object' ? options : {};
    const emptyMessage =
      String(safeOptions.emptyMessage || 'No transcription yet.').trim() || 'No transcription yet.';
    const interactiveSpeakerNames = Boolean(safeOptions.interactiveSpeakerNames);

    if (!document || !Array.isArray(document.segments) || document.segments.length === 0) {
      renderEmptyTranscript(containerElement, emptyMessage);
      return;
    }

    const speakerMap = document.speakerMap || {};
    const displaySegments = mergeDisplaySegments(document.segments);

    if (displaySegments.length === 0) {
      renderEmptyTranscript(containerElement, emptyMessage);
      return;
    }

    const transcriptMarkup = displaySegments
      .map((segment) => {
        const speakerId = String(segment.speakerId || '').trim();
        const speakerName = getSpeakerDisplayName(speakerMap, speakerId);
        const initials = buildSpeakerInitials(speakerName);
        const transcriptTime = formatTranscriptTimeRange(
          segment.startSec,
          segment.endSec,
          segment.createdAt
        );
        const speakerLabelMarkup = interactiveSpeakerNames
          ? `
              <button
                type="button"
                class="transcript-speaker-btn"
                data-speaker-id="${escapeHtml(speakerId)}"
                aria-label="Rename ${escapeHtml(speakerName)}"
              >
                ${escapeHtml(speakerName)}
              </button>
            `
          : `<span class="transcript-speaker-name">${escapeHtml(speakerName)}</span>`;

        return `
          <article class="transcript-entry">
            <span class="transcript-avatar">${escapeHtml(initials)}</span>
            <div class="transcript-content">
              <p class="transcript-meta">
                ${speakerLabelMarkup}
                <span class="transcript-time">${escapeHtml(transcriptTime)}</span>
              </p>
              <p class="transcript-text">${escapeHtml(String(segment.text || ''))}</p>
            </div>
          </article>
        `;
      })
      .join('');

    containerElement.innerHTML = transcriptMarkup;
    refreshScrollableState();
  }

  window.transcriptRenderer = {
    getSpeakerDisplayName,
    mergeDisplaySegments,
    renderEmptyTranscript,
    renderTranscriptFromDocument,
  };
})();
