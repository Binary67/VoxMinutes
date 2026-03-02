(function initializeDashboardMetrics() {
  const { toFiniteDurationSeconds } = window.uiShared;
  const { ESTIMATION_WINDOW_DAYS, MS_PER_DAY } = window.dashboardStateStore;

  function getTotalRecordedSeconds(meetings) {
    return meetings.reduce((totalSeconds, meeting) => {
      return totalSeconds + toFiniteDurationSeconds(meeting && meeting.durationSec);
    }, 0);
  }

  function formatTotalRecordedTime(totalSeconds) {
    const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.round(totalSeconds) : 0;
    if (safeSeconds === 0) {
      return '0 min';
    }

    if (safeSeconds >= 3600) {
      const totalHours = safeSeconds / 3600;
      return `${totalHours.toFixed(1)} hrs`;
    }

    const totalMinutes = Math.max(1, Math.round(safeSeconds / 60));
    return `${totalMinutes} min`;
  }

  function toTimestampOrNull(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function getMeetingTimestamp(meeting) {
    const updatedAtTimestamp = toTimestampOrNull(meeting && meeting.updatedAt);
    if (updatedAtTimestamp !== null) {
      return updatedAtTimestamp;
    }

    return toTimestampOrNull(meeting && meeting.createdAt);
  }

  function getRecentMeetings(meetings, nowTimestamp = Date.now()) {
    const windowStartTimestamp = nowTimestamp - ESTIMATION_WINDOW_DAYS * MS_PER_DAY;
    return meetings.filter((meeting) => {
      const meetingTimestamp = getMeetingTimestamp(meeting);
      if (meetingTimestamp === null) {
        return false;
      }

      return meetingTimestamp >= windowStartTimestamp && meetingTimestamp <= nowTimestamp;
    });
  }

  function getEstimatedMeetingEfficiency(durationSec) {
    const safeDurationSec = toFiniteDurationSeconds(durationSec);
    if (safeDurationSec <= 0) {
      return {
        savedMinutes: 6,
        baselineMinutes: 12,
      };
    }

    const durationMinutes = safeDurationSec / 60;
    if (durationMinutes < 5) {
      return {
        savedMinutes: 4,
        baselineMinutes: 8,
      };
    }

    if (durationMinutes <= 20) {
      return {
        savedMinutes: 8,
        baselineMinutes: 15,
      };
    }

    return {
      savedMinutes: 12,
      baselineMinutes: 25,
    };
  }

  function getEstimatedProductivityMetrics(meetings) {
    const recentMeetings = getRecentMeetings(meetings);
    const totals = recentMeetings.reduce(
      (accumulator, meeting) => {
        const efficiency = getEstimatedMeetingEfficiency(meeting && meeting.durationSec);
        return {
          totalSavedMinutes: accumulator.totalSavedMinutes + efficiency.savedMinutes,
          totalBaselineMinutes: accumulator.totalBaselineMinutes + efficiency.baselineMinutes,
        };
      },
      {
        totalSavedMinutes: 0,
        totalBaselineMinutes: 0,
      }
    );

    const rawLiftPercent =
      totals.totalBaselineMinutes > 0
        ? Math.round((totals.totalSavedMinutes / totals.totalBaselineMinutes) * 100)
        : 0;
    const estimatedLiftPercent = Math.max(0, Math.min(99, rawLiftPercent));

    return {
      totalSavedMinutes: totals.totalSavedMinutes,
      estimatedLiftPercent,
      recentMeetingCount: recentMeetings.length,
    };
  }

  function formatEstimatedTimeSaved(totalMinutes) {
    const safeMinutes = Number.isFinite(totalMinutes) && totalMinutes > 0 ? Math.round(totalMinutes) : 0;
    if (safeMinutes >= 60) {
      const totalHours = safeMinutes / 60;
      return `${totalHours.toFixed(1)} hrs`;
    }

    return `${safeMinutes} min`;
  }

  window.dashboardMetrics = {
    getTotalRecordedSeconds,
    formatTotalRecordedTime,
    getEstimatedProductivityMetrics,
    formatEstimatedTimeSaved,
  };
})();
