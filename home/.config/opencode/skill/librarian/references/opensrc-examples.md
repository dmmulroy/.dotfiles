# opensrc Code Examples

## Workflow: Fetch → Explore

### Basic Fetch and Explore with tree()

```javascript
async () => {
  const [{ source }] = await opensrc.fetch("vercel/ai");
  // Get directory structure first
  const tree = await opensrc.tree(source.name, { depth: 2 });
  return tree;
}
```

### Fetch and Read Key Files

```javascript
async () => {
  const [{ source }] = await opensrc.fetch("vercel/ai");
  const sourceName = source.name; // "github.com/vercel/ai"
  
  const files = await opensrc.readMany(sourceName, [
    "package.json",
    "README.md", 
    "src/index.ts"
  ]);
  
  return { sourceName, files };
}
```

### readMany with Globs

```javascript
async () => {
  const [{ source }] = await opensrc.fetch("zod");
  // Read all package.json files in monorepo
  const files = await opensrc.readMany(source.name, [
    "packages/*/package.json"  // globs supported!
  ]);
  return Object.keys(files);
}
```

### Batch Fetch Multiple Packages

```javascript
async () => {
  const results = await opensrc.fetch(["zod", "valibot", "yup"]);
  const names = results.map(r => r.source.name);
  
  // Compare how each handles string validation
  const comparisons = {};
  for (const name of names) {
    const matches = await opensrc.grep("string.*validate|validateString", { 
      sources: [name], 
      include: "*.ts",
      maxResults: 10 
    });
    comparisons[name] = matches.map(m => `${m.file}:${m.line}`);
  }
  return comparisons;
}
```

## Search Patterns

### Grep → Read Context

```javascript
async () => {
  const matches = await opensrc.grep("export function parse\\(", { 
    sources: ["zod"], 
    include: "*.ts" 
  });
  
  if (matches.length === 0) return "No matches";
  
  const match = matches[0];
  const content = await opensrc.read(match.source, match.file);
  const lines = content.split("\n");
  
  // Return 40 lines starting from match
  return {
    file: match.file,
    code: lines.slice(match.line - 1, match.line + 39).join("\n")
  };
}
```

### Search Across All Fetched Sources

```javascript
async () => {
  const sources = opensrc.list();
  const results = {};
  
  for (const source of sources) {
    const errorHandling = await opensrc.grep("throw new|catch \\(|\\.catch\\(", {
      sources: [source.name],
      include: "*.ts",
      maxResults: 20
    });
    results[source.name] = {
      type: source.type,
      errorPatterns: errorHandling.length
    };
  }
  
  return results;
}
```

## AST-Based Search

Use `astGrep` for semantic code search with pattern matching.

### Find Function Declarations

```javascript
async () => {
  const [{ source }] = await opensrc.fetch("lodash");
  
  const fns = await opensrc.astGrep(source.name, "function $NAME($$$ARGS) { $$$BODY }", {
    lang: "js",
    limit: 20
  });
  
  return fns.map(m => ({
    file: m.file,
    line: m.line,
    name: m.metavars.NAME
  }));
}
```

### Find React Hooks Usage

```javascript
async () => {
  const [{ source }] = await opensrc.fetch("vercel/ai");
  
  const stateHooks = await opensrc.astGrep(
    source.name,
    "const [$STATE, $SETTER] = useState($$$INIT)",
    { lang: ["ts", "tsx"], limit: 50 }
  );
  
  return stateHooks.map(m => ({
    file: m.file,
    state: m.metavars.STATE,
    setter: m.metavars.SETTER
  }));
}
```

### Find Class Definitions with Context

```javascript
async () => {
  const [{ source }] = await opensrc.fetch("zod");
  
  const classes = await opensrc.astGrep(source.name, "class $NAME", {
    glob: "**/*.ts"
  });
  
  const details = [];
  for (const cls of classes.slice(0, 5)) {
    const content = await opensrc.read(source.name, cls.file);
    const lines = content.split("\n");
    details.push({
      name: cls.metavars.NAME,
      file: cls.file,
      preview: lines.slice(cls.line - 1, cls.line + 9).join("\n")
    });
  }
  return details;
}
```

