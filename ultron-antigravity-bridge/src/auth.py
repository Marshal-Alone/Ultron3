from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging

logger = logging.getLogger(__name__)
security = HTTPBearer()

def get_current_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    return credentials.credentials

class AuthValidator:
    def __init__(self):
        self.expected_token = None

    def set_token(self, token: str):
        self.expected_token = token

    def validate_token(self, token: str = Depends(get_current_token)):
        if not self.expected_token:
            logger.error("AuthValidator not initialized with a token")
            raise HTTPException(status_code=500, detail="Internal Server Error")
        
        if token != self.expected_token:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        return token

auth_validator = AuthValidator()
