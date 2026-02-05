/**
 * Widen Sync Controller
 *
 * Handles the complete sync flow:
 * 1. Fetch assets from Widen DAM
 * 2. Download PDF files
 * 3. Upload to Kore.ai SearchAI
 * 4. Trigger ingestion
 */
const fs = require('fs');
const path = require('path');
const { readConfig } = require("../utils/readConfig");
const {
  fetchWidenAssets,
  fetchWidenAssetsWithPagination,
  downloadWidenPDF,
  validateWidenEnvVars,
  isFileSizeAllowed,
  DEFAULT_MAX_FILE_SIZE_MB,
} = require("../utils/widenService");
const {
  uploadFileToKore,
  ingestFilesToKore,
} = require("../utils/koreSearchAI");
const { validateKoreEnvVars } = require("../utils/koreAuth");
const { processWithConcurrency } = require("../utils/concurrency");
const { splitPdfBySize } = require('../utils/splitPdf')
const { readWidenState, writeWidenState } = require('../utils/widenAsset')
const { appendErrorRow } = require('../utils/errorExcelLogger')

// Max file size for Kore.ai upload (in MB) - can be overridden via env
const MAX_FILE_SIZE_MB = parseInt(
  process.env.MAX_FILE_SIZE_MB || DEFAULT_MAX_FILE_SIZE_MB,
);

/**
 * Main sync controller - called when SearchAssist triggers sync
 * GET /syncWiden or POST /syncWiden
 *
 * Query params:
 * - limit: number of assets to fetch (default: from config)
 * - offset: pagination offset (default: 0)
 * - skipIngest: if "true", only upload files, don't call ingest API
 */
