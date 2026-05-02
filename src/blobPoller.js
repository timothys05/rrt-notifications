'use strict';

const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');

const PROCESSED_FILE = path.join(__dirname, '..', 'processed-blobs.json');

function loadProcessed() {
  try {
    return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

function saveProcessed(set) {
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...set], null, 2));
}

async function listNewBlobs(containerClient, processedNames) {
  const newBlobs = [];

  for await (const blob of containerClient.listBlobsFlat()) {
    if (!processedNames.has(blob.name)) {
      newBlobs.push(blob.name);
    }
  }

  return newBlobs;
}

async function readBlobContent(containerClient, blobName) {
  const blobClient = containerClient.getBlobClient(blobName);
  const downloadResponse = await blobClient.download();
  const chunks = [];

  for await (const chunk of downloadResponse.readableStreamBody) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function createPoller() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
  }

  const containerName = process.env.AZURE_CONTAINER_NAME;
  if (!containerName) {
    throw new Error('AZURE_CONTAINER_NAME is not set');
  }

  const serviceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = serviceClient.getContainerClient(containerName);
  const processed = loadProcessed();

  async function poll() {
    console.log(`[poller] Checking for new blobs in "${containerName}"...`);

    let newBlobs;
    try {
      newBlobs = await listNewBlobs(containerClient, processed);
    } catch (err) {
      console.error(`[poller] Failed to list blobs: ${err.message}`);
      return [];
    }

    if (newBlobs.length === 0) {
      console.log('[poller] No new blobs found.');
      return [];
    }

    console.log(`[poller] Found ${newBlobs.length} new blob(s): ${newBlobs.join(', ')}`);

    const results = [];
    for (const blobName of newBlobs) {
      try {
        const content = await readBlobContent(containerClient, blobName);
        results.push({ blobName, content });
        processed.add(blobName);
        saveProcessed(processed);
      } catch (err) {
        console.error(`[poller] Failed to read blob "${blobName}": ${err.message}`);
      }
    }

    return results;
  }

  return { poll };
}

module.exports = { createPoller };
