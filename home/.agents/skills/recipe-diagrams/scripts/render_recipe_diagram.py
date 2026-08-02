#!/usr/bin/env python3
"""Render a Cooking for Engineers-style recipe dependency graph as aligned ASCII."""

from __future__ import annotations

import argparse
import json
import sys
import textwrap
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ASCII_REPLACEMENTS = {
    "°": " deg ",
    "×": "x",
    "–": "-",
    "—": "-",
    "−": "-",
    "’": "'",
    "‘": "'",
    "“": '"',
    "”": '"',
    "¼": "1/4",
    "½": "1/2",
    "¾": "3/4",
    "⅓": "1/3",
    "⅔": "2/3",
    "⅛": "1/8",
    "⅜": "3/8",
    "⅝": "5/8",
    "⅞": "7/8",
}


class RecipeDiagramInputError(ValueError):
    """Reports malformed recipe diagram JSON with a searchable error prefix."""


@dataclass(frozen=True)
class RecipeAction:
    """An operation consuming one inclusive, contiguous range of ingredient rows."""

    start_row: int
    end_row: int
    label: str


@dataclass(frozen=True)
class RecipeDiagram:
    """The validated recipe process-flow table consumed by the ASCII renderer."""

    title: str
    recipe_yield: str
    setup: tuple[str, ...]
    ingredients: tuple[str, ...]
    columns: tuple[tuple[RecipeAction, ...], ...]


@dataclass(frozen=True)
class RecipeDiagramLayout:
    """Wrapped labels, row heights, and fixed column widths for one rendering."""

    column_widths: tuple[int, ...]
    row_heights: tuple[int, ...]
    ingredient_lines: tuple[tuple[str, ...], ...]
    action_lines: tuple[dict[RecipeAction, tuple[str, ...]], ...]


def ascii_recipe_text(value: str) -> str:
    """Transliterate recipe text so every rendered character is seven-bit ASCII."""

    replaced = "".join(ASCII_REPLACEMENTS.get(character, character) for character in value)
    normalized = unicodedata.normalize("NFKD", replaced)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_text.split())


def require_recipe_string(value: Any, field_name: str, allow_empty: bool = False) -> str:
    """Validate and normalize one string field from recipe diagram JSON."""

    if not isinstance(value, str):
        raise RecipeDiagramInputError(f"{field_name} must be a string")
    normalized = ascii_recipe_text(value)
    if not allow_empty and not normalized:
        raise RecipeDiagramInputError(f"{field_name} must not be empty")
    return normalized


def parse_recipe_diagram(document: Any) -> RecipeDiagram:
    """Parse and validate the complete recipe diagram JSON document."""

    if not isinstance(document, dict):
        raise RecipeDiagramInputError("top-level JSON value must be an object")

    title = require_recipe_string(document.get("title"), "title")
    recipe_yield = require_recipe_string(document.get("yield", ""), "yield", allow_empty=True)

    setup_value = document.get("setup", [])
    if not isinstance(setup_value, list):
        raise RecipeDiagramInputError("setup must be an array of strings")
    setup = tuple(
        require_recipe_string(item, f"setup[{index}]")
        for index, item in enumerate(setup_value)
    )

    ingredients_value = document.get("ingredients")
    if not isinstance(ingredients_value, list) or not ingredients_value:
        raise RecipeDiagramInputError("ingredients must be a non-empty array of strings")
    ingredients = tuple(
        require_recipe_string(item, f"ingredients[{index}]")
        for index, item in enumerate(ingredients_value)
    )

    columns_value = document.get("columns")
    if not isinstance(columns_value, list) or not columns_value:
        raise RecipeDiagramInputError("columns must be a non-empty array")

    columns: list[tuple[RecipeAction, ...]] = []
    for column_index, column_value in enumerate(columns_value):
        if not isinstance(column_value, dict):
            raise RecipeDiagramInputError(f"columns[{column_index}] must be an object")
        actions_value = column_value.get("actions", [])
        if not isinstance(actions_value, list):
            raise RecipeDiagramInputError(f"columns[{column_index}].actions must be an array")

        actions: list[RecipeAction] = []
        occupied_rows: set[int] = set()
        for action_index, action_value in enumerate(actions_value):
            action_field = f"columns[{column_index}].actions[{action_index}]"
            if not isinstance(action_value, dict):
                raise RecipeDiagramInputError(f"{action_field} must be an object")
            rows_value = action_value.get("rows")
            if (
                not isinstance(rows_value, list)
                or len(rows_value) != 2
                or any(isinstance(row, bool) or not isinstance(row, int) for row in rows_value)
            ):
                raise RecipeDiagramInputError(f"{action_field}.rows must contain two integers")
            start_row, end_row = rows_value
            if start_row < 0 or end_row < start_row or end_row >= len(ingredients):
                raise RecipeDiagramInputError(
                    f"{action_field}.rows must be an inclusive range within 0..{len(ingredients) - 1}"
                )
            action_rows = set(range(start_row, end_row + 1))
            if occupied_rows.intersection(action_rows):
                raise RecipeDiagramInputError(
                    f"{action_field}.rows overlaps another action in column {column_index}"
                )
            occupied_rows.update(action_rows)
            actions.append(
                RecipeAction(
                    start_row=start_row,
                    end_row=end_row,
                    label=require_recipe_string(action_value.get("label"), f"{action_field}.label"),
                )
            )
        columns.append(tuple(sorted(actions, key=lambda action: action.start_row)))

    return RecipeDiagram(
        title=title,
        recipe_yield=recipe_yield,
        setup=setup,
        ingredients=ingredients,
        columns=tuple(columns),
    )


