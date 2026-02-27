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
  const statusMessage = `Azure OpenAI request failed with status ${response.status}.`;
  const error = new Error(apiErrorMessage || statusMessage);
  error.status = response.status;
  error.payloadBody = payloadBody;
  return error;
}

function toMessageText(contentValue) {
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

function createInsightsPrompt(meetingTitle, transcriptText, wordLimit, maxItems) {
  const normalizedTitle = String(meetingTitle || '').trim() || 'Untitled meeting';
  const normalizedWordLimit = Number.isFinite(wordLimit) ? Math.max(1, Math.floor(wordLimit)) : 18;
  const normalizedMaxItems = Number.isFinite(maxItems) ? Math.max(0, Math.floor(maxItems)) : 6;
  return [
    'Return a strict JSON object with this exact schema and no additional keys:',
    '{"summary": string, "keyDecisions": string[], "actionItems": string[]}',
    '',
    'Rules:',
    `- Summary: one concise sentence of at most ${normalizedWordLimit} words.`,
    `- keyDecisions: 0 to ${normalizedMaxItems} concise bullets, no speaker names.`,
    `- actionItems: 0 to ${normalizedMaxItems} concrete tasks, no speaker names.`,
    '- If none, return an empty array for the section.',
    '- Output JSON only. Do not include markdown fences or commentary.',
    '',
    `Meeting title: ${normalizedTitle}`,
    `Transcript:\n${transcriptText}`,
  ].join('\n');
}

function stripJsonCodeFence(value) {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith('```')) {
    return normalized;
  }

  const fencedMatch = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  if (!fencedMatch) {
    return normalized;
  }

  return fencedMatch[1].trim();
}

function extractLikelyJsonObject(value) {
  const normalized = String(value || '').trim();
  const objectStart = normalized.indexOf('{');
  const objectEnd = normalized.lastIndexOf('}');

  if (objectStart < 0 || objectEnd <= objectStart) {
    return normalized;
  }

  return normalized.slice(objectStart, objectEnd + 1).trim();
}

function normalizeInsightsList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || '').replace(/\s+/gu, ' ').trim().replace(/^[\-\u2022*]+\s*/u, ''))
    .filter(Boolean);
}

function parseInsightsResponse(contentValue) {
  const rawResponse = toMessageText(contentValue);
  if (!rawResponse) {
    throw new Error('Insights response did not include text.');
  }

  const jsonText = stripJsonCodeFence(rawResponse);
  let parsedBody = null;
  try {
    parsedBody = JSON.parse(jsonText);
  } catch (_error) {
    try {
      parsedBody = JSON.parse(extractLikelyJsonObject(jsonText));
    } catch (_nestedError) {
      throw new Error('Insights response format invalid.');
    }
  }

  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    throw new Error('Insights response format invalid.');
  }

  const summary = String(parsedBody.summary || '').trim();
  if (!summary) {
    throw new Error('Insights response did not include summary text.');
  }

  return {
    summary,
    keyDecisions: normalizeInsightsList(parsedBody.keyDecisions),
    actionItems: normalizeInsightsList(parsedBody.actionItems),
  };
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

  const summaryText = toMessageText(
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

async function requestMeetingInsightsFromAzure({
  endpoint,
  apiKey,
  deploymentName,
  apiVersion,
  meetingTitle,
  transcriptText,
  wordLimit,
  maxItems,
}) {
  if (typeof fetch !== 'function') {
    throw new Error('Runtime does not support fetch required for insights generation.');
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
            'You generate structured meeting insights from transcripts. Obey the user schema and formatting constraints exactly.',
        },
        {
          role: 'user',
          content: createInsightsPrompt(meetingTitle, transcriptText, wordLimit, maxItems),
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

  return parseInsightsResponse(
    payloadBody &&
      Array.isArray(payloadBody.choices) &&
      payloadBody.choices[0] &&
      payloadBody.choices[0].message
      ? payloadBody.choices[0].message.content
      : ''
  );
}

module.exports = {
  requestMeetingInsightsFromAzure,
  requestMeetingSummaryFromAzure,
};
