# Effect configuration

This reference covers Effect `Config` recipes, providers, and config-backed Layers. For configuration ownership, startup failure handling, and resource lifecycle, also apply [`configuration-and-resources.md`](configuration-and-resources.md).

Install environment-backed providers at the composition root, then read typed runtime configuration through Effect `Config` recipes.

```ts
export const dataDirectoryConfig = Config.schema(
  AbsolutePath,
  "APP_DATA_DIR",
)

export const layerFromEnvironment = Layer.effect(
  Configuration.Service,
  Effect.gen(function* () {
    const apiKey = yield* Config.redacted("API_KEY")
    const optionalModel = yield* Config.option(Config.string("MODEL"))
    const enabled = yield* Config.boolean("FEATURE_ENABLED").pipe(
      Config.withDefault(false),
    )

    return Configuration.Service.of({ apiKey, optionalModel, enabled })
  }),
)
```

## Config Recipes

- `Config<T>` is yieldable and reads the current `ConfigProvider` reference.
- The default provider is `ConfigProvider.fromEnv()`.
- Use `Config.redacted(...)` for credentials.
- Use `Config.schema(...)` or `Config.mapOrFail(...)` for refined values.
- Use `Config.option(...)` for semantic absence.
- Use `Config.withDefault(...)` for missing-data defaults only; malformed values still fail.
- `Config.orElse(...)` catches any config parse failure; use it when every such failure should select the fallback.
- Use `Config.unwrap(...)` / `Config.Wrap<T>` for `layerConfig(...)` helpers.

## Providers

- Use `ConfigProvider.layer(provider)` to replace the active provider for an app or suite.
- Use `ConfigProvider.layerAdd(provider)` for fallbacks; pass `{ asPrimary: true }` when the added provider must override the current provider.
- Use `ConfigProvider.fromEnv(...)` for environment variables.
- Use `ConfigProvider.constantCase` when camelCase schema keys should read `SCREAMING_SNAKE_CASE` env vars.
- Use `ConfigProvider.nested(...)` to scope a provider under a prefix.

For tests that supply configuration, follow [`effect-testing.md#config-in-tests`](effect-testing.md#config-in-tests).

## Layer Config Helpers

A `layerConfig(options: Config.Wrap<Options>)` helper earns its place when callers need to compose runtime `Config` recipes. Keep `layer(options)` as the concrete constructor for callers that already have decoded options.

```ts
export const layerConfig = (
  config: Config.Wrap<ClientOptions>,
) =>
  Layer.effect(
    Client.Service,
    Config.unwrap(config).pipe(
      Effect.flatMap(makeClient),
      Effect.map((client) => Client.Service.of(client)),
    ),
  )
```

Expose only the constructor forms required by actual callers.

## Completion check

Every runtime value is decoded through a typed `Config` recipe; credentials use `Config.redacted`; defaults distinguish missing values from malformed values; every `Config.orElse` fallback intentionally covers all parse failures; provider replacement, fallback, and precedence are explicit; every `layerConfig` has a caller that composes `Config` recipes; and configuration tests follow the linked testing strategy.