const sync_widen_controller = async (assetsToProcess, configOverrides = {}) => {

  console.log('--------sync -----')

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const startTime = Date.now();
  const skipIngest = false;


  const results = {
    success: false,
    timestamp: new Date().toISOString(),
    config: {
      limit: assetsToProcess.length,
      offset: configOverrides.offset,
      maxFileSizeMB: MAX_FILE_SIZE_MB,
      skipIngest: skipIngest,
    },
    widenAssetsFetched: assetsToProcess.length,
    successfullyUploaded: 0,
    failedUploads: 0,
    skipped: 0,
    skippedTooLarge: 0,
    fileIds: [],
    ingestResponse: null,
    itemStatus: [],
    errors: [],
    durationMs: 0,
  };

  try {
    const widenValidation = validateWidenEnvVars();
    if (!widenValidation.isValid) {
      throw new Error(
        `Missing Widen env vars: ${widenValidation.missing.join(", ")}`,
      );
    }

    const koreValidation = validateKoreEnvVars();
    if (!koreValidation.isValid) {
      throw new Error(
        `Missing Kore env vars: ${koreValidation.missing.join(", ")}`,
      );
    }

    const config = await readConfig();
    const concurrency = parseInt(
      process.env.CONCURRENCY || config.concurrency || 3,
    );

    // const fetchOptions = {};
    // if (customLimit) fetchOptions.limit = customLimit;
    // if (customOffset) fetchOptions.offset = customOffset;
    // const assetsToProcess = await fetchWidenAssets(fetchOptions);

    results.widenAssetsFetched = assetsToProcess.length;

    if (!assetsToProcess || assetsToProcess.length === 0) {
      results.success = true;
      results.message = "No assets found matching the query";
      results.durationMs = Date.now() - startTime;
      return results;
    }

    const processAsset = async (asset, index) => {
      const itemStatus = {
        id: asset.id,
        filename: asset.filename,
        status: "pending",
        fileIds: [],
        error: null,
      };

      try {
        const filename = (asset.filename || "").toLowerCase();

        if (filename.endsWith(".zip")) {
          itemStatus.status = "skipped";
          itemStatus.reason = "Unsupported file type: .zip";

          // await appendErrorRow({
          //   id: asset.id,
          //   fileId: "",
          //   reason: itemStatus.reason,
          //   message: "",
          //   status: itemStatus.status,
          //   fileSize: asset.fileSize ?? "",
          // });

          return { asset, itemStatus };
        }
        const pdfBuffer = await downloadWidenPDF(
          asset.downloadUrl,
          asset.filename,
          1,
        );

        // to test large file size
        // const pdfBuffer = await downloadWidenPDF(
        //   'https://orders-bb.us-east-1.widencdn.net/download-deferred/originals?actor=wrn%3Ausers%3Auser%3A29055826%3Aab7gjx&tracking=ewogICJkb19ub3RfdHJhY2siOiBmYWxzZSwKICAiYW5vbnltb3VzIjogZmFsc2UsCiAgInZpc2l0b3JfaWQiOiBudWxsLAogICJ1c2VyX3dybiI6ICJ3aWRlbjp1c2Vyczp1c2VyOkhBUk1BOmFiN2dqeCIKfQ%3D%3D&asset_wrn=wrn%3Aassets%3Aasset%3A29055826%3Abuyxi9iin4&custom_metadata=ewogICJhcHBfbmFtZSI6ICJheGlvbSIsCiAgImludGVuZGVkX3VzZV9jb2RlIjogbnVsbCwKICAiaW50ZW5kZWRfdXNlX3ZhbHVlIjogbnVsbCwKICAiaW50ZW5kZWRfdXNlX2VtYWlsIjogbnVsbCwKICAiY29sbGVjdGlvbl9pZCI6IG51bGwsCiAgInBvcnRhbF9pZCI6IG51bGwsCiAgInBvcnRhbF9hY2Nlc3NfY29kZV9lbWFpbCI6IG51bGwsCiAgImRhbV9vcmRlcl9pZCI6IG51bGwKfQ%3D%3D&Expires=1770328800&Signature=bLN81xVZa2wVWG1OB3w9a2my6f3xUaygCzQhJoB92d5OJqGxJm8koNLOhhTnWroGWqymF4crcu9ivsIx-04KCg8SFLEBvILzRZQa9wGzmf1VxMCrmQXH1XvDG5kzSHl8XWJpQSRxQYaChLUKfBASgJRP9EFmg-cA0XHC7bXemhxLipIPCkmtbri-y9d7yHXqS-aO~K9gxctAQMshu0ZyiO0Rz827kk7m5uHFdv9u4fLlJSFEXfUsYVlFL6h7HW7lfe~~9TNZHzRDV2U6TvPyUMMUgPCdD8PYRhZDMWLa5WntML7-cV5NeWWn81yofp0ZFHHGPtc0xqgQgIkFmav40g__&Key-Pair-Id=APKAJM7FVRD2EPOYUXBQ',
        //   1,
        // );

        const fileSizeMB = pdfBuffer.length / 1024 / 1024;
        console.log('----filesSize----', fileSizeMB)
        const fileIds = []
        let fileId = ''
        if (fileSizeMB <= MAX_FILE_SIZE_MB) {
          // Normal upload
          fileId = await uploadFileToKore(pdfBuffer, asset.filename)
          fileIds.push(fileId)

        } else {
          // Split and upload
          const pdfChunks = await splitPdfBySize(pdfBuffer);
          for (const chunk of pdfChunks) {
            const chunkFileName = `${asset.filename.replace(
              /\.pdf$/i,
              ''
            )}_part${chunk.index}.pdf`;

            // fs.writeFileSync(chunkFileName, chunk.buffer);   // testing
            fileId = await uploadFileToKore(chunk.buffer, chunkFileName);
            fileIds.push(fileId);
            await sleep(500);
          }
        }


        itemStatus.status = "uploaded";
        itemStatus.fileIds = fileIds;


        return { fileIds, asset, itemStatus };
      } catch (error) {
        itemStatus.status = "failed";
        itemStatus.error = error.message;
        throw { itemStatus, error };
      }
    };

    const processingResults = await processWithConcurrency(
      assetsToProcess,
      processAsset,
      concurrency,
    );

    const successfulUploads = [];

    for (const result of processingResults) {
      if (result.success) {
        if (result.result.skipped) {
          results.skipped++;
          results.itemStatus.push(result.result.itemStatus);
          const s = result.result.itemStatus || {};
          await appendErrorRow({
            id: s.id || result.result.asset?.id,
            fileId: Array.isArray(s.fileIds) ? s.fileIds.join(",") : s.fileId || "",
            reason: s.reason || "Skipped asset",
            message: s.error || "",
            status: "skipped",
            fileSize:
              typeof s.fileSize === "number"
                ? s.fileSize
                : result.result.asset?.fileSize ?? "",
          });
        } else {
          successfulUploads.push(result.result);
          // results.fileIds.push(result.result.fileId);

          results.fileIds = result.result.fileIds
          results.itemStatus.push(result.result.itemStatus);
          results.successfullyUploaded++;
        }
      } else {
        const itemStatus = result.error?.itemStatus || {
          id: result.item?.id,
          filename: result.item?.filename,
          status: "failed",
          fileId: null,
          error: result.error?.message || String(result.error),
        };
        results.itemStatus.push(itemStatus);
        results.failedUploads++;
        results.errors.push({
          asset: result.item?.filename,
          error: result.error?.message || String(result.error),
        });

        await appendErrorRow({
          id: itemStatus.id || result.item?.id,
          fileId: Array.isArray(itemStatus.fileIds)
            ? itemStatus.fileIds.join(",")
            : itemStatus.fileId || "",
          reason: itemStatus.reason || "Asset processing failed",
          message: itemStatus.error || "",
          status: itemStatus.status || "failed",
          fileSize: result.item?.fileSize ?? "",
        });
      }
    }

    if (results.fileIds.length > 0 && !skipIngest) {
      try {
        const sourceName =
          process.env.SEARCHAI_SOURCE_NAME ||
          config.kore?.sourceName ||
          "JBL_WIDEN_1";
        const ingestResponse = await ingestFilesToKore(
          results.fileIds,
          sourceName,
        );
        results.ingestResponse = ingestResponse;
      } catch (ingestError) {
        const errorMsg = ingestError.message;
        if (errorMsg.includes("already uploaded") || errorMsg.includes("419")) {
          results.ingestResponse = {
            status: "partial",
            message: "Some files were already ingested previously",
            error: errorMsg,
          };
        } else {
          results.errors.push({
            stage: "ingestion",
            error: errorMsg,
          });
        }
      }
    } else if (skipIngest) {
      results.ingestResponse = {
        status: "skipped",
        message: "Ingestion skipped per request",
      };
    } else {
      console.log("\nNo files to ingest - all uploads failed or skipped");
    }

    results.success = results.successfullyUploaded > 0;
    results.durationMs = Date.now() - startTime;
    return results;
  } catch (error) {
    console.log(error)
    results.success = false;
    results.errors.push({
      stage: "sync",
      error: error.message,
    });
    results.durationMs = Date.now() - startTime;

    return results;
  }
};

