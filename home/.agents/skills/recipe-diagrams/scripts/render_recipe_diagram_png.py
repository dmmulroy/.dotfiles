#!/usr/bin/env python3
"""Render recipe dependency JSON as a high-resolution PNG table."""

from __future__ import annotations

import argparse
import html
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
from dataclasses import dataclass
from pathlib import Path

from render_recipe_diagram import (
    RecipeAction,
    RecipeDiagram,
    RecipeDiagramInputError,
    ascii_recipe_text,
    load_recipe_document,
    parse_recipe_diagram,
)


@dataclass(frozen=True)
class PngLayout:
    width: int
    height: int
    margin: int
    table_x: int
    table_width: int
    column_widths: tuple[int, ...]
    title_height: int
    setup_heights: tuple[int, ...]
    row_heights: tuple[int, ...]
    ingredient_lines: tuple[tuple[str, ...], ...]
    setup_lines: tuple[tuple[str, ...], ...]
    action_lines: tuple[dict[RecipeAction, tuple[str, ...]], ...]
    font_size: int
    title_font_size: int
    line_height: int
    padding: int


def wrap_for_pixels(text: str, pixel_width: int, font_size: int, padding: int) -> tuple[str, ...]:
    """Wrap monospaced text using a conservative character-width estimate."""

    usable_width = max(1, pixel_width - 2 * padding)
    character_width = font_size * 0.62
    character_count = max(1, int(usable_width / character_width))
    lines = textwrap.wrap(
        ascii_recipe_text(text),
        width=character_count,
        break_long_words=True,
        break_on_hyphens=False,
        replace_whitespace=True,
        drop_whitespace=True,
    )
    return tuple(lines or [""])


def build_png_layout(diagram: RecipeDiagram, width: int) -> PngLayout:
    """Calculate a high-density table layout with readable wrapped text."""

    if width < 1920:
        raise RecipeDiagramInputError("PNG width must be at least 1920 pixels")

    scale = width / 3840
    margin = round(72 * scale)
    padding = max(12, round(18 * scale))
    font_size = max(20, round(34 * scale))
    title_font_size = max(30, round(50 * scale))
    line_height = max(29, round(47 * scale))

    table_width = width - 2 * margin
    process_count = len(diagram.columns)
    ingredient_width = round(table_width * (0.24 if process_count >= 6 else 0.30))
    remaining_width = table_width - ingredient_width
    process_width, extra = divmod(remaining_width, process_count)
    column_widths = (ingredient_width,) + tuple(
        process_width + (1 if index < extra else 0) for index in range(process_count)
    )

    ingredient_lines = tuple(
        wrap_for_pixels(ingredient, ingredient_width, font_size, padding)
        for ingredient in diagram.ingredients
    )
    minimum_row_height = max(round(62 * scale), line_height + 2 * padding)
    row_heights = [
        max(minimum_row_height, len(lines) * line_height + 2 * padding)
        for lines in ingredient_lines
    ]

    action_lines: list[dict[RecipeAction, tuple[str, ...]]] = []
    for column_index, actions in enumerate(diagram.columns):
        wrapped_actions: dict[RecipeAction, tuple[str, ...]] = {}
        cell_width = column_widths[column_index + 1]
        for action in actions:
            lines = wrap_for_pixels(action.label, cell_width, font_size, padding)
            wrapped_actions[action] = lines
            required_height = len(lines) * line_height + 2 * padding
            available_height = sum(row_heights[action.start_row : action.end_row + 1])
            if required_height > available_height:
                row_heights[action.end_row] += required_height - available_height
        action_lines.append(wrapped_actions)

    setup_lines = tuple(
        wrap_for_pixels(item, table_width, font_size, padding) for item in diagram.setup
    )
    setup_heights = tuple(len(lines) * line_height + 2 * padding for lines in setup_lines)
    title_height = max(round(104 * scale), title_font_size + 2 * padding)
    height = 2 * margin + title_height + sum(setup_heights) + sum(row_heights)

    return PngLayout(
        width=width,
        height=height,
        margin=margin,
        table_x=margin,
        table_width=table_width,
        column_widths=column_widths,
        title_height=title_height,
        setup_heights=setup_heights,
        row_heights=tuple(row_heights),
        ingredient_lines=ingredient_lines,
        setup_lines=setup_lines,
        action_lines=tuple(action_lines),
        font_size=font_size,
        title_font_size=title_font_size,
        line_height=line_height,
        padding=padding,
    )


