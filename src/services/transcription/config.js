const fs = require('node:fs/promises');

const { ENV_FILE_PATH } = require('./constants');

let cachedWhisperConfig = null;

function parseEnvContent(content) {
  const values = {};
  const lines = content.split(/\r?\n/u);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

async function loadWhisperConfig() {
  if (cachedWhisperConfig) {
    return cachedWhisperConfig;
  }

  let fileConfig = {};
  try {
    const envContent = await fs.readFile(ENV_FILE_PATH, 'utf8');
    fileConfig = parseEnvContent(envContent);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const mergedConfig = {
    ...fileConfig,
    ...process.env,
  };

  cachedWhisperConfig = {
    endpoint: String(mergedConfig.APP_AZURE_WHISPER_OPENAI_ENDPOINT || '').trim(),
    apiKey: String(mergedConfig.APP_AZURE_WHISPER_API_KEY || '').trim(),
    deploymentName: String(mergedConfig.APP_AZURE_WHISPER_DEPLOYMENT_NAME || '').trim(),
    apiVersion: String(mergedConfig.APP_AZURE_WHISPER_API_VERSION || '').trim(),
  };

  return cachedWhisperConfig;
}

function requireWhisperConfig(config) {
  const missingVariables = [];

  if (!config.endpoint) {
    missingVariables.push('APP_AZURE_WHISPER_OPENAI_ENDPOINT');
  }
  if (!config.apiKey) {
    missingVariables.push('APP_AZURE_WHISPER_API_KEY');
  }
  if (!config.deploymentName) {
    missingVariables.push('APP_AZURE_WHISPER_DEPLOYMENT_NAME');
  }
  if (!config.apiVersion) {
    missingVariables.push('APP_AZURE_WHISPER_API_VERSION');
  }

  if (missingVariables.length > 0) {
    throw new Error(`Missing transcription configuration: ${missingVariables.join(', ')}`);
  }
}

function normalizeEndpoint(endpoint) {
  return endpoint.replace(/\/+$/u, '');
}

module.exports = {
  loadWhisperConfig,
  normalizeEndpoint,
  requireWhisperConfig,
};
