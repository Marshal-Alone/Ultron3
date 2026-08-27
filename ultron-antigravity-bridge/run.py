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

# Configure clean logging: silence raw SDK WebSocket messages and keep only essential bridge events
logging.basicConfig(level=logging.WARNING, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logging.getLogger("src").setLevel(logging.INFO)
logging.getLogger("__main__").setLevel(logging.INFO)
logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("google.antigravity").setLevel(logging.WARNING)
logging.getLogger("websockets").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

import argparse

def main():
    parser = argparse.ArgumentParser(description="Start Ultron Antigravity Project Copilot Bridge")
    parser.add_argument(
        "workspace_pos",
        nargs="?",
        default=None,
        help="Path to the project folder you want Copilot to answer questions about (e.g. C:\\Projects\\MyApp)"
    )
    parser.add_argument(
        "-w", "--workspace",
        dest="workspace_flag",
        default=None,
        help="Path to the project folder you want Copilot to answer questions about"
    )
    args = parser.parse_args()

    # Determine target workspace in priority order:
    # 1. CLI positional arg or --workspace flag
    # 2. PROJECT_WORKSPACE env variable
    # 3. Default to parent Ultron3 directory
    chosen_path = args.workspace_flag or args.workspace_pos or os.environ.get("PROJECT_WORKSPACE")
    
    if chosen_path:
        workspace = os.path.abspath(chosen_path)
    elif os.path.exists(os.path.join(BRIDGE_DIR, "..", "package.json")):
        workspace = os.path.abspath(os.path.join(BRIDGE_DIR, ".."))
    else:
        workspace = os.getcwd()

    if not os.path.exists(workspace):
        logger.error(f"Workspace directory does not exist: {workspace}")
        sys.exit(1)

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

    print("=" * 65)
    print("🚀 Ultron Project Copilot Bridge")
    print(f"📁 Target Project: {workspace}")
    print(f"🔌 Port:           {handshake.port}")
    print(f"🔑 Gemini Key:     {'Configured ✅' if os.environ.get('GEMINI_API_KEY') else 'Missing ⚠️'}")
    print("=" * 65)
    print("[INFO] Initializing persistent Agent on workspace...")
    
    try:
        # Run server (lifespan will start the persistent Agent and warmup in background)
        uvicorn.run(app, host="127.0.0.1", port=handshake.port, log_level="warning")
    finally:
        handshake.cleanup()

if __name__ == "__main__":
    main()
