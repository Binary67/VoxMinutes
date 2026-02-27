function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSpeakerId(rawSpeaker, index) {
  const speakerValue = String(rawSpeaker || '').trim();
  if (!speakerValue) {
    return `speaker_${index + 1}`;
  }

  const normalized = speakerValue
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '_')
    .replace(/^_+|_+$/gu, '');

  return normalized || `speaker_${index + 1}`;
}

function pickFirstString(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function pickFirstNumber(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }

    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  return null;
}

function roundSeconds(value) {
  return Math.round(value * 1000) / 1000;
}

function toSeconds(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  if (Math.abs(numericValue) > 1_000_000_000) {
    return roundSeconds(numericValue / 10_000_000);
  }

  if (Math.abs(numericValue) > 1_000_000) {
    return roundSeconds(numericValue / 1000);
  }

  return roundSeconds(numericValue);
}

function normalizeSegment(rawSegment, index) {
  if (!isPlainObject(rawSegment)) {
    return null;
  }

  const text = pickFirstString(rawSegment, ['text', 'transcript', 'utterance', 'display', 'value']);
  if (!text) {
    return null;
  }

  const speakerId = normalizeSpeakerId(
    pickFirstString(rawSegment, [
      'speakerId',
      'speaker_id',
      'speaker',
      'speakerLabel',
      'speaker_label',
      'participant',
      'channel',
      'role',
    ]),
    index
  );

  const startValue = pickFirstNumber(rawSegment, [
    'startSec',
    'start',
    'start_time',
    'startTime',
    'offset',
    'offsetSeconds',
  ]);

  const endValue = pickFirstNumber(rawSegment, ['endSec', 'end', 'end_time', 'endTime']);
  const durationValue = pickFirstNumber(rawSegment, ['durationSec', 'duration', 'durationSeconds']);

  const startSec = toSeconds(startValue);
  let endSec = toSeconds(endValue);

  if (endSec === null && startSec !== null && durationValue !== null) {
    endSec = roundSeconds(startSec + toSeconds(durationValue));
  }

  return {
    speakerId,
    startSec,
    endSec,
    text,
  };
}

function getCandidateSegmentArrays(payload) {
  const candidates = [];

  if (Array.isArray(payload.segments)) {
    candidates.push(payload.segments);
  }
  if (Array.isArray(payload.diarized_segments)) {
    candidates.push(payload.diarized_segments);
  }
  if (isPlainObject(payload.results) && Array.isArray(payload.results.segments)) {
    candidates.push(payload.results.segments);
  }
  if (Array.isArray(payload.utterances)) {
    candidates.push(payload.utterances);
  }
  if (Array.isArray(payload.phrases)) {
    candidates.push(payload.phrases);
  }
  if (Array.isArray(payload.diarization_segments)) {
    candidates.push(payload.diarization_segments);
  }
  if (isPlainObject(payload.diarization) && Array.isArray(payload.diarization.segments)) {
    candidates.push(payload.diarization.segments);
  }
  if (isPlainObject(payload.output) && Array.isArray(payload.output.segments)) {
    candidates.push(payload.output.segments);
  }
  if (Array.isArray(payload.output)) {
    const outputSegments = payload.output
      .map((item) => (isPlainObject(item) && Array.isArray(item.segments) ? item.segments : null))
      .filter((value) => Array.isArray(value))
      .flat();

    if (outputSegments.length > 0) {
      candidates.push(outputSegments);
    }
  }

  return candidates;
}

function getCandidateWordArrays(payload) {
  const candidates = [];

  if (Array.isArray(payload.words)) {
    candidates.push(payload.words);
  }
  if (Array.isArray(payload.word_segments)) {
    candidates.push(payload.word_segments);
  }
  if (isPlainObject(payload.results) && Array.isArray(payload.results.words)) {
    candidates.push(payload.results.words);
  }
  if (isPlainObject(payload.output) && Array.isArray(payload.output.words)) {
    candidates.push(payload.output.words);
  }
  if (Array.isArray(payload.segments)) {
    const nestedWords = payload.segments
      .map((segment) => (isPlainObject(segment) && Array.isArray(segment.words) ? segment.words : null))
      .filter((value) => Array.isArray(value))
      .flat();

    if (nestedWords.length > 0) {
      candidates.push(nestedWords);
    }
  }

  return candidates;
}

