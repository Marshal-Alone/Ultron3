from pydantic import BaseModel, Field

class AskRequest(BaseModel):
    requestId: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1, max_length=1024)
    mode: str = Field(..., pattern="^interview$")
    stream: bool = Field(..., description="Must be true for V1 support")
