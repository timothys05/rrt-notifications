'use strict';

const { BlobServiceClient } = require('@azure/storage-blob');

const BLOB_NAME = 'optins.csv';
const CSV_HEADERS = 'firstName,lastName,phone,email,smsOptIn,emailOptIn,timestamp\n';

function getContainerClient() {
  const blobServiceUrl = process.env.AZURE_BLOB_SERVICE_URL;
  const sasToken = process.env.AZURE_SAS_TOKEN;
  const containerName = process.env.AZURE_CONTAINER_NAME;

  if (!blobServiceUrl || !sasToken || !containerName) {
    throw new Error('Azure Blob Storage environment variables are not set');
  }

  const serviceClient = new BlobServiceClient(`${blobServiceUrl}?${sasToken}`);
  return serviceClient.getContainerClient(containerName);
}

function escapeCsvField(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(data) {
  const fields = [
    data.firstName,
    data.lastName,
    data.phone,
    data.email,
    data.smsOptIn,
    data.emailOptIn,
    data.timestamp,
  ];
  return fields.map(escapeCsvField).join(',') + '\n';
}

async function appendOptinRow(data) {
  const containerClient = getContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(BLOB_NAME);

  let existing = CSV_HEADERS;
  try {
    const downloadResponse = await blockBlobClient.download();
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }
    existing = Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    if (err.statusCode !== 404) {
      throw err;
    }
    // Blob doesn't exist yet — start with headers
  }

  const updated = existing + buildCsvRow(data);
  const buffer = Buffer.from(updated, 'utf8');

  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: 'text/csv' },
    overwrite: true,
  });
}

async function getOptinsCsv() {
  const containerClient = getContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(BLOB_NAME);

  const downloadResponse = await blockBlobClient.download();
  const chunks = [];
  for await (const chunk of downloadResponse.readableStreamBody) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { appendOptinRow, getOptinsCsv };
