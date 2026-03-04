"""
flomatai_bridge.py — Python side of the flomatai Python bridge.

This helper implements the JSON-over-stdin/stdout protocol expected by
@flomatai/bridge-python. Import it in your Python skill scripts.

Protocol (per line, newline-delimited JSON):
  TS → Python: { "id": "<uuid>", "function": "<fn>", "input": {...} }
  Python → TS: { "id": "<uuid>", "output": {...} }
           or: { "id": "<uuid>", "error": "<message>" }

Usage in your skill script:
    from flomatai_bridge import Bridge

    def analyze(input: dict) -> dict:
        # ... your logic ...
        return {"result": ...}

    if __name__ == "__main__":
        bridge = Bridge()
        bridge.register("analyze", analyze)
        bridge.run()
"""

import sys
import json
import traceback
from typing import Callable, Any


class Bridge:
    def __init__(self):
        self._handlers: dict[str, Callable[[dict], Any]] = {}

    def register(self, name: str, fn: Callable[[dict], Any]) -> None:
        """Register a function under a name callable from TypeScript."""
        self._handlers[name] = fn

    def run(self) -> None:
        """
        Start the bridge event loop.
        Reads newline-delimited JSON from stdin, dispatches to registered handlers,
        and writes results back to stdout.
        """
        for raw_line in sys.stdin:
            line = raw_line.strip()
            if not line:
                continue

            request_id = None
            try:
                request = json.loads(line)
                request_id = request.get("id")
                fn_name = request.get("function")
                input_data = request.get("input", {})

                if fn_name not in self._handlers:
                    raise ValueError(f"Unknown function: {fn_name!r}. Available: {list(self._handlers.keys())}")

                output = self._handlers[fn_name](input_data)
                response = {"id": request_id, "output": output}

            except Exception as e:
                err_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
                response = {"id": request_id, "error": err_msg}

            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()


# ── Convenience decorator ─────────────────────────────────────────────────────

_default_bridge = Bridge()


def skill(fn: Callable[[dict], Any]) -> Callable[[dict], Any]:
    """
    Decorator to register a function as a flomatai skill.

    @skill
    def my_function(input: dict) -> dict:
        return {"result": ...}
    """
    _default_bridge.register(fn.__name__, fn)
    return fn


def run() -> None:
    """Run the default bridge (for scripts using @skill decorator)."""
    _default_bridge.run()


# ── Example usage ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Example: a simple echo skill
    @skill
    def echo(input: dict) -> dict:
        return {"echoed": input}

    run()
