import asyncio
import json
import logging
from fastapi import FastAPI, Depends, Request, Response
from sse_starlette.sse import EventSourceResponse

from src.schemas import AskRequest
from src.auth import auth_validator
from src.agent import AgentClient

logger = logging.getLogger(__name__)

app = FastAPI()
agent_client = AgentClient()

# V1 concurrency lock
active_request_lock = asyncio.Lock()

async def event_generator(req: AskRequest, client_request: Request):
    request_id = req.requestId
    
    # Send start event
    yield {
        "event": "message",
        "data": json.dumps({"type": "start", "requestId": request_id})
    }
    
    try:
        # Wrap the whole generation in a timeout
        async with asyncio.timeout(600.0):
            async for token in agent_client.ask(req.question):
                # Detect client disconnect before yielding next token
                if await client_request.is_disconnected():
                    raise asyncio.CancelledError("Client disconnected")

                yield {
                    "event": "message",
                    "data": json.dumps({"type": "token", "token": token})
                }
                
        # If successfully completed
        yield {
            "event": "message",
            "data": json.dumps({"type": "complete", "requestId": request_id})
        }
            
    except asyncio.TimeoutError:
        logger.warning(f"Request {request_id} timed out")
        agent_client.cancel()
        yield {
            "event": "message",
            "data": json.dumps({
                "type": "error",
                "requestId": request_id,
                "code": "AGENT_TIMEOUT",
                "message": "Project analysis timed out."
            })
        }
    except asyncio.CancelledError:
        # Do NOT yield anything after client disconnect, just cleanup
        logger.info(f"Client disconnected for request {request_id}")
        agent_client.cancel()
        raise
    except Exception as e:
        logger.error(f"Agent error for {request_id}: {e}")
        agent_client.cancel()
        yield {
            "event": "message",
            "data": json.dumps({
                "type": "error",
                "requestId": request_id,
                "code": "AGENT_ERROR",
                "message": "An error occurred during project analysis."
            })
        }

@app.post("/v1/project/ask", dependencies=[Depends(auth_validator.validate_token)])
async def ask_project(req: AskRequest, request: Request, response: Response):
    if active_request_lock.locked():
        response.status_code = 409
        return {"error": "Another request is currently active"}
        
    await active_request_lock.acquire()
    
    async def sse_wrapper():
        try:
            async for event in event_generator(req, request):
                yield event
        finally:
            active_request_lock.release()
            
    return EventSourceResponse(sse_wrapper())
