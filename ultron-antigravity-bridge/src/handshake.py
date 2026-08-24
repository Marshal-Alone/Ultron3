import os
import json
import secrets
import socket
import logging

logger = logging.getLogger(__name__)

def get_free_port(start_port: int = 4747) -> int:
    port = start_port
    while port < 65535:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1
    raise RuntimeError("No free ports available")

class HandshakeManager:
    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)
        self.session_file = os.path.expanduser("~/.ultron/session.json")
        self.token = secrets.token_hex(16)
        self.port = None

    def initialize(self):
        self.port = get_free_port()
        os.makedirs(os.path.dirname(self.session_file), exist_ok=True)
        
        data = {
            "protocolVersion": 1,
            "status": "ready",
            "port": self.port,
            "token": self.token,
            "workspace": self.workspace,
            "pid": os.getpid()
        }
        
        with open(self.session_file, "w") as f:
            json.dump(data, f, indent=4)
            
        logger.info(f"Handshake written to {self.session_file}")
        logger.info(f"Selected port: {self.port}")
        logger.info(f"Workspace: {self.workspace}")

    def cleanup(self):
        try:
            if os.path.exists(self.session_file):
                os.remove(self.session_file)
                logger.info(f"Cleaned up {self.session_file}")
        except Exception as e:
            logger.error(f"Failed to clean up session file: {e}")
