'use strict';

const unzipper = require('unzipper');

/**
 * Parses report blob content into a normalized record.
 *
 * Accepts a Buffer or string. If the blob is a .zip, extracts the first
 * JSON or CSV entry and parses that. Otherwise parses as JSON or CSV directly.
 * Expected fields: email, phone, optInEmail/opt_in_email, optInSms/opt_in_sms
 */
async function parseReport(content, blobName) {
  const ext = blobName.split('.').pop().toLowerCase();

  if (ext === 'zip') {
    return parseZip(content, blobName);
  }

  const text = Buffer.isBuffer(content) ? content.toString('utf8') : content;

  if (ext === 'json') {
    return parseJson(text, blobName);
  } else if (ext === 'csv') {
    return parseCsv(text, blobName);
  }

  // Default: try JSON first, then CSV
  try {
    return parseJson(text, blobName);
  } catch {
    return parseCsv(text, blobName);
  }
}

const ZIP_PASSWORD = 'B25GMr.6kGBp:kV6c0dhTbU]M1wV';

async function parseZip(content, blobName) {
  let directory;
  try {
    directory = await unzipper.Open.buffer(content);
  } catch (err) {
    throw new Error(`[${blobName}] Failed to open zip: ${err.message}`);
  }

  const files = directory.files;
  const jsonEntry = files.find(f => f.path.toLowerCase().endsWith('.json'));
  const csvEntry = files.find(f => f.path.toLowerCase().endsWith('.csv'));
  const manifestEntry = files.find(f => f.path.toLowerCase() === 'manifest.txt');

  const readEntry = async (entry) => (await entry.buffer(ZIP_PASSWORD)).toString('utf8');

  if (jsonEntry) {
    return parseJson(await readEntry(jsonEntry), `${blobName}/${jsonEntry.path}`);
  }

  if (csvEntry) {
    return parseCsv(await readEntry(csvEntry), `${blobName}/${csvEntry.path}`);
  }

  if (manifestEntry) {
    return parseManifest(await readEntry(manifestEntry), `${blobName}/${manifestEntry.path}`);
  }

  throw new Error(`[${blobName}] Zip contains no JSON, CSV, or Manifest.txt file`);
}

function parseManifest(content, blobName) {
  const field = (label) => {
    const match = content.match(new RegExp(`^${label}:\\s*(.*)$`, 'm'));
    return match ? match[1].trim() : '';
  };

  const data = {
    email: field('Reporter Email'),
    phone: field('Reporter Phone Number'),
    optInSms: field('Text Message Updates Opt-in'),
    optInEmail: field('Email Updates Opt-in'),
  };

  return normalize(data, blobName);
}

function parseJson(content, blobName) {
  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    throw new Error(`[${blobName}] Invalid JSON: ${err.message}`);
  }

  return normalize(data, blobName);
}

function parseCsv(content, blobName) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error(`[${blobName}] CSV must have a header row and at least one data row`);
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const values = lines[1].split(',').map(v => v.trim());

  const row = {};
  headers.forEach((header, i) => {
    row[header] = values[i] ?? '';
  });

  const data = {
    email: row['email'],
    phone: row['phone'],
    optInEmail: row['optinemail'] ?? row['opt_in_email'],
    optInSms: row['optinsms'] ?? row['opt_in_sms'],
  };

  return normalize(data, blobName);
}

function normalize(data, blobName) {
  const email = (data.email || '').trim();
  const phone = (data.phone || '').trim();
  const optInEmail = parseBool(data.optInEmail ?? data.opt_in_email ?? data.optinemail);
  const optInSms = parseBool(data.optInSms ?? data.opt_in_sms ?? data.optinsms);

  if (!email && !phone) {
    throw new Error(`[${blobName}] Report has no email or phone`);
  }
  if (!email && optInEmail) {
    throw new Error(`[${blobName}] optInEmail is true but no email address provided`);
  }
  if (!phone && optInSms) {
    throw new Error(`[${blobName}] optInSms is true but no phone number provided`);
  }

  return { email, phone, optInEmail, optInSms };
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

module.exports = { parseReport };
