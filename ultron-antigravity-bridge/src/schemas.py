from pydantic import BaseModel, Field

class AskRequest(BaseModel):
    requestId: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1, max_length=1024)
    mode: str = Field(default="interview", pattern="^interview$")
    stream: bool = Field(default=True, description="Must be true for V1 support")

