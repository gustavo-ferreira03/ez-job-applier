import asyncio
import uuid


class WaiterTimeout(Exception):
    pass


class WaiterRegistry:
    def __init__(self, events, timeout_seconds=600):
        self.events = events
        self.timeout_seconds = timeout_seconds
        self.pending_inputs = {}
        self.pending_submits = {}

    async def wait_for_answers(self, metadata):
        request_id = str(uuid.uuid4())
        future = asyncio.get_running_loop().create_future()
        event = {**metadata, "type": "needs_input", "request_id": request_id, "timeout_seconds": self.timeout_seconds}
        self.pending_inputs[request_id] = {"future": future, "event": event}
        await self.events.publish(event)
        try:
            return await asyncio.wait_for(future, timeout=self.timeout_seconds)
        except asyncio.TimeoutError as exc:
            await self.events.publish({**event, "type": "input_timeout"})
            raise WaiterTimeout from exc
        finally:
            self.pending_inputs.pop(request_id, None)

    async def wait_for_answer(self, metadata):
        answers = await self.wait_for_answers({**metadata, "questions": [metadata]})
        return answers[metadata["question_key"]]

    async def wait_for_submit(self, metadata):
        request_id = str(uuid.uuid4())
        future = asyncio.get_running_loop().create_future()
        event = {**metadata, "type": "ready_to_submit", "request_id": request_id, "timeout_seconds": self.timeout_seconds}
        self.pending_submits[request_id] = {"future": future, "event": event}
        await self.events.publish(event)
        try:
            return await asyncio.wait_for(future, timeout=self.timeout_seconds)
        except asyncio.TimeoutError as exc:
            await self.events.publish({**event, "type": "submit_timeout"})
            raise WaiterTimeout from exc
        finally:
            self.pending_submits.pop(request_id, None)

    def resolve_answer(self, request_id, answer):
        waiter = self.pending_inputs.get(request_id)
        if not waiter or waiter["future"].done():
            return False
        waiter["future"].set_result(answer)
        return True

    def resolve_submit(self, request_id, decision):
        waiter = self.pending_submits.get(request_id)
        if not waiter or waiter["future"].done():
            return False
        waiter["future"].set_result(decision)
        return True

    def state(self):
        return {
            "pending_inputs": [item["event"] for item in self.pending_inputs.values()],
            "pending_submits": [item["event"] for item in self.pending_submits.values()],
        }
