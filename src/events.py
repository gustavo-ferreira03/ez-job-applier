import asyncio
from collections import deque
from datetime import datetime


class EventBus:
    def __init__(self, history_size=100):
        self.history = deque(maxlen=history_size)
        self.subscribers = set()

    async def publish(self, event):
        event = {"timestamp": datetime.utcnow().isoformat(timespec="seconds"), **event}
        self.history.append(event)
        dead = []
        for queue in self.subscribers:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                dead.append(queue)
        for queue in dead:
            self.subscribers.discard(queue)

    async def subscribe(self):
        queue = asyncio.Queue(maxsize=100)
        self.subscribers.add(queue)
        try:
            for event in self.history:
                yield event
            while True:
                yield await queue.get()
        finally:
            self.subscribers.discard(queue)
