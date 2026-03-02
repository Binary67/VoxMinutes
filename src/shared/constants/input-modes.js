(function initializeUiInputModes() {
  const INPUT_SOURCE_MODES = Object.freeze({
    MIC: 'mic',
    SYSTEM: 'system',
    BOTH: 'both',
  });
  const DEFAULT_INPUT_SOURCE_MODE = INPUT_SOURCE_MODES.MIC;
  const inputSourceModeLabels = Object.freeze({
    [INPUT_SOURCE_MODES.MIC]: 'Microphone',
    [INPUT_SOURCE_MODES.SYSTEM]: 'System Audio',
    [INPUT_SOURCE_MODES.BOTH]: 'Mic + System',
  });

  function normalizeInputSourceMode(value) {
    const normalizedValue = String(value || '')
      .trim()
      .toLowerCase();

    if (Object.values(INPUT_SOURCE_MODES).includes(normalizedValue)) {
      return normalizedValue;
    }

    return DEFAULT_INPUT_SOURCE_MODE;
  }

  function getInputSourceModeLabel(value) {
    const normalizedValue = normalizeInputSourceMode(value);
    return inputSourceModeLabels[normalizedValue] || inputSourceModeLabels[DEFAULT_INPUT_SOURCE_MODE];
  }

  window.uiInputModes = {
    normalizeInputSourceMode,
    getInputSourceModeLabel,
    INPUT_SOURCE_MODES,
    DEFAULT_INPUT_SOURCE_MODE,
  };
})();
