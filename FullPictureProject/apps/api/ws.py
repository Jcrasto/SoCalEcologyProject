"""WebSocket connection manager for real-time layer broadcasts."""

import logging
import time
from typing import Dict, List, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and their layer subscriptions."""

    def __init__(self) -> None:
        # Maps each WebSocket to the set of layer names it has subscribed to
        self.active_connections: Dict[WebSocket, Set[str]] = {}

    async def connect(self, ws: WebSocket) -> None:
        """Accept a new WebSocket connection."""
        await ws.accept()
        self.active_connections[ws] = set()
        logger.info("WebSocket connected. Total connections: %d", len(self.active_connections))

    def disconnect(self, ws: WebSocket) -> None:
        """Remove a disconnected WebSocket."""
        self.active_connections.pop(ws, None)
        logger.info("WebSocket disconnected. Total connections: %d", len(self.active_connections))

    async def subscribe(self, ws: WebSocket, layers: List[str]) -> None:
        """Add layer subscriptions for a connected WebSocket."""
        if ws in self.active_connections:
            self.active_connections[ws].update(layers)
            logger.debug("WebSocket subscribed to layers: %s", layers)

    async def broadcast_layer(self, layer: str, data: list) -> None:
        """
        Send an update message to all connections subscribed to *layer*.

        Message shape:
            {"type": "update", "layer": "<name>", "data": [...features], "ts": <unix_ts>}
        """
        message = {
            "type": "update",
            "layer": layer,
            "data": data,
            "ts": int(time.time()),
        }
        disconnected: List[WebSocket] = []
        for ws, subscriptions in self.active_connections.items():
            if layer in subscriptions:
                try:
                    await ws.send_json(message)
                except Exception as exc:
                    logger.warning("Failed to send to WebSocket: %s", exc)
                    disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws)

    async def broadcast_alert(self, layer: str, feature: dict) -> None:
        """
        Send an alert message to all connections subscribed to *layer*.

        Message shape:
            {"type": "alert", "layer": "<name>", "data": {feature}, "ts": <unix_ts>}
        """
        message = {
            "type": "alert",
            "layer": layer,
            "data": feature,
            "ts": int(time.time()),
        }
        disconnected: List[WebSocket] = []
        for ws, subscriptions in self.active_connections.items():
            if layer in subscriptions:
                try:
                    await ws.send_json(message)
                except Exception as exc:
                    logger.warning("Failed to send alert to WebSocket: %s", exc)
                    disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws)


# Module-level singleton
manager = ConnectionManager()
