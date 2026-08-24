import asyncio
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request, Response
from sse_starlette.sse import EventSourceResponse

from src.schemas import AskRequest, BridgeStatusResponse
from src.auth import auth_validator
from src.agent import agent_manager

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # If workspace has been configured (e.g. from run.py), start persistent Agent and warmup in background
    if agent_manager.workspace:
        logger.info(f"Lifespan: starting persistent Agent on workspace: {agent_manager.workspace}")
        await agent_manager.start(auto_warm=True)
    yield
    logger.info("Lifespan: shutting down AgentManager...")
    await agent_manager.stop()


app = FastAPI(lifespan=lifespan)

# V1 concurrency lock
active_request_lock = asyncio.Lock()


@app.get("/v1/project/status", response_model=BridgeStatusResponse, dependencies=[Depends(auth_validator.validate_token)])
async def get_project_status():
    """Returns the current state, turn count, model, and warmup duration of the bridge."""
    return BridgeStatusResponse(
        state=agent_manager.state,
        workspace=agent_manager.workspace,
        model=agent_manager.model_name,
        turnCount=agent_manager.turn_count,
        warmupDurationSec=agent_manager.warmup_duration_sec,
        errorMessage=agent_manager.error_message
    )


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
            async for token in agent_manager.ask(req.question, request_id=request_id):
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
        agent_manager.cancel()
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
        agent_manager.cancel()
        raise
    except Exception as e:
        logger.error(f"Agent error for {request_id}: {e}")
        agent_manager.cancel()
        yield {
            "event": "message",
            "data": json.dumps({
                "type": "error",
                "requestId": request_id,
                "code": "AGENT_ERROR",
                "message": str(e) or "An error occurred during project analysis."
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
