# HTML Template Reference

This documents the exact CSS framework, component library, and JavaScript used to generate walkthrough slide decks. Every walkthrough must use this system to ensure visual consistency.

## Document Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[MR/PR ID] Walkthrough — [Short Title]</title>
  <style>/* All CSS inline — see below */</style>
</head>
<body>
  <!-- Top navigation bar -->
  <div class="topbar">...</div>
  <!-- Progress bar -->
  <div class="progress-track"><div class="progress-fill" id="progress"></div></div>
  <!-- Slides -->
  <main>
    <section class="slide active" id="slide-1">...</section>
    <section class="slide" id="slide-2">...</section>
    <!-- ... more slides ... -->
  </main>
  <!-- Keyboard hint -->
  <div class="keyboard-hint">...</div>
  <script>/* Navigation JS — see below */</script>
</body>
</html>
```

## CSS Design System

### Color Tokens

```css
:root {
  --bg: #0d1117;           /* Page background */
  --surface: #161b22;      /* Card/component background */
  --surface2: #1c2129;     /* Elevated surface */
  --border: #30363d;       /* Borders */
  --text: #e6edf3;         /* Primary text */
  --text-muted: #8b949e;   /* Secondary text */
  --accent: #58a6ff;       /* Links, info, neutral highlights */
  --green: #3fb950;        /* Positive: improvements, additions, success */
  --red: #f85149;          /* Negative: problems, removals, errors */
  --orange: #d29922;       /* Warnings, caution */
  --purple: #bc8cff;       /* Architecture, WASM, structural elements */
  --pink: #f778ba;         /* Boundaries, interfaces */
  --cyan: #39d353;         /* Tertiary accent */
  --font-mono: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
}
```

### Semantic Color Usage

| Color | Use for |
|-------|---------|
| `--green` | Improvements, new code, success metrics, positive outcomes |
| `--red` | Problems, removed code, errors, the "before" state pain points |
| `--accent` (blue) | Neutral info, links, labels, info callouts |
| `--orange` | Warnings, review findings, caution callouts |
| `--purple` | Architecture layers, structural concepts, WASM/system boundaries |
| `--pink` | Interface boundaries, FFI crossings |
| `--text-muted` | Descriptions, secondary labels, diagram annotations |

## Component Library

### Top Bar

Fixed navigation bar with MR/PR badge, title, prev/next buttons, and slide counter.

```html
<div class="topbar">
  <div class="topbar-left">
    <span class="mr-badge">MR !13</span>  <!-- or "PR #42" for GitHub -->
    <h1>Short Title — Visual Walkthrough</h1>
  </div>
  <div class="topbar-right">
    <button class="nav-btn" onclick="prev()">← Prev</button>
    <span class="nav-counter" id="counter">1 / 10</span>
    <button class="nav-btn" onclick="next()">Next →</button>
  </div>
</div>
<div class="progress-track"><div class="progress-fill" id="progress"></div></div>
```

### Slides

Each slide is a `<section>` with consistent padding and max-width. Only one is visible at a time.

```html
<section class="slide" id="slide-N">
  <p class="label" style="color: var(--accent);">SECTION LABEL</p>
  <h2>Slide Title</h2>
  <p class="subtitle">Optional subtitle for context</p>
  <!-- Content: cards, diagrams, code, stats, etc. -->
</section>
```

Every slide starts with a colored `.label` (uppercase, small) that categorizes it (e.g., "Background", "The Problem", "Push Path"), followed by a large `h2` title.

### Stat Cards

For quantitative results. Use a 2- or 3-column grid.

```html
<div class="stat-grid">
  <div class="stat stat-green">
    <div class="stat-value">−68%</div>
    <div class="stat-label">Transfer Size</div>
  </div>
  <div class="stat stat-accent">
    <div class="stat-value">−19%</div>
    <div class="stat-label">Clone Time</div>
  </div>
  <div class="stat stat-purple">
    <div class="stat-value">0</div>
    <div class="stat-label">Server CPU Cost</div>
  </div>
</div>
```

Stat variants: `.stat-green`, `.stat-accent`, `.stat-purple`. The `.stat-value` is large monospace (36px, 800 weight).

### Cards

Generic content containers. Use `.card-row` for 2-column and `.card-row-3` for 3-column layouts.

```html
<div class="card-row">
  <div class="card">
    <h3>Card Title</h3>
    <p>Card content...</p>
  </div>
  <div class="card">
    <h3>Card Title</h3>
    <p>Card content...</p>
  </div>
