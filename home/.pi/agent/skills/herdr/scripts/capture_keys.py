#!/usr/bin/env python3
"""Capture terminal key sequences in raw mode and print them as hex.

Usage:
    python3 scripts/capture_keys.py

Behavior:
- Switches stdin to raw mode
- Coalesces bytes until input goes idle for 20ms
- Prints each coalesced sequence as hex + escaped text
- Exit with Ctrl+G (0x07)

This is meant for collecting real terminal fixtures from Ghostty, GNOME Terminal,
kitty, iTerm2, Terminal.app, tmux, etc.
"""

from __future__ import annotations

import select
import sys
import termios
import tty
from typing import Iterable

IDLE_TIMEOUT_S = 0.020
EXIT_BYTE = b"\x07"  # Ctrl+G


def to_hex(data: bytes) -> str:
    return data.hex()


def escaped(data: bytes) -> str:
    parts: list[str] = []
    for byte in data:
        if byte == 0x1B:
            parts.append("\\x1b")
        elif byte == 0x7F:
            parts.append("\\x7f")
        elif byte == 0x0D:
            parts.append("\\r")
        elif byte == 0x0A:
            parts.append("\\n")
        elif byte == 0x09:
            parts.append("\\t")
        elif 0x20 <= byte <= 0x7E:
            parts.append(chr(byte))
        else:
            parts.append(f"\\x{byte:02x}")
    return "".join(parts)


def read_sequence() -> bytes:
    first = sys.stdin.buffer.read1(1)
    if not first:
        return b""

    chunks = [first]
    while True:
        ready, _, _ = select.select([sys.stdin], [], [], IDLE_TIMEOUT_S)
        if not ready:
            break
        chunk = sys.stdin.buffer.read1(1024)
        if not chunk:
            break
        chunks.append(chunk)
    return b"".join(chunks)


def main() -> int:
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    print("capture-keys: raw mode enabled", file=sys.stderr)
    print("capture-keys: press Ctrl+G to quit", file=sys.stderr)
    print("family\thex\tescaped", file=sys.stdout)
    sys.stdout.flush()

    try:
        tty.setraw(fd)
        while True:
            data = read_sequence()
            if not data:
                return 0
            if data == EXIT_BYTE:
                print("capture-keys: exiting", file=sys.stderr)
                return 0
            print(f"captured\t{to_hex(data)}\t{escaped(data)}", file=sys.stdout)
            sys.stdout.flush()
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


if __name__ == "__main__":
    raise SystemExit(main())
