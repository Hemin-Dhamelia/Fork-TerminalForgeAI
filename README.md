# Node.js Ping Server

Minimal HTTP server with a single GET /ping endpoint.

## Prerequisites
- Node.js 16+ installed

## Run
```bash
node server.js
```

## Test
```bash
curl http://localhost:3000/ping
```

## Expected Response
```json
{"pong":true}
```
