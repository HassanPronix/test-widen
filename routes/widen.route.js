/**
 * Widen Sync Routes
 * 
 * Exposes endpoints for Widen DAM -> Kore SearchAI sync
 */

const route = require('express').Router();
const { checkAuthorized } = require('../middleware/authorization');
const { 
    sync_widen_controller, 
    sync_status_controller,
    get_widen_content_controller 
} = require('../controller/widen.controller');

/**
 * POST /syncWiden
 * Main sync endpoint - triggers full Widen -> Kore sync
 * Downloads PDFs from Widen, uploads to Kore, triggers ingestion
 * 
 * Response:
 * {
 *   "success": true,
 *   "widenAssetsFetched": 15,
 *   "successfullyUploaded": 14,
 *   "failedUploads": 1,
 *   "fileIds": ["fileId1", "fileId2", ...],
 *   "ingestResponse": {...},
 *   "itemStatus": [{id, filename, status, fileId, error}, ...],
 *   "durationMs": 45000
 * }
 */
route.post('/syncWiden', checkAuthorized, sync_widen_controller);

/**
 * GET /syncWiden
 * Alternative GET method for triggering sync (same as POST)
 */
route.get('/syncWiden', checkAuthorized, sync_widen_controller);

/**
 * GET /syncWiden/status
 * Health check and configuration status
 * Does not require authorization for health monitoring
 */
route.get('/syncWiden/status', sync_status_controller);

/**
 * GET /getWidenContent
 * Pull-based content endpoint (alternative to push-based sync)
 * Returns Widen assets in Kore SearchAssist expected format
 * Use this if you want SearchAssist to pull content like standard connectors
 * 
 * Query params:
 * - limit: number of items to fetch (default: 15)
 * - offset: pagination offset (default: 0)
 */
route.get('/getWidenContent', checkAuthorized, get_widen_content_controller);

module.exports = route;