function normalizeWord(rawWord, index) {
  if (!isPlainObject(rawWord)) {
    return null;
  }

  const text = pickFirstString(rawWord, ['word', 'text', 'token', 'value', 'display']);
  if (!text) {
    return null;
  }

  const speakerId = normalizeSpeakerId(
    pickFirstString(rawWord, [
      'speakerId',
      'speaker_id',
      'speaker',
      'speakerLabel',
      'speaker_label',
      'participant',
      'channel',
      'role',
    ]),
    index
  );

  const startValue = pickFirstNumber(rawWord, [
    'startSec',
    'start',
    'start_time',
    'startTime',
    'offset',
    'offsetSeconds',
  ]);

  const endValue = pickFirstNumber(rawWord, ['endSec', 'end', 'end_time', 'endTime']);
  const durationValue = pickFirstNumber(rawWord, ['durationSec', 'duration', 'durationSeconds']);

  const startSec = toSeconds(startValue);
  let endSec = toSeconds(endValue);
  if (endSec === null && startSec !== null && durationValue !== null) {
    endSec = roundSeconds(startSec + toSeconds(durationValue));
  }

  return {
    speakerId,
    startSec,
    endSec,
    text,
  };
}

function isPunctuationToken(token) {
  return /^[.,!?;:%)\]}]+$/u.test(token);
}

function isOpeningPunctuationToken(token) {
  return /^[(\[{]+$/u.test(token);
}

function joinWordTokens(tokens) {
  let output = '';

  for (const rawToken of tokens) {
    const token = String(rawToken || '').trim();
    if (!token) {
      continue;
    }

    if (!output) {
      output = token;
      continue;
    }

    if (isPunctuationToken(token)) {
      output += token;
      continue;
    }

    if (isOpeningPunctuationToken(token)) {
      output += ` ${token}`;
      continue;
    }

    output += ` ${token}`;
  }

  return output.trim();
}

function normalizeWordSegments(payload) {
  const candidateWordArrays = getCandidateWordArrays(payload);
  if (candidateWordArrays.length === 0) {
    return [];
  }

  const words = [];
  for (const candidate of candidateWordArrays) {
    for (let index = 0; index < candidate.length; index += 1) {
      const normalizedWord = normalizeWord(candidate[index], index);
      if (normalizedWord) {
        words.push(normalizedWord);
      }
    }

    if (words.length > 0) {
      break;
    }
  }

  if (words.length === 0) {
    return [];
  }

  const segments = [];
  let activeSegment = null;

  for (const word of words) {
    if (!activeSegment || activeSegment.speakerId !== word.speakerId) {
      if (activeSegment) {
        activeSegment.text = joinWordTokens(activeSegment.tokens);
        delete activeSegment.tokens;
        segments.push(activeSegment);
      }

      activeSegment = {
        speakerId: word.speakerId,
        startSec: word.startSec,
        endSec: word.endSec,
        tokens: [word.text],
      };
      continue;
    }

    activeSegment.tokens.push(word.text);
    if (activeSegment.startSec === null && word.startSec !== null) {
      activeSegment.startSec = word.startSec;
    }
    if (word.endSec !== null) {
      activeSegment.endSec = word.endSec;
    }
  }

  if (activeSegment) {
    activeSegment.text = joinWordTokens(activeSegment.tokens);
    delete activeSegment.tokens;
    segments.push(activeSegment);
  }

  return segments.filter((segment) => segment.text);
}

function normalizeTranscriptionPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('Transcription response was empty or invalid.');
  }

  const segments = [];
  const candidateSegmentArrays = getCandidateSegmentArrays(payload);

  for (const candidate of candidateSegmentArrays) {
    for (let index = 0; index < candidate.length; index += 1) {
      const normalized = normalizeSegment(candidate[index], index);
      if (normalized) {
        segments.push(normalized);
      }
    }

    if (segments.length > 0) {
      break;
    }
  }

  if (segments.length === 0) {
    segments.push(...normalizeWordSegments(payload));
  }

  const rawText = pickFirstString(payload, ['rawText', 'text', 'transcript']);
  if (segments.length === 0 && rawText) {
    segments.push({
      speakerId: 'speaker_1',
      startSec: null,
      endSec: null,
      text: rawText,
    });
  }

  if (segments.length === 0) {
    throw new Error('Transcription response did not include any text segments.');
  }

  return {
    rawText: rawText || segments.map((segment) => segment.text).join(' '),
    segments,
  };
}

function getLastTimelineSecond(segments) {
  let latestSecond = 0;

  for (const segment of segments) {
    if (!isPlainObject(segment)) {
      continue;
    }

    const segmentEnd = toSeconds(segment.endSec);
    const segmentStart = toSeconds(segment.startSec);
    if (segmentEnd !== null) {
      latestSecond = Math.max(latestSecond, segmentEnd);
      continue;
    }
    if (segmentStart !== null) {
      latestSecond = Math.max(latestSecond, segmentStart);
    }
  }

  return latestSecond;
}

module.exports = {
  getLastTimelineSecond,
  isPlainObject,
  normalizeSpeakerId,
  normalizeTranscriptionPayload,
  roundSeconds,
  toSeconds,
};
