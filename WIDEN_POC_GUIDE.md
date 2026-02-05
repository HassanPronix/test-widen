# Widen DAM → Kore.ai SearchAI POC Integration Guide

This guide explains how to use the Widen custom connector to ingest JBL Harman PDF manuals from Widen DAM into Kore.ai SearchAI.

## Overview

The POC implements a **push-based** sync flow:

1. **Fetch Assets** from Widen DAM via REST API (Bearer token)
2. **Download PDFs** using signed `_links.download` URLs
3. **Upload Files** to Kore.ai using Upload File API → get `fileId`
4. **Ingest Data** via SearchAI API with `sourceType: "file"` and list of `fileIds`

SearchAI then extracts, chunks, and indexes the PDF content automatically.

---

## Prerequisites

### 1. Widen DAM Access
- Bearer token with read access to assets
- Know your search query (default: `mt:({_Manuals & QSG (LS)})`)

### 2. Kore.ai SearchAI Bot
- A SearchAI bot created in Kore.ai platform
- Bot ID (the SearchAI app/bot identifier)
- XO Platform app credentials (Client ID + Client Secret)
- A Source created in SearchAI named `JBL_WIDEN_POC` (or your chosen name)

---

## Installation

```bash
cd simpplr-tarsus-test

# Install dependencies
npm install
```

---

## Configuration

### Step 1: Create Environment File

Copy the template and fill in your values:

```bash
# Windows
copy ENV_TEMPLATE.txt .env

# Linux/Mac
cp ENV_TEMPLATE.txt .env
```

### Step 2: Edit `.env` with your credentials

```env
# Connector Authorization (base64 encoded for Authorization header)
Authorization=your-connector-auth-token

# Widen DAM
WIDEN_BEARER=your-widen-bearer-token
WIDEN_SEARCH_URL=https://api.widencollective.com/v2/assets/search
WIDEN_QUERY=mt:({_Manuals & QSG (LS)})
WIDEN_LIMIT=15
WIDEN_OFFSET=0

# Kore.ai SearchAI
KORE_HOST=https://platform.kore.ai
KORE_BOT_ID=st-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
KORE_CLIENT_ID=cs-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
KORE_CLIENT_SECRET=your-client-secret-here
SEARCHAI_SOURCE_NAME=JBL_WIDEN

# Processing
CONCURRENCY=3
PORT=3232
```

---

## Running the Connector

### Start the Server

```bash
npm start
```

You should see:

```
========================================
🚀 Kore.ai Custom Connector Service
========================================
Server listening on port 3232
...
```

### Check Configuration Status

```bash
curl http://localhost:3232/syncWiden/status
```

Expected response if configured correctly:

```json
{
  "status": "ready",
  "timestamp": "2024-12-24T10:00:00.000Z",
  "configuration": {
    "widen": {
      "configured": true,
      "missing": []
    },
    "kore": {
      "configured": true,
      "missing": []
    }
  }
}
```

---

## Triggering Sync

### Generate Authorization Header

The connector requires an Authorization header. Encode your `Authorization` env value to base64:

```bash
# If your Authorization value is: my-secret-token
# Base64 encode it:
# Windows PowerShell:
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("my-secret-token"))

# Linux/Mac:
echo -n "my-secret-token" | base64
```

### Trigger Widen → SearchAI Sync

```bash
curl -X POST http://localhost:3232/syncWiden \
  -H "Authorization: bXktc2VjcmV0LXRva2Vu"
```

**Note:** Replace `bXktc2VjcmV0LXRva2Vu` with your base64-encoded Authorization value.

### Expected Response

```json
{
  "success": true,
  "timestamp": "2024-12-24T10:00:00.000Z",
  "widenAssetsFetched": 15,
  "successfullyUploaded": 14,
  "failedUploads": 1,
  "skipped": 0,
  "fileIds": [
    "file-id-1",
    "file-id-2",
    "..."
  ],
  "ingestResponse": {
    "status": "success",
    "message": "Ingestion initiated"
  },
  "itemStatus": [
    {
      "id": "widen-asset-id",
      "filename": "JBL_Manual_Speaker.pdf",
      "status": "uploaded",
      "fileId": "file-id-1",
      "error": null
    },
    {
      "id": "widen-asset-id-2",
      "filename": "JBL_QSG_Headphones.pdf",
      "status": "failed",
      "fileId": null,
      "error": "Download timeout"
    }
  ],
  "errors": [],
  "durationMs": 45000
}
```

---

## Verifying Indexing

After ingestion completes (may take a few minutes for SearchAI to process), verify content is indexed:

