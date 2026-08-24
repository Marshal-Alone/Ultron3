import asyncio
import json
import pytest
import httpx
from httpx import AsyncClient
from src.server import app, agent_manager
from src.auth import auth_validator

# Mock agent manager for testing
class MockAgentManager:
    def __init__(self):
        self._mock_mode = True
        self.cancel_called = False
        self.workspace = "/test/workspace"
        self.model_name = "gemini-3.5-flash-lite"
        self.state = "READY"
        self.turn_count = 0
        self.warmup_duration_sec = 12.5
        self.error_message = None
        
    def setup(self, workspace):
        self.workspace = workspace
        
    async def start(self, auto_warm=True):
        self.state = "READY"
        
    def cancel(self):
        self.cancel_called = True
        self.state = "READY"
        
    async def stop(self):
        self.state = "STARTING"
        
    async def ask(self, question, request_id=None):
        if question == "error":
            raise Exception("Simulated error")
        elif question == "timeout":
            await asyncio.sleep(65)
            yield "never"
        else:
            self.turn_count += 1
            yield "Hello"
            yield " World"

@pytest.fixture(autouse=True)
def inject_mock_agent(monkeypatch):
    mock = MockAgentManager()
    monkeypatch.setattr("src.server.agent_manager", mock)
    auth_validator.set_token("test-token")
    return mock

@pytest.mark.asyncio
async def test_status_auth_missing():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/project/status")
        assert response.status_code in (401, 403)

@pytest.mark.asyncio
async def test_status_authenticated():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/v1/project/status",
            headers={"Authorization": "Bearer test-token"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "READY"
        assert data["workspace"] == "/test/workspace"
        assert data["turnCount"] == 0
        assert data["warmupDurationSec"] == 12.5

@pytest.mark.asyncio
async def test_auth_missing():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/v1/project/ask", json={
            "requestId": "req_1",
            "question": "Q",
            "mode": "interview",
            "stream": True
        })
        assert response.status_code in (401, 403)

@pytest.mark.asyncio
async def test_auth_invalid():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/project/ask", 
            headers={"Authorization": "Bearer bad-token"},
            json={
                "requestId": "req_1",
                "question": "Q",
                "mode": "interview",
                "stream": True
            }
        )
        assert response.status_code == 401

@pytest.mark.asyncio
async def test_malformed_request():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/project/ask", 
            headers={"Authorization": "Bearer test-token"},
            json={"requestId": "req"} # missing question
        )
        assert response.status_code == 422

@pytest.mark.asyncio
async def test_empty_question():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/project/ask", 
            headers={"Authorization": "Bearer test-token"},
            json={"requestId": "req_1", "question": "", "mode": "interview", "stream": True}
        )
        assert response.status_code == 422

@pytest.mark.asyncio
async def test_oversized_question():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/project/ask", 
            headers={"Authorization": "Bearer test-token"},
            json={"requestId": "req_1", "question": "a" * 2000, "mode": "interview", "stream": True}
        )
        assert response.status_code == 422

@pytest.mark.asyncio
async def test_sse_streaming():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        async with client.stream(
            "POST", "/v1/project/ask", 
            headers={"Authorization": "Bearer test-token"},
            json={"requestId": "req_1", "question": "test", "mode": "interview", "stream": True}
        ) as response:
            assert response.status_code == 200
            events = []
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
            
            assert len(events) == 4
            assert events[0] == {"type": "start", "requestId": "req_1"}
            assert events[1] == {"type": "token", "token": "Hello"}
            assert events[2] == {"type": "token", "token": " World"}
            assert events[3] == {"type": "complete", "requestId": "req_1"}

@pytest.mark.asyncio
async def test_agent_error():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        async with client.stream(
            "POST", "/v1/project/ask", 
            headers={"Authorization": "Bearer test-token"},
            json={"requestId": "req_2", "question": "error", "mode": "interview", "stream": True}
        ) as response:
            assert response.status_code == 200
            events = []
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
            
            assert len(events) == 2
            assert events[0] == {"type": "start", "requestId": "req_2"}
            assert events[1] == {"type": "error", "requestId": "req_2", "code": "AGENT_ERROR", "message": "Simulated error"}

@pytest.mark.asyncio
async def test_concurrency():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        async def slow_req():
            try:
                async with client.stream(
                    "POST", "/v1/project/ask",
                    headers={"Authorization": "Bearer test-token"},
                    json={"requestId": "req_slow", "question": "timeout", "mode": "interview", "stream": True}
                ) as resp:
                    pass
            except:
                pass
                
        task = asyncio.create_task(slow_req())
        await asyncio.sleep(0.1) # Give it time to acquire lock
        
        # Second request should get 409
        response2 = await client.post(
            "/v1/project/ask", 
            headers={"Authorization": "Bearer test-token"},
            json={"requestId": "req_fast", "question": "test", "mode": "interview", "stream": True}
        )
        assert response2.status_code == 409
        
        # Cancel the slow request
        task.cancel()
