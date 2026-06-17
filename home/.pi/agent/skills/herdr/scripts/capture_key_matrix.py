#!/usr/bin/env python3
"""Interactive terminal key capture tool.

Self-contained: copy this file to any macOS/Linux machine and run it with Python 3.
No project imports, no external dependencies.

What it does:
- auto-detects OS + tmux status
- asks for terminal name + optional notes
- prompts a fixed key matrix one key at a time
- captures the raw byte sequence for each key press in raw mode
- writes a TSV file you can copy back into the repo later

Usage:
    python3 capture_key_matrix.py

Exit / control:
- Press the requested key to capture it
- After each capture: Enter=accept, r=retry, s=skip, q=quit
- Ctrl+G during raw capture aborts immediately
"""

from __future__ import annotations

import os
import platform
import re
import select
import sys
import termios
import time
import tty
from pathlib import Path

IDLE_TIMEOUT_S = 0.025
ABORT_CAPTURE = b"\x07"  # Ctrl+G

KEY_MATRIX: list[tuple[str, str]] = [
    ("esc", "Press Escape"),
    ("up", "Press Up Arrow"),
    ("down", "Press Down Arrow"),
    ("left", "Press Left Arrow"),
    ("right", "Press Right Arrow"),
    ("alt+up", "Press Alt+Up Arrow"),
    ("alt+down", "Press Alt+Down Arrow"),
    ("alt+left", "Press Alt+Left Arrow"),
    ("alt+right", "Press Alt+Right Arrow"),
    ("ctrl+b", "Press Ctrl+B"),
    ("ctrl+c", "Press Ctrl+C"),
    ("shift+enter", "Press Shift+Enter"),
    ("shift+l", "Press Shift+L"),
    ("shift+1", "Press Shift+1"),
    ("shift+/", "Press Shift+/"),
    ("home", "Press Home"),
    ("end", "Press End"),
    ("pageup", "Press Page Up"),
    ("pagedown", "Press Page Down"),
]


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


def sanitize(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9._-]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-._")
    return value or "terminal"


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


class RawMode:
    def __enter__(self) -> "RawMode":
        self.fd = sys.stdin.fileno()
        self.old = termios.tcgetattr(self.fd)
        tty.setraw(self.fd)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        termios.tcsetattr(self.fd, termios.TCSADRAIN, self.old)


def detect_os() -> str:
    system = platform.system().lower()
    if system == "darwin":
        return "macos"
    if system == "linux":
        return "linux"
    return system or "unknown"


def detect_tmux() -> str:
    return "yes" if os.environ.get("TMUX") else "no"


def prompt(text: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{text}{suffix}: ").strip()
    if not value and default is not None:
        return default
    return value


def choose_output_path(terminal_name: str, os_name: str, tmux_state: str) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    default_name = (
        f"key-capture-{sanitize(terminal_name)}-{sanitize(os_name)}-{sanitize(tmux_state)}-{stamp}.tsv"
    )
    raw = prompt("Output file path", default_name)
    return Path(raw).expanduser().resolve()


def capture_one(display: str) -> bytes | None:
    print()
    print(f"=== {display} ===")
    print("Press the key now. Ctrl+G aborts the session.")
    sys.stdout.flush()
    with RawMode():
        data = read_sequence()
    if data == ABORT_CAPTURE:
        return None
    return data


def confirm_capture(data: bytes) -> str:
    print(f"Captured: hex={to_hex(data)} escaped={escaped(data)!r}")
    while True:
        choice = input("Enter=accept, r=retry, s=skip, q=quit: ").strip().lower()
        if choice in {"", "r", "s", "q"}:
            return choice
        print("Please enter one of: Enter, r, s, q")


def write_tsv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        f.write("terminal\tos\ttmux\tkey\tnotes\tbytes_hex\tescaped\n")
        for row in rows:
            f.write(
                "\t".join(
                    [
                        row["terminal"],
                        row["os"],
                        row["tmux"],
                        row["key"],
                        row["notes"],
                        row["bytes_hex"],
                        row["escaped"],
                    ]
                )
                + "\n"
            )


def main() -> int:
    print("Interactive terminal key capture")
    print("This will collect one raw sequence per requested key and write a TSV file.")
    print()

    os_name = detect_os()
    tmux_state = detect_tmux()

    terminal_name = prompt("Terminal name (e.g. gnome-terminal, ghostty, kitty, iterm2)")
    if not terminal_name:
        print("Terminal name is required.", file=sys.stderr)
        return 1

    notes = prompt("Optional notes", "")
    output_path = choose_output_path(terminal_name, os_name, tmux_state)

    print()
    print(f"Terminal: {terminal_name}")
    print(f"OS:       {os_name}")
    print(f"Tmux:     {tmux_state}")
    print(f"Notes:    {notes or '-'}")
    print(f"Output:   {output_path}")
    print()
    input("Press Enter to start capture...")

    rows: list[dict[str, str]] = []

    for key_id, display in KEY_MATRIX:
        while True:
            data = capture_one(display)
            if data is None:
                print("Aborted by Ctrl+G.")
                write_tsv(output_path, rows)
                print(f"Wrote partial capture to {output_path}")
                return 1

            choice = confirm_capture(data)
            if choice == "r":
                continue
            if choice == "s":
                rows.append(
                    {
                        "terminal": terminal_name,
                        "os": os_name,
                        "tmux": tmux_state,
                        "key": key_id,
                        "notes": notes,
                        "bytes_hex": "",
                        "escaped": "SKIPPED",
                    }
                )
                break
            if choice == "q":
                write_tsv(output_path, rows)
                print(f"Wrote partial capture to {output_path}")
                return 0

            rows.append(
                {
                    "terminal": terminal_name,
                    "os": os_name,
                    "tmux": tmux_state,
                    "key": key_id,
                    "notes": notes,
                    "bytes_hex": to_hex(data),
                    "escaped": escaped(data),
                }
            )
            break

    write_tsv(output_path, rows)
    print()
    print(f"Done. Wrote {len(rows)} rows to {output_path}")
    print("Copy that TSV file back here and we can fold it into the corpus.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
