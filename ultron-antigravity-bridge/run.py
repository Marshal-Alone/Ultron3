import os
import sys
import json
import logging
import uvicorn
from dotenv import load_dotenv

# Ensure the bridge directory is at the front of sys.path for robust module imports
BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
if BRIDGE_DIR not in sys.path:
    sys.path.insert(0, BRIDGE_DIR)

load_dotenv(os.path.join(BRIDGE_DIR, ".env"))
load_dotenv(os.path.expanduser("~/.env"))

# Auto-discover Gemini API key from jarvis-config if not already in environment
if not os.environ.get("GEMINI_API_KEY"):
    cred_paths = [
        os.path.expanduser("~/AppData/Roaming/jarvis-config/credentials.json"),
        os.path.expanduser("~/Library/Application Support/jarvis-config/credentials.json"),
        os.path.expanduser("~/.config/jarvis-config/credentials.json"),
    ]
    for cp in cred_paths:
        if os.path.exists(cp):
            try:
                with open(cp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("apiKey"):
                        os.environ["GEMINI_API_KEY"] = data["apiKey"]
                        break
            except Exception:
                pass

from src.server import app, agent_manager
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
        
    # Configure auth and agent workspace
    auth_validator.set_token(handshake.token)
    agent_manager.setup(handshake.workspace)
    
    try:
        # Run server (lifespan will start the persistent Agent and warmup in background)
        uvicorn.run(app, host="127.0.0.1", port=handshake.port)
    finally:
        handshake.cleanup()

if __name__ == "__main__":
    main()
