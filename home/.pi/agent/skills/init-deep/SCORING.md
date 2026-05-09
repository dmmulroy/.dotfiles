# Scoring Matrix

## Factors

| Factor | Weight | High Threshold | How to Measure |
|--------|--------|----------------|----------------|
| File count | 3× | >20 | `find <dir> -type f \| wc -l` |
| Subdir count | 2× | >5 | `find <dir> -maxdepth 1 -type d \| wc -l` |
| Code ratio | 2× | >70% code files | extension analysis |
| Unique patterns | 1× | Has own config files | find config files |
| Module boundary | 2× | Has index.ts/\_\_init\_\_.py/mod.rs | `find <dir> -maxdepth 1 -name "index.*"` |
| Symbol density | 2× | >30 exported symbols | `rg "^export" <dir> \| wc -l` |
| Export count | 2× | >10 exports | grep exports |
| Reference density | 3× | >20 cross-dir imports | `rg "from ['\"]\.\./" <dir> \| wc -l` |

## Scoring without LSP

Pi doesn't have LSP tools. Substitute with grep-based analysis:

```bash
# Symbol density (replaces LspDocumentSymbols)
rg "^(export |pub |def |class |fn |func )" <dir> --type-add 'code:*.{ts,tsx,js,py,go,rs,lua}' -t code -c 2>/dev/null | awk -F: '{sum+=$2} END {print sum}'

# Export count (replaces LspWorkspaceSymbols)
rg "^export " <dir> --type-add 'code:*.{ts,tsx,js}' -t code -c 2>/dev/null | awk -F: '{sum+=$2} END {print sum}'

# Reference centrality (replaces LspFindReferences)
# Count how many OTHER directories import from this one
rg "from ['\"].*$(basename <dir>)" . --type-add 'code:*.{ts,tsx,js}' -t code -l 2>/dev/null | grep -v "<dir>" | wc -l
```

## Decision Rules

| Score | Action |
|-------|--------|
| **Root (.)** | ALWAYS create |
| **>15** | Create AGENTS.md |
| **8–15** | Create only if distinct domain (different conventions, own config, clear boundary) |
| **<8** | Skip — parent covers it |

## Scale-Adaptive Analysis

Adjust analysis depth based on project size:

| Project Scale | Files | Analysis Approach |
|---------------|-------|-------------------|
| **Small** | <50 | Single bash pass, maybe 1 AGENTS.md (root only) |
| **Medium** | 50–200 | Full scoring, expect 2–4 AGENTS.md files |
| **Large** | 200–1000 | Deep analysis, expect 5–10 AGENTS.md files |
| **Monorepo** | >1000 | Per-package analysis, each package scored independently |

For large projects, batch the grep analysis — run one `rg` across the whole tree and parse results per-directory, rather than N separate `rg` calls.
