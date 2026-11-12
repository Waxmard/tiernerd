from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import HTTPException, Request, Response, status
from fastapi.routing import APIRoute
from starlette.types import Message


def bounded_write_route(max_bytes: Callable[[], int], detail: str) -> type[APIRoute]:
    class BoundedWriteRoute(APIRoute):
        def get_route_handler(
            self,
        ) -> Callable[[Request], Coroutine[Any, Any, Response]]:
            handler = super().get_route_handler()
            if not self.methods or self.methods.isdisjoint({"POST", "PUT"}):
                return handler

            def check_size(size: int) -> None:
                if size > max_bytes():
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=detail,
                    )

            async def bounded_handler(request: Request) -> Response:
                try:
                    content_length = int(request.headers.get("content-length", "0"))
                except ValueError:
                    content_length = 0
                check_size(content_length)
                receive = request.receive
                received = 0

                async def bounded_receive() -> Message:
                    nonlocal received
                    message = await receive()
                    if message["type"] == "http.request":
                        received += len(message.get("body", b""))
                        check_size(received)
                    return message

                return await handler(Request(request.scope, receive=bounded_receive))

            return bounded_handler

    return BoundedWriteRoute
