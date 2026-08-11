---
name: recipe-diagrams
description: "Recipe diagrams: convert any recipe into a high-resolution Cooking for Engineers-style PNG process-flow table with aligned ingredient streams, preparation branches, joins, temperatures, timings, and finish steps. Use when the user asks for a recipe diagram."
compatibility: Requires Python 3 and ImageMagick.
disable-model-invocation: true
---

# Recipe diagrams

Convert the recipe into a dependency graph, then render that graph as a high-resolution Cooking for Engineers-style PNG table. Read the table left to right: ingredient rows are streams, columns are stages, and vertically merged action cells are joins.

## Steps

1. **Normalize the source.** Read the complete recipe, including yield, ingredient headings, ingredient preparation, numbered method, notes that alter execution, and any linked source the user supplied. Preserve quantities, equipment, temperatures, times, sensory completion cues, resting/cooling, and serving steps. The source is normalized when every execution-relevant source statement has one prospective home in the diagram.

2. **Build the dependency graph.** Separate global setup from ingredient streams and operations. Treat an ingredient's inline preparation (for example, `onion, diced`) as an operation unless it is purchased in that state. Split an ingredient into labeled portions when the source uses it at different stages. Keep independent preparations in the same column when order does not matter; place dependent operations in later columns. The graph is complete when every ingredient reaches every operation that consumes it and all operations lead to the finished result.

3. **Make the graph planar.** Order ingredient rows so every operation consumes one contiguous row range. Each later join spans the complete ranges of the intermediates it combines. Add columns until actions in one column have disjoint row ranges. The layout is complete when no action range is discontinuous and no two action ranges overlap within a column.

4. **Encode the layout.** Write a temporary JSON file using the schema below. Keep labels imperative and compact, but retain execution details. Use plain strings; the renderer transliterates symbols to ASCII.

```json
{
  "title": "Recipe name",
  "yield": "about 10 servings",
  "setup": [
    "Butter and flour a loaf pan",
    "Preheat oven to 350 deg F (170 deg C)"
  ],
  "ingredients": [
    "2 large (250 g) ripe bananas",
    "6 Tbsp (90 mL) butter"
  ],
  "columns": [
    {
      "actions": [
        { "rows": [0, 0], "label": "mash" },
        { "rows": [1, 1], "label": "melt" }
      ]
    },
    {
      "actions": [
        { "rows": [0, 1], "label": "mix until smooth" }
      ]
    }
  ]
}
```

`rows` is an inclusive, zero-based ingredient-row range. A blank stage cell means that stream carries forward unchanged. A cell spanning several rows consumes those ingredients or the intermediates already produced from them. Put pan preparation, preheating, and other recipe-wide prerequisites in `setup`; put cooking, cooling, garnishing, and serving in action columns at their actual dependency point.

5. **Audit before rendering.** Compare the JSON against the source. Verify every ingredient and portion, every operation, all ordering constraints, and all execution details exactly once. Preserve genuine alternatives in the relevant label. Mark source uncertainty with `[?]` and explain it after the diagram rather than inventing a resolution. The audit is complete only when every source item is accounted for.

6. **Render, inspect, and return.** Resolve `scripts/render_recipe_diagram_png.py` relative to this `SKILL.md`, then run:

```bash
python3 scripts/render_recipe_diagram_png.py /tmp/recipe-diagram.json /tmp/recipe-diagram.png --width 3840
```

The renderer creates a 4K-wide PNG with an adaptive height, a local monospaced font, graphical borders, wrapped labels, and true vertically merged action cells. Set `RECIPE_DIAGRAM_FONT` to a `.ttf` or `.ttc` file to override the detected font. If the table is unusually dense, increase `--width`; do not alter the dependency graph merely to fit a chat viewport.

Open the generated PNG and inspect it before returning. Verify that the complete outer border is visible, text stays inside its cells, no labels overlap or clip, joins and row boundaries are unambiguous, and the image remains legible when scaled down. Return the PNG as an image attachment or clear file link rather than pasting an ASCII table. If `[?]` appears, follow the image with a short `Uncertainties` list. The output is complete when rasterization succeeds, the image is at least 3840 pixels wide, and visual inspection confirms crisp text and borders.
