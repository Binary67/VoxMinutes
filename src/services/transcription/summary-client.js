const { normalizeEndpoint } = require('./config');

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

function createSummaryError(response, payloadBody) {
  const apiErrorMessage = extractErrorMessage(payloadBody);
  const statusMessage = `Summary request failed with status ${response.status}.`;
  const error = new Error(apiErrorMessage || statusMessage);
  error.status = response.status;
  error.payloadBody = payloadBody;
  return error;
}

function toSummaryText(contentValue) {
  if (typeof contentValue === 'string') {
    return contentValue.trim();
  }

  if (!Array.isArray(contentValue)) {
    return '';
  }

  return contentValue
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      if (typeof item.text === 'string') {
        return item.text.trim();
      }
      return '';
    })
    .filter(Boolean)
    .join(' ')
    .trim();
}

function createSummaryPrompt(meetingTitle, transcriptText, wordLimit) {
  const normalizedTitle = String(meetingTitle || '').trim() || 'Untitled meeting';
  return [
    `Write one sentence of at most ${wordLimit} words that captures the meeting topic or outcome.`,
    'Use plain language.',
    'Do not include speaker names or quotations.',
    'Return only the sentence.',
    `Meeting title: ${normalizedTitle}`,
    `Transcript:\n${transcriptText}`,
  ].join('\n');
}

async function requestMeetingSummaryFromAzure({
  endpoint,
  apiKey,
  deploymentName,
  apiVersion,
  meetingTitle,
  transcriptText,
  wordLimit,
}) {
  if (typeof fetch !== 'function') {
    throw new Error('Runtime does not support fetch required for summary generation.');
  }

  const requestUrl =
    `${normalizeEndpoint(endpoint)}/openai/deployments/` +
    `${encodeURIComponent(deploymentName)}/chat/completions` +
    `?api-version=${encodeURIComponent(apiVersion)}`;

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content:
            'You generate concise dashboard snapshot summaries for meeting transcripts. Obey format constraints exactly.',
        },
        {
          role: 'user',
          content: createSummaryPrompt(meetingTitle, transcriptText, wordLimit),
        },
      ],
      reasoning_effort: 'minimal',
    }),
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
    throw createSummaryError(response, payloadBody);
  }

  const summaryText = toSummaryText(
    payloadBody &&
      Array.isArray(payloadBody.choices) &&
      payloadBody.choices[0] &&
      payloadBody.choices[0].message
      ? payloadBody.choices[0].message.content
      : ''
  );

  if (!summaryText) {
    throw new Error('Summary response did not include text.');
  }

  return summaryText;
}

module.exports = {
  requestMeetingSummaryFromAzure,
};
