'use strict';

/**
 * Parses report file content into a normalized record.
 *
 * Supports JSON files and CSV files (single data row after header).
 * Expected fields: email, phone, optInEmail, optInSms
 * CSV header aliases: opt_in_email / optin_email, opt_in_sms / optin_sms
 */
function parseReport(content, blobName) {
  const ext = blobName.split('.').pop().toLowerCase();

  if (ext === 'json') {
    return parseJson(content, blobName);
  } else if (ext === 'csv') {
    return parseCsv(content, blobName);
  }

  // Default: try JSON first, then CSV
  try {
    return parseJson(content, blobName);
  } catch {
    return parseCsv(content, blobName);
  }
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

  // Normalize CSV field aliases
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
