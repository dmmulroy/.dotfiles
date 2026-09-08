# Persistence

Read this reference when changed behavior reads or writes a database, cache, durable object, ORM model, or persisted record.

Also read:

- [`modules-services-and-adapters.md`](modules-services-and-adapters.md) for persistence capability ownership, Adapter design, and public contracts;
- [`parsing-and-schemas.md`](parsing-and-schemas.md) when stored data is read or its representation changes;
- [`testing.md`](testing.md) when persistence behavior changes;
- [`workflows-transactions-and-idempotency.md`](workflows-transactions-and-idempotency.md) when transaction scope, retries, or duplicate execution may change.

Define each persistence boundary around a cohesive domain capability, with table layout kept as a private implementation detail.

Treat stored rows, ORM models, and cached values as serialized input under the parsing rules. Keep queries, schema details, raw records, and ORM mechanics inside the owning persistence module.

## Representation authority

Select the codec from storage source, explicit version, or discriminator evidence before decoding. Current storage uses the current contract; identified legacy storage uses its explicit compatibility translation. Once evidence selects a representation, malformed data fails there rather than falling through to a weaker schema that drops recovery fields.

Keep the original invalid authority available for diagnosis. Migration/import commits only after all required validation succeeds. Translation may establish field types without proving cross-field or state-transition invariants; apply the owning refinement before treating a receipt or checkpoint as valid evidence. Read [workflow safety](workflows-transactions-and-idempotency.md) before changing durable intent, compensation, or uncertain outcomes.

Exercise both valid imports and corrupt/hybrid evidence through the real storage interface. Reconstructing a service over the same database proves persistence behavior, not native process eviction, alarm recovery, or production resource adoption.

## Completion check

Every changed persistence operation belongs to one cohesive domain capability; table layout, queries, schema details, raw records, and ORM mechanics remain private to the owning persistence module; every stored-data read satisfies the parsing completion check; each current/legacy path selects its representation from evidence and preserves invalid authority without partial migration writes; translated values retain required refinements; verification claims match the runtime actually exercised; and every other linked reference whose trigger applies has passed its completion check or has a reported exception with concrete evidence.