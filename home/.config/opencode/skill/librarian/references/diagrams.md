# Mermaid Diagram Patterns

Create diagrams for:
- Architecture (component relationships)
- Data flow (request → response)
- Dependencies (import graph)
- Sequences (step-by-step processes)

## Architecture

```mermaid
graph TD
    A[Client] --> B[API Gateway]
    B --> C[Auth Service]
    B --> D[Data Service]
    D --> E[(Database)]
```

## Flow

```mermaid
flowchart LR
    Input --> Parse --> Validate --> Transform --> Output
```

## Sequence

```mermaid
sequenceDiagram
    Client->>+Server: Request
    Server->>+DB: Query
    DB-->>-Server: Result
    Server-->>-Client: Response
```

## When to Use

| Type | Use For |
|------|---------|
| `graph TD` | Component hierarchy, dependencies |
| `flowchart LR` | Data transformation, pipelines |
| `sequenceDiagram` | Request/response, multi-party interaction |
| `classDiagram` | Type relationships, inheritance |
| `stateDiagram` | State machines, lifecycle |

## Tips

- Keep nodes short (3-4 words max)
- Use subgraphs for grouping related components
- Arrow labels for relationship types
- Prefer LR (left-right) for flows, TD (top-down) for hierarchies