def calculate_column_widths(total_width: int, process_column_count: int) -> tuple[int, ...]:
    """Allocate one ingredient width and equal process widths within total output width."""

    table_column_count = process_column_count + 1
    content_width = total_width - table_column_count - 1
    minimum_ingredient_width = 24
    minimum_process_width = 10
    minimum_content_width = minimum_ingredient_width + minimum_process_width * process_column_count
    if content_width < minimum_content_width:
        minimum_total_width = minimum_content_width + table_column_count + 1
        raise RecipeDiagramInputError(
            f"diagram width {total_width} is too narrow; use --width {minimum_total_width} or greater"
        )

    ingredient_width = min(44, max(minimum_ingredient_width, int(content_width * 0.38)))
    remaining_width = content_width - ingredient_width
    process_width, extra_width = divmod(remaining_width, process_column_count)
    widths = [ingredient_width]
    widths.extend(
        process_width + (1 if index < extra_width else 0)
        for index in range(process_column_count)
    )
    return tuple(widths)


def wrap_recipe_label(label: str, width: int) -> tuple[str, ...]:
    """Wrap one ASCII label without breaking words unless a word exceeds the cell width."""

    wrapped = textwrap.wrap(
        label,
        width=width,
        break_long_words=True,
        break_on_hyphens=False,
        replace_whitespace=True,
        drop_whitespace=True,
    )
    return tuple(wrapped or [""])


def build_recipe_layout(diagram: RecipeDiagram, total_width: int) -> RecipeDiagramLayout:
    """Compute wrapped cell content and enough row height for every merged action."""

    column_widths = calculate_column_widths(total_width, len(diagram.columns))
    ingredient_lines = tuple(
        wrap_recipe_label(ingredient, column_widths[0]) for ingredient in diagram.ingredients
    )
    row_heights = [len(lines) for lines in ingredient_lines]

    action_lines: list[dict[RecipeAction, tuple[str, ...]]] = []
    for column_index, actions in enumerate(diagram.columns):
        process_width = column_widths[column_index + 1]
        wrapped_actions: dict[RecipeAction, tuple[str, ...]] = {}
        for action in actions:
            lines = wrap_recipe_label(action.label, process_width)
            wrapped_actions[action] = lines
            available_height = sum(row_heights[action.start_row : action.end_row + 1])
            if len(lines) > available_height:
                row_heights[action.end_row] += len(lines) - available_height
        action_lines.append(wrapped_actions)

    return RecipeDiagramLayout(
        column_widths=column_widths,
        row_heights=tuple(row_heights),
        ingredient_lines=ingredient_lines,
        action_lines=tuple(action_lines),
    )


def find_row_action(actions: tuple[RecipeAction, ...], row_index: int) -> RecipeAction | None:
    """Find the merged action occupying one process-column row, if present."""

    for action in actions:
        if action.start_row <= row_index <= action.end_row:
            return action
    return None


def center_cell_text(text: str, width: int) -> str:
    """Center text in one fixed-width ASCII table cell."""

    return text.center(width)


def render_horizontal_border(widths: tuple[int, ...], fill: str = "-") -> str:
    """Render a full table border using one ASCII fill character."""

    return "+" + "+".join(fill * width for width in widths) + "+"


def render_merged_separator(
    diagram: RecipeDiagram,
    layout: RecipeDiagramLayout,
    boundary_row: int,
) -> str:
    """Render a row boundary while leaving active row-spanning action cells open."""

    segments = ["-" * layout.column_widths[0]]
    for column_index, actions in enumerate(diagram.columns):
        spanning_boundary = any(
            action.start_row < boundary_row <= action.end_row for action in actions
        )
        fill = " " if spanning_boundary else "-"
        segments.append(fill * layout.column_widths[column_index + 1])
    return "+" + "+".join(segments) + "+"