</div>
```

### Code Blocks

Syntax-highlighted with semantic span classes. Never use raw diff format — annotate with `+`/`-` markers and comments.

```html
<pre><code><span class="cm">// Comment explaining context</span>
<span class="kw">pub const</span> PackEntry = <span class="kw">struct</span> {
    obj_type: ObjectType,
    hash: [<span class="num">40</span>]<span class="ty">u8</span>,
    data: []<span class="ty">u8</span>,
<span class="add">+   delta_base_hash: ?[40]u8 = null,   // new field!</span>
<span class="del">-   // this line was removed</span>
};</code></pre>
```

Syntax classes:
- `.kw` — keywords (red: `#ff7b72`)
- `.fn` — function names (purple: `#d2a8ff`)
- `.str` — strings (blue: `#a5d6ff`)
- `.cm` — comments (muted, italic: `#8b949e`)
- `.ty` — types (blue: `#79c0ff`)
- `.num` — numbers (blue: `#79c0ff`)
- `.add` — added lines (green: `var(--green)`)
- `.del` — removed lines (red: `var(--red)`)

For inline code references in prose: `<span class="inline-code">functionName</span>`

### Callout Boxes

Three variants for key information:

```html
<!-- Info (blue) — background knowledge, insights -->
<div class="callout callout-info">
  <span class="callout-icon">💡</span>
  <div class="callout-body"><strong>Key insight:</strong> explanation here.</div>
</div>

<!-- Warning (orange) — gotchas, review findings -->
<div class="callout callout-warn">
  <span class="callout-icon">⚠️</span>
  <div class="callout-body"><strong>Warning:</strong> explanation here.</div>
</div>

<!-- Success (green) — positive outcomes, design wins -->
<div class="callout callout-success">
  <span class="callout-icon">✅</span>
  <div class="callout-body"><strong>Result:</strong> explanation here.</div>
</div>
```

### SVG Diagrams

All diagrams are inline SVGs inside a `.diagram` container. Use consistent styling:

```html
<div class="diagram">
  <svg width="900" height="320" viewBox="0 0 900 320">
    <!-- Boxes: rounded rects with fill + stroke from the palette -->
    <rect x="30" y="50" width="160" height="70" rx="8"
          fill="#1a3a5c" stroke="#264d73"/>
    <!-- Text: centered in boxes -->
    <text x="110" y="80" fill="#e6edf3" font-size="13"
          font-weight="600" text-anchor="middle">Component Name</text>
    <!-- Arrows: lines with markers -->
    <line x1="190" y1="85" x2="280" y2="85"
          stroke="#58a6ff" stroke-width="2" marker-end="url(#arrow)"/>
    <!-- Arrow marker definition (one per SVG) -->
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8" fill="none" stroke="currentColor" stroke-width="1.5"/>
      </marker>
    </defs>
  </svg>
  <div class="diagram-label">Caption describing the diagram</div>
</div>
```

**Box color conventions for diagrams:**

| Component Type | Fill | Stroke |
|---------------|------|--------|
| Client / External | `#1a3a5c` | `#264d73` |
| Server / Processing | `#3d2e0a` | `#6b4f1a` |
| WASM / Boundary | `#2d1f4e` | `#4a3578` |
| TypeScript / Bridge | `#0d2948` | `#1a4a7a` |
| Storage / Database | `#1a3320` | `#2a5435` |
| Error / Removed | `#f8514920` | `#f85149` (dashed) |

Use `stroke-dasharray="4"` for error/removed/optional elements.

### Flow Steps

Numbered step-by-step walkthrough with connecting lines:

```html
<div class="flow-container">
  <div class="flow-step">
    <div class="flow-num">1</div>
    <div class="flow-line"></div>
    <div class="flow-content">
      <h4>Step Title</h4>
      <p>Explanation of what happens at this step.</p>
      <pre><code><!-- Optional: code snippet for this step --></code></pre>
    </div>
  </div>
  <div class="flow-step">
    <div class="flow-num">2</div>
    <!-- Omit .flow-line on the last step -->
    <div class="flow-content">
      <h4>Step Title</h4>
      <p>Explanation.</p>
    </div>
  </div>
</div>
```

