# Ultron-Antigravity Bridge

This is a standalone Python microservice that acts as a bridge between the Ultron3 application and the Google Antigravity Agent. It receives interview questions, delegates them to the local Antigravity Agent using the `google-antigravity` SDK, and streams the answer back to the Ultron3 client via Server-Sent Events (SSE).

## Architecture
- **Framework:** FastAPI with Uvicorn
- **SDK:** `google-antigravity`
- **Streaming:** SSE (`sse_starlette`)
- **Concurrency:** Single-request lock for V1
- **Handshake:** On startup, writes `~/.ultron/session.json` containing the assigned port and authentication token.
- **Agent Integration:** Utilizes `Agent` and `LocalAgentConfig` to run within the context of the user's local project workspace.

## Requirements
- Python 3.12+
- Packages listed in `requirements.txt`

## Installation
```bash
# Set up a virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Running the Bridge
Run the server from the root of your Ultron3 project workspace:
```bash
python ultron-antigravity-bridge/run.py
```
> **Note:** The server will bind only to `127.0.0.1` and will attempt to use port `4747`. If that port is busy, it will find the next available port.

## Workspace Behavior
The bridge automatically sets the workspace path based on its startup directory. This absolute path is written into the handshake file and passed directly to the Antigravity Agent via `LocalAgentConfig.workspaces`.

## Handshake Location
On startup, the bridge generates a `session.json` file in:
```text
~/.ultron/session.json
```
This file includes the `protocolVersion`, `status`, `port`, `token`, `workspace`, and `pid`.

## Authentication
Every request requires the bearer token defined in the handshake file:
```http
Authorization: Bearer <token>
```
Missing or invalid tokens will result in a `401 Unauthorized` or `403 Forbidden` error.

## API
### POST `/v1/project/ask`
Submits a question to the Antigravity Agent.
**Request Body:**
```json
{
    "requestId": "req_123",
    "question": "Why did you choose Electron for Ultron3?",
    "mode": "interview",
    "stream": true
}
```

## SSE Protocol
The response is delivered using `text/event-stream`. 

Events:
- `start`: Indicates the agent session has begun.
- `token`: Streams the actual text content chunk.
- `complete`: Indicates the agent successfully finished responding.
- `error`: Indicates a failure, with codes such as `AGENT_ERROR`, `AGENT_TIMEOUT`, etc.

## Testing
Run the automated test suite using `pytest`:
```bash
pytest tests/test_api.py -v
```
Tests use a mocked agent client to avoid requiring an active Gemini API key during CI.

## Security Model
- **Localhost Only:** The server binds strictly to loopback (`127.0.0.1`).
- **Token Exchange:** The token is auto-generated using `secrets.token_hex(16)` and is written to a file within the user's home directory. It is never logged.
- **Errors:** No stack traces or API keys are exposed to the HTTP client.

## Troubleshooting
- **AGENT_ERROR:** You must set your `GEMINI_API_KEY` in the environment so the SDK can communicate with the backend model.
- **AGENT_TIMEOUT:** The request exceeded the 60-second limit.