/**
 * Get sync status / health check
 * GET /syncWiden/status
 */
const sync_status_controller = async (req, res) => {
  const widenValidation = validateWidenEnvVars();
  const koreValidation = validateKoreEnvVars();
  const config = await readConfig();

  return res.json({
    status: "ready",
    timestamp: new Date().toISOString(),
    configuration: {
      widen: {
        configured: widenValidation.isValid,
        missing: widenValidation.missing,
        searchUrl: process.env.WIDEN_SEARCH_URL || config.widen?.searchUrl,
        query: process.env.WIDEN_QUERY || config.widen?.query,
        limit: process.env.WIDEN_LIMIT || config.widen?.limit,
      },
      kore: {
        configured: koreValidation.isValid,
        missing: koreValidation.missing,
        host: process.env.KORE_HOST || config.kore?.host,
        sourceName: process.env.SEARCHAI_SOURCE_NAME || config.kore?.sourceName,
      },
      processing: {
        maxFileSizeMB: MAX_FILE_SIZE_MB,
        concurrency: process.env.CONCURRENCY || config.concurrency || 3,
      },
    },
  });
};

/**
 * Formats data for Kore SearchAssist connector response
 * This is used if you want to use the traditional pull-based approach
 */

const get_widen_content_controller = async (req, res) => {
  try {
    let limit = parseInt(req?.query?.limit);
    let offset = parseInt(req?.query?.offset);


    // if (limit !== 0) {
    //   limit = 1;
    // }

    // if (offset !== 0) {
    //   offset = offset / 30;
    // }

    console.log('--------start------')
    console.log('limit and offset: ', { limit, offset })
    const state = await readWidenState();
    console.log('limit and offset: ', { offset: state.widenOffset, limit: state.batchSize, currentIndex: state.currentIndex })


    if (state.batchComplete || state.items.length === 0) {  // if batch is completed
      const { assets, totalCount } = await fetchWidenAssetsWithPagination(
        state.batchSize,
        state.widenOffset
      );

      // assets.push(...assets);

      state.items = assets;
      state.currentIndex = 0;
      state.batchComplete = false;
      state.totalCount = totalCount
    }

    const asset = state.items[state.currentIndex];


    // Defensive check
    if (!asset) {
      return res.json({
        data: [],
        isContentAvailable: false,
      });
    }

    state.currentIndex++;
    // If batch completed, prepare for next Widen call
    if (state.currentIndex >= state.items.length) {
      state.batchComplete = true;
      state.items = [];
      state.currentIndex = 0;
      state.widenOffset += state.batchSize; //  real offset update
    }

    const isContentAvailable = ((state.widenOffset + state.batchSize) <= state.totalCount) || !state.batchComplete
    if (!isContentAvailable) {
      state.batchComplete = true;
      state.items = [];
      state.currentIndex = 0;
      state.widenOffset = 0
    }

    await writeWidenState(state);

    // const assets = await fetchWidenAssetsWithPagination(limit, offset);
    // await sync_widen_controller(limit, offset);
    await sync_widen_controller([asset], { offset, limit });

    const formattedData = {
      id: asset.id,
      sys_id: asset.id,
      title: asset.title,
      content: "", // Content will be extracted by SearchAI when we upload PDF
      url: asset.downloadUrl,
      type: "pdf",
      doc_created_on: asset.createdDate,
      doc_updated_on: asset.updatedDate,
      rawData: asset.rawItem,
      sys_file_type: "pdf",
      _widen_external_id: asset.externalId,
      _widen_filename: asset.filename,
      _widen_file_size: asset.fileSize,
    };

    console.log('totalCount-----', state.totalCount)
    console.log('completed: ', isContentAvailable)

    console.log
    return res.json({
      data: formattedData,
      isContentAvailable: isContentAvailable
    });
  } catch (error) {

    console.log(error)
    await appendErrorRow({
      id: "",
      fileId: "",
      reason: "get_widen_content_controller error",
      message: error.message || String(error),
      status: "failed",
      fileSize: "",
    });
    return res.json({
      error: error.message,
      data: [],
      isContentAvailable: false,
    });
  }
};

module.exports = {
  sync_widen_controller,
  sync_status_controller,
  get_widen_content_controller,
};