def svg_text_lines(
    lines: tuple[str, ...],
    x: float,
    center_y: float,
    font_size: int,
    line_height: int,
    anchor: str,
    weight: int = 500,
    color: str = "#303446",
) -> str:
    """Create vertically centered SVG text elements for wrapped lines."""

    first_baseline = center_y - ((len(lines) - 1) * line_height) / 2 + font_size * 0.35
    escaped_anchor = html.escape(anchor, quote=True)
    elements = []
    for index, line in enumerate(lines):
        elements.append(
            f'<text x="{x:.1f}" y="{first_baseline + index * line_height:.1f}" '
            f'text-anchor="{escaped_anchor}" font-size="{font_size}" font-weight="{weight}" '
            f'fill="{color}">{html.escape(line)}</text>'
        )
    return "\n".join(elements)


def action_spans_boundary(actions: tuple[RecipeAction, ...], boundary_row: int) -> bool:
    return any(action.start_row < boundary_row <= action.end_row for action in actions)


def render_svg(diagram: RecipeDiagram, layout: PngLayout) -> str:
    """Render the table as SVG so rasterization retains crisp geometry and text."""

    scale = layout.width / 3840
    border = max(2, round(3 * scale))
    outer_border = max(6, round(10 * scale))
    radius = max(8, round(14 * scale))
    x_positions = [layout.table_x]
    for cell_width in layout.column_widths:
        x_positions.append(x_positions[-1] + cell_width)

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{layout.width}" height="{layout.height}" '
        f'viewBox="0 0 {layout.width} {layout.height}">',
        "<style>",
        "text { font-family: monospace; }",
        ".rule { stroke: #51576d; stroke-linecap: square; shape-rendering: geometricPrecision; }",
        "</style>",
        f'<rect width="{layout.width}" height="{layout.height}" fill="#f7f7fb"/>',
        f'<rect x="{layout.table_x}" y="{layout.margin}" width="{layout.table_width}" '
        f'height="{layout.height - 2 * layout.margin}" rx="{radius}" fill="#ffffff" stroke="#51576d" stroke-width="{border}"/>',
    ]

    y = layout.margin
    title = diagram.title
    if diagram.recipe_yield:
        title = f"{title} ({diagram.recipe_yield})"
    parts.append(
        f'<path d="M {layout.table_x + radius} {y} H {layout.table_x + layout.table_width - radius} '
        f'Q {layout.table_x + layout.table_width} {y} {layout.table_x + layout.table_width} {y + radius} '
        f'V {y + layout.title_height} H {layout.table_x} V {y + radius} '
        f'Q {layout.table_x} {y} {layout.table_x + radius} {y} Z" fill="#303446"/>'
    )
    title_lines = wrap_for_pixels(title, layout.table_width, layout.title_font_size, layout.padding)
    parts.append(
        svg_text_lines(
            title_lines,
            layout.table_x + layout.table_width / 2,
            y + layout.title_height / 2,
            layout.title_font_size,
            round(layout.title_font_size * 1.3),
            "middle",
            weight=700,
            color="#ffffff",
        )
    )
    y += layout.title_height
    parts.append(
        f'<line class="rule" x1="{layout.table_x}" y1="{y}" x2="{layout.table_x + layout.table_width}" y2="{y}" stroke-width="{border}"/>'
    )

    for lines, setup_height in zip(layout.setup_lines, layout.setup_heights, strict=True):
        parts.append(
            f'<rect x="{layout.table_x}" y="{y}" width="{layout.table_width}" height="{setup_height}" fill="#e9eaf2"/>'
        )
        parts.append(
            svg_text_lines(
                lines,
                layout.table_x + layout.table_width / 2,
                y + setup_height / 2,
                layout.font_size,
                layout.line_height,
                "middle",
                weight=600,
            )
        )
        y += setup_height
        parts.append(
            f'<line class="rule" x1="{layout.table_x}" y1="{y}" x2="{layout.table_x + layout.table_width}" y2="{y}" stroke-width="{border}"/>'
        )

    body_y = y
    row_tops = [body_y]
    for row_height in layout.row_heights:
        row_tops.append(row_tops[-1] + row_height)

    for row_index, row_height in enumerate(layout.row_heights):
        fill = "#fbfbfd" if row_index % 2 == 0 else "#f4f5f9"
        parts.append(
            f'<rect x="{x_positions[0]}" y="{row_tops[row_index]}" width="{layout.column_widths[0]}" height="{row_height}" fill="{fill}"/>'
        )

    for column_index, actions in enumerate(diagram.columns):
        for action in actions:
            action_y = row_tops[action.start_row]
            action_height = row_tops[action.end_row + 1] - action_y
            parts.append(
                f'<rect x="{x_positions[column_index + 1]}" y="{action_y}" '
                f'width="{layout.column_widths[column_index + 1]}" height="{action_height}" fill="#f0eef8"/>'
            )

    for x in x_positions[1:-1]:
        parts.append(
            f'<line class="rule" x1="{x}" y1="{body_y}" x2="{x}" y2="{row_tops[-1]}" stroke-width="{border}"/>'
        )

    for boundary_row in range(1, len(diagram.ingredients)):
        boundary_y = row_tops[boundary_row]
        parts.append(
            f'<line class="rule" x1="{x_positions[0]}" y1="{boundary_y}" x2="{x_positions[1]}" y2="{boundary_y}" stroke-width="{border}"/>'
        )
        for column_index, actions in enumerate(diagram.columns):
            if not action_spans_boundary(actions, boundary_row):
                parts.append(
                    f'<line class="rule" x1="{x_positions[column_index + 1]}" y1="{boundary_y}" '
                    f'x2="{x_positions[column_index + 2]}" y2="{boundary_y}" stroke-width="{border}"/>'
                )

    for row_index, lines in enumerate(layout.ingredient_lines):
        parts.append(
            svg_text_lines(
                lines,
                x_positions[0] + layout.padding,
                (row_tops[row_index] + row_tops[row_index + 1]) / 2,
                layout.font_size,
                layout.line_height,
                "start",
                weight=600,
            )
        )

    for column_index, actions in enumerate(diagram.columns):
        for action in actions:
            parts.append(
                svg_text_lines(
                    layout.action_lines[column_index][action],
                    (x_positions[column_index + 1] + x_positions[column_index + 2]) / 2,
                    (row_tops[action.start_row] + row_tops[action.end_row + 1]) / 2,
                    layout.font_size,
                    layout.line_height,
                    "middle",
                    weight=500,
                )
            )

    table_bottom = layout.height - layout.margin
    table_right = layout.table_x + layout.table_width
    parts.extend(
        [
            f'<rect x="{layout.table_x}" y="{layout.margin}" width="{layout.table_width}" height="{outer_border}" fill="#303446"/>',
            f'<rect x="{layout.table_x}" y="{table_bottom - outer_border}" width="{layout.table_width}" height="{outer_border}" fill="#303446"/>',
            f'<rect x="{layout.table_x}" y="{layout.margin}" width="{outer_border}" height="{table_bottom - layout.margin}" fill="#303446"/>',
            f'<rect x="{table_right - outer_border}" y="{layout.margin}" width="{outer_border}" height="{table_bottom - layout.margin}" fill="#303446"/>',
        ]
    )
    parts.append("</svg>")
    return "\n".join(parts)


