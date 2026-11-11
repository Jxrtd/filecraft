import time
from collections import deque

from starlette.responses import JSONResponse

from app.core import config


class BodyLimit(Exception):
    pass


class LimitsMiddleware:
    """Bound wire body bytes before multipart parsing, plus per-client request rate."""

    def __init__(self, app):
        self.app = app
        self.clients = {}
        self.active = 0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        now = time.monotonic()
        self.clients = {
            key: queue for key, queue in self.clients.items() if queue and queue[-1] > now - 60
        }
        client = (scope.get("client") or ("unknown",))[0]
        queue = self.clients.setdefault(client, deque())
        while queue and queue[0] <= now - 60:
            queue.popleft()
        status = None
        if (
            len(queue) >= config.REQUESTS_PER_MINUTE
            or self.active >= config.CONCURRENT
            or len(self.clients) > 10000
        ):
            status = (429, "Server busy or request limit reached. Please retry in a minute.")
        headers = dict(scope["headers"])
        try:
            if int(headers.get(b"content-length", b"0")) > config.MAX_REQUEST_BYTES:
                status = (413, "Request exceeds the upload limit.")
        except ValueError:
            status = (400, "Invalid request size.")
        if status:
            return await JSONResponse({"detail": status[1]}, status[0])(scope, receive, send)
        queue.append(now)
        self.active += 1
        total = 0
        started = False

        async def bounded_receive():
            nonlocal total
            message = await receive()
            total += len(message.get("body", b""))
            if total > config.MAX_REQUEST_BYTES:
                raise BodyLimit()
            return message

        async def track_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, bounded_receive, track_send)
        except BodyLimit:
            if not started:
                await JSONResponse({"detail": "Request exceeds the upload limit."}, 413)(
                    scope, receive, send
                )
        finally:
            self.active -= 1
