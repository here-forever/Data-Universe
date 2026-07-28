from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class CollaborationHub:
    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, dataset_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.rooms[dataset_id].add(websocket)
        await self.broadcast(
            dataset_id,
            {"type": "presence", "online": len(self.rooms[dataset_id])},
        )

    async def disconnect(self, dataset_id: str, websocket: WebSocket) -> None:
        self.rooms[dataset_id].discard(websocket)
        if self.rooms[dataset_id]:
            await self.broadcast(
                dataset_id,
                {"type": "presence", "online": len(self.rooms[dataset_id])},
            )
        else:
            self.rooms.pop(dataset_id, None)

    async def broadcast(self, dataset_id: str, message: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for socket in self.rooms.get(dataset_id, set()):
            try:
                await socket.send_json(message)
            except RuntimeError:
                stale.append(socket)
        for socket in stale:
            self.rooms[dataset_id].discard(socket)


collaboration_hub = CollaborationHub()
