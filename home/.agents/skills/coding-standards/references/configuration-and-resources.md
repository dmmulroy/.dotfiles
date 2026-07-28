# Configuration and resources

At startup or the earliest composition boundary, read environment and runtime configuration once, parse it into typed values, and pass those values inward.

Apply [`errors.md`](errors.md) to configuration failures and [`sensitive-data-and-observability.md`](sensitive-data-and-observability.md) to credentials and other sensitive configuration. For Effect configuration, resources, time, or randomness, apply [`effect.md`](effect.md) and every matching branch.

Entrypoints/bootstrap own top-level side effects and each resource's acquisition, lifetime, and release. Keep every other module's imports inert: start servers, open connections, read environment variables, register handlers, and perform top-level I/O only in true entrypoints.

Confine mutable singleton/global state to framework boundaries. Define constants and pure lookup tables as ordinary values.

Make time and randomness explicit dependencies. Dependency-bearing modules consume runtime clock and random capabilities; pure domain functions accept concrete timestamps or generated values.

## Completion check

Every environment and configuration source is read at startup or the earliest composition boundary and parsed once into typed values; every known configuration failure remains typed until the startup boundary produces a non-sensitive failure outcome; every acquired resource has one explicit owner and is released on success, failure, and cancellation or interruption; every non-entrypoint import is inert; mutable singleton/global state stays at a framework boundary; and time and randomness enter dependency-bearing modules as explicit capabilities and pure functions as concrete values.