### Layer Stack

Vertical stack showing architectural layers with arrows between them:

```html
<div class="layer-stack">
  <div class="layer layer-git">
    <span class="layer-label">🌐 Git Protocol <span class="layer-tech">— protocol.zig</span></span>
    <span style="font-size:12px; color: var(--accent);">What changed in this layer</span>
  </div>
  <div class="layer-arrow">↕</div>
  <div class="layer layer-zig">
    <span class="layer-label">📦 Pack Parser <span class="layer-tech">— pack.zig</span></span>
    <span style="font-size:12px; color: var(--orange);">What changed in this layer</span>
  </div>
  <!-- ... more layers ... -->
</div>
```

Layer variants: `.layer-git`, `.layer-zig`, `.layer-wasm`, `.layer-ts`, `.layer-kv`

For PRs in other tech stacks, create analogous layer classes using the box color conventions above. Map them semantically: the "outermost" layer (API, protocol) uses the client colors, processing uses server colors, boundaries use WASM colors, etc.

### File List

Summary of files changed with badges and descriptions:

```html
<ul class="file-list">
  <li>
    <span class="file-badge badge-zig">Zig</span>
    <code>src/pack.zig</code>
    <span class="file-desc">Description of changes</span>
  </li>
  <li>
    <span class="file-badge badge-ts">TS</span>
    <code>worker/src/storage.ts</code>
    <span class="file-desc">Description of changes</span>
  </li>
</ul>
```

Badge variants: `.badge-zig` (orange), `.badge-ts` (blue), `.badge-wasm` (purple). Create new badge variants for other languages using the same pattern:

```css
.badge-py { background: #3572A522; color: #3572A5; }    /* Python */
.badge-rs { background: #dea58422; color: #dea584; }    /* Rust */
.badge-go { background: #00ADD822; color: #00ADD8; }    /* Go */
.badge-rb { background: #CC342D22; color: #CC342D; }    /* Ruby */
.badge-java { background: #b0731122; color: #b07311; }  /* Java */
.badge-kt { background: #A97BFF22; color: #A97BFF; }    /* Kotlin */
.badge-swift { background: #F0523522; color: #F05235; }  /* Swift */
.badge-js { background: #f1e05a22; color: #f1e05a; }    /* JavaScript */
.badge-css { background: #563d7c22; color: #563d7c; }   /* CSS */
.badge-html { background: #e34c2622; color: #e34c26; }  /* HTML */
.badge-sql { background: #e38c0022; color: #e38c00; }   /* SQL */
.badge-sh { background: #89e05122; color: #89e051; }    /* Shell */
.badge-yml { background: #cb171e22; color: #cb171e; }   /* YAML/Config */
.badge-json { background: #29283622; color: #e6edf3; }  /* JSON */
.badge-md { background: #08345522; color: #083455; }    /* Markdown */
.badge-proto { background: #58a6ff22; color: #58a6ff; } /* Protobuf/gRPC */
.badge-tf { background: #5C4EE522; color: #5C4EE5; }   /* Terraform */
.badge-docker { background: #384d5422; color: #384d54; }/* Docker */
```

### Review Items

For displaying reviewer feedback:

```html
<div class="review-item">
  <span class="severity severity-warn">⚠️ Performance</span>
  <p><strong>Finding title</strong> — description of the issue and suggested fix.</p>
</div>
<div class="review-item">
  <span class="severity severity-nit">💬 Nit</span>
  <p><strong>Finding title</strong> — minor suggestion.</p>
</div>
```

### Comparison Table

For before/after comparisons:

```html
<table class="compare-table">
  <tr>
    <th>Metric</th><th>Before</th><th>After</th><th>Change</th>
  </tr>
  <tr>
    <td>Transfer size</td>
    <td class="before">62 KB</td>
    <td class="after">20 KB</td>
    <td class="change">−68%</td>
  </tr>
</table>
```

## JavaScript

The navigation JS is always the same. Include it at the bottom of `<body>`:

