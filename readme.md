## Simpplr Custom Connector – Complete Guide

### Overview
This service exposes a lightweight HTTP API to fetch and normalize content from Simpplr for ingestion into downstream systems. It supports OAuth2 Client Credentials and Basic Auth, pagination, selective filtering, and PDF text extraction.

### Project Structure
```
simpplr-tarsus-test/
  config/
    config.json
  controller/
    content.controller.js
  middleware/
    authorization.js
  routes/
    content.route.js
  utils/
    formatData.js
    readConfig.js
    specificIds.js
  TestFiles/
    sampleDoc.txt
    sampleDocs.txt
  server.js
  package.json
  package-lock.json
  readme.md
```

### Runtime and Dependencies
- Node.js 18+
- NPM packages: `express`, `dotenv`, `axios`, `pdf-parse`

### Quick Start
1. Install dependencies:
```bash
npm install
```
2. Create a `.env` file next to `server.js` with your shared secret for request authorization:
```bash
Authorization=YOUR_SHARED_SECRET
```
3. Configure Simpplr API and auth in `config/config.json` (see Config section).
4. Start the server:
```bash
node server.js
```
5. Call the API (see Endpoints). Default port is 3232.

## Configuration

### File: `config/config.json`
Key sections and how they are used:
- `authDetails`
  - `authorizationType`: `OAuth2ClientCredentials` or `BasicAuth`.
  - For OAuth2: `clientId`, `clientSecret`, `tokenUrl`, optional `scope`.
  - For Basic: `username`, `password`.
- `configuration.api`
  - `contentUrl`: Simpplr content endpoint.
  - `method`: HTTP method (`POST` expected for the provided Simpplr B2B endpoint).
- `configuration.pagination`
  - `limit`, `offset`: Query parameter names that the controller will populate from `?limit=&offset=`.
- `configuration.lookupFields`
  - Field mapping used by the formatter. Supported keys include: `rootField`, `id`, `title`, `content`, `url`, `signedUrl`, `type`, `doc_created_on`, `doc_updated_on`, `sys_racl`, `sys_file_type`, `html`.
- `hasMore`
  - String used to detect pagination via response headers (e.g., `rel="next"`).

Example (current):
```json
{
  "name": "customOAuth2Connector",
  "type": "customConnector",
  "authDetails": {
    "authorizationType": "OAuth2ClientCredentials",
    "clientId": "...",
    "clientSecret": "...",
    "tokenUrl": "https://platform.app.simpplr.com/v1/identity/oauth/token",
    "scope": "optional_scope_if_required"
  },
  "configuration": {
    "api": {
      "contentUrl": "https://platform.app.simpplr.com/v1/b2b/content/files/list",
      "method": "POST"
    },
    "pagination": {
      "limit": "pageSize",
      "offset": "pageToken"
    },
    "lookupFields": {
      "rootField": "listOfItems",
      "id": "id",
      "title": "title",
      "content": "content",
      "url": "url",
      "signedUrl": "signedDownloadUrl",
      "type": "type",
      "sys_racl": "permissions"
    },
    "hasMore": "rel=\"next\""
  }
}
```

## Server and Middleware

### File: `server.js`
- Sets up Express, JSON parsing, and a global error handler.
- Loads environment variables with `dotenv`.
- Mounts routes and listens on port 3232.

### File: `middleware/authorization.js`
- Guards every request to protected routes.
- Compares the `Authorization` request header to the Base64 value of the server-side secret from `.env`:
  - Compute at runtime: `Buffer.from(process.env.Authorization).toString('base64')`.
  - Clients must send exactly this Base64 string in the `Authorization` header (no scheme prefix).
  - On mismatch: responds with HTTP 403.

## Router and Controller

### File: `routes/content.route.js`
- Registers a single route:
```
GET /getContent?limit=<number>&offset=<number>
```
- Protected by `checkAuthorized`.
- Handled by `get_content_controller`.

