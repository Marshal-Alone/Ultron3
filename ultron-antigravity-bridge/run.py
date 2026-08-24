import os
import sys
import logging
import uvicorn
from dotenv import load_dotenv
load_dotenv(os.path.expanduser("~/.env"))

from src.server import app, agent_client
from src.handshake import HandshakeManager
from src.auth import auth_validator

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def main():
    workspace = os.getcwd()
    
    # Initialize handshake
    handshake = HandshakeManager(workspace)
    try:
        handshake.initialize()
    except Exception as e:
        logger.error(f"Failed to initialize handshake: {e}")
        sys.exit(1)
        
    # Configure auth and agent
    auth_validator.set_token(handshake.token)
    agent_client.setup(handshake.workspace)
    
    try:
        # Run server
        uvicorn.run(app, host="127.0.0.1", port=handshake.port)
    finally:
        handshake.cleanup()

if __name__ == "__main__":
    main()
