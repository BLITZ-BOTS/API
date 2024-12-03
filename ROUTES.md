# Routes

## Authentication

All routes require Bearer token authentication in the header:
`Authorization: Bearer <token>`

## Response

### Success

```typescript
{"data": any}
```

### Error

```typescript
{"error": string, "message": string}
```

## `/plugins`

### GET /plugins

Get all plugins

- **Query Parameters**:
  - `page`: number (optional, default: 1)
  - `per_page`: number (optional, default: 25, max: 100)
- **Response**: Paginated array of plugin data

### POST /plugins

Upload a new plugin

- **Body**: Multipart form data
  - `name`: string
  - `description`: string
  - `version`: string
  - `tags`: string[]
  - `homepage`: string (valid URL)
  - `file`: ZIP file (max 5MB)
- **Response**: Plugin data or error

### PATCH /plugins/:name

Updates a plugin

- **Body**: Multipart form data (these are required, you can also update other fields)
  - `version`: string
  - `file`: ZIP file (max 5MB)
- **Response**: Plugin data or error

### DELETE /plugins/:name

Delete a plugin

- **Params**: name (string)
- **Auth**: Only plugin author can delete
- **Response**: Success or error

### GET /plugins/search

Search plugins

- **Query Parameters**:
  - `query`: string (required)
  - `page`: number (optional, default: 1)
  - `per_page`: number (optional, default: 25, max: 100)
- **Response**: Paginated plugin results

### GET /plugins/get/:name

Get info about a plugin

- **Params**: name (string)
- **Response**: Plugin data or error

## `/projects`

### GET /projects

Get all projects

- **Response**: Array of project data

### POST /projects

Create a new project

- **Body**:
  {
  "name": "string",
  "host": "string",
  "server_id": "string"
  }
- **Response**: Project data

### DELETE /projects/:index

Delete a project by index

- **Params**: index (number)
- **Response**: Success or error

## `/user`

### POST /user/pella_key

Update user's Pella API key

- **Body**:
  {
  "pella_api_key": "string"
  }
- **Validation**: Pella API key will be validated
- **Response**: Success or error
