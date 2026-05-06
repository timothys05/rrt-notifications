'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const execFileAsync = promisify(execFile);

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

async function parseZip(content, blobName) {
  const id = crypto.randomBytes(8).toString('hex');
  const tmpZip = path.join(os.tmpdir(), `rrt-${id}.zip`);
  const tmpDir = path.join(os.tmpdir(), `rrt-${id}`);

  try {
    fs.writeFileSync(tmpZip, content);
    fs.mkdirSync(tmpDir);

    try {
      // -j: junk paths (flat extract), -o: overwrite without prompt
      await execFileAsync('unzip', ['-j', '-o', tmpZip, '-d', tmpDir]);
    } catch (err) {
      // unzip exits 1 for warnings but still extracts files; treat as success
      if (err.code !== 1) {
        throw new Error(`[${blobName}] Failed to extract zip: ${err.stderr || err.message}`);
      }
    }

    const files = fs.readdirSync(tmpDir);
    const jsonFile = files.find(f => f.toLowerCase().endsWith('.json'));
    const csvFile = files.find(f => f.toLowerCase().endsWith('.csv'));
    const manifestFile = files.find(f => f.toLowerCase() === 'manifest.txt');

    if (jsonFile) {
      return parseJson(fs.readFileSync(path.join(tmpDir, jsonFile), 'utf8'), `${blobName}/${jsonFile}`);
    }
    if (csvFile) {
      return parseCsv(fs.readFileSync(path.join(tmpDir, csvFile), 'utf8'), `${blobName}/${csvFile}`);
    }
    if (manifestFile) {
      return parseManifest(fs.readFileSync(path.join(tmpDir, manifestFile), 'utf8'), `${blobName}/${manifestFile}`);
    }

    throw new Error(`[${blobName}] Zip contains no JSON, CSV, or Manifest.txt file`);
  } finally {
    try { fs.rmSync(tmpZip); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  }
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