def resolve_monospace_font() -> Path:
    """Find a crisp local monospace font for ImageMagick's SVG renderer."""

    configured_font = os.environ.get("RECIPE_DIAGRAM_FONT")
    candidates = [
        configured_font,
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Menlo.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    raise RecipeDiagramInputError(
        "no monospace font found; set RECIPE_DIAGRAM_FONT to a .ttf or .ttc file"
    )


def rasterize_svg(svg: str, output_path: Path) -> None:
    """Rasterize SVG to PNG with ImageMagick."""

    magick = shutil.which("magick")
    if magick is None:
        raise RecipeDiagramInputError("ImageMagick is required; install the `imagemagick` package")
    font_path = resolve_monospace_font()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".svg", encoding="utf-8", delete=False) as svg_file:
        svg_file.write(svg)
        svg_path = Path(svg_file.name)
    try:
        result = subprocess.run(
            [
                magick,
                "-font",
                str(font_path),
                str(svg_path),
                "-strip",
                "-define",
                "png:color-type=6",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip() or "unknown ImageMagick error"
            raise RecipeDiagramInputError(f"cannot rasterize PNG: {message}")
    finally:
        svg_path.unlink(missing_ok=True)


def parse_command_line() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render recipe dependency JSON as a high-resolution PNG")
    parser.add_argument("input", type=Path, help="JSON input file")
    parser.add_argument("output", type=Path, help="PNG output path")
    parser.add_argument("--width", type=int, default=3840, help="PNG width in pixels (default: 3840)")
    return parser.parse_args()


def main() -> int:
    arguments = parse_command_line()
    try:
        diagram = parse_recipe_diagram(load_recipe_document(arguments.input))
        layout = build_png_layout(diagram, arguments.width)
        rasterize_svg(render_svg(diagram, layout), arguments.output)
        print(f"Rendered {arguments.output} ({layout.width}x{layout.height})")
    except RecipeDiagramInputError as error:
        print(f"Recipe diagram PNG input error: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