def action_line_for_row(
    action: RecipeAction,
    wrapped_lines: tuple[str, ...],
    row_index: int,
    line_index: int,
    row_heights: tuple[int, ...],
) -> str:
    """Place a merged action label at the vertical center of its complete row range."""

    total_height = sum(row_heights[action.start_row : action.end_row + 1])
    top_padding = (total_height - len(wrapped_lines)) // 2
    lines_before_row = sum(row_heights[action.start_row:row_index])
    merged_line_index = lines_before_row + line_index
    label_line_index = merged_line_index - top_padding
    if 0 <= label_line_index < len(wrapped_lines):
        return wrapped_lines[label_line_index]
    return ""


def render_recipe_diagram(diagram: RecipeDiagram, total_width: int) -> str:
    """Render and internally verify one complete aligned ASCII recipe diagram."""

    layout = build_recipe_layout(diagram, total_width)
    widths = layout.column_widths
    lines: list[str] = []

    title = diagram.title
    if diagram.recipe_yield:
        title = f"{title} ({diagram.recipe_yield})"
    title_lines = wrap_recipe_label(title, total_width - 2)

    lines.append(render_horizontal_border(widths))
    for title_line in title_lines:
        lines.append("|" + center_cell_text(title_line, total_width - 2) + "|")
    lines.append(render_horizontal_border(widths))

    for setup_line in diagram.setup:
        for wrapped_setup_line in wrap_recipe_label(setup_line, total_width - 2):
            lines.append("|" + center_cell_text(wrapped_setup_line, total_width - 2) + "|")
        lines.append(render_horizontal_border(widths))

    for row_index in range(len(diagram.ingredients)):
        ingredient_row_lines = layout.ingredient_lines[row_index]
        for line_index in range(layout.row_heights[row_index]):
            ingredient_text = (
                ingredient_row_lines[line_index]
                if line_index < len(ingredient_row_lines)
                else ""
            )
            cells = [ingredient_text.ljust(widths[0])]
            for column_index, actions in enumerate(diagram.columns):
                action = find_row_action(actions, row_index)
                action_text = ""
                if action is not None:
                    action_text = action_line_for_row(
                        action,
                        layout.action_lines[column_index][action],
                        row_index,
                        line_index,
                        layout.row_heights,
                    )
                cells.append(center_cell_text(action_text, widths[column_index + 1]))
            lines.append("|" + "|".join(cells) + "|")

        if row_index < len(diagram.ingredients) - 1:
            lines.append(render_merged_separator(diagram, layout, row_index + 1))

    lines.append(render_horizontal_border(widths))
    validate_rendered_diagram(lines, total_width)
    return "\n".join(lines)


def validate_rendered_diagram(lines: list[str], expected_width: int) -> None:
    """Reject renderer output containing non-ASCII characters or misaligned lines."""

    for line_number, line in enumerate(lines, start=1):
        if len(line) != expected_width:
            raise RuntimeError(
                f"Recipe diagram renderer error: line {line_number} has width {len(line)}, expected {expected_width}"
            )
        if not line.isascii():
            raise RuntimeError(
                f"Recipe diagram renderer error: line {line_number} contains a non-ASCII character"
            )


def load_recipe_document(input_path: Path) -> Any:
    """Load recipe diagram JSON from a named file or standard input."""

    try:
        if str(input_path) == "-":
            return json.load(sys.stdin)
        with input_path.open("r", encoding="utf-8") as input_file:
            return json.load(input_file)
    except (OSError, json.JSONDecodeError) as error:
        raise RecipeDiagramInputError(f"cannot read {input_path}: {error}") from error


def parse_command_line() -> argparse.Namespace:
    """Parse the recipe diagram renderer command-line arguments."""

    parser = argparse.ArgumentParser(
        description="Render recipe dependency JSON as an aligned ASCII process-flow table."
    )
    parser.add_argument("input", type=Path, help="JSON input file, or - for standard input")
    parser.add_argument(
        "--width",
        type=int,
        default=120,
        help="exact output width in ASCII characters (default: 120)",
    )
    return parser.parse_args()


def main() -> int:
    """Run the recipe diagram ASCII renderer command-line program."""

    arguments = parse_command_line()
    try:
        document = load_recipe_document(arguments.input)
        diagram = parse_recipe_diagram(document)
        print(render_recipe_diagram(diagram, arguments.width))
    except RecipeDiagramInputError as error:
        print(f"Recipe diagram input error: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
