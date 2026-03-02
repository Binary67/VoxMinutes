(function initializeDashboardStateStore() {
  const meetingVisuals = Object.freeze({
    accent: '#0a84ff',
    iconBg: '#eaf4ff',
    icon: 'bi-record-circle-fill',
    category: 'Recording',
  });

  const MAX_MEETING_TITLE_LENGTH = 160;
  const MAX_RECENT_MEETINGS_ON_DASHBOARD = 3;
  const ESTIMATION_WINDOW_DAYS = 30;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const dashboardState = {
    meetings: [],
    searchQuery: '',
    loadErrorMessage: '',
    openMenuSessionId: '',
  };

  const modalState = {
    activeModal: '',
    lastFocusedElement: null,
  };

  const recordingInputSourceState = {
    isOpen: false,
    activeIndex: 0,
    selectedValue: '',
  };

  const renameMeetingState = {
    sessionId: '',
    isSaving: false,
  };

  const deleteMeetingState = {
    sessionId: '',
    isDeleting: false,
  };

  const tagList = document.getElementById('tag-list');
  const meetingsGrid = document.getElementById('meetings-grid');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const totalRecordedTimeValue = document.getElementById('total-recorded-time-value');
  const estimatedTimeSavedValue = document.getElementById('estimated-time-saved-value');
  const estimatedTimeSavedMeta = document.getElementById('estimated-time-saved-meta');
  const estimatedProductivityLiftValue = document.getElementById('estimated-productivity-lift-value');
  const estimatedProductivityLiftMeta = document.getElementById('estimated-productivity-lift-meta');
  const viewAllMeetingsButton = document.querySelector('.view-all-btn');

  const newRecordingButton = document.getElementById('new-recording-btn');
  const modalBackdrop = document.getElementById('new-recording-modal-backdrop');
  const modalElement = document.getElementById('new-recording-modal');
  const newRecordingForm = document.getElementById('new-recording-form');
  const meetingTitleInput = document.getElementById('meeting-title-input');
  const meetingParticipantsInput = document.getElementById('meeting-participants-input');
  const meetingInputSourceDropdown = document.getElementById('meeting-input-source-dropdown');
  const meetingInputSourceTrigger = document.getElementById('meeting-input-source-trigger');
  const meetingInputSourceTriggerLabel = document.getElementById('meeting-input-source-trigger-label');
  const meetingInputSourceListbox = document.getElementById('meeting-input-source-listbox');
  const meetingInputSourceOptions = Array.from(
    document.querySelectorAll('#meeting-input-source-listbox .meeting-input-source-option')
  );
  const meetingInputSourceModeInput = document.getElementById('meeting-input-source-mode-input');
  const modalCancelButton = document.getElementById('meeting-modal-cancel-btn');
  const renameMeetingModalBackdrop = document.getElementById('rename-meeting-modal-backdrop');
  const renameMeetingModal = document.getElementById('rename-meeting-modal');
  const renameMeetingForm = document.getElementById('rename-meeting-form');
  const renameMeetingTitleInput = document.getElementById('rename-meeting-title-input');
  const renameMeetingError = document.getElementById('rename-meeting-error');
  const renameMeetingCancelButton = document.getElementById('rename-meeting-cancel-btn');
  const renameMeetingSubmitButton = document.getElementById('rename-meeting-submit-btn');
  const deleteMeetingModalBackdrop = document.getElementById('delete-meeting-modal-backdrop');
  const deleteMeetingModal = document.getElementById('delete-meeting-modal');
  const deleteMeetingForm = document.getElementById('delete-meeting-form');
  const deleteMeetingTitle = document.getElementById('delete-meeting-title');
  const deleteMeetingError = document.getElementById('delete-meeting-error');
  const deleteMeetingCancelButton = document.getElementById('delete-meeting-cancel-btn');
  const deleteMeetingSubmitButton = document.getElementById('delete-meeting-submit-btn');

  window.dashboardStateStore = {
    meetingVisuals,
    MAX_MEETING_TITLE_LENGTH,
    MAX_RECENT_MEETINGS_ON_DASHBOARD,
    ESTIMATION_WINDOW_DAYS,
    MS_PER_DAY,
    dashboardState,
    modalState,
    recordingInputSourceState,
    renameMeetingState,
    deleteMeetingState,
    tagList,
    meetingsGrid,
    emptyState,
    searchInput,
    totalRecordedTimeValue,
    estimatedTimeSavedValue,
    estimatedTimeSavedMeta,
    estimatedProductivityLiftValue,
    estimatedProductivityLiftMeta,
    viewAllMeetingsButton,
    newRecordingButton,
    modalBackdrop,
    modalElement,
    newRecordingForm,
    meetingTitleInput,
    meetingParticipantsInput,
    meetingInputSourceDropdown,
    meetingInputSourceTrigger,
    meetingInputSourceTriggerLabel,
    meetingInputSourceListbox,
    meetingInputSourceOptions,
    meetingInputSourceModeInput,
    modalCancelButton,
    renameMeetingModalBackdrop,
    renameMeetingModal,
    renameMeetingForm,
    renameMeetingTitleInput,
    renameMeetingError,
    renameMeetingCancelButton,
    renameMeetingSubmitButton,
    deleteMeetingModalBackdrop,
    deleteMeetingModal,
    deleteMeetingForm,
    deleteMeetingTitle,
    deleteMeetingError,
    deleteMeetingCancelButton,
    deleteMeetingSubmitButton,
  };
})();
