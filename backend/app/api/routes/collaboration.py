from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.collaboration.hub import collaboration_hub

router = APIRouter(prefix="/collaboration", tags=["collaboration"])


@router.websocket("/{dataset_id}/ws")
async def collaboration_socket(dataset_id: str, websocket: WebSocket) -> None:
    await collaboration_hub.connect(dataset_id, websocket)
    try:
        while True:
            message = await websocket.receive_json()
            event = {
                "type": str(message.get("type", "activity")),
                "actor": str(message.get("actor", "anonymous"))[:80],
                "payload": message.get("payload", {}),
            }
            await collaboration_hub.broadcast(dataset_id, event)
    except WebSocketDisconnect:
        await collaboration_hub.disconnect(dataset_id, websocket)
