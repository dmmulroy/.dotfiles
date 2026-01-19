# Tool Routing

## Decision Flowchart

```mermaid
graph TD
    Q[User Query] --> T{Query Type?}
    T -->|Understand/Explain| U[UNDERSTAND]
    T -->|Find/Search| F[FIND]
    T -->|Explore/Architecture| E[EXPLORE]
    T -->|Compare| C[COMPARE]
    
    U --> U1{Known library?}
    U1 -->|Yes| U2[context7.resolve-library-id]
    U2 --> U3[context7.query-docs]
    U3 --> U4{Need source?}
    U4 -->|Yes| U5[opensrc.fetch → read]
    U1 -->|No| U6[grep_app → opensrc.fetch]
    
    F --> F1{Specific repo?}
    F1 -->|Yes| F2[opensrc.fetch → grep → read]
    F1 -->|No| F3[grep_app broad search]
    F3 --> F4[opensrc.fetch interesting repos]
    
    E --> E1[opensrc.fetch]
    E1 --> E2[opensrc.files]
    E2 --> E3[Read entry points]
    E3 --> E4[Create diagram]
    
    C --> C1["opensrc.fetch([X, Y])"]
    C1 --> C2[grep same pattern]
    C2 --> C3[Read comparable files]
    C3 --> C4[Synthesize comparison]
```

## Query Type Detection

| Keywords | Query Type | Start With |
|----------|------------|------------|
| "how does", "why does", "explain", "purpose of" | UNDERSTAND | context7 |
| "find", "where is", "implementations of", "examples of" | FIND | grep_app |
| "explore", "walk through", "architecture", "structure" | EXPLORE | opensrc |
| "compare", "vs", "difference between" | COMPARE | opensrc |

## UNDERSTAND Queries

```
Known library? → context7.resolve-library-id → context7.query-docs
                 └─ Need source? → opensrc.fetch → read

Unknown?      → grep_app search → opensrc.fetch top result → read
```

**When to transition context7 → opensrc:**
- Need implementation details (not just API docs)
- Question about internals/private methods
- Tracing code flow through library

## FIND Queries

```
Specific repo? → opensrc.fetch → opensrc.grep → read matches

Broad search?  → grep_app → analyze → opensrc.fetch interesting repos
```

**grep_app query tips:**
- Use literal code patterns: `useState(` not "react hooks"
- Filter by language: `language: ["TypeScript"]`
- Narrow by repo: `repo: "vercel/"` for org

## EXPLORE Queries

```
1. opensrc.fetch(target)
2. opensrc.files → understand structure
3. Identify entry points: README, package.json, src/index.*
4. Read entry → internals
5. Create architecture diagram
```

## COMPARE Queries

```
1. opensrc.fetch([X, Y])
2. Extract source.name from each result
3. opensrc.grep same pattern in both
4. Read comparable files
5. Synthesize → comparison table
```

## Tool Capabilities

| Tool | Best For | Not For |
|------|----------|---------|
| **grep_app** | Broad search, unknown scope, finding repos | Semantic queries |
| **context7** | Library APIs, best practices, common patterns | Library internals |
| **opensrc** | Deep exploration, reading internals, tracing flow | Initial discovery |

## Anti-patterns

| Don't | Do |
|-------|-----|
| grep_app for known library docs | context7 first |
| opensrc.fetch before knowing target | grep_app to discover |
| Multiple small reads | opensrc.readMany batch |
| Describe without linking | Link every file ref |
| Text for complex relationships | Mermaid diagram |
| Use tool names in responses | "I'll search..." not "I'll use opensrc" |
