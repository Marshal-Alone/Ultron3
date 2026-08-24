import asyncio
import json
import pytest
import httpx
from httpx import AsyncClient
from src.server import app, agent_client
from src.auth import auth_validator

# Mock agent for testing
class MockAgentClient:
    def __init__(self):
        self._mock_mode = True
        self.cancel_called = False
        
    def setup(self, workspace):
        pass
        
    def cancel(self):
        self.cancel_called = True
        
    async def ask(self, question):
        if question == "error":
            raise Exception("Simulated error")
        elif question == "timeout":
            await asyncio.sleep(65)
            yield "never"
        else:
            yield "Hello"
            yield " World"

@pytest.fixture(autouse=True)
def inject_mock_agent(monkeypatch):
    mock = MockAgentClient()
    monkeypatch.setattr("src.server.agent_client", mock)
    auth_validator.set_token("test-token")
    return mock

@pytest.mark.asyncio
async def test_auth_missing():
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/v1/project/ask", json={
            "requestId": "req_1",
            "question": "Q",
            "mode": "interview",
            "stream": True
        })
        assert response.status_code in (401, 403) # HTTPBearer returns 403 or 401 when missing

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
            assert events[1] == {"type": "error", "requestId": "req_2", "code": "AGENT_ERROR", "message": "An error occurred during project analysis."}

@pytest.mark.asyncio
async def test_concurrency():
    # Simulate a slow request by mocking the lock acquisition
    # Wait, the lock is real. Let's send two requests concurrently.
    # To reliably test concurrency, we need the first request to block.
    # We can use our "timeout" mock for the first request.
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Start first request without waiting for it to finish
        import asyncio
        
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