### Compare Export Patterns Across Libraries

```javascript
async () => {
  const results = await opensrc.fetch(["zod", "valibot"]);
  const names = results.map(r => r.source.name);
  
  const exports = {};
  for (const name of names) {
    const matches = await opensrc.astGrep(name, "export const $NAME = $_", {
      lang: "ts",
      limit: 30
    });
    exports[name] = matches.map(m => m.metavars.NAME);
  }
  return exports;
}
```

### grep vs astGrep

| Use Case | Tool |
|----------|------|
| Text/regex pattern | `grep` |
| Function declarations | `astGrep`: `function $NAME($$$) { $$$ }` |
| Arrow functions | `astGrep`: `const $N = ($$$) => $_` |
| Class definitions | `astGrep`: `class $NAME extends $PARENT` |
| Import statements | `astGrep`: `import { $$$IMPORTS } from "$MOD"` |
| JSX components | `astGrep`: `<$COMP $$$PROPS />` |

## Repository Exploration

### Find Entry Points

```javascript
async () => {
  const name = "github.com/vercel/ai";
  
  const allFiles = await opensrc.files(name, "**/*.{ts,js}");
  const entryPoints = allFiles.filter(f => 
    f.path.match(/^(src\/)?(index|main|mod)\.(ts|js)$/) ||
    f.path.includes("/index.ts")
  );
  
  // Read all entry points
  const contents = {};
  for (const ep of entryPoints.slice(0, 5)) {
    contents[ep.path] = await opensrc.read(name, ep.path);
  }
  
  return { 
    totalFiles: allFiles.length,
    entryPoints: entryPoints.map(f => f.path),
    contents 
  };
}
```

### Explore Package Structure

```javascript
async () => {
  const name = "zod";
  
  // Get all TypeScript files
  const tsFiles = await opensrc.files(name, "**/*.ts");
  
  // Group by directory
  const byDir = {};
  for (const f of tsFiles) {
    const dir = f.path.split("/").slice(0, -1).join("/") || ".";
    byDir[dir] = (byDir[dir] || 0) + 1;
  }
  
  // Read key files
  const pkg = await opensrc.read(name, "package.json");
  const readme = await opensrc.read(name, "README.md");
  
  return {
    structure: byDir,
    package: JSON.parse(pkg),
    readmePreview: readme.slice(0, 500)
  };
}
```

## Batch Operations

### Read Many with Error Handling

```javascript
async () => {
  const files = await opensrc.readMany("zod", [
    "src/index.ts",
    "src/types.ts",
    "src/ZodError.ts",
    "src/helpers/parseUtil.ts"
  ]);
  
  // files is Record<string, string> - errors start with "[Error:"
  const successful = Object.entries(files)
    .filter(([_, content]) => !content.startsWith("[Error:"))
    .map(([path, content]) => ({ path, lines: content.split("\n").length }));
  
  return successful;
}
```

### Parallel Grep Across Multiple Sources

```javascript
async () => {
  const targets = ["zod", "valibot"];
  const pattern = "export (type|interface)";
  
  const results = await Promise.all(
    targets.map(async (name) => {
      const matches = await opensrc.grep(pattern, {
        sources: [name],
        include: "*.ts",
        maxResults: 50
      });
      return { name, count: matches.length, matches };
    })
  );
  
  return results;
}
```

## Workflow Checklist

### Comprehensive Repository Analysis

```
Repository Analysis Progress:
- [ ] 1. Fetch repository
- [ ] 2. Read package.json + README
- [ ] 3. Identify entry points (src/index.*)
- [ ] 4. Read main entry file
- [ ] 5. Map exports and public API
- [ ] 6. Trace key functionality
- [ ] 7. Create architecture diagram
```

### Library Comparison

```
Comparison Progress:
- [ ] 1. Fetch all libraries
- [ ] 2. Grep for target pattern in each
- [ ] 3. Read matching implementations
- [ ] 4. Create comparison table
- [ ] 5. Synthesize findings
```
