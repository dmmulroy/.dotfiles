# Workflows, transactions, and idempotency

Use an ordinary call when an operation requires no atomic state change. Use a database transaction when changes within one datastore must commit or roll back together.

Use a saga or durable workflow when progress must survive process loss or redelivery, or the operation requires long delays, compensation, resumability, timers, human approval, cross-service coordination, or multiple transaction boundaries.

Retry ownership and durability follow the operation's authority, side-effect safety, and required lifetime. Project and domain design determine the concrete arrangement.

Close database transactions before network calls or long-running work.

Require an explicit idempotency strategy when an operation has a real duplicate-execution path through retries, redelivery, workflow resumption, concurrent submission, or repeated external requests. Choose the strategy at the layer that owns duplication and record it in the design:

- an idempotency key when a caller can provide a stable identity for repeated requests;
- a natural unique constraint when duplicates violate an existing uniqueness invariant;
- a deduplication record when a redelivered message or event has a stable identity;
- a state-machine transition guard when the current state determines whether the mutation may run;
- a transactional outbox when a state change and intent to publish must be recorded atomically;
- a transactional inbox when message deduplication and the resulting state change must commit atomically.

For every retried side effect, state the guarantee that makes repeated execution safe, such as stable-key deduplication, a uniqueness constraint, or a guarded state transition.

## Completion check

Every changed operation is assigned to an ordinary call, database transaction, or durable workflow using the criteria above; every database transaction closes before network or long-running work; every retry's owner and durability match the operation's authority, side-effect safety, and required lifetime; every retried side effect has a stated repeated-execution guarantee; and every real duplicate-execution path has a recorded idempotency strategy at the layer that owns it.