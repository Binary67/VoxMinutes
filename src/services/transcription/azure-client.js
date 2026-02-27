const { DEFAULT_MIME_TYPE } = require('./constants');

function extractErrorMessage(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return '';
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }

  if (
    payload.error &&
    typeof payload.error === 'object' &&
    !Array.isArray(payload.error) &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message.trim();
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  return '';
}

function createTranscriptionError(response, payloadBody) {
  const apiErrorMessage = extractErrorMessage(payloadBody);
  const statusMessage = `Transcription request failed with status ${response.status}.`;
  const error = new Error(apiErrorMessage || statusMessage);
  error.status = response.status;
  error.payloadBody = payloadBody;
  return error;
}

function isIncompatibleResponseFormatError(error) {
  if (!(error instanceof Error) || !error.message) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  if (!normalizedMessage.includes('response_format')) {
    return false;
  }

  return normalizedMessage.includes('not compatible');
}

function getFileExtensionFromMime(mimeType) {
  const normalized = String(mimeType || DEFAULT_MIME_TYPE).toLowerCase();
  if (normalized.includes('mp4')) {
    return 'mp4';
  }
  if (normalized.includes('mpeg')) {
    return 'mp3';
  }
  if (normalized.includes('ogg')) {
    return 'ogg';
  }
  if (normalized.includes('wav')) {
    return 'wav';
  }
  return 'webm';
}

async function requestTranscriptionFromAzure({
  requestUrl,
  apiKey,
  deploymentName,
  audioBuffer,
  mimeType,
  responseFormat,
}) {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([audioBuffer], { type: mimeType }),
    `recording.${getFileExtensionFromMime(mimeType)}`
  );
  formData.append('model', deploymentName);
  formData.append('response_format', responseFormat);
  formData.append('chunking_strategy', 'auto');

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
    },
    body: formData,
  });

  const rawResponseText = await response.text();
  let payloadBody = {};
  if (rawResponseText.trim()) {
    try {
      payloadBody = JSON.parse(rawResponseText);
    } catch (_error) {
      payloadBody = { message: rawResponseText };
    }
  }

  if (!response.ok) {
    throw createTranscriptionError(response, payloadBody);
  }

  return payloadBody;
}

module.exports = {
  isIncompatibleResponseFormatError,
  requestTranscriptionFromAzure,
};
