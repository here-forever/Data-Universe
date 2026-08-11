import time
from collections import deque

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.collaboration.hub import collaboration_hub
from app.collaboration.schemas import CollaborationMessage
from app.core.config import Settings, get_settings

router = APIRouter(prefix="/collaboration", tags=["collaboration"])


@router.websocket("/{dataset_id}/ws")
async def collaboration_socket(
    dataset_id: str,
    websocket: WebSocket,
    settings: Settings = Depends(get_settings),
) -> None:
    connected = await collaboration_hub.connect(dataset_id, websocket, settings)
    if not connected:
        return
    received_at: deque[float] = deque()
    try:
        while True:
            raw_message = await websocket.receive_text()
            if len(raw_message.encode("utf-8")) > settings.collaboration_max_message_bytes:
                await websocket.close(code=1009, reason="Message too large")
                break

            now = time.monotonic()
            window_start = now - settings.collaboration_rate_limit_window_seconds
            while received_at and received_at[0] < window_start:
                received_at.popleft()
            if len(received_at) >= settings.collaboration_rate_limit_messages:
                await websocket.close(code=1008, reason="Message rate limit exceeded")
                break
            received_at.append(now)

            try:
                message = CollaborationMessage.model_validate_json(raw_message)
            except ValidationError:
                await websocket.send_json(
                    {"type": "error", "code": "invalid_collaboration_message"}
                )
                continue
            await collaboration_hub.broadcast(dataset_id, message.model_dump(mode="json"))
    except WebSocketDisconnect:
        pass
    finally:
        await collaboration_hub.disconnect(dataset_id, websocket)
