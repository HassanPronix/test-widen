## Simpplr Connector: Detailed Single-File Documentation

### Purpose
This document explains, in simple terms, how the Simpplr connector service works end-to-end. It covers every file, configuration, authentication, request/response formats, and common troubleshooting.

---

## 1) Quick Start

1. Install dependencies:
```bash
npm install
```
2. Create `.env` (same directory as `server.js`):
```bash
Authorization=YOUR_SHARED_SECRET
```
3. Update `config/config.json` with your Simpplr credentials and endpoints.
4. Start the server:
```bash
node server.js
```
5. Call the content endpoint:
```bash
curl "http://localhost:3232/getContent?limit=10&offset=0" \
  -H "Authorization: <BASE64_OF_YOUR_SHARED_SECRET>"
```

How to compute header value: it must equal `Base64(.env Authorization)`. Example with Node:
```bash
node -e "console.log(Buffer.from('YOUR_SHARED_SECRET').toString('base64'))"
```

---

## 2) Project Structure and What Each File Does

```
simpplr-tarsus-test/
  config/
    config.json            # Connector configuration (API, auth, mappings)
  controller/
    content.controller.js  # Main business logic to fetch and normalize content
  middleware/
    authorization.js       # Validates caller via shared-secret check
  routes/
    content.route.js       # Defines HTTP route(s)
  utils/
    formatData.js          # Maps raw Simpplr items into unified shape
    readConfig.js          # Loads JSON config from disk
    specificIds.js         # Optional allowlist of item IDs to include
  TestFiles/
    sampleDoc.txt          # Sample data for local testing (optional)
    sampleDocs.txt         # Sample data for local testing (optional)
  server.js                # Express setup and global error handler
  package.json             # Dependencies
  readme.md                # High-level guide
  SIMPPLR_DETAILED_DOC.md  # This file
```

---

## 3) Configuration (`config/config.json`)

Key sections:
- `authDetails`: How the service authenticates to Simpplr
  - `authorizationType`: `OAuth2ClientCredentials` or `BasicAuth`
  - OAuth2 fields: `clientId`, `clientSecret`, `tokenUrl`, optional `scope`
  - Basic fields: `username`, `password`
- `configuration.api`:
  - `contentUrl`: Simpplr content API URL
  - `method`: HTTP method (e.g., `POST`)
- `configuration.pagination`:
  - `limit`, `offset`: parameter names the connector will send (mapped from `?limit=&offset=` query params)
- `configuration.lookupFields`:
  - Field names used by `formatData` to extract values from raw API items
  - Useful keys: `rootField`, `id`, `title`, `content`, `url`, `signedUrl`, `type`, `doc_created_on`, `doc_updated_on`, `sys_racl`, `sys_file_type`, `html`
- `hasMore`: A marker the connector searches for in response headers to infer pagination

Example snippet:
```json
{
  "authDetails": {
    "authorizationType": "OAuth2ClientCredentials",
    "clientId": "...",
    "clientSecret": "...",
    "tokenUrl": "https://platform.app.simpplr.com/v1/identity/oauth/token"
  },
  "configuration": {
    "api": {
      "contentUrl": "https://platform.app.simpplr.com/v1/b2b/content/files/list",
      "method": "POST"
    },
    "pagination": { "limit": "pageSize", "offset": "pageToken" },
    "lookupFields": {
      "rootField": "listOfItems",
      "id": "id",
      "title": "title",
      "content": "content",
      "url": "url",
      "signedUrl": "signedDownloadUrl",
      "type": "type"
    },
    "hasMore": "rel=\"next\""
  }
}
```

---

## 4) Server (`server.js`)
- Initializes an Express app
- Adds JSON and URL-encoded parsers
- Loads environment variables via `dotenv`
- Registers a global error handler returning JSON
- Mounts routes and starts listening on port `3232`

Behavior:
- Root path `GET /` returns a simple message that endpoints exist
- For unhandled errors, the error handler responds with `{ success: false, message }`

---

## 5) Authorization Middleware (`middleware/authorization.js`)
Purpose: Only allow requests that present the correct `Authorization` header.

How it works:
- Reads `.env` variable `Authorization`
- Computes `Buffer.from(process.env.Authorization).toString('base64')`
- Compares that Base64 string to the incoming request header `Authorization`
- If equal: `next()`; otherwise responds `403 Forbidden`

Client requirement:
- Set header `Authorization: <BASE64_OF_ENV_SECRET>` (no `Basic`/`Bearer` prefix)

---

## 6) Router (`routes/content.route.js`)
Defines:
```
GET /getContent?limit=<number>&offset=<number>
```
- Applies `checkAuthorized` middleware
- Delegates to `get_content_controller`

---

## 7) Controller (`controller/content.controller.js`)
This is the main workflow to fetch, filter, enrich, and format Simpplr content.

