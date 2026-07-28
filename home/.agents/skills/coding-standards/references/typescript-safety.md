# TypeScript safety

## Strictness and immutable values

New or changed TypeScript configurations enable:

- `strict: true`;
- `noUncheckedIndexedAccess: true`;
- `exactOptionalPropertyTypes: true`;
- `noImplicitOverride: true`;
- `noFallthroughCasesInSwitch: true`.

A legacy configuration that cannot adopt a listed flag within the changed behavior keeps the exception scoped to that configuration and records the blocking compiler diagnostics and migration boundary.

Prefer immutable values:

```ts
type CreateUserInput = {
  readonly email: EmailAddress;
  readonly roles: ReadonlyArray<Role>;
};
```

Localize mutation inside imperative shell code, performance-sensitive internals, builders, or Adapters and hide it behind a precise interface.

Exported interface methods and public class methods have explicit return types. Exported functions that return an object, union, or collection also state that return type explicitly. Write a concise return type inline; introduce a named exported result contract when its name adds domain meaning or the contract is reused. Derive the contract from an owning runtime schema instead of duplicating schema and handwritten types. Local callbacks and unexported helpers use inference when their declarations preserve the complete contract.

## Casts, `any`, and non-null assertions

Resolve uncertain values with branching, parsing, refinement, or a more precise type. Reserve `any` and `as Type` for invariants TypeScript cannot express. `as const` is ordinary and needs no justification.

Highly generic helpers, branding internals, interop boundaries, and combinators may need a cast because TypeScript cannot express the invariant. Every non-`as const` cast includes a Rust-like safety comment:

```ts
// SAFETY: TypeScript cannot express the brand. parseEmailAddress checked the normalized string before branding. Callers cannot construct EmailAddress except through this parser.
return normalized as EmailAddress;
```

A necessary `any` includes a targeted lint suppression and justification:

```ts
// oxlint-disable-next-line no-explicit-any -- SAFETY: This helper preserves arbitrary function parameters; TypeScript cannot express this variadic constraint without any.
type Fn = (...args: any[]) => unknown;
```

Branch, parse, or refine optional values so required values are present before use.

## Completion check

Changed source compiles under the repository's strict settings. Every new or changed TypeScript configuration enables all listed flags, or each scoped legacy exception records its blocking diagnostics and migration boundary. Mutable state is contained. Exported interface methods, public class methods, and exported functions returning objects, unions, or collections have explicit return types; a named exported result contract adds domain meaning or serves more than one declaration, and derives from an owning schema where one exists. Every non-`as const` cast has a valid safety comment, every `any` has a targeted lint suppression and safety justification, and no changed non-null assertion remains.