'use strict';

const AdmZip = require('adm-zip');

/**
 * Parses report blob content into a normalized record.
 *
 * Accepts a Buffer or string. If the blob is a .zip, extracts the first
 * JSON or CSV entry and parses that. Otherwise parses as JSON or CSV directly.
 * Expected fields: email, phone, optInEmail/opt_in_email, optInSms/opt_in_sms
 */
function parseReport(content, blobName) {
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

function parseZip(content, blobName) {
  let zip;
  try {
    zip = new AdmZip(content);
  } catch (err) {
    throw new Error(`[${blobName}] Failed to open zip: ${err.message}`);
  }

  const entries = zip.getEntries();
  const jsonEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.json'));
  const csvEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.csv'));

  const manifestEntry = entries.find(e => e.entryName.toLowerCase() === 'manifest.txt');

  if (jsonEntry) {
    const innerName = `${blobName}/${jsonEntry.entryName}`;
    return parseJson(zip.readAsText(jsonEntry), innerName);
  }

  if (csvEntry) {
    const innerName = `${blobName}/${csvEntry.entryName}`;
    return parseCsv(zip.readAsText(csvEntry), innerName);
  }

  if (manifestEntry) {
    const innerName = `${blobName}/${manifestEntry.entryName}`;
    return parseManifest(zip.readAsText(manifestEntry), innerName);
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
