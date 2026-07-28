# Comments and JSDoc

Every exported JavaScript or TypeScript symbol has JSDoc at its original declaration. A concise comment is sufficient when it states the sharpest caller-visible fact the signature cannot show. Use additional prose or tags only for further constraints, expected failures, side effects, ownership, invariants, trade-offs, non-obvious domain rules, or safety justifications.

Names, public documentation, UI copy, and rendered errors use durable vocabulary appropriate to their audience. Use ordinary domain phrases readers are likely to search for when those phrases differ from an identifier's spelling. Keep ticket names, migration phases, internal storage fields, framework mechanics, and planning language in internal implementation or planning material.

Public methods and properties of an exported class also require JSDoc. Document private/internal code when safe maintenance depends on a non-obvious purpose, invariant, domain rule, side effect, trade-off, or safety justification.

Document each original declaration once; re-exports rely on that documentation. Write explicit documentation in place of inheritance tags such as `@inheritDoc`.

Attach `/** ... */` JSDoc directly to its declaration. Include tags when they add caller-relevant information:

```ts
/**
 * Parse and validate an email address at an external input boundary.
 *
 * @param input - Raw input received from outside the application.
 * @returns A validated email address, or `InvalidEmailAddress` when validation fails.
 */
export function parseEmailAddress(input: string): Result<EmailAddress, InvalidEmailAddress>;
```

Add `@template` when a type parameter has a role or constraint the signature does not make clear:

```ts
/**
 * Map the success value of a result while preserving its error channel.
 *
 * @template E - Error channel preserved without invoking `fn`.
 * @param fn - Transforms the success value; it is skipped when `result` contains an error.
 * @returns A result containing the transformed success value or the original error.
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;
```

Reserve `@throws` for unrecoverable defects, framework-required behavior, and temporary `notYetImplemented` paths. Describe expected typed errors in `@returns` or the operation's documented outcomes.

Document exported object fields whose semantics extend beyond their names and types:

```ts
/** Options that bound and identify an outbound request. */
export type RequestOptions = {
  /** Total request budget, including connection setup and retries. */
  readonly timeout: Duration;

  /** Correlation identifier forwarded unchanged to downstream services. */
  readonly correlationId: CorrelationId;
};
```

## Completion check

Complete when every applicable rule above has been checked: every exported symbol and public class member has useful JSDoc on its original declaration; concise comments state the sharpest fact the signature cannot show and longer comments earn their additional detail; re-exports rely on the original declaration; inherited public members have explicit documentation; non-obvious exported fields and private/internal behavior are documented; `@throws` is reserved for the listed defect paths; comments add meaning beyond the code and include searchable ordinary domain phrases when identifier spelling differs; and public language uses durable, audience-appropriate vocabulary while internal implementation and planning terms stay internal.