```javascript
const slides = document.querySelectorAll('.slide');
let current = 0;

function show(n) {
  slides[current].classList.remove('active');
  current = Math.max(0, Math.min(n, slides.length - 1));
  slides[current].classList.add('active');
  document.getElementById('counter').textContent = `${current + 1} / ${slides.length}`;
  document.getElementById('progress').style.width = `${((current + 1) / slides.length) * 100}%`;
  window.scrollTo(0, 0);
}

function next() { show(current + 1); }
function prev() { show(current - 1); }

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
  if (e.key === 'Home') { e.preventDefault(); show(0); }
  if (e.key === 'End') { e.preventDefault(); show(slides.length - 1); }
});

// Touch/swipe support
let touchStartX = 0;
document.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; });
document.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].screenX - touchStartX;
  if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
});

show(0);
```

## Full CSS

Include all of the following CSS. Adapt and extend — don't remove base styles.

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  overflow-x: hidden;
}

/* ── Top nav ── */
.topbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  background: rgba(13, 17, 23, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 32px; height: 56px;
}
.topbar-left { display: flex; align-items: center; gap: 16px; }
.topbar-left .mr-badge {
  background: var(--accent); color: var(--bg);
  font-weight: 700; font-size: 13px; padding: 3px 10px; border-radius: 12px;
}
.topbar-left h1 { font-size: 15px; font-weight: 600; }
.topbar-right { display: flex; gap: 8px; }
.nav-btn {
  background: var(--surface); border: 1px solid var(--border); color: var(--text);
  padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
  transition: all 0.15s;
}
.nav-btn:hover { background: var(--surface2); border-color: var(--accent); }
.nav-counter {
  color: var(--text-muted); font-size: 13px; font-family: var(--font-mono);
  min-width: 60px; text-align: center;
}

/* ── Progress bar ── */
.progress-track {
  position: fixed; top: 56px; left: 0; right: 0; height: 3px;
  background: var(--surface); z-index: 99;
}
.progress-fill {
  height: 100%; background: linear-gradient(90deg, var(--accent), var(--purple));
  transition: width 0.4s ease;
}

/* ── Main content ── */
main { padding-top: 80px; }
.slide {
  display: none; min-height: calc(100vh - 80px);
  padding: 48px 32px 64px;
  max-width: 1100px; margin: 0 auto;
  animation: fadeIn 0.3s ease;
}
.slide.active { display: block; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Typography ── */
h2 { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
h3 { font-size: 20px; font-weight: 600; margin-bottom: 12px; color: var(--accent); }
h4 { font-size: 16px; font-weight: 600; margin: 20px 0 8px; }
p { color: var(--text-muted); font-size: 15px; margin-bottom: 16px; line-height: 1.7; }
p strong { color: var(--text); }
.subtitle { font-size: 18px; color: var(--text-muted); margin-bottom: 32px; }
.label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1.2px; margin-bottom: 6px;
}

/* ── Cards ── */
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 24px; margin-bottom: 20px;
}
.card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.card-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 20px; }

/* ── Stat blocks ── */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
.stat {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 20px; text-align: center;
}
.stat-value { font-size: 36px; font-weight: 800; font-family: var(--font-mono); }
.stat-label {
  font-size: 12px; color: var(--text-muted); margin-top: 4px;
  text-transform: uppercase; letter-spacing: 1px;
}
.stat-green .stat-value { color: var(--green); }
.stat-accent .stat-value { color: var(--accent); }
.stat-purple .stat-value { color: var(--purple); }

