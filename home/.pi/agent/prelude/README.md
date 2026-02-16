# Prelude

Shared helpers used across local Pi extensions.

## Modules

- `environment.ts`
  - `getHomeDir()`
  - `toHomeRelativePath(path, homeDir?)`
- `model.ts`
  - `getModelDisplayName(model, fallback)`
  - `getModelProviderName(model, fallback?)`
- `extension-status.ts`
  - `shouldHideExtensionStatus(statusKey, value)`
  - `isBracketStatusLine(value)`
- `ui/`
  - Shared ANSI + layout + box helpers (see `ui/README.md`)

Use from extensions with relative imports, e.g.:

```ts
import { getModelDisplayName } from "../../prelude/model.js";
```