Steps:
1. Validate `limit` and `offset` query params; return `400` if missing
2. Load config via `readConfig()`
3. Build auth headers using `getAuthHeaders(config)`
   - If `OAuth2ClientCredentials`: request a token with client credentials, cache it with an expiry buffer, send `Authorization: Bearer <token>`
   - If `BasicAuth`: send `Authorization: Basic <base64(username:password)>`
4. Build request options to Simpplr
   - URL, method, headers
   - Query params: `{ [limitKey]: limit, [offsetKey]: offset }`
   - Body: `{ provider: "intranet", size: 4000 }` (adjust per Simpplr API)
5. Send request using `axios`
6. Filter results
   - Keep only items with `type === "PDF"`
   - Keep only items from a specific `siteID` (change this value for your tenant)
   - Keep only items in `utils/specificIds`
7. PDF text extraction
   - For each filtered item with `signedDownloadUrl`, download the PDF, extract text via `pdf-parse`, and set `item.content` to the extracted text
8. Format output via `formatData(rawItems, lookupFields)`
9. Determine `isContentAvailable`
   - Tries to infer via header links or presence of a marker string
10. Return JSON `{ data: [...], isContentAvailable: <boolean> }`

Error handling:
- On failure, respond with HTTP 500 and a normalized shape: `{ error, result: [], isContentAvailable: false }`

Where to customize:
- Update `siteID` to target your Simpplr site
- Modify or remove `specificIds` filtering
- Adjust request body, pagination, and lookup fields as needed

---

## 8) Utilities

### a) `utils/readConfig.js`
- Asynchronously reads `config/config.json`
- Parses JSON and returns it
- Throws friendly errors for missing file or invalid JSON

### b) `utils/formatData.js`
- Accepts raw items (array or object with a `rootField`)
- Builds a normalized array of records using keys from `lookupFields`
- Prefers `signedDownloadUrl` over `url` if present
- Returns `{ data: [...] }`

Sample output item fields:
- `id`, `title`, `content`, `url`, `type`, `doc_created_on`, `doc_updated_on`, `rawData`, `sys_racl`, `sys_file_type`, `html`

### c) `utils/specificIds.js`
- Array of allowed IDs; used to include only selected Simpplr items
- You can empty this list or remove the filter in the controller to include all

---

## 9) Endpoints

### Health
```
GET /
```
- Returns a static message confirming service is running

### Get Content
```
GET /getContent?limit=<number>&offset=<number>
Headers:
  Authorization: <BASE64_OF_ENV_SECRET>
```

Response example:
```json
{
  "data": [
    {
      "id": "...",
      "title": "...",
      "content": "...",
      "url": "...",
      "type": "PDF"
    }
  ],
  "isContentAvailable": false
}
```

Common errors:
- `400`: Missing `limit` or `offset`
- `403`: Invalid `Authorization` header
- `500`: Upstream API or transformation error

---

## 10) Authentication Modes

- OAuth2 Client Credentials (default)
  - Set `authorizationType` to `OAuth2ClientCredentials`
  - Provide `clientId`, `clientSecret`, `tokenUrl`
  - Token is cached in memory with a small safety buffer before expiry

- Basic Auth
  - Set `authorizationType` to `BasicAuth`
  - Provide `username`, `password`

---

## 11) Security Notes
- Keep `.env` secret out of version control
- Always use HTTPS in production
- Rotate the shared secret regularly
- Restrict network access to trusted IPs/services

---

## 12) Customization Tips
- Update `siteID` and `specificIds` to refine which PDFs appear
- Map extra fields in `lookupFields` and return them via `formatData`
- Adjust Simpplr request body and pagination params in the controller
- Tweak PDF chunking (`getPdfTextChunks`) if you need different extraction rules

---

## 13) Troubleshooting
- 403 Forbidden
  - Ensure `Authorization` header equals `Base64(.env Authorization)` exactly (no `Bearer`/`Basic` prefix)
- 400 Bad Request
  - Include both `limit` and `offset` query params
- OAuth2 token errors
  - Verify `clientId`, `clientSecret`, `tokenUrl`; check network access and Simpplr tenant details
- Empty or too few results
  - Confirm `siteID` matches your Simpplr site
  - Review the `specificIds` list; remove filter if not needed
- PDF extraction returns empty
  - Ensure `signedDownloadUrl` is valid and accessible; verify PDF contents are text-based (not just images)

---

## 14) Example: Minimal Client Call
```bash
# 1) Prepare header value from your shared secret
SECRET="YOUR_SHARED_SECRET"
AUTH=$(node -e "console.log(Buffer.from(process.env.SECRET || '').toString('base64'))" | SECRET="$SECRET" node -e "process.stdin.on('data',d=>console.log(String(d).trim()))")

# 2) Call the service
curl "http://localhost:3232/getContent?limit=10&offset=0" \
  -H "Authorization: $AUTH"
```

---

## 15) Maintenance
- Dependencies are listed in `package.json`
- The server currently starts with `node server.js`
- Consider adding scripts (e.g., `start`, `dev`) and logging/metrics as needed

