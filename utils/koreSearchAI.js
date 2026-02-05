/**
 * Kore.ai SearchAI Service
 *
 * Handles uploading files to Kore.ai and triggering ingestion.
 * Supports multiple Kore.ai API endpoint formats with fallback.
 */

const axios = require("axios");
const FormData = require("form-data");
const { createKoreJWTFromEnv } = require("./koreAuth");
const { readConfig } = require("./readConfig");

const UPLOAD_ENDPOINTS = ["/api/public/uploadfile"];

/**
 * Uploads a PDF file to Kore.ai Upload File API
 * Tries multiple endpoint patterns until one succeeds
 * @param {Buffer} fileBuffer - PDF file content as buffer
 * @param {string} filename - Name of the file
 * @returns {Promise<string>} The fileId returned by Kore
 */
async function uploadFileToKore(fileBuffer, filename) {

  console.log('-------upload-------')
 
  const koreHost =    process.env.KORE_HOST 
  const botId = process.env.KORE_BOT_ID;
  const uploadTimeout = 180000;

  if (!botId) {
    throw new Error(
      "KORE_BOT_ID environment variable is required for file upload",
    );
  }

  const jwt = createKoreJWTFromEnv();

  const fileExtension = filename.split(".").pop()?.toLowerCase() || "pdf";

  let endpoints = UPLOAD_ENDPOINTS.map((ep) => ep.replace("{botId}", botId));

  // if (sourceId) {
  //   endpoints.unshift(
  //     `/api/public/bot/${botId}/sources/${sourceId}/file/upload`,
  //   );
  // }

  let lastError = null;

  for (const endpoint of endpoints) {
    const uploadUrl = `${koreHost}${endpoint}`;

    try {
      console.log(`Trying upload to: ${uploadUrl}`);

      const form = new FormData();
      form.append("file", fileBuffer, {
        filename: filename,
        contentType: "application/pdf",
      });

      form.append("fileContext", "findly");
      form.append("fileExtension", fileExtension);
      form.append("fileName", filename);
      form.append("contentType", "application/pdf");

      const response = await axios.post(uploadUrl, form, {
        headers: {
          ...form.getHeaders(),
          auth: jwt,
        },
        timeout: uploadTimeout,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const data = response.data;
      const fileId = extractFileId(data);

      if (fileId) {
        return fileId;
      } else {
        console.log(
          `Response received but no fileId found, trying next endpoint...`,
        );
      }
    } catch (error) {
      const status = error.response?.status;
      const errorData = error.response?.data;
      lastError = error;
    }
  }

  const errorMsg = lastError?.response?.data
    ? JSON.stringify(lastError.response.data)
    : lastError?.message;
  throw new Error(
    `Failed to upload ${filename} after trying all endpoints: ${errorMsg}`,
  );
}

/**
 * Extract fileId from various response formats
 */
function extractFileId(data) {
  if (!data) return null;

  if (data.fileId) return data.fileId;
  if (data.file_id) return data.file_id;
  if (data.id) return data.id;
  if (data._id) return data._id;

  if (data.data?.fileId) return data.data.fileId;
  if (data.data?.file_id) return data.data.file_id;
  if (data.data?.id) return data.data.id;

  if (data.fileInfo?.fileId) return data.fileInfo.fileId;
  if (data.fileInfo?.id) return data.fileInfo.id;
  if (data.fileInfo?._id) return data.fileInfo._id;

  if (data.response?.fileId) return data.response.fileId;

  if (Array.isArray(data) && data[0]?.fileId) return data[0].fileId;
  if (Array.isArray(data.files) && data.files[0]?.fileId)
    return data.files[0].fileId;

  return null;
}

/**
 * Calls Kore.ai Ingest Data API to index uploaded files
 * @param {Array<string>} fileIds - Array of fileId strings
 * @param {string} [sourceName] - Name of the source in SearchAI
 * @returns {Promise<Object>} Ingest API response
 */
async function ingestFilesToKore(fileIds, sourceName) {

  console.log('-------ingestion ------')
  const koreHost = process.env.KORE_HOST
  const botId = process.env.KORE_BOT_ID;
  const defaultSourceName =
    process.env.SEARCHAI_SOURCE_NAME

  if (!botId) {
    throw new Error("KORE_BOT_ID environment variable is required");
  }

  const jwt = createKoreJWTFromEnv();

  const ingestEndpoints = [`/api/public/bot/${botId}/ingest-data`];

  const documents = fileIds.map((fileId) => ({ fileId }));
  const payload = {
    sourceName: sourceName || defaultSourceName,
    sourceType: "file",
    documents: documents,
  };

  // console.log('documents--------', documents)
  let lastError = null;

  for (const endpoint of ingestEndpoints) {
    const ingestUrl = `${koreHost}${endpoint}`;

    try {
      const response = await axios.post(ingestUrl, payload, {
        headers: {
          "Content-Type": "application/json",
          auth: jwt,
        },
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const errorData = error.response?.data;
      lastError = error;
    }
  }

  const errorData = lastError?.response?.data;
  throw new Error(
    `Ingest API failed: ${JSON.stringify(errorData) || lastError?.message}`,
  );
}

/**
 * Performs advanced search against SearchAI
 * @param {string} query - Search query
 * @param {number} [topK=5] - Number of results to return
 * @returns {Promise<Object>} Search results
 */
async function searchKore(query, topK = 5) {
  const config = await readConfig();
  const koreHost =
    process.env.KORE_HOST || config.kore?.host || "https://platform.kore.ai";
  const botId = process.env.KORE_BOT_ID;

  if (!botId) {
    throw new Error("KORE_BOT_ID environment variable is required");
  }

  const jwt = createKoreJWTFromEnv();
  const searchUrl = `${koreHost}/api/public/bot/${botId}/advancedSearch`;

  console.log(`Searching: "${query}" (topK: ${topK})`);

  try {
    const response = await axios.post(
      searchUrl,
      {
        query: query,
        maxNumOfResults: topK,
      },
      {
        headers: {
          "Content-Type": "application/json",
          auth: jwt,
        },
        timeout: 30000,
      },
    );

    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data;
    console.error("Search API Error:", status, errorData || error.message);
    throw new Error(
      `Search API failed: ${JSON.stringify(errorData) || error.message}`,
    );
  }
}

module.exports = {
  uploadFileToKore,
  ingestFilesToKore,
  searchKore,
};