### Search Test

```bash
# First, generate a JWT for direct API calls
# The connector does this automatically, but for testing:

curl -X POST "https://platform.kore.ai/api/public/bot/{KORE_BOT_ID}/search/v2/advanced-search" \
  -H "Content-Type: application/json" \
  -H "auth: YOUR_JWT_TOKEN" \
  -d '{
    "query": "JBL speaker bluetooth pairing",
    "topK": 5
  }'
```

**Generating JWT for Testing:**

```javascript
// Quick Node.js script to generate JWT
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { sub: 'widen-connector-poc', appId: 'YOUR_CLIENT_ID' },
  'YOUR_CLIENT_SECRET',
  { algorithm: 'HS256', expiresIn: '30m' }
);
console.log(token);
```

### Expected Search Response

If PDFs were indexed successfully, you should see results with:
- Answer text extracted from PDF content
- Source references pointing to the ingested files
- Confidence scores

---

## Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service info and available endpoints |
| POST | `/syncWiden` | **Main sync** - Widen → Kore ingestion |
| GET | `/syncWiden` | Same as POST (convenience) |
| GET | `/syncWiden/status` | Check configuration (no auth required) |
| GET | `/getWidenContent` | Pull-based mode (returns formatted assets) |
| GET | `/getContent` | Original Simpplr content endpoint |

---

## Troubleshooting

### "Missing Widen env vars: WIDEN_BEARER"
- Ensure `.env` file exists and contains `WIDEN_BEARER=...`
- Restart the server after creating/modifying `.env`

### "Missing Kore env vars: KORE_BOT_ID, KORE_CLIENT_ID..."
- Set all required Kore environment variables
- Get credentials from Kore.ai platform > App Settings

### "Failed to fetch Widen assets"
- Check WIDEN_BEARER token is valid and not expired
- Verify WIDEN_SEARCH_URL is correct
- Check WIDEN_QUERY syntax

### "Could not extract fileId from upload response"
- Verify KORE_HOST is correct (e.g., `https://platform.kore.ai`)
- Check JWT is being signed correctly with KORE_CLIENT_SECRET
- Ensure the XO app has permissions for file upload

### "Ingest API failed"
- Verify KORE_BOT_ID is correct
- Ensure the source `SEARCHAI_SOURCE_NAME` exists in SearchAI
- Check SearchAI bot is properly configured

### Downloads timing out
- Increase `downloadTimeout` in config.json (default: 120000ms)
- Reduce `CONCURRENCY` to lower parallel downloads
- Some Widen signed URLs may expire quickly

---

## File Structure After Implementation

```
simpplr-tarsus-test/
├── config/
│   └── config.json          # Updated with Widen & Kore settings
├── controller/
│   ├── content.controller.js  # Original Simpplr controller
│   └── widen.controller.js    # NEW: Widen sync controller
├── middleware/
│   └── authorization.js       # Auth middleware (unchanged)
├── routes/
│   ├── content.route.js       # Original Simpplr routes
│   └── widen.route.js         # NEW: Widen sync routes
├── utils/
│   ├── formatData.js          # Original formatter
│   ├── readConfig.js          # Config reader (unchanged)
│   ├── specificIds.js         # Original IDs list
│   ├── koreAuth.js            # NEW: Kore JWT utility
│   ├── koreSearchAI.js        # NEW: Kore Upload/Ingest service
│   ├── widenService.js        # NEW: Widen API service
│   └── concurrency.js         # NEW: Concurrency limiter
├── server.js                  # Updated with Widen routes
├── package.json               # Updated with new deps
├── ENV_TEMPLATE.txt           # Environment template
├── WIDEN_POC_GUIDE.md         # This guide
└── .env                       # Your actual credentials (not committed)
```

---

## Production Considerations

For production use beyond POC:

1. **Delta Sync**: Track last sync timestamp, use Widen's date filters
2. **Error Recovery**: Store failed items, implement retry queue
3. **Rate Limiting**: Add rate limiting for Widen API calls
4. **Logging**: Integrate with centralized logging (e.g., CloudWatch)
5. **Secrets Management**: Use AWS Secrets Manager / Azure Key Vault
6. **Source Creation**: Auto-create SearchAI source if not exists
7. **Metadata**: Pass document metadata to SearchAI for better search

---

## Support

For issues with:
- **Widen API**: Contact Widen support or check [Widen API docs](https://widencollective.com/api/)
- **Kore.ai SearchAI**: Contact Kore.ai support or check [SearchAI docs](https://docs.kore.ai/)
- **This Connector**: Review logs and error messages in the sync response




