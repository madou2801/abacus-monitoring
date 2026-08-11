"""Rate limiter token-bucket asynchrone."""
from __future__ import annotations

import asyncio
import time


class AsyncRateLimiter:
    def __init__(self, rate_per_sec: float, burst: int | None = None):
        self.rate = max(rate_per_sec, 0.001)
        self.capacity = float(burst if burst else max(1, int(rate_per_sec)))
        self.tokens = self.capacity
        self.last = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.rate)
            self.last = now
            if self.tokens >= 1:
                self.tokens -= 1
                return
            wait = (1 - self.tokens) / self.rate
        await asyncio.sleep(wait)
        await self.acquire()
