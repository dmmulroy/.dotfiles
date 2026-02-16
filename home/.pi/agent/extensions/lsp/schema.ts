import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { LspConfigFile, LspServerConfig } from "./types.js";

const PositiveInt = Type.Integer({ minimum: 1 });

export const LspServerConfigSchema = Type.Object(
  {
    disabled: Type.Optional(Type.Boolean()),
    command: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
    extensions: Type.Optional(Type.Array(Type.String())),
    env: Type.Optional(Type.Record(Type.String(), Type.String())),
    initialization: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    roots: Type.Optional(Type.Array(Type.String())),
    excludeRoots: Type.Optional(Type.Array(Type.String())),
    rootMode: Type.Optional(Type.Union([Type.Literal("workspace-or-marker"), Type.Literal("marker-only")])),
  },
  { additionalProperties: false },
);

export const LspSecurityConfigSchema = Type.Object(
  {
    projectConfigPolicy: Type.Optional(
      Type.Union([
        Type.Literal("trusted-only"),
        Type.Literal("always"),
        Type.Literal("never"),
      ]),
    ),
    trustedProjectRoots: Type.Optional(Type.Array(Type.String())),
    allowExternalPaths: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const LspTimingConfigSchema = Type.Object(
  {
    requestTimeoutMs: Type.Optional(PositiveInt),
    diagnosticsWaitTimeoutMs: Type.Optional(PositiveInt),
    initializeTimeoutMs: Type.Optional(PositiveInt),
  },
  { additionalProperties: false },
);

export const LspConfigFileSchema = Type.Object(
  {
    lsp: Type.Optional(
      Type.Union([
        Type.Literal(false),
        Type.Record(Type.String(), LspServerConfigSchema),
      ]),
    ),
    security: Type.Optional(LspSecurityConfigSchema),
    timing: Type.Optional(LspTimingConfigSchema),
  },
  { additionalProperties: false },
);

export type LspServerConfigSchemaType = Static<typeof LspServerConfigSchema>;
export type LspSecurityConfigSchemaType = Static<typeof LspSecurityConfigSchema>;
export type LspTimingConfigSchemaType = Static<typeof LspTimingConfigSchema>;
export type LspConfigFileSchemaType = Static<typeof LspConfigFileSchema>;

export const DEFAULT_LSP_TIMING = {
  requestTimeoutMs: 10_000,
  diagnosticsWaitTimeoutMs: 3_000,
  initializeTimeoutMs: 15_000,
} as const;

export const DEFAULT_LSP_SECURITY = {
  projectConfigPolicy: "trusted-only",
  trustedProjectRoots: [] as string[],
  allowExternalPaths: false,
} as const;

export const DEFAULT_SERVER_CONFIG: Required<Pick<LspServerConfig, "extensions" | "env" | "initialization" | "roots" | "excludeRoots" | "rootMode">> = {
  extensions: [],
  env: {},
  initialization: {},
  roots: [],
  excludeRoots: [],
  rootMode: "workspace-or-marker",
};

export interface ValidationFailure {
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: ValidationFailure[];
}

export function validateLspConfig(value: unknown): ValidationResult<LspConfigFile> {
  if (Value.Check(LspConfigFileSchema, value)) {
    return {
      ok: true,
      value: value as LspConfigFile,
      errors: [],
    };
  }

  const errors: ValidationFailure[] = [];
  for (const error of Value.Errors(LspConfigFileSchema, value)) {
    errors.push({
      path: error.path || "/",
      message: error.message,
    });
  }

  return {
    ok: false,
    errors,
  };
}
