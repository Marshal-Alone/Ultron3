from typing import Optional
from pydantic import BaseModel, Field

class AskRequest(BaseModel):
    requestId: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1, max_length=1024)
    mode: str = Field(default="interview", pattern="^interview$")
    stream: bool = Field(default=True, description="Must be true for V1 support")

class BridgeStatusResponse(BaseModel):
    state: str = Field(..., description="STARTING, WARMING, READY, THINKING, STREAMING, ERROR")
    workspace: Optional[str] = None
    model: Optional[str] = None
    turnCount: int = 0
    warmupDurationSec: Optional[float] = None
    errorMessage: Optional[str] = None