/* ── Code blocks ── */
pre {
  background: #0d1117; border: 1px solid var(--border);
  border-radius: 8px; padding: 16px 20px; overflow-x: auto;
  font-family: var(--font-mono); font-size: 13px; line-height: 1.7;
  margin-bottom: 16px;
}
code { font-family: var(--font-mono); font-size: 13px; }
.kw { color: #ff7b72; }
.fn { color: #d2a8ff; }
.str { color: #a5d6ff; }
.cm { color: #8b949e; font-style: italic; }
.ty { color: #79c0ff; }
.num { color: #79c0ff; }
.add { color: var(--green); }
.del { color: var(--red); }
.inline-code {
  background: var(--surface2); padding: 2px 7px; border-radius: 4px;
  font-family: var(--font-mono); font-size: 13px; color: var(--accent);
}

/* ── Diagrams ── */
.diagram {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 32px; margin: 24px 0;
  overflow-x: auto;
}
.diagram svg { display: block; margin: 0 auto; }
.diagram-label {
  text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 12px;
}

/* ── File tree ── */
.file-list { list-style: none; }
.file-list li {
  padding: 10px 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 12px; font-size: 14px;
}
.file-list li:last-child { border-bottom: none; }
.file-badge {
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.badge-zig { background: #f7a41d22; color: #f7a41d; }
.badge-ts { background: #3178c622; color: #3178c6; }
.badge-wasm { background: #654ff022; color: #bc8cff; }

/* ── Flow steps ── */
.flow-container { position: relative; margin: 32px 0; }
.flow-step {
  display: flex; align-items: flex-start; gap: 20px;
  margin-bottom: 4px; position: relative;
}
.flow-num {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--accent); color: var(--bg);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 14px; flex-shrink: 0;
  position: relative; z-index: 2;
}
.flow-line {
  position: absolute; left: 17px; top: 36px; bottom: -4px;
  width: 2px; background: var(--border);
}
.flow-content { flex: 1; padding-bottom: 24px; }
.flow-content h4 { margin: 4px 0 6px; font-size: 15px; color: var(--text); }
.flow-content p { font-size: 14px; margin-bottom: 0; }

/* ── Comparison table ── */
.compare-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
.compare-table th {
  text-align: left; padding: 10px 16px; font-size: 12px;
  text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);
  border-bottom: 2px solid var(--border);
}
.compare-table td {
  padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 14px;
}
.compare-table .before { color: var(--text-muted); }
.compare-table .after { color: var(--green); font-weight: 600; }
.compare-table .change { color: var(--accent); font-family: var(--font-mono); font-size: 13px; }

/* ── Callout boxes ── */
.callout {
  border-radius: 8px; padding: 16px 20px; margin: 16px 0;
  display: flex; gap: 12px; align-items: flex-start;
}
.callout-icon { font-size: 18px; flex-shrink: 0; margin-top: 2px; }
.callout-body { font-size: 14px; color: var(--text); }
.callout-body strong { color: var(--text); }
.callout-info { background: #58a6ff15; border-left: 3px solid var(--accent); }
.callout-warn { background: #d2992215; border-left: 3px solid var(--orange); }
.callout-success { background: #3fb95015; border-left: 3px solid var(--green); }

/* ── Layer stack ── */
.layer-stack { display: flex; flex-direction: column; gap: 2px; margin: 20px 0; }
.layer {
  display: flex; align-items: center; padding: 14px 20px;
  border-radius: 8px; font-size: 14px; font-weight: 600;
}
.layer-label { flex: 1; }
.layer-tech { font-size: 12px; color: rgba(255,255,255,0.6); font-weight: 400; }
.layer-arrow { text-align: center; color: var(--text-muted); font-size: 18px; padding: 2px 0; }
.layer-git { background: linear-gradient(135deg, #1a3a5c, #1a2840); border: 1px solid #264d73; }
.layer-zig { background: linear-gradient(135deg, #3d2e0a, #2a1f08); border: 1px solid #6b4f1a; }
.layer-wasm { background: linear-gradient(135deg, #2d1f4e, #1f1535); border: 1px solid #4a3578; }
.layer-ts { background: linear-gradient(135deg, #0d2948, #0a1e36); border: 1px solid #1a4a7a; }
.layer-kv { background: linear-gradient(135deg, #1a3320, #0f2215); border: 1px solid #2a5435; }

/* ── Review items ── */
.review-item {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px 20px; margin-bottom: 12px;
}
.review-item .severity {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  padding: 2px 8px; border-radius: 4px; display: inline-block; margin-bottom: 8px;
}
.severity-warn { background: #d2992230; color: var(--orange); }
.severity-nit { background: #58a6ff20; color: var(--accent); }
.review-item p { margin-bottom: 0; font-size: 14px; }

/* ── Keyboard hints ── */
.keyboard-hint {
  position: fixed; bottom: 24px; right: 32px;
  color: var(--text-muted); font-size: 12px;
  display: flex; gap: 16px; align-items: center;
}
.keyboard-hint kbd {
  background: var(--surface); border: 1px solid var(--border);
  padding: 2px 8px; border-radius: 4px; font-family: var(--font-mono); font-size: 11px;
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .card-row, .card-row-3 { grid-template-columns: 1fr; }
  .stat-grid { grid-template-columns: 1fr; }
  .slide { padding: 32px 16px 48px; }
  h2 { font-size: 24px; }
}
```
