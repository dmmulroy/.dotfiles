# Imports, exports, and files

## Imports and exports

Import directly from the file that owns an abstraction. Use re-export layers and barrels only as intentional package or public entrypoints.

Use named imports for self-describing exported operations, classes, and focused shared helpers:

```ts
import { parseEmailAddress } from "./email-address";
import { PasswordReset } from "./password-reset";
```

Import related Domain Module operations through a namespace when the module follows an established canonical API and the namespace preserves useful ownership at call sites.

Use `import type` and `export type` for type-only imports and exports.

Use static imports for ordinary dependencies. Use dynamic `import()` at lazy-loading, optional-runtime, plugin, or code-splitting boundaries. Resolve ordinary dependency timing and cycles through the static module structure.

Export only what callers should use. Keep internal helpers private and test through public interfaces. When changed behavior makes an exported name inaccurate or changes its audience, rename it in the same change and update every caller.

Use ES modules for application-owned grouping. Reserve a TypeScript `namespace` for required interop.

## Files and helpers

Give each file a searchable subject that identifies what it owns. Prefer concept- or domain-qualified names over generic role names when the role alone would collide or hide ownership:

```txt
email-address.ts
billing-period.ts
string-case.ts
array.ts
```

A shared generic helper file has an explicit stable subject. A helper may move there as soon as its meaning is generic and stable; a second consumer is useful evidence, not a prerequisite. Keep each family with its subject:

- exhaustive and exceptional-control-flow helpers such as `casesHandled`, `shouldNeverHappen`, and `notYetImplemented`;
- sensitive-value wrappers such as `Redacted`;
- tagged-union type operations such as `Tags`, `ExtractTag`, and `ExcludeTag`;
- common `Result` operations when the repository uses neither Effect nor `better-result`;
- genuinely broad type operations.

Domain and application policy stay with their owning modules.

A file owns one cohesive concept or capability. It may contain related operations and private helpers that share that owner. Split unrelated concepts; keep helpers that make sense only inside one concept with their owner. Use cohesion and discoverability rather than file-size limits.

## Completion check

Complete when every applicable rule above has been checked: imports point directly to owners and exported operations remain self-describing unless an established canonical namespace carries ownership; re-exports serve intentional public entrypoints; type-only edges use type-only syntax; dynamic imports serve a loading or runtime boundary; exports expose only caller-facing behavior and stale names change with their behavior or audience; internal helpers are tested through public interfaces; TypeScript namespaces satisfy a required interop constraint; files and shared helpers have searchable stable subjects; domain and application policy remain with their owners; and each changed file owns one cohesive concept or capability.