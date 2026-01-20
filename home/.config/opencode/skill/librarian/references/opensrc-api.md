# opensrc API Reference

## Tool

Use the **opensrc MCP server** via single tool:

| Tool | Purpose |
|------|---------|
| `opensrc_execute` | All operations (fetch, read, grep, files, remove, etc.) |

Takes a `code` parameter: JavaScript async arrow function executed server-side. Source trees stay on server, only results return.

## API Surface

### Read Operations

```typescript
// List all fetched sources
opensrc.list(): Source[]

// Check if source exists
opensrc.has(name: string, version?: string): boolean

// Get source metadata
opensrc.get(name: string): Source | undefined

// List files with optional glob
opensrc.files(sourceName: string, glob?: string): Promise<FileEntry[]>

// Get directory tree structure (default depth: 3)
opensrc.tree(sourceName: string, options?: { depth?: number }): Promise<TreeNode>

// Regex search file contents
opensrc.grep(pattern: string, options?: GrepOptions): Promise<GrepResult[]>

// AST-based semantic code search
opensrc.astGrep(sourceName: string, pattern: string, options?: AstGrepOptions): Promise<AstGrepMatch[]>

// Read single file
opensrc.read(sourceName: string, filePath: string): Promise<string>

// Batch read multiple files (supports globs!)
opensrc.readMany(sourceName: string, paths: string[]): Promise<Record<string, string>>

// Parse fetch spec
opensrc.resolve(spec: string): Promise<ParsedSpec>
```

### Mutation Operations

```typescript
// Fetch packages/repos
opensrc.fetch(specs: string | string[], options?: { modify?: boolean }): Promise<FetchedSource[]>

// Remove sources
opensrc.remove(names: string[]): Promise<RemoveResult>

// Clean by type
opensrc.clean(options?: CleanOptions): Promise<RemoveResult>
```

## Types

### Source

```typescript
interface Source {
  type: "npm" | "pypi" | "crates" | "repo";
  name: string;           // Use this for all subsequent calls
  version?: string;
  ref?: string;
  path: string;
  fetchedAt: string;
  repository: string;
}
```

### FetchedSource

```typescript
interface FetchedSource {
  source: Source;         // IMPORTANT: use source.name for subsequent calls
  alreadyExists: boolean;
}
```

### GrepOptions

```typescript
interface GrepOptions {
  sources?: string[];     // Filter to specific sources
  include?: string;       // File glob pattern (e.g., "*.ts")
  maxResults?: number;    // Limit results (default: 100)
}
```

### GrepResult

```typescript
interface GrepResult {
  source: string;
  file: string;
  line: number;
  content: string;
}
```

### AstGrepOptions

```typescript
interface AstGrepOptions {
  glob?: string;            // File glob pattern (e.g., "**/*.ts")
  lang?: string | string[]; // Language(s): "js", "ts", "tsx", "html", "css"
  limit?: number;           // Max results (default: 1000)
}
```

### AstGrepMatch

```typescript
interface AstGrepMatch {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  text: string;                       // Matched code text
  metavars: Record<string, string>;   // Captured $VAR → text
}
```

#### AST Pattern Syntax

| Pattern | Matches |
|---------|---------|
| `$NAME` | Single node, captures to metavars |
| `$$$ARGS` | Zero or more nodes (variadic), captures |
| `$_` | Single node, no capture |
| `$$$` | Zero or more nodes, no capture |

### FileEntry

```typescript
interface FileEntry {
  path: string;
  size: number;
  isDirectory: boolean;
}
```

### TreeNode

```typescript
interface TreeNode {
  name: string;
  type: "file" | "dir";
  children?: TreeNode[];  // only for dirs
}
```

### CleanOptions

```typescript
interface CleanOptions {
  packages?: boolean;
  repos?: boolean;
  npm?: boolean;
  pypi?: boolean;
  crates?: boolean;
}
```

### RemoveResult

```typescript
interface RemoveResult {
  success: boolean;
  removed: string[];
}
```

## Error Handling

Operations throw on errors. Wrap in try/catch if needed:

```javascript
async () => {
  try {
    const content = await opensrc.read("zod", "missing.ts");
    return content;
  } catch (e) {
    return { error: e.message };
  }
}
```

`readMany` returns errors as string values prefixed with `[Error:`:

```javascript
const files = await opensrc.readMany("zod", ["exists.ts", "missing.ts"]);
// { "exists.ts": "content...", "missing.ts": "[Error: ENOENT...]" }

// Filter successful reads
const successful = Object.entries(files)
  .filter(([_, content]) => !content.startsWith("[Error:"));
```

## Package Spec Formats

| Format | Example | Source Name After Fetch |
|--------|---------|------------------------|
| `<name>` | `"zod"` | `"zod"` |
| `<name>@<version>` | `"zod@3.22.0"` | `"zod"` |
| `pypi:<name>` | `"pypi:requests"` | `"requests"` |
| `crates:<name>` | `"crates:serde"` | `"serde"` |
| `owner/repo` | `"vercel/ai"` | `"github.com/vercel/ai"` |
| `owner/repo@ref` | `"vercel/ai@v1.0.0"` | `"github.com/vercel/ai"` |
| `gitlab:owner/repo` | `"gitlab:org/repo"` | `"gitlab.com/org/repo"` |

## Critical Pattern

**Always capture `source.name` from fetch results:**

```javascript
async () => {
  const [{ source }] = await opensrc.fetch("vercel/ai");
  
  // GitHub repos: "vercel/ai" → "github.com/vercel/ai"
  const sourceName = source.name;
  
  // Use sourceName for ALL subsequent calls
  const files = await opensrc.files(sourceName, "src/**/*.ts");
  return files;
}
```
