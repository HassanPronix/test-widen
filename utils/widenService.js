/**
 * Widen DAM Service
 *
 * Handles fetching assets from Widen DAM and downloading PDF files.
 */

const axios = require("axios");
const { readConfig } = require("./readConfig");
const { appendErrorRow } = require("./errorExcelLogger");

// Default max file size for Kore.ai upload / split threshold (45 MB)
const DEFAULT_MAX_FILE_SIZE_MB = 45;

/**
 * Fetches assets from Widen DAM search API (uses config defaults, for sync mode)
 * @param {Object} [options] - Optional overrides
 * @param {number} [options.limit] - Override limit
 * @param {number} [options.offset] - Override offset (default 0 for sync)
 * @returns {Promise<Array>} Array of asset objects with download info
 */
async function fetchWidenAssets(options = {}) {
  const config = await readConfig();

  // For sync mode, always start from offset 0 unless explicitly overridden
  const searchUrl =
    process.env.WIDEN_SEARCH_URL ||
    config.widen?.searchUrl ||
    "https://api.widencollective.com/v2/assets/search";
  const query =
    process.env.WIDEN_QUERY ||
    config.widen?.query ||
    "mt:({_Manuals & QSG (LS)})";
  const limit =
    options.limit ??
    parseInt(process.env.WIDEN_LIMIT || config.widen?.limit || 15);
  const offset = options.offset ?? 0; // Default to 0 for sync mode
  const bearerToken = process.env.WIDEN_BEARER;

  return fetchWidenAssetsInternal(searchUrl, query, limit, offset, bearerToken);
}

/**
 * Fetches assets from Widen DAM with custom pagination (for pull mode)
 * Does NOT modify global env vars
 * @param {number} limit - Number of items to fetch
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of asset objects with download info
 */

async function fetchWidenAssetsWithPagination(limit, offset) {
  const config = await readConfig();

  const searchUrl =
    process.env.WIDEN_SEARCH_URL ||
    config.widen?.searchUrl ||
    "https://api.widencollective.com/v2/assets/search";
  const query =
    process.env.WIDEN_QUERY ||
    config.widen?.query ||
    "mt:({_Manuals & QSG (LS)})";
  const bearerToken = process.env.WIDEN_BEARER;

  return fetchWidenAssetsInternal(searchUrl, query, limit, offset, bearerToken);
}

/**
 * Internal function to fetch Widen assets
 */
//get data
async function fetchWidenAssetsInternal(searchUrl, query, limit, offset, bearerToken) {
  if (!bearerToken) {
    throw new Error('WIDEN_BEARER environment variable is required');
  }

  console.log('=== WIDEN FETCH ===');
  console.log(`URL: ${searchUrl}`);
  console.log(`Query: ${query}`);
  console.log(`Limit: ${limit}, Offset: ${offset}`);

  try {
    const response = await axios.get(searchUrl, {
      params: {
        query: query,
        limit: limit,
        offset: offset
      },
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Accept': 'application/json'
      },
      // timeout: 600000
    });

    const items = response.data?.items || [];
    console.log(`Widen returned ${items.length} items`);

    // Parse and filter items
    const assets = items
      .filter((item) => {
        const id = item.id || item.external_id;

        // Must have download link and not be explicitly denied (403-style)
        const hasDownloadLink = item?._links?.download;
        const noPermission = item.expanded?.status === false;


        if (!hasDownloadLink || noPermission) {
          console.log(
            `Skipping ${id || "unknown"}: No download link or we dont have permission to download (403 - error)`,
          );
          // Log to Excel as a skipped asset
          appendErrorRow({
            id,
            fileId: "",
            reason: "No download link or no permission (403)",
            message: "",
            status: "skipped",
            fileSize,
          });
          return false;
        }        

        return true;
      })
      .map((item) => ({
        id: item.id || item.external_id,
        externalId: item.external_id || item.id,
        filename: item.filename || `${item.id}.pdf`,
        downloadUrl: item._links.download || "",
        fileType: item.file_properties?.format || 'pdf',
        title: item.metadata?.fields?.title?.[0] || item.filename || `${item.id}.pdf`,
        description: item.metadata?.fields?.description?.[0] || '',
        createdDate: item.created_date,
        updatedDate: item.last_update_date,
        fileSize: item.file_properties?.size || 0,
        rawItem: item
      }));

    console.log(`${assets.length} assets have download links`);
    console.log('totalCount -------', response.data?.total_count)
    return { assets, totalCount: response.data?.total_count };

  } catch (error) {
    console.error('Widen API Error:', error.response?.status, error.response?.data || error.message);
    throw new Error(`Failed to fetch Widen assets: ${error.message}`);
  }
}



/**
 * Checks if a file size is within the upload limit
 * @param {number} fileSizeBytes - File size in bytes
 * @param {number} [maxSizeMB] - Maximum size in MB (default: 25 MB)
 * @returns {boolean} True if within limit
 */

//size-bytes-max
function isFileSizeAllowed(
  fileSizeBytes,
  maxSizeMB = DEFAULT_MAX_FILE_SIZE_MB,
) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return fileSizeBytes <= maxSizeBytes;
}

/**
 * Downloads a PDF from Widen
 * @param {string} downloadUrl - The signed download URL
 * @param {string} filename - Filename for logging
 * @param {number} [retryCount=1] - Number of retries on failure
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function downloadWidenPDF(downloadUrl, filename, retryCount = 1) {

  console.log('-----download-------')
  const config = await readConfig();
  const timeout = config.widen?.downloadTimeout || 120000;
  const userAgent = config.widen?.userAgent || "kore-widen-connector-poc/1.0";

  let lastError;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt} for ${filename}`);
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }

      console.log(`Downloading: ${filename}...`);

      const response = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
        timeout: timeout,
        headers: {
          "User-Agent": userAgent,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const buffer = Buffer.from(response.data);

      console.log(
        `Downloaded ${filename}: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
      );

      return buffer;
    } catch (error) {
      lastError = error;
      console.error(
        `Download failed for ${filename} (attempt ${attempt + 1}):`,
        error.message,
      );

      if (attempt === retryCount) {
        throw new Error(
          `Failed to download ${filename} after ${retryCount + 1} attempts: ${error.message}`,
        );
      }
    }
  }

  throw lastError;
}

/**
 * Validates Widen environment configuration
 * @returns {Object} Object with isValid boolean and missing array
 */
function validateWidenEnvVars() {
  const required = ["WIDEN_BEARER"];
  const missing = required.filter((varName) => !process.env[varName]);

  return {
    isValid: missing.length === 0,
    missing: missing,
  };
}

module.exports = {
  fetchWidenAssets,
  fetchWidenAssetsWithPagination,
  downloadWidenPDF,
  validateWidenEnvVars,
  isFileSizeAllowed,
  DEFAULT_MAX_FILE_SIZE_MB,
};
