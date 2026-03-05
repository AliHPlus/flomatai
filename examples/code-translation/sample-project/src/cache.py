"""
cache.py — Simple in-memory cache with TTL support

Provides a thread-safe LRU-like cache for storing frequently accessed data.
"""

import time
from collections import OrderedDict
from typing import Any, Optional
from threading import Lock


class CacheEntry:
    """A single cache entry with TTL."""
    def __init__(self, value: Any, ttl_seconds: Optional[float] = None):
        self.value = value
        self.created_at = time.monotonic()
        self.ttl_seconds = ttl_seconds

    def is_expired(self) -> bool:
        if self.ttl_seconds is None:
            return False
        return (time.monotonic() - self.created_at) > self.ttl_seconds


class MemoryCache:
    """
    Thread-safe in-memory cache with optional TTL and max size (LRU eviction).
    
    Example:
        cache = MemoryCache(max_size=1000, default_ttl=300)
        cache.set("key", {"data": "value"})
        value = cache.get("key")
    """

    def __init__(self, max_size: int = 1000, default_ttl: Optional[float] = None):
        self.max_size = max_size
        self.default_ttl = default_ttl
        self._store: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = Lock()

    def get(self, key: str) -> Optional[Any]:
        """Get a value from the cache. Returns None if not found or expired."""
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            if entry.is_expired():
                del self._store[key]
                return None
            # Move to end (LRU: most recently used)
            self._store.move_to_end(key)
            return entry.value

    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Set a value in the cache."""
        with self._lock:
            ttl_to_use = ttl if ttl is not None else self.default_ttl
            self._store[key] = CacheEntry(value, ttl_to_use)
            self._store.move_to_end(key)
            # Evict oldest if over max size
            while len(self._store) > self.max_size:
                self._store.popitem(last=False)

    def delete(self, key: str) -> bool:
        """Delete a key from the cache. Returns True if key existed."""
        with self._lock:
            if key in self._store:
                del self._store[key]
                return True
            return False

    def clear(self) -> None:
        """Clear all entries from the cache."""
        with self._lock:
            self._store.clear()

    def size(self) -> int:
        """Return the number of entries in the cache."""
        with self._lock:
            return len(self._store)

    def cleanup_expired(self) -> int:
        """Remove expired entries. Returns count of removed entries."""
        with self._lock:
            expired_keys = [k for k, v in self._store.items() if v.is_expired()]
            for key in expired_keys:
                del self._store[key]
            return len(expired_keys)
