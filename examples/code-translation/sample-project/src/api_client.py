"""
api_client.py — HTTP API client with retry logic and rate limiting

A robust API client that handles retries, rate limiting, and error parsing.
"""

import time
import json
from typing import Any, Optional, Dict
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode


class APIError(Exception):
    """Base API error."""
    def __init__(self, message: str, status_code: Optional[int] = None, body: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class RateLimitError(APIError):
    """Raised when API rate limit is hit."""
    def __init__(self, retry_after: Optional[int] = None):
        super().__init__(f"Rate limited. Retry after {retry_after}s", 429)
        self.retry_after = retry_after


class APIClient:
    """
    HTTP API client with retry logic, rate limiting, and JSON handling.
    
    Args:
        base_url: Base URL for all requests
        api_key: API key for authentication
        max_retries: Max number of retries on failure (default: 3)
        timeout: Request timeout in seconds (default: 30)
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        max_retries: int = 3,
        timeout: int = 30,
    ):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.max_retries = max_retries
        self.timeout = timeout

    def _make_request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, str]] = None,
        body: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Any:
        """Make an HTTP request with retry logic."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        if params:
            url = f"{url}?{urlencode(params)}"

        req_headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if headers:
            req_headers.update(headers)

        data = json.dumps(body).encode() if body is not None else None

        for attempt in range(self.max_retries + 1):
            try:
                req = Request(url, data=data, headers=req_headers, method=method)
                with urlopen(req, timeout=self.timeout) as response:
                    response_body = response.read().decode('utf-8')
                    return json.loads(response_body) if response_body else None

            except HTTPError as e:
                status = e.code
                body_str = e.read().decode('utf-8') if e.fp else ''

                if status == 429:
                    retry_after = int(e.headers.get('Retry-After', 60))
                    if attempt < self.max_retries:
                        time.sleep(retry_after)
                        continue
                    raise RateLimitError(retry_after)

                if status >= 500 and attempt < self.max_retries:
                    wait = 2 ** attempt  # exponential backoff
                    time.sleep(wait)
                    continue

                raise APIError(f"HTTP {status}", status, body_str)

            except URLError as e:
                if attempt < self.max_retries:
                    time.sleep(2 ** attempt)
                    continue
                raise APIError(f"Request failed: {e.reason}")

        raise APIError("Max retries exceeded")

    def get(self, path: str, params: Optional[Dict[str, str]] = None) -> Any:
        return self._make_request("GET", path, params=params)

    def post(self, path: str, body: Any = None, params: Optional[Dict[str, str]] = None) -> Any:
        return self._make_request("POST", path, params=params, body=body)

    def put(self, path: str, body: Any = None) -> Any:
        return self._make_request("PUT", path, body=body)

    def delete(self, path: str) -> Any:
        return self._make_request("DELETE", path)