### File: `controller/content.controller.js`
High-level flow of `get_content_controller`:
1. Validates `limit` and `offset` query params.
2. Loads `config.json` using `readConfig`.
3. Builds auth headers via `getAuthHeaders`:
   - `OAuth2ClientCredentials`: obtains and caches a bearer token from `authDetails.tokenUrl` using `client_credentials`.
   - `BasicAuth`: uses `username:password` Base64 in `Authorization: Basic ...`.
4. Constructs request options: `url`, `method`, headers, pagination params, and request body `{ provider: "intranet", size: 4000 }` for Simpplr.
5. Calls the Simpplr API with `axios`.
6. Filters results to PDFs that belong to a specific site and that match IDs listed in `utils/specificIds.js`.
7. For each remaining item with `signedDownloadUrl`, downloads the PDF, extracts text with `pdf-parse`, and assigns it to `item.content`.
8. Formats the filtered list with `utils/formatData` and returns `{ data: [...], isContentAvailable: <boolean> }`.
9. On error, responds with HTTP 500 and a normalized error payload.

Notes:
- Token caching uses a 5-minute safety buffer before expiry.
- `siteID` and the specific IDs list are hard-coded; update them to fit your tenant and selection logic.

## Utilities

### File: `utils/readConfig.js`
- Reads and parses `config/config.json` asynchronously. Throws meaningful errors for ENOENT and parse errors.

### File: `utils/formatData.js`
- Normalizes raw API items using `lookupFields`.
- Prefers `signedDownloadUrl` over `url` if present.
- Returns shape: `{ data: Array<FormattedItem> }` where each item contains `id`, `title`, `content`, `url`, `type`, `doc_created_on`, `doc_updated_on`, `rawData`, `sys_racl`, `sys_file_type`, `html` (if mapped).

### File: `utils/specificIds.js`
- Array of allowed item IDs used by the controller to filter Simpplr results.

## Endpoints

### Health/Root
```
GET /
```
Returns a static string indicating the service is running.

### Get Content
```
GET /getContent?limit=<number>&offset=<number>
Headers:
  Authorization: <base64_of_env_secret>
```
Response:
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

Sample cURL:
```bash
curl "http://localhost:3232/getContent?limit=10&offset=0" \
  -H "Authorization: $(printf %s "$AUTH_SECRET" | node -e "process.stdin.on('data',d=>console.log(Buffer.from(String(d).trim()).toString('base64')))" )"
```
Where `$AUTH_SECRET` equals the same value set in the server `.env` as `Authorization`.

## Switching Auth Modes
- OAuth2 Client Credentials (default): set `authorizationType` to `OAuth2ClientCredentials` and provide `clientId`, `clientSecret`, `tokenUrl`.
- Basic Auth: set `authorizationType` to `BasicAuth` and provide `username`, `password`.

## Error Handling
- Central error handler returns JSON with `success: false` and the error `message`.
- Controller returns normalized error payload `{ error, result: [], isContentAvailable: false }` when upstream calls fail.

## Security Notes
- The route-level check requires the client’s `Authorization` header to match the Base64 of the server-side secret. Treat the `.env` value as a shared secret and rotate it periodically.
- Never commit secrets. `.env` should be git-ignored.
- For production, prefer HTTPS and limit network access to trusted callers.

## Customization Tips
- Update `siteID` and `utils/specificIds.js` to control which PDFs are returned.
- Adjust `configuration.lookupFields` to align with your Simpplr response shape.
- Extend `formatData` to include additional fields as needed.
- Tune PDF extraction behavior in `getPdfTextChunks` if chunking rules need to change.

## Development Scripts
No npm scripts are defined beyond the default test placeholder. Start with:
```bash
node server.js
```

## Troubleshooting
- 403 Forbidden: Ensure the request `Authorization` header equals `Base64(.env Authorization)`.
- 400 Bad Request: Provide `limit` and `offset` query parameters.
- OAuth2 failures: Verify `clientId`, `clientSecret`, and `tokenUrl`. Check token endpoint logs.
- Empty results: Confirm `siteID` and IDs in `specificIds.js` match actual Simpplr content.

