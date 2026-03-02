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
    '{"salientPoints": string[], "actionItems": [{"task": string, "evidenceQuote": string}], "importantTimeline": [{"date": "YYYY-MM-DD", "task": string, "evidenceQuote": string}]}',
    '',
    'Rules:',
    `- salientPoints (meeting points): 0 to ${normalizedMaxItems} concise bullets, each at most ${normalizedWordLimit} words.`,
    '- Use salientPoints to capture key ideas, insights, decisions, motivations, or notable context discussed.',
    '- When transcript has meaningful discussion, include at least 1 salient point.',
    '- Do not leave salientPoints empty unless transcript is too short/noisy to extract clear meeting points.',
    `- actionItems: 0 to ${normalizedMaxItems} entries with concrete tasks explicitly stated in transcript.`,
    `- importantTimeline: 0 to ${normalizedMaxItems} entries with explicit date and explicit task from transcript.`,
    '- Action item and timeline evidenceQuote values must be short verbatim quotes from transcript text.',
    '- Do not infer or assume tasks, deadlines, owners, or dates.',
    '- Include timeline entries only when transcript clearly states a full calendar date.',
    '- Timeline date must be YYYY-MM-DD.',
    '- If none, return an empty array.',
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

function normalizeInsightsTextList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || '').replace(/\s+/gu, ' ').trim().replace(/^[\-\u2022*]+\s*/u, ''))
    .filter(Boolean);
}

function normalizeInsightObjectList(value, keys) {
  if (!Array.isArray(value) || !Array.isArray(keys) || keys.length === 0) {
    return [];
  }

  const normalizedItems = [];

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const normalizedItem = {};
    let isValid = true;

    for (const key of keys) {
      const normalizedValue = String(item[key] || '').replace(/\s+/gu, ' ').trim();
      if (!normalizedValue) {
        isValid = false;
        break;
      }

      normalizedItem[key] = normalizedValue;
    }

    if (isValid) {
      normalizedItems.push(normalizedItem);
    }
  }

  return normalizedItems;
}

function isValidIsoDate(value) {
  const normalizedValue = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalizedValue)) {
    return false;
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return parsedDate.toISOString().slice(0, 10) === normalizedValue;
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

  const parsedTimeline = normalizeInsightObjectList(parsedBody.importantTimeline, [
    'date',
    'task',
    'evidenceQuote',
  ]).filter((item) => isValidIsoDate(item.date));

  return {
    salientPoints: normalizeInsightsTextList(parsedBody.salientPoints),
    actionItems: normalizeInsightObjectList(parsedBody.actionItems, ['task', 'evidenceQuote']),
    importantTimeline: parsedTimeline,
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
            'You generate structured meeting insights from transcripts, including practical meeting points that capture key ideas. Obey the user schema and formatting constraints exactly.',
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
