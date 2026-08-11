from __future__ import annotations

import asyncio
from typing import Any

from fastapi import WebSocket

from app.core.config import Settings


class CollaborationHub:
    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, dataset_id: str, websocket: WebSocket, settings: Settings) -> bool:
        async with self._lock:
            room = self.rooms.get(dataset_id)
            room_limit_reached = (
                room is None and len(self.rooms) >= settings.collaboration_max_rooms
            )
            connection_limit_reached = (
                room is not None and len(room) >= settings.collaboration_max_connections_per_room
            )
            await websocket.accept()
            if room_limit_reached or connection_limit_reached:
                await websocket.close(code=1013, reason="Collaboration capacity reached")
                return False
            active_room = self.rooms.setdefault(dataset_id, set())
            active_room.add(websocket)
            online = len(active_room)
        await self.broadcast(
            dataset_id,
            {"type": "presence", "online": online},
        )
        return True

    async def disconnect(self, dataset_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            room = self.rooms.get(dataset_id)
            if room is None:
                return
            room.discard(websocket)
            online = len(room)
            if not room:
                self.rooms.pop(dataset_id, None)
        if online:
            await self.broadcast(
                dataset_id,
                {"type": "presence", "online": online},
            )

    async def broadcast(self, dataset_id: str, message: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for socket in tuple(self.rooms.get(dataset_id, set())):
            try:
                await socket.send_json(message)
            except (OSError, RuntimeError):
                stale.append(socket)
        if not stale:
            return
        async with self._lock:
            room = self.rooms.get(dataset_id)
            if room is None:
                return
            for socket in stale:
                room.discard(socket)
            if not room:
                self.rooms.pop(dataset_id, None)


collaboration_hub = CollaborationHub()
