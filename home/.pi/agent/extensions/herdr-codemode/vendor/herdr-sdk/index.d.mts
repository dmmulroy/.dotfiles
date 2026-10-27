import { Config, Context, Duration, Effect, Layer, Option, Result, Schema, Scope, Stream } from "effect";
import { Buffer } from "node:buffer";
//#region src/herdr-errors.d.ts
declare const HerdrConfigurationError_base: Schema.Class<HerdrConfigurationError, Schema.TaggedStruct<"HerdrConfigurationError", {
  readonly operation: Schema.Literal<"loadHerdrConfig">;
  readonly message: Schema.String;
  readonly cause: Schema.Defect;
}>, import("effect/Cause").YieldableError>;
/**
 * Failure to decode or resolve Herdr SDK configuration.
 *
 * @category errors
 * @since 0.8.2
 */
declare class HerdrConfigurationError extends HerdrConfigurationError_base {
  /** Creates a safe configuration failure while retaining the diagnostic cause. */
  constructor(cause: unknown);
}
declare const HerdrInvalidInput_base: Schema.Class<HerdrInvalidInput, Schema.TaggedStruct<"HerdrInvalidInput", {
  readonly operation: Schema.String;
  readonly message: Schema.String;
  readonly cause: Schema.Defect;
}>, import("effect/Cause").YieldableError>;
/**
 * Failure to parse caller input into the domain value required by one SDK operation.
 *
 * @category errors
 * @since 0.8.2
 */
declare class HerdrInvalidInput extends HerdrInvalidInput_base {
  /** Creates an input parse failure at a named public operation boundary. */
  constructor(operation: string, cause: unknown);
}
declare const HerdrTransportError_base: Schema.Class<HerdrTransportError, Schema.TaggedStruct<"HerdrTransportError", {
  readonly operation: Schema.Literals<readonly ["request", "compatibility_check", "event_subscription", "ssh_agent_registration"]>;
  readonly reason: Schema.Literals<readonly ["connect", "read", "write", "premature_close"]>;
  readonly requestId: Schema.String;
  readonly message: Schema.String;
  readonly cause: Schema.Defect;
}>, import("effect/Cause").YieldableError>;
/**
 * Local Unix-socket connection, read, write, or premature-close failure.
 *
 * @category errors
 * @since 0.8.2
 */
declare class HerdrTransportError extends HerdrTransportError_base {
  /** Creates a classified transport failure with its wire correlation identifier. */
  constructor(operation: HerdrTransportError["operation"], reason: HerdrTransportError["reason"], requestId: string, cause: unknown);
}
declare const HerdrRequestTimeout_base: Schema.Class<HerdrRequestTimeout, Schema.TaggedStruct<"HerdrRequestTimeout", {
  readonly operation: Schema.Literals<readonly ["request", "compatibility_check", "event_subscription", "ssh_agent_registration"]>;
  readonly requestId: Schema.String;
  readonly timeoutMilliseconds: Schema.Finite;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/**
 * Local deadline elapsed before a Herdr operation completed.
 *
 * @category errors
 * @since 0.8.2
 */
declare class HerdrRequestTimeout extends HerdrRequestTimeout_base {
  /** Creates a local deadline failure without classifying fiber interruption as a timeout. */
  constructor(operation: HerdrRequestTimeout["operation"], requestId: string, timeoutMilliseconds: number);
}
declare const HerdrInvalidResponse_base: Schema.Class<HerdrInvalidResponse, Schema.TaggedStruct<"HerdrInvalidResponse", {
  readonly reason: Schema.Literals<readonly ["malformed_json", "oversized_frame", "correlation_mismatch", "schema_mismatch", "missing_result", "unsupported_value"]>;
  readonly requestId: Schema.String;
  readonly message: Schema.String;
  readonly cause: Schema.Defect;
}>, import("effect/Cause").YieldableError>;
/**
 * Malformed, oversized, mismatched, or schema-invalid Herdr response.
 *
 * @category errors
 * @since 0.8.2
 */
declare class HerdrInvalidResponse extends HerdrInvalidResponse_base {
  /** Creates a classified response-boundary failure. */
  constructor(reason: HerdrInvalidResponse["reason"], requestId: string, cause: unknown);
}
declare const HerdrUnsupportedProtocol_base: Schema.Class<HerdrUnsupportedProtocol, Schema.TaggedStruct<"HerdrUnsupportedProtocol", {
  readonly actualProtocol: Schema.Finite;
  readonly supportedProtocol: Schema.Literal<22>;
  readonly requestId: Schema.String;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/**
 * Server protocol version differs from protocol 22 supported by this SDK.
 *
 * @category errors
 * @since 0.8.2
 */
declare class HerdrUnsupportedProtocol extends HerdrUnsupportedProtocol_base {
  /** Creates a protocol compatibility failure from the ping handshake. */
  constructor(actualProtocol: number, supportedProtocol: 22, requestId: string);
}
declare const HerdrUnsupportedResult_base: Schema.Class<HerdrUnsupportedResult, Schema.TaggedStruct<"HerdrUnsupportedResult", {
  readonly operation: Schema.String;
  readonly actualType: Schema.String;
  readonly expectedType: Schema.String;
  readonly requestId: Schema.String;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/**
 * Success result discriminant is not supported for the requested operation.
 *
 * @category errors
 * @since 0.8.2
 */
declare class HerdrUnsupportedResult extends HerdrUnsupportedResult_base {
  /** Creates an unsupported success-result failure. */
  constructor(operation: string, actualType: string, expectedType: string, requestId: string);
}
declare const HerdrUnsupportedEvent_base: Schema.Class<HerdrUnsupportedEvent, Schema.TaggedStruct<"HerdrUnsupportedEvent", {
  readonly eventType: Schema.String;
  readonly requestId: Schema.String;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/**
 * Event discriminant is not supported by this SDK build.
 *
 * @category errors
 * @since 0.8.2
 */
declare class HerdrUnsupportedEvent extends HerdrUnsupportedEvent_base {
  /** Creates an unsupported event failure from a subscription or wait boundary. */
  constructor(eventType: string, requestId: string);
}
declare const HerdrServerError_base: Schema.Class<HerdrServerError, Schema.TaggedStruct<"HerdrServerError", {
  readonly serverCode: Schema.String;
  readonly serverMessage: Schema.String;
  readonly requestId: Schema.String;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/**
 * Open-code server-returned failure correlated to one request.
 *
 * @category errors
 * @since 0.8.2
 */
declare class HerdrServerError extends HerdrServerError_base {
  /** Creates a typed boundary error while preserving the server's open code space. */
  constructor(serverCode: string, serverMessage: string, requestId: string);
}
declare const HerdrEventsLost_base: Schema.Class<HerdrEventsLost, Schema.TaggedStruct<"HerdrEventsLost", {
  readonly serverMessage: Schema.String;
  readonly requestId: Schema.String;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/**
 * Event subscription fell behind Herdr's retained history and was closed by the server.
 *
 * Cached state derived from the subscription is stale. Open a new subscription, wait for it to be
 * accepted, then reconcile through authoritative reads such as `session.snapshot`.
 *
 * @category errors
 * @since 0.9.5
 */
declare class HerdrEventsLost extends HerdrEventsLost_base {
  /** Creates a subscription overrun failure from the server's `events_lost` response. */
  constructor(serverMessage: string, requestId: string);
}
declare const HerdrSshAgentRegistrationClosed_base: Schema.Class<HerdrSshAgentRegistrationClosed, Schema.TaggedStruct<"HerdrSshAgentRegistrationClosed", {
  readonly requestId: Schema.String;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/**
 * Herdr ended a connection-scoped SSH agent registration before its owner released it.
 *
 * @category errors
 * @since 0.9.5
 */
declare class HerdrSshAgentRegistrationClosed extends HerdrSshAgentRegistrationClosed_base {
  /** Creates a lease-ended failure when the server closes the registration connection. */
  constructor(requestId: string);
}
//#endregion
//#region src/herdr-domain.d.ts
/**
 * Environment variables supplied to a newly created Herdr process.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrEnvironment: Schema.$Record<Schema.String, Schema.String>;
/**
 * Environment variables supplied to a newly created Herdr process.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrEnvironment = typeof HerdrEnvironment.Type;
/**
 * String metadata tokens reported by a Herdr resource owner.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrMetadataTokens: Schema.$Record<Schema.String, Schema.String>;
/**
 * String metadata tokens reported by a Herdr resource owner.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrMetadataTokens = typeof HerdrMetadataTokens.Type;
/**
 * Updates at most 16 metadata tokens; null removes a token. Names match `^[A-Za-z0-9_-]{1,32}$`.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrMetadataTokenPatch: Schema.$Record<Schema.String, Schema.NullOr<Schema.String>>;
/**
 * Metadata token updates where null removes the named token.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrMetadataTokenPatch = typeof HerdrMetadataTokenPatch.Type;
/**
 * Immutable named-key sequence accepted by pane and agent input operations.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrKeySequence: Schema.$Array<Schema.String>;
/**
 * Immutable named-key sequence accepted by pane and agent input operations.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrKeySequence = typeof HerdrKeySequence.Type;
/**
 * Non-empty identifier for a Herdr workspace.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorkspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
/**
 * Non-empty identifier for a Herdr workspace.
 *
 * @category models
 * @since 0.8.2
 */
type WorkspaceId = typeof WorkspaceId.Type;
/**
 * Parses an external workspace identifier before it enters SDK services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseWorkspaceId: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string & import("effect/Brand").Brand<"WorkspaceId">, Schema.SchemaError, never>;
/**
 * Non-empty identifier for a Herdr tab.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const TabId: Schema.brand<Schema.NonEmptyString, "TabId">;
/**
 * Non-empty identifier for a Herdr tab.
 *
 * @category models
 * @since 0.8.2
 */
type TabId = typeof TabId.Type;
/**
 * Parses an external tab identifier before it enters SDK services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseTabId: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string & import("effect/Brand").Brand<"TabId">, Schema.SchemaError, never>;
/**
 * Non-empty identifier for a Herdr pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
/**
 * Non-empty identifier for a Herdr pane.
 *
 * @category models
 * @since 0.8.2
 */
type PaneId = typeof PaneId.Type;
/**
 * Parses an external pane identifier before it enters SDK services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parsePaneId: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string & import("effect/Brand").Brand<"PaneId">, Schema.SchemaError, never>;
/**
 * Non-empty identifier for a Herdr terminal.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const TerminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
/**
 * Non-empty identifier for a Herdr terminal.
 *
 * @category models
 * @since 0.8.2
 */
type TerminalId = typeof TerminalId.Type;
/**
 * Parses an external terminal identifier before it enters SDK services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseTerminalId: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string & import("effect/Brand").Brand<"TerminalId">, Schema.SchemaError, never>;
/**
 * Non-empty identifier for an installed Herdr plugin.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginId: Schema.brand<Schema.NonEmptyString, "PluginId">;
/**
 * Non-empty identifier for an installed Herdr plugin.
 *
 * @category models
 * @since 0.8.2
 */
type PluginId = typeof PluginId.Type;
/**
 * Parses an external plugin identifier before it enters SDK services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parsePluginId: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string & import("effect/Brand").Brand<"PluginId">, Schema.SchemaError, never>;
/**
 * Non-empty identifier for a Herdr plugin action.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginActionId: Schema.brand<Schema.NonEmptyString, "PluginActionId">;
/**
 * Non-empty identifier for a Herdr plugin action.
 *
 * @category models
 * @since 0.8.2
 */
type PluginActionId = typeof PluginActionId.Type;
/**
 * Parses an external plugin action identifier before it enters SDK services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parsePluginActionId: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string & import("effect/Brand").Brand<"PluginActionId">, Schema.SchemaError, never>;
/**
 * Non-empty identifier for a Herdr plugin command log.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginLogId: Schema.brand<Schema.NonEmptyString, "PluginLogId">;
/**
 * Non-empty identifier for a Herdr plugin command log.
 *
 * @category models
 * @since 0.8.2
 */
type PluginLogId = typeof PluginLogId.Type;
/**
 * Parses an external plugin command-log identifier before it enters SDK services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parsePluginLogId: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string & import("effect/Brand").Brand<"PluginLogId">, Schema.SchemaError, never>;
/**
 * Non-empty caller-assigned name for a Herdr agent.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentName: Schema.brand<Schema.NonEmptyString, "AgentName">;
/**
 * Non-empty caller-assigned name for a Herdr agent.
 *
 * @category models
 * @since 0.8.2
 */
type AgentName = typeof AgentName.Type;
/**
 * Parses an external agent name before it enters SDK services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseAgentName: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string & import("effect/Brand").Brand<"AgentName">, Schema.SchemaError, never>;
/**
 * Absolute filesystem path accepted by Herdr SDK operations and configuration.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrAbsolutePath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
/**
 * Absolute filesystem path accepted by Herdr SDK operations and configuration.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrAbsolutePath = typeof HerdrAbsolutePath.Type;
/**
 * Parses an external absolute path before it enters SDK services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrAbsolutePath: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string & import("effect/Brand").Brand<"HerdrAbsolutePath">, Schema.SchemaError, never>;
/**
 * Herdr session name that cannot escape its session directory.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrSessionName: Schema.brand<Schema.String, "HerdrSessionName">;
/**
 * Herdr session name that cannot escape its session directory.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrSessionName = typeof HerdrSessionName.Type;
/**
 * Parses an external session name before socket-path resolution.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrSessionName: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string & import("effect/Brand").Brand<"HerdrSessionName">, Schema.SchemaError, never>;
/**
 * Finite, non-negative integer duration measured in milliseconds.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrMilliseconds: Schema.brand<Schema.Natural, "HerdrMilliseconds">;
/**
 * Finite, non-negative integer duration measured in milliseconds.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrMilliseconds = typeof HerdrMilliseconds.Type;
/**
 * Parses an external millisecond duration before it enters SDK services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrMilliseconds: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<number & import("effect/Brand").Brand<"HerdrMilliseconds">, Schema.SchemaError, never>;
/**
 * Finite, non-negative Unix timestamp measured in milliseconds.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrUnixMilliseconds: Schema.brand<Schema.Natural, "HerdrUnixMilliseconds">;
/**
 * Finite, non-negative Unix timestamp measured in milliseconds.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrUnixMilliseconds = typeof HerdrUnixMilliseconds.Type;
/**
 * Parses an external Unix millisecond timestamp.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrUnixMilliseconds: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<number & import("effect/Brand").Brand<"HerdrUnixMilliseconds">, Schema.SchemaError, never>;
/**
 * Finite, non-negative Unix timestamp measured in seconds.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrUnixSeconds: Schema.brand<Schema.Natural, "HerdrUnixSeconds">;
/**
 * Finite, non-negative Unix timestamp measured in seconds.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrUnixSeconds = typeof HerdrUnixSeconds.Type;
/**
 * Parses an external Unix second timestamp.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrUnixSeconds: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<number & import("effect/Brand").Brand<"HerdrUnixSeconds">, Schema.SchemaError, never>;
/**
 * Finite, non-negative pane-output revision.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrRevision: Schema.brand<Schema.Natural, "HerdrRevision">;
/**
 * Finite, non-negative pane-output revision.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrRevision = typeof HerdrRevision.Type;
/**
 * Parses an external pane-output revision.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrRevision: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<number & import("effect/Brand").Brand<"HerdrRevision">, Schema.SchemaError, never>;
/**
 * Finite, non-negative sequence used to order reported agent state.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrStateChangeSequence: Schema.brand<Schema.Natural, "HerdrStateChangeSequence">;
/**
 * Finite, non-negative sequence used to order reported agent state.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrStateChangeSequence = typeof HerdrStateChangeSequence.Type;
/**
 * Parses an external agent state-change sequence.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrStateChangeSequence: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<number & import("effect/Brand").Brand<"HerdrStateChangeSequence">, Schema.SchemaError, never>;
/**
 * Finite split ratio strictly between zero and one.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrSplitRatio: Schema.brand<Schema.Finite, "HerdrSplitRatio">;
/**
 * Finite split ratio strictly between zero and one.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrSplitRatio = typeof HerdrSplitRatio.Type;
/**
 * Parses an external split ratio before it enters layout or pane services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrSplitRatio: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<number & import("effect/Brand").Brand<"HerdrSplitRatio">, Schema.SchemaError, never>;
/**
 * Metadata time-to-live between one millisecond and one day, inclusive.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrMetadataTtl: Schema.brand<Schema.Finite, "HerdrMetadataTtl">;
/**
 * Metadata time-to-live between one millisecond and one day, inclusive.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrMetadataTtl = typeof HerdrMetadataTtl.Type;
/**
 * Parses an external metadata time-to-live before report operations.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrMetadataTtl: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<number & import("effect/Brand").Brand<"HerdrMetadataTtl">, Schema.SchemaError, never>;
/**
 * Non-negative insertion index used by ordered workspace and tab operations.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrInsertIndex: Schema.brand<Schema.Natural, "HerdrInsertIndex">;
/**
 * Non-negative insertion index used by ordered workspace and tab operations.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrInsertIndex = typeof HerdrInsertIndex.Type;
/**
 * Parses an external insertion index before it enters ordering services.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrInsertIndex: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<number & import("effect/Brand").Brand<"HerdrInsertIndex">, Schema.SchemaError, never>;
/**
 * Command argv that resumes an agent session after a Herdr server restart.
 *
 * Herdr types this command into the restored pane's shell, so the first element must be a plain
 * command name (ASCII letters, digits, `_`, `-`, or `.`, not starting with `-`), never a path. It
 * holds one to 64 arguments totalling at most 8 KiB of UTF-8, with no apostrophes or control
 * characters.
 *
 * @category schemas
 * @since 0.9.5
 */
declare const HerdrResumeArgv: Schema.$Array<Schema.String>;
/**
 * Validated command argv that resumes an agent session after a Herdr server restart.
 *
 * @category models
 * @since 0.9.5
 */
type HerdrResumeArgv = typeof HerdrResumeArgv.Type;
/**
 * Parses an external resume command before it is attached to an agent report.
 *
 * @category decoding
 * @since 0.9.5
 */
declare const parseHerdrResumeArgv: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<readonly string[], Schema.SchemaError, never>;
/**
 * Popup size in terminal cells or an integer percentage from one through one hundred.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrPopupSize: Schema.Union<readonly [Schema.Finite, Schema.String]>;
/**
 * Popup size in terminal cells or an integer percentage from one through one hundred.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrPopupSize = typeof HerdrPopupSize.Type;
/**
 * Parses an external popup size before plugin pane operations.
 *
 * @category decoding
 * @since 0.8.2
 */
declare const parseHerdrPopupSize: (input: unknown, options?: import("effect/SchemaAST").ParseOptions) => import("effect/Effect").Effect<string | number, Schema.SchemaError, never>;
/** Opaque endpoint-issued custom command identifier; never command text. @category schemas @since 0.9.0 */
declare const HerdrCommandId: Schema.brand<Schema.NonEmptyString, "HerdrCommandId">;
/** Parsed custom command identifier. @category models @since 0.9.0 */
type HerdrCommandId = typeof HerdrCommandId.Type;
/**
 * Pure schema-owned helpers for constructing branded Herdr identifiers and paths.
 *
 * @category models
 * @since 0.8.2
 */
interface IHerdrIds {
  /** Constructs an opaque endpoint-issued custom command identifier. */
  readonly command: (value: string) => HerdrCommandId;
  /** Constructs a non-empty workspace identifier. */
  readonly workspace: (value: string) => WorkspaceId;
  /** Constructs a non-empty tab identifier. */
  readonly tab: (value: string) => TabId;
  /** Constructs a non-empty pane identifier. */
  readonly pane: (value: string) => PaneId;
  /** Constructs a non-empty terminal identifier. */
  readonly terminal: (value: string) => TerminalId;
  /** Constructs a non-empty plugin identifier. */
  readonly plugin: (value: string) => PluginId;
  /** Constructs a non-empty plugin action identifier. */
  readonly pluginAction: (value: string) => PluginActionId;
  /** Constructs a non-empty plugin command-log identifier. */
  readonly pluginLog: (value: string) => PluginLogId;
  /** Constructs a non-empty agent name. */
  readonly agentName: (value: string) => AgentName;
  /** Constructs an absolute filesystem path. */
  readonly absolutePath: (value: string) => HerdrAbsolutePath;
}
/**
 * Pure schema-owned constructors exposed as `herdr.ids`.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const herdrIds: IHerdrIds;
//#endregion
//#region src/herdr-config.d.ts
/**
 * Finite, non-negative deadline for ordinary Herdr transport requests.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrRequestDeadline: Schema.brand<Schema.Duration, "HerdrRequestDeadline">;
/**
 * Parsed deadline for ordinary Herdr transport requests.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrRequestDeadline = typeof HerdrRequestDeadline.Type;
/**
 * Application identity sent during the Herdr compatibility handshake.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrApplication: Schema.Struct<{
  readonly name: Schema.NonEmptyString;
  readonly version: Schema.OptionFromOptionalKey<Schema.NonEmptyString>;
}>;
/**
 * Parsed application identity sent during the Herdr compatibility handshake.
 *
 * @category models
 * @since 0.8.2
 */
interface HerdrApplication extends Schema.Schema.Type<typeof HerdrApplication> {}
/**
 * Supported Herdr wire protocol version.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrProtocolVersion: Schema.Literal<22>;
/**
 * Supported Herdr wire protocol version.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrProtocolVersion = typeof HerdrProtocolVersion.Type;
/**
 * Explicit SDK configuration accepted by {@link makeHerdrConfig}.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrConfigOptions: Schema.refine<{
  readonly socketPath?: string & import("effect/Brand").Brand<"HerdrAbsolutePath">;
  readonly session?: string & import("effect/Brand").Brand<"HerdrSessionName">;
  readonly requestTimeout?: Duration.Duration & import("effect/Brand").Brand<"HerdrRequestDeadline">;
  readonly application?: {
    readonly name: string;
    readonly version: Option.Option<string>;
  };
} & ({
  readonly socketPath?: never;
} | {
  readonly session?: never;
}), Schema.Struct<{
  readonly socketPath: Schema.optionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly session: Schema.optionalKey<Schema.brand<Schema.String, "HerdrSessionName">>;
  readonly requestTimeout: Schema.optionalKey<Schema.brand<Schema.Duration, "HerdrRequestDeadline">>;
  readonly application: Schema.optionalKey<Schema.Struct<{
    readonly name: Schema.NonEmptyString;
    readonly version: Schema.OptionFromOptionalKey<Schema.NonEmptyString>;
  }>>;
}>>;
/**
 * External representation of explicit Herdr SDK configuration.
 *
 * @category models
 * @since 0.8.2
 */
interface HerdrConfigOptions extends Schema.Codec.Encoded<typeof HerdrConfigOptions> {}
/**
 * Immutable configuration consumed by Herdr SDK services.
 *
 * @category services
 * @since 0.8.2
 */
interface IHerdrConfig {
  /** Resolved local socket used for every Herdr request. */
  readonly socketPath: HerdrAbsolutePath;
  /** Named session that selected the socket, or `None` for an exact/default socket. */
  readonly session: Option.Option<HerdrSessionName>;
  /** Default local deadline for ordinary transport requests. */
  readonly requestTimeout: HerdrRequestDeadline;
  /** Optional application identity included in the compatibility handshake. */
  readonly application: Option.Option<HerdrApplication>;
  /** Herdr protocol version accepted by this SDK build. */
  readonly supportedProtocol: HerdrProtocolVersion;
}
declare const HerdrConfig_base: Context.ServiceClass<HerdrConfig, "@herdr/sdk/HerdrConfig", IHerdrConfig>;
/**
 * Yieldable Effect service containing resolved Herdr SDK configuration.
 *
 * @category services
 * @since 0.8.2
 */
declare class HerdrConfig extends HerdrConfig_base {}
/**
 * Effect Config recipe that resolves ambient Herdr SDK configuration.
 *
 * @category configuration
 * @since 0.8.2
 */
declare const herdrConfigRecipe: Config.Config<IHerdrConfig>;
/**
 * Constructs Herdr configuration using explicit options before ambient configuration.
 *
 * @category constructors
 * @since 0.8.2
 */
declare function makeHerdrConfig(options?: HerdrConfigOptions): Effect.Effect<HerdrConfig["Service"], HerdrConfigurationError>;
/**
 * Provides Herdr configuration while preserving the active ConfigProvider.
 *
 * @category layers
 * @since 0.8.2
 */
declare const herdrConfigLayerWithoutDependencies: Layer.Layer<HerdrConfig, HerdrConfigurationError>;
/**
 * Production Layer that loads Herdr configuration from the active ConfigProvider.
 *
 * @category layers
 * @since 0.8.2
 */
declare const herdrConfigLayer: Layer.Layer<HerdrConfig, HerdrConfigurationError>;
/**
 * Provides Herdr configuration resolved from explicit and ambient options.
 *
 * @category layers
 * @since 0.8.2
 */
declare function herdrConfigLayerFromOptions(options: HerdrConfigOptions): Layer.Layer<HerdrConfig, HerdrConfigurationError>;
/**
 * Provides an already parsed Herdr configuration value.
 *
 * @category layers
 * @since 0.8.2
 */
declare function herdrConfigLayerFromValue(config: IHerdrConfig): Layer.Layer<HerdrConfig>;
//#endregion
//#region src/generated/wire-request.d.ts
/** Generated from schema/herdr-api.schema.json; do not edit. */
type Request = {
  id: string;
  [k: string]: unknown;
} & ({
  method: "ping";
  params: PingParams;
  [k: string]: unknown;
} | {
  method: "server.stop";
  params: EmptyParams;
  [k: string]: unknown;
} | {
  method: "server.live_handoff";
  params: ServerLiveHandoffParams;
  [k: string]: unknown;
} | {
  method: "server.reload_config";
  params: EmptyParams;
  [k: string]: unknown;
} | {
  method: "server.ssh_agent.register";
  params: ServerSshAgentRegisterParams;
  [k: string]: unknown;
} | {
  method: "server.agent_manifests";
  params: EmptyParams;
  [k: string]: unknown;
} | {
  method: "server.reload_agent_manifests";
  params: EmptyParams;
  [k: string]: unknown;
} | {
  method: "notification.show";
  params: NotificationShowParams;
  [k: string]: unknown;
} | {
  method: "product_announcement.dismiss";
  params: ProductAnnouncementDismissParams;
  [k: string]: unknown;
} | {
  method: "release_notes.dismiss";
  params: ReleaseNotesDismissParams;
  [k: string]: unknown;
} | {
  method: "command.invoke";
  params: CommandInvokeParams;
  [k: string]: unknown;
} | {
  method: "client.window_title.set";
  params: ClientWindowTitleSetParams;
  [k: string]: unknown;
} | {
  method: "client.window_title.clear";
  params: EmptyParams;
  [k: string]: unknown;
} | {
  method: "client_shell.surface.set";
  params: ClientShellSurfaceSetParams;
  [k: string]: unknown;
} | {
  method: "session.snapshot";
  params: EmptyParams;
  [k: string]: unknown;
} | {
  method: "workspace.create";
  params: WorkspaceCreateParams;
  [k: string]: unknown;
} | {
  method: "workspace.list";
  params: EmptyParams;
  [k: string]: unknown;
} | {
  method: "workspace.get";
  params: WorkspaceTarget;
  [k: string]: unknown;
} | {
  method: "workspace.focus";
  params: WorkspaceTarget;
  [k: string]: unknown;
} | {
  method: "workspace.rename";
  params: WorkspaceRenameParams;
  [k: string]: unknown;
} | {
  method: "workspace.move";
  params: WorkspaceMoveParams;
  [k: string]: unknown;
} | {
  method: "workspace.move_block";
  params: WorkspaceMoveBlockParams;
  [k: string]: unknown;
} | {
  method: "workspace.report_metadata";
  params: WorkspaceReportMetadataParams;
  [k: string]: unknown;
} | {
  method: "workspace.close";
  params: WorkspaceCloseParams;
  [k: string]: unknown;
} | {
  method: "worktree.list";
  params: WorktreeListParams;
  [k: string]: unknown;
} | {
  method: "worktree.create";
  params: WorktreeCreateParams;
  [k: string]: unknown;
} | {
  method: "worktree.open";
  params: WorktreeOpenParams;
  [k: string]: unknown;
} | {
  method: "worktree.remove";
  params: WorktreeRemoveParams;
  [k: string]: unknown;
} | {
  method: "tab.create";
  params: TabCreateParams;
  [k: string]: unknown;
} | {
  method: "tab.list";
  params: TabListParams;
  [k: string]: unknown;
} | {
  method: "tab.get";
  params: TabTarget;
  [k: string]: unknown;
} | {
  method: "tab.focus";
  params: TabTarget;
  [k: string]: unknown;
} | {
  method: "tab.rename";
  params: TabRenameParams;
  [k: string]: unknown;
} | {
  method: "tab.move";
  params: TabMoveParams;
  [k: string]: unknown;
} | {
  method: "tab.close";
  params: TabTarget;
  [k: string]: unknown;
} | {
  method: "agent.list";
  params: EmptyParams;
  [k: string]: unknown;
} | {
  method: "agent.get";
  params: AgentTarget$1;
  [k: string]: unknown;
} | {
  method: "agent.read";
  params: AgentReadParams;
  [k: string]: unknown;
} | {
  method: "agent.explain";
  params: AgentTarget$1;
  [k: string]: unknown;
} | {
  method: "agent.send_keys";
  params: AgentSendKeysParams;
  [k: string]: unknown;
} | {
  method: "agent.rename";
  params: AgentRenameParams;
  [k: string]: unknown;
} | {
  method: "agent.view.set";
  params: AgentViewSetParams;
  [k: string]: unknown;
} | {
  method: "agent.view.clear";
  params: AgentViewClearParams;
  [k: string]: unknown;
} | {
  method: "agent.focus";
  params: AgentTarget$1;
  [k: string]: unknown;
} | {
  method: "agent.start";
  params: AgentStartParams;
  [k: string]: unknown;
} | {
  method: "agent.prompt";
  params: AgentPromptParams;
  [k: string]: unknown;
} | {
  method: "agent.wait";
  params: AgentWaitParams;
  [k: string]: unknown;
} | {
  method: "pane.split";
  params: PaneSplitParams;
  [k: string]: unknown;
} | {
  method: "pane.swap";
  params: PaneSwapParams;
  [k: string]: unknown;
} | {
  method: "pane.move";
  params: PaneMoveParams;
  [k: string]: unknown;
} | {
  method: "pane.zoom";
  params: PaneZoomParams;
  [k: string]: unknown;
} | {
  method: "pane.layout";
  params: PaneLayoutParams;
  [k: string]: unknown;
} | {
  method: "pane.process_info";
  params: PaneProcessInfoParams;
  [k: string]: unknown;
} | {
  method: "layout.export";
  params: LayoutExportParams;
  [k: string]: unknown;
} | {
  method: "layout.apply";
  params: LayoutApplyParams;
  [k: string]: unknown;
} | {
  method: "layout.set_split_ratio";
  params: LayoutSetSplitRatioParams;
  [k: string]: unknown;
} | {
  method: "pane.neighbor";
  params: PaneNeighborParams;
  [k: string]: unknown;
} | {
  method: "pane.edges";
  params: PaneEdgesParams;
  [k: string]: unknown;
} | {
  method: "pane.focus_direction";
  params: PaneFocusDirectionParams;
  [k: string]: unknown;
} | {
  method: "pane.resize";
  params: PaneResizeParams;
  [k: string]: unknown;
} | {
  method: "pane.scroll";
  params: PaneScrollParams;
  [k: string]: unknown;
} | {
  method: "pane.clear";
  params: PaneTarget;
  [k: string]: unknown;
} | {
  method: "pane.edit_scrollback";
  params: PaneTarget;
  [k: string]: unknown;
} | {
  method: "pane.selection.read";
  params: PaneSelectionReadParams;
  [k: string]: unknown;
} | {
  method: "pane.copy_motion";
  params: PaneCopyMotionParams;
  [k: string]: unknown;
} | {
  method: "pane.copy_search";
  params: PaneCopySearchParams;
  [k: string]: unknown;
} | {
  method: "pane.list";
  params: PaneListParams;
  [k: string]: unknown;
} | {
  method: "pane.current";
  params: PaneCurrentParams;
  [k: string]: unknown;
} | {
  method: "pane.get";
  params: PaneTarget;
  [k: string]: unknown;
} | {
  method: "pane.focus";
  params: PaneTarget;
  [k: string]: unknown;
} | {
  method: "pane.input.set";
  params: PaneInputSetParams;
  [k: string]: unknown;
} | {
  method: "pane.link.activate";
  params: PaneLinkActivateParams;
  [k: string]: unknown;
} | {
  method: "pane.link.resolve";
  params: PaneLinkActivateParams;
  [k: string]: unknown;
} | {
  method: "pane.rename";
  params: PaneRenameParams;
  [k: string]: unknown;
} | {
  method: "pane.send_text";
  params: PaneSendTextParams;
  [k: string]: unknown;
} | {
  method: "pane.send_keys";
  params: PaneSendKeysParams;
  [k: string]: unknown;
} | {
  method: "pane.send_input";
  params: PaneSendInputParams;
  [k: string]: unknown;
} | {
  method: "pane.read";
  params: PaneReadParams;
  [k: string]: unknown;
} | {
  method: "pane.report_agent";
  params: PaneReportAgentParams;
  [k: string]: unknown;
} | {
  method: "pane.report_agent_session";
  params: PaneReportAgentSessionParams;
  [k: string]: unknown;
} | {
  method: "pane.report_metadata";
  params: PaneReportMetadataParams;
  [k: string]: unknown;
} | {
  method: "pane.clear_agent_authority";
  params: PaneClearAgentAuthorityParams;
  [k: string]: unknown;
} | {
  method: "pane.release_agent";
  params: PaneReleaseAgentParams;
  [k: string]: unknown;
} | {
  method: "pane.close";
  params: PaneTarget;
  [k: string]: unknown;
} | {
  method: "popup.close";
  params: EmptyParams;
  [k: string]: unknown;
} | {
  method: "events.subscribe";
  params: EventsSubscribeParams;
  [k: string]: unknown;
} | {
  method: "events.wait";
  params: EventsWaitParams;
  [k: string]: unknown;
} | {
  method: "pane.wait_for_output";
  params: PaneWaitForOutputParams;
  [k: string]: unknown;
} | {
  method: "integration.list";
  params: EmptyParams;
  [k: string]: unknown;
} | {
  method: "integration.install";
  params: IntegrationInstallParams;
  [k: string]: unknown;
} | {
  method: "integration.uninstall";
  params: IntegrationUninstallParams;
  [k: string]: unknown;
} | {
  method: "plugin.link";
  params: PluginLinkParams;
  [k: string]: unknown;
} | {
  method: "plugin.list";
  params: PluginListParams;
  [k: string]: unknown;
} | {
  method: "plugin.unlink";
  params: PluginUnlinkParams;
  [k: string]: unknown;
} | {
  method: "plugin.enable";
  params: PluginSetEnabledParams;
  [k: string]: unknown;
} | {
  method: "plugin.disable";
  params: PluginSetEnabledParams;
  [k: string]: unknown;
} | {
  method: "plugin.action.list";
  params: PluginActionListParams;
  [k: string]: unknown;
} | {
  method: "plugin.action.invoke";
  params: PluginActionInvokeParams;
  [k: string]: unknown;
} | {
  method: "plugin.log.list";
  params: PluginLogListParams;
  [k: string]: unknown;
} | {
  method: "plugin.pane.open";
  params: PluginPaneOpenParams;
  [k: string]: unknown;
} | {
  method: "plugin.pane.focus";
  params: PluginPaneFocusParams;
  [k: string]: unknown;
} | {
  method: "plugin.pane.close";
  params: PluginPaneCloseParams;
  [k: string]: unknown;
});
type ToastHerdrPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type NotificationShowSound = "none" | "done" | "request";
type ReadSource$1 = "visible" | "recent" | "recent_unwrapped" | "detection";
type AgentViewFilter$1 = {
  filters: AgentViewFilter$1[];
  op: "all";
  [k: string]: unknown;
} | {
  filters: AgentViewFilter$1[];
  op: "any";
  [k: string]: unknown;
} | {
  filter: AgentViewFilter$1;
  op: "not";
  [k: string]: unknown;
} | {
  field: AgentViewField$1;
  op: "eq";
  value: AgentViewValue$1;
  [k: string]: unknown;
} | {
  field: AgentViewField$1;
  op: "in";
  values: AgentViewValue$1[];
  [k: string]: unknown;
} | {
  field: AgentViewField$1;
  op: "exists";
  [k: string]: unknown;
};
type AgentViewField$1 = AgentViewBuiltinField | {
  token: string;
  [k: string]: unknown;
};
type AgentViewBuiltinField = "status" | "workspace_id" | "tab_id" | "pane_id" | "agent" | "seen" | "state_change_seq";
type AgentViewValue$1 = string | boolean | number | {
  context: AgentViewContext;
  [k: string]: unknown;
};
type AgentViewContext = "current_workspace_id" | "current_tab_id";
type AgentViewSortField$1 = AgentViewBuiltinSortField | {
  token: string;
  [k: string]: unknown;
};
type AgentViewBuiltinSortField = "workspace_order" | "tab_order" | "pane_order" | "attention" | "status" | "agent" | "seen" | "state_change_seq";
type AgentStatus$2 = "idle" | "working" | "blocked" | "done" | "unknown";
type SplitDirection$2 = "right" | "down";
type PaneDirection$2 = "left" | "right" | "up" | "down";
type PaneMoveDestination$1 = {
  ratio?: number | null;
  split: SplitDirection$2;
  tab_id: string;
  target_pane_id?: string | null;
  type: "tab";
  [k: string]: unknown;
} | {
  label?: string | null;
  type: "new_tab";
  workspace_id?: string | null;
  [k: string]: unknown;
} | {
  label?: string | null;
  tab_label?: string | null;
  type: "new_workspace";
  [k: string]: unknown;
};
type LayoutNode$2 = {
  command?: string[] | null;
  cwd?: string | null;
  env?: {
    [k: string]: string;
  };
  label?: string | null;
  pane_id?: string | null;
  type: "pane";
  [k: string]: unknown;
} | {
  direction: SplitDirection$2;
  first: LayoutNode$2;
  ratio: number;
  second: LayoutNode$2;
  type: "split";
  [k: string]: unknown;
};
type PaneCopyMotion$1 = "line_end" | "first_non_blank" | "next_word_start" | "previous_word_start" | "next_word_end" | "next_big_word_start" | "previous_big_word_start" | "next_big_word_end" | "previous_paragraph" | "next_paragraph";
type PaneCopySearchDirection = "forward" | "backward";
type PaneRightClickTarget$1 = "herdr" | "pane";
type PaneAgentState = "idle" | "working" | "blocked" | "unknown";
type Subscription = {
  type: "workspace.created";
  [k: string]: unknown;
} | {
  type: "workspace.updated";
  [k: string]: unknown;
} | {
  type: "workspace.metadata_updated";
  [k: string]: unknown;
} | {
  type: "workspace.renamed";
  [k: string]: unknown;
} | {
  type: "workspace.moved";
  [k: string]: unknown;
} | {
  type: "workspace.reordered";
  [k: string]: unknown;
} | {
  type: "workspace.closed";
  [k: string]: unknown;
} | {
  type: "workspace.focused";
  [k: string]: unknown;
} | {
  type: "worktree.created";
  [k: string]: unknown;
} | {
  type: "worktree.opened";
  [k: string]: unknown;
} | {
  type: "worktree.removed";
  [k: string]: unknown;
} | {
  type: "tab.created";
  [k: string]: unknown;
} | {
  type: "tab.closed";
  [k: string]: unknown;
} | {
  type: "tab.focused";
  [k: string]: unknown;
} | {
  type: "tab.renamed";
  [k: string]: unknown;
} | {
  type: "tab.moved";
  [k: string]: unknown;
} | {
  type: "pane.created";
  [k: string]: unknown;
} | {
  type: "pane.closed";
  [k: string]: unknown;
} | {
  type: "pane.updated";
  [k: string]: unknown;
} | {
  type: "pane.focused";
  [k: string]: unknown;
} | {
  type: "pane.moved";
  [k: string]: unknown;
} | {
  type: "pane.exited";
  [k: string]: unknown;
} | {
  type: "pane.agent_detected";
  [k: string]: unknown;
} | {
  lines?: number | null;
  match: OutputMatch;
  pane_id: string;
  source: ReadSource$1;
  strip_ansi?: boolean;
  type: "pane.output_matched";
  [k: string]: unknown;
} | {
  agent_status?: AgentStatus$2 | null;
  pane_id: string;
  type: "pane.agent_status_changed";
  [k: string]: unknown;
} | {
  pane_id: string;
  type: "pane.scroll_changed";
  [k: string]: unknown;
} | {
  type: "layout.updated";
  [k: string]: unknown;
};
type OutputMatch = {
  type: "substring";
  value: string;
  [k: string]: unknown;
} | {
  type: "regex";
  value: string;
  [k: string]: unknown;
};
type EventMatch$1 = {
  event: "workspace_created";
  workspace_id?: string | null;
  [k: string]: unknown;
} | {
  event: "workspace_updated";
  workspace_id: string;
  [k: string]: unknown;
} | {
  event: "workspace_closed";
  workspace_id: string;
  [k: string]: unknown;
} | {
  event: "workspace_renamed";
  label?: string | null;
  workspace_id: string;
  [k: string]: unknown;
} | {
  event: "workspace_moved";
  workspace_id: string;
  [k: string]: unknown;
} | {
  event: "workspace_focused";
  workspace_id: string;
  [k: string]: unknown;
} | {
  event: "tab_created";
  tab_id?: string | null;
  workspace_id?: string | null;
  [k: string]: unknown;
} | {
  event: "tab_closed";
  tab_id: string;
  [k: string]: unknown;
} | {
  event: "tab_renamed";
  label?: string | null;
  tab_id: string;
  [k: string]: unknown;
} | {
  event: "tab_moved";
  tab_id: string;
  [k: string]: unknown;
} | {
  event: "tab_focused";
  tab_id: string;
  [k: string]: unknown;
} | {
  event: "pane_created";
  pane_id?: string | null;
  workspace_id?: string | null;
  [k: string]: unknown;
} | {
  event: "pane_closed";
  pane_id: string;
  [k: string]: unknown;
} | {
  event: "pane_focused";
  pane_id: string;
  [k: string]: unknown;
} | {
  event: "pane_moved";
  pane_id: string;
  [k: string]: unknown;
} | {
  event: "pane_output_changed";
  min_revision?: number | null;
  pane_id: string;
  [k: string]: unknown;
} | {
  event: "pane_exited";
  pane_id: string;
  [k: string]: unknown;
} | {
  agent?: string | null;
  event: "pane_agent_detected";
  pane_id: string;
  [k: string]: unknown;
} | {
  agent_status: AgentStatus$2;
  event: "pane_agent_status_changed";
  pane_id: string;
  [k: string]: unknown;
};
type IntegrationTarget$2 = "pi" | "omp" | "claude" | "codex" | "copilot" | "devin" | "droid" | "kimi" | "opencode" | "kilo" | "hermes" | "qodercli" | "qwen" | "cursor" | "mastracode" | "antigravity_cli" | "grok";
type PopupSize$1 = number | string;
type PluginPanePlacement$1 = "overlay" | "popup" | "split" | "tab" | "zoomed";
interface PingParams {
  [k: string]: unknown;
}
interface EmptyParams {
  [k: string]: unknown;
}
interface ServerLiveHandoffParams {
  expected_protocol?: number | null;
  expected_version?: string | null;
  import_exe?: string | null;
  [k: string]: unknown;
}
interface ServerSshAgentRegisterParams {
  /**
   * Absolute remote-host agent socket. Registration lasts until this API connection closes.
   */
  socket_path: string;
  [k: string]: unknown;
}
interface NotificationShowParams {
  body?: string | null;
  position?: ToastHerdrPosition | null;
  sound?: NotificationShowSound;
  title: string;
  [k: string]: unknown;
}
interface ProductAnnouncementDismissParams {
  id: string;
  version: string;
  [k: string]: unknown;
}
interface ReleaseNotesDismissParams {
  version: string;
  [k: string]: unknown;
}
interface CommandInvokeParams {
  /**
   * Opaque endpoint-issued command identifier from the client-shell projection.
   */
  command_id: string;
  pane_id?: string | null;
  /**
   * Client-owned selection coordinates, validated against the pane's content revision.
   */
  selection?: PaneSelectionReadParams | null;
  tab_id?: string | null;
  workspace_id?: string | null;
  [k: string]: unknown;
}
interface PaneSelectionReadParams {
  anchor: PaneTextPoint$2;
  content_revision?: number | null;
  cursor: PaneTextPoint$2;
  pane_id: string;
  [k: string]: unknown;
}
interface PaneTextPoint$2 {
  col: number;
  row: number;
  [k: string]: unknown;
}
interface ClientWindowTitleSetParams {
  title: string;
  [k: string]: unknown;
}
/**
 * Updates whether the requesting client shell receives and controls pane presentation.
 */
interface ClientShellSurfaceSetParams {
  active: boolean;
  [k: string]: unknown;
}
interface WorkspaceCreateParams {
  cwd?: string | null;
  env?: {
    [k: string]: string;
  };
  focus?: boolean;
  label?: string | null;
  /**
   * Workspace whose focused pane supplies the `follow` cwd policy.
   */
  source_workspace_id?: string | null;
  [k: string]: unknown;
}
interface WorkspaceTarget {
  workspace_id: string;
  [k: string]: unknown;
}
interface WorkspaceRenameParams {
  label: string;
  workspace_id: string;
  [k: string]: unknown;
}
interface WorkspaceMoveParams {
  insert_index: number;
  workspace_id: string;
  [k: string]: unknown;
}
interface WorkspaceMoveBlockParams {
  before_workspace_id?: string | null;
  workspace_ids: string[];
  [k: string]: unknown;
}
interface WorkspaceReportMetadataParams {
  seq?: number | null;
  source: string;
  tokens: {
    [k: string]: string | null;
  };
  ttl_ms?: number | null;
  workspace_id: string;
  [k: string]: unknown;
}
interface WorkspaceCloseParams {
  close_group?: boolean;
  workspace_id: string;
  [k: string]: unknown;
}
interface WorktreeListParams {
  cwd?: string | null;
  trust_repository?: boolean;
  workspace_id?: string | null;
  [k: string]: unknown;
}
interface WorktreeCreateParams {
  base?: string | null;
  branch?: string | null;
  cwd?: string | null;
  focus?: boolean;
  label?: string | null;
  path?: string | null;
  trust_repository?: boolean;
  workspace_id?: string | null;
  [k: string]: unknown;
}
interface WorktreeOpenParams {
  branch?: string | null;
  cwd?: string | null;
  focus?: boolean;
  label?: string | null;
  path?: string | null;
  trust_repository?: boolean;
  workspace_id?: string | null;
  [k: string]: unknown;
}
interface WorktreeRemoveParams {
  force?: boolean;
  trust_repository?: boolean;
  workspace_id: string;
  [k: string]: unknown;
}
interface TabCreateParams {
  cwd?: string | null;
  env?: {
    [k: string]: string;
  };
  focus?: boolean;
  label?: string | null;
  workspace_id?: string | null;
  [k: string]: unknown;
}
interface TabListParams {
  workspace_id?: string | null;
  [k: string]: unknown;
}
interface TabTarget {
  tab_id: string;
  [k: string]: unknown;
}
interface TabRenameParams {
  label: string;
  tab_id: string;
  [k: string]: unknown;
}
interface TabMoveParams {
  insert_index: number;
  tab_id: string;
  [k: string]: unknown;
}
interface AgentTarget$1 {
  target: string;
  [k: string]: unknown;
}
interface AgentReadParams {
  format?: "text" | "ansi";
  lines?: number | null;
  source: ReadSource$1;
  strip_ansi?: boolean;
  target: string;
  [k: string]: unknown;
}
interface AgentSendKeysParams {
  keys: string[];
  target: string;
  [k: string]: unknown;
}
interface AgentRenameParams {
  name?: string | null;
  target: string;
  [k: string]: unknown;
}
interface AgentViewSetParams {
  filter?: AgentViewFilter$1 | null;
  label?: string | null;
  sort?: AgentViewSort$1[];
  source: string;
  [k: string]: unknown;
}
interface AgentViewSort$1 {
  field: AgentViewSortField$1;
  order?: "asc" | "desc";
  [k: string]: unknown;
}
interface AgentViewClearParams {
  source?: string | null;
  [k: string]: unknown;
}
interface AgentStartParams {
  args?: string[];
  kind: string;
  name: string;
  pane_id: string;
  /**
   * Startup timeout in milliseconds. Values must be greater than 3000 and at most 300000.
   */
  timeout_ms?: number | null;
  [k: string]: unknown;
}
interface AgentPromptParams {
  target: string;
  text: string;
  wait?: AgentPromptWaitOptions | null;
  [k: string]: unknown;
}
interface AgentPromptWaitOptions {
  timeout_ms?: number | null;
  until?: AgentStatus$2[];
  [k: string]: unknown;
}
interface AgentWaitParams {
  target: string;
  timeout_ms?: number | null;
  until?: AgentStatus$2[];
  [k: string]: unknown;
}
interface PaneSplitParams {
  cwd?: string | null;
  direction: SplitDirection$2;
  env?: {
    [k: string]: string;
  };
  focus?: boolean;
  ratio?: number | null;
  right_click?: "herdr" | "pane";
  target_pane_id?: string | null;
  workspace_id?: string | null;
  [k: string]: unknown;
}
interface PaneSwapParams {
  direction?: PaneDirection$2 | null;
  pane_id?: string | null;
  source_pane_id?: string | null;
  target_pane_id?: string | null;
  [k: string]: unknown;
}
interface PaneMoveParams {
  destination: PaneMoveDestination$1;
  focus?: boolean;
  pane_id: string;
  [k: string]: unknown;
}
interface PaneZoomParams {
  mode?: "toggle" | "on" | "off";
  pane_id?: string | null;
  [k: string]: unknown;
}
interface PaneLayoutParams {
  pane_id?: string | null;
  [k: string]: unknown;
}
interface PaneProcessInfoParams {
  pane_id?: string | null;
  [k: string]: unknown;
}
interface LayoutExportParams {
  pane_id?: string | null;
  tab_id?: string | null;
  [k: string]: unknown;
}
interface LayoutApplyParams {
  focus?: boolean;
  root: LayoutNode$2;
  tab_id?: string | null;
  tab_label?: string | null;
  workspace_id?: string | null;
  [k: string]: unknown;
}
interface LayoutSetSplitRatioParams {
  pane_id?: string | null;
  path: boolean[];
  ratio: number;
  tab_id?: string | null;
  [k: string]: unknown;
}
interface PaneNeighborParams {
  direction: PaneDirection$2;
  pane_id?: string | null;
  [k: string]: unknown;
}
interface PaneEdgesParams {
  pane_id?: string | null;
  [k: string]: unknown;
}
interface PaneFocusDirectionParams {
  direction: PaneDirection$2;
  pane_id?: string | null;
  [k: string]: unknown;
}
interface PaneResizeParams {
  amount?: number | null;
  direction: PaneDirection$2;
  pane_id?: string | null;
  [k: string]: unknown;
}
interface PaneScrollParams {
  offset_from_bottom: number;
  pane_id: string;
  [k: string]: unknown;
}
interface PaneTarget {
  pane_id: string;
  [k: string]: unknown;
}
interface PaneCopyMotionParams {
  content_revision?: number | null;
  cursor: PaneTextPoint$2;
  motion: PaneCopyMotion$1;
  pane_id: string;
  [k: string]: unknown;
}
interface PaneCopySearchParams {
  content_revision: number;
  cursor: PaneTextPoint$2;
  direction: PaneCopySearchDirection;
  pane_id: string;
  previous?: PaneTextRange$2 | null;
  query: string;
  [k: string]: unknown;
}
interface PaneTextRange$2 {
  end: PaneTextPoint$2;
  start: PaneTextPoint$2;
  [k: string]: unknown;
}
interface PaneListParams {
  workspace_id?: string | null;
  [k: string]: unknown;
}
interface PaneCurrentParams {
  caller_pane_id?: string | null;
  [k: string]: unknown;
}
interface PaneInputSetParams {
  pane_id: string;
  right_click: PaneRightClickTarget$1;
  [k: string]: unknown;
}
interface PaneLinkActivateParams {
  col: number;
  content_revision?: number | null;
  offset_from_bottom?: number | null;
  pane_id: string;
  viewport_row: number;
  [k: string]: unknown;
}
interface PaneRenameParams {
  label?: string | null;
  pane_id: string;
  [k: string]: unknown;
}
interface PaneSendTextParams {
  pane_id: string;
  text: string;
  [k: string]: unknown;
}
interface PaneSendKeysParams {
  keys: string[];
  pane_id: string;
  [k: string]: unknown;
}
interface PaneSendInputParams {
  keys?: string[];
  pane_id: string;
  text?: string;
  [k: string]: unknown;
}
interface PaneReadParams {
  format?: "text" | "ansi";
  lines?: number | null;
  pane_id: string;
  source: ReadSource$1;
  strip_ansi?: boolean;
  [k: string]: unknown;
}
interface PaneReportAgentParams {
  agent: string;
  agent_session_id?: string | null;
  agent_session_path?: string | null;
  message?: string | null;
  pane_id: string;
  /**
   * Command that resumes this agent's session after a Herdr restart. The
   * first element must be a plain command name.
   */
  resume_argv?: string[] | null;
  seq?: number | null;
  source: string;
  state: PaneAgentState;
  [k: string]: unknown;
}
interface PaneReportAgentSessionParams {
  agent: string;
  agent_session_id?: string | null;
  agent_session_path?: string | null;
  pane_id: string;
  /**
   * Command that resumes this agent's session after a Herdr restart. The
   * first element must be a plain command name.
   */
  resume_argv?: string[] | null;
  seq?: number | null;
  session_start_source?: string | null;
  source: string;
  [k: string]: unknown;
}
interface PaneReportMetadataParams {
  agent?: string | null;
  applies_to_source?: string | null;
  clear_display_agent?: boolean;
  clear_state_labels?: boolean;
  clear_title?: boolean;
  display_agent?: string | null;
  pane_id: string;
  seq?: number | null;
  source: string;
  state_labels?: {
    [k: string]: string;
  };
  title?: string | null;
  tokens?: {
    [k: string]: string | null;
  };
  ttl_ms?: number | null;
  [k: string]: unknown;
}
interface PaneClearAgentAuthorityParams {
  pane_id: string;
  seq?: number | null;
  source?: string | null;
  [k: string]: unknown;
}
interface PaneReleaseAgentParams {
  agent: string;
  pane_id: string;
  seq?: number | null;
  source: string;
  [k: string]: unknown;
}
interface EventsSubscribeParams {
  subscriptions: Subscription[];
  [k: string]: unknown;
}
interface EventsWaitParams {
  match_event: EventMatch$1;
  timeout_ms?: number | null;
  [k: string]: unknown;
}
interface PaneWaitForOutputParams {
  lines?: number | null;
  match: OutputMatch;
  pane_id: string;
  source: ReadSource$1;
  strip_ansi?: boolean;
  timeout_ms?: number | null;
  [k: string]: unknown;
}
interface IntegrationInstallParams {
  target: IntegrationTarget$2;
  [k: string]: unknown;
}
interface IntegrationUninstallParams {
  target: IntegrationTarget$2;
  [k: string]: unknown;
}
interface PluginLinkParams {
  enabled?: boolean;
  path: string;
  source?: PluginSourceInfo$1 | null;
  [k: string]: unknown;
}
interface PluginSourceInfo$1 {
  installed_unix_ms?: number | null;
  kind?: "local" | "github";
  managed_path?: string | null;
  owner?: string | null;
  repo?: string | null;
  requested_ref?: string | null;
  resolved_commit?: string | null;
  subdir?: string | null;
  [k: string]: unknown;
}
interface PluginListParams {
  plugin_id?: string | null;
  [k: string]: unknown;
}
interface PluginUnlinkParams {
  plugin_id: string;
  [k: string]: unknown;
}
interface PluginSetEnabledParams {
  plugin_id: string;
  [k: string]: unknown;
}
interface PluginActionListParams {
  plugin_id?: string | null;
  [k: string]: unknown;
}
interface PluginActionInvokeParams {
  action_id: string;
  context?: PluginInvocationContext$2 | null;
  plugin_id?: string | null;
  [k: string]: unknown;
}
interface PluginInvocationContext$2 {
  clicked_url?: string | null;
  correlation_id?: string | null;
  focused_pane_agent?: string | null;
  focused_pane_cwd?: string | null;
  focused_pane_id?: string | null;
  focused_pane_status?: AgentStatus$2 | null;
  invocation_source?: string | null;
  link_handler_id?: string | null;
  selected_text?: string | null;
  tab_id?: string | null;
  tab_label?: string | null;
  workspace_cwd?: string | null;
  workspace_id?: string | null;
  workspace_label?: string | null;
  worktree?: WorkspaceWorktreeInfo$1 | null;
  [k: string]: unknown;
}
interface WorkspaceWorktreeInfo$1 {
  checkout_path: string;
  is_linked_worktree: boolean;
  repo_key: string;
  repo_name: string;
  repo_root: string;
  [k: string]: unknown;
}
interface PluginLogListParams {
  limit?: number | null;
  plugin_id?: string | null;
  [k: string]: unknown;
}
interface PluginPaneOpenParams {
  cwd?: string | null;
  direction?: SplitDirection$2 | null;
  entrypoint: string;
  env?: {
    [k: string]: string;
  };
  focus?: boolean;
  height?: PopupSize$1 | null;
  placement?: PluginPanePlacement$1 | null;
  plugin_id: string;
  target_pane_id?: string | null;
  width?: PopupSize$1 | null;
  workspace_id?: string | null;
  [k: string]: unknown;
}
interface PluginPaneFocusParams {
  pane_id: string;
  [k: string]: unknown;
}
interface PluginPaneCloseParams {
  pane_id: string;
  [k: string]: unknown;
}
//#endregion
//#region src/generated/wire-success-response.d.ts
/** Generated from schema/herdr-api.schema.json; do not edit. */
type ResponseResult = {
  capabilities?: ServerCapabilities$1 | null;
  protocol: number;
  type: "pong";
  version: string;
  [k: string]: unknown;
} | {
  snapshot: SessionSnapshot$1;
  type: "session_snapshot";
  [k: string]: unknown;
} | {
  type: "workspace_info";
  workspace: WorkspaceInfo;
  [k: string]: unknown;
} | {
  root_pane: PaneInfo;
  tab: TabInfo;
  type: "workspace_created";
  workspace: WorkspaceInfo;
  [k: string]: unknown;
} | {
  type: "workspace_list";
  workspaces: WorkspaceInfo[];
  [k: string]: unknown;
} | {
  source: WorktreeSourceInfo$1;
  type: "worktree_list";
  worktrees: WorktreeInfo[];
  [k: string]: unknown;
} | {
  root_pane: PaneInfo;
  tab: TabInfo;
  type: "worktree_created";
  workspace: WorkspaceInfo;
  worktree: WorktreeInfo;
  [k: string]: unknown;
} | {
  already_open: boolean;
  root_pane: PaneInfo;
  tab: TabInfo;
  type: "worktree_opened";
  workspace: WorkspaceInfo;
  worktree: WorktreeInfo;
  [k: string]: unknown;
} | {
  forced: boolean;
  path: string;
  type: "worktree_removed";
  workspace_id: string;
  [k: string]: unknown;
} | {
  tab: TabInfo;
  type: "tab_info";
  [k: string]: unknown;
} | {
  root_pane: PaneInfo;
  tab: TabInfo;
  type: "tab_created";
  [k: string]: unknown;
} | {
  tabs: TabInfo[];
  type: "tab_list";
  [k: string]: unknown;
} | {
  agent: AgentInfo;
  type: "agent_info";
  [k: string]: unknown;
} | {
  agent: AgentInfo;
  argv: string[];
  type: "agent_started";
  [k: string]: unknown;
} | {
  agent: AgentInfo;
  type: "agent_prompted";
  [k: string]: unknown;
} | {
  agents: AgentInfo[];
  type: "agent_list";
  [k: string]: unknown;
} | {
  active: boolean;
  label?: string | null;
  source?: string | null;
  type: "agent_view";
  [k: string]: unknown;
} | {
  pane: PaneInfo;
  type: "pane_info";
  [k: string]: unknown;
} | {
  panes: PaneInfo[];
  type: "pane_list";
  [k: string]: unknown;
} | {
  pane: PaneInfo;
  type: "pane_current";
  [k: string]: unknown;
} | {
  swap: PaneSwapResult$1;
  type: "pane_swap";
  [k: string]: unknown;
} | {
  move_result: PaneMoveResult$1;
  type: "pane_move";
  [k: string]: unknown;
} | {
  type: "pane_zoom";
  zoom: PaneZoomResult$1;
  [k: string]: unknown;
} | {
  layout: PaneLayoutSnapshot$1;
  type: "pane_layout";
  [k: string]: unknown;
} | {
  process_info: PaneProcessInfo$1;
  type: "pane_process_info";
  [k: string]: unknown;
} | {
  layout: LayoutDescription$1;
  type: "layout_export";
  [k: string]: unknown;
} | {
  layout: LayoutDescription$1;
  type: "layout_apply";
  [k: string]: unknown;
} | {
  layout: LayoutDescription$1;
  type: "layout_split_ratio_set";
  [k: string]: unknown;
} | {
  neighbor: PaneNeighborResult$1;
  type: "pane_neighbor";
  [k: string]: unknown;
} | {
  edges: PaneEdgesResult$1;
  type: "pane_edges";
  [k: string]: unknown;
} | {
  focus: PaneFocusDirectionResult$1;
  type: "pane_focus_direction";
  [k: string]: unknown;
} | {
  resize: PaneResizeResult$1;
  type: "pane_resize";
  [k: string]: unknown;
} | {
  read: PaneReadResult$1;
  type: "pane_read";
  [k: string]: unknown;
} | {
  pane_id: string;
  text: string;
  type: "pane_selection";
  [k: string]: unknown;
} | {
  content_revision: number;
  cursor: PaneTextPoint$1;
  pane_id: string;
  type: "pane_copy_motion";
  [k: string]: unknown;
} | {
  content_revision: number;
  current?: number | null;
  current_global?: number | null;
  matches: PaneTextRange$1[];
  pane_id: string;
  total: number;
  type: "pane_copy_search";
  [k: string]: unknown;
} | {
  explain: unknown;
  type: "agent_explain";
  [k: string]: unknown;
} | {
  type: "subscription_started";
  [k: string]: unknown;
} | {
  event: EventEnvelope;
  type: "wait_matched";
  [k: string]: unknown;
} | {
  matched_line?: string | null;
  pane_id: string;
  read: PaneReadResult$1;
  revision: number;
  type: "output_matched";
  [k: string]: unknown;
} | {
  reason: NotificationShowReason;
  shown: boolean;
  type: "notification_show";
  [k: string]: unknown;
} | {
  changed: boolean;
  reason: ClientWindowTitleReason;
  type: "client_window_title";
  [k: string]: unknown;
} | {
  integrations: IntegrationInfo$1[];
  type: "integration_list";
  [k: string]: unknown;
} | {
  details: IntegrationInstallResult;
  target: IntegrationTarget$1;
  type: "integration_install";
  [k: string]: unknown;
} | {
  details: IntegrationUninstallResult;
  target: IntegrationTarget$1;
  type: "integration_uninstall";
  [k: string]: unknown;
} | {
  manifests: AgentManifestInfo[];
  type: "agent_manifest_reload";
  [k: string]: unknown;
} | {
  last_check_unix?: number | null;
  last_result?: string | null;
  manifests: AgentManifestInfo[];
  type: "agent_manifest_status";
  [k: string]: unknown;
} | {
  plugin: InstalledPluginInfo;
  type: "plugin_linked";
  [k: string]: unknown;
} | {
  plugins: InstalledPluginInfo[];
  type: "plugin_list";
  [k: string]: unknown;
} | {
  plugin_id: string;
  removed: boolean;
  type: "plugin_unlinked";
  [k: string]: unknown;
} | {
  plugin: InstalledPluginInfo;
  type: "plugin_enabled";
  [k: string]: unknown;
} | {
  plugin: InstalledPluginInfo;
  type: "plugin_disabled";
  [k: string]: unknown;
} | {
  actions: PluginActionInfo[];
  type: "plugin_action_list";
  [k: string]: unknown;
} | {
  action: PluginActionInfo;
  context: PluginInvocationContext$1;
  log: PluginCommandLogInfo;
  type: "plugin_action_invoked";
  [k: string]: unknown;
} | {
  regions: PaneLinkRegion$1[];
  type: "pane_link_resolved";
  [k: string]: unknown;
} | {
  handled: boolean;
  type: "pane_link_activated";
  url?: string | null;
  [k: string]: unknown;
} | {
  logs: PluginCommandLogInfo[];
  type: "plugin_log_list";
  [k: string]: unknown;
} | {
  plugin_pane: PluginPaneInfo;
  type: "plugin_pane_opened";
  [k: string]: unknown;
} | {
  plugin_pane: PluginPaneInfo;
  type: "plugin_pane_focused";
  [k: string]: unknown;
} | {
  pane_id: string;
  type: "plugin_pane_closed";
  [k: string]: unknown;
} | {
  diagnostics: string[];
  status: ConfigReloadStatus;
  type: "config_reload";
  [k: string]: unknown;
} | {
  active: boolean;
  projection_revision: number;
  type: "client_shell_surface_set";
  [k: string]: unknown;
} | {
  type: "ok";
  [k: string]: unknown;
};
type AgentSessionRefKind = "id" | "path";
type AgentStatus$1 = "idle" | "working" | "blocked" | "done" | "unknown";
type SplitDirection$1 = "right" | "down";
type PaneSwapReason = "no_neighbor" | "same_pane" | "not_found" | "cross_tab";
type PaneMoveReason = "same_tab" | "zoomed_tab";
type PaneZoomReason = "single_pane" | "already_zoomed" | "already_unzoomed";
type LayoutNode$1 = {
  command?: string[] | null;
  cwd?: string | null;
  env?: {
    [k: string]: string;
  };
  label?: string | null;
  pane_id?: string | null;
  type: "pane";
  [k: string]: unknown;
} | {
  direction: SplitDirection$1;
  first: LayoutNode$1;
  ratio: number;
  second: LayoutNode$1;
  type: "split";
  [k: string]: unknown;
};
type PaneDirection$1 = "left" | "right" | "up" | "down";
type PaneFocusDirectionReason = "no_neighbor";
type PaneResizeReason = "unchanged";
type ReadFormat = "text" | "ansi";
type ReadSource = "visible" | "recent" | "recent_unwrapped" | "detection";
type EventData = {
  type: "workspace_created";
  workspace: WorkspaceInfo;
  [k: string]: unknown;
} | {
  type: "workspace_updated";
  workspace: WorkspaceInfo;
  [k: string]: unknown;
} | {
  type: "workspace_metadata_updated";
  workspace: WorkspaceInfo;
  [k: string]: unknown;
} | {
  type: "workspace_closed";
  workspace?: WorkspaceInfo | null;
  workspace_id: string;
  [k: string]: unknown;
} | {
  label: string;
  type: "workspace_renamed";
  workspace_id: string;
  [k: string]: unknown;
} | {
  insert_index: number;
  type: "workspace_moved";
  workspace_id: string;
  workspaces: WorkspaceInfo[];
  [k: string]: unknown;
} | {
  before_workspace_id?: string | null;
  type: "workspace_reordered";
  workspace_ids: string[];
  workspaces: WorkspaceInfo[];
  [k: string]: unknown;
} | {
  type: "workspace_focused";
  workspace_id: string;
  [k: string]: unknown;
} | {
  type: "worktree_created";
  workspace: WorkspaceInfo;
  worktree: WorktreeInfo;
  [k: string]: unknown;
} | {
  already_open: boolean;
  type: "worktree_opened";
  workspace: WorkspaceInfo;
  worktree: WorktreeInfo;
  [k: string]: unknown;
} | {
  forced: boolean;
  type: "worktree_removed";
  workspace?: WorkspaceInfo | null;
  workspace_id: string;
  worktree: WorktreeInfo;
  [k: string]: unknown;
} | {
  tab: TabInfo;
  type: "tab_created";
  [k: string]: unknown;
} | {
  tab_id: string;
  type: "tab_closed";
  workspace_id: string;
  [k: string]: unknown;
} | {
  label: string;
  tab_id: string;
  type: "tab_renamed";
  workspace_id: string;
  [k: string]: unknown;
} | {
  insert_index: number;
  tab_id: string;
  tabs: TabInfo[];
  type: "tab_moved";
  workspace_id: string;
  [k: string]: unknown;
} | {
  tab_id: string;
  type: "tab_focused";
  workspace_id: string;
  [k: string]: unknown;
} | {
  pane: PaneInfo;
  type: "pane_created";
  [k: string]: unknown;
} | {
  pane_id: string;
  type: "pane_closed";
  workspace_id: string;
  [k: string]: unknown;
} | {
  pane: PaneInfo;
  type: "pane_updated";
  [k: string]: unknown;
} | {
  pane_id: string;
  type: "pane_focused";
  workspace_id: string;
  [k: string]: unknown;
} | {
  closed_tab_id?: string | null;
  closed_workspace_id?: string | null;
  created_tab?: TabInfo | null;
  created_workspace?: WorkspaceInfo | null;
  pane: PaneInfo;
  previous_pane_id: string;
  previous_tab_id: string;
  previous_workspace_id: string;
  type: "pane_moved";
  [k: string]: unknown;
} | {
  pane_id: string;
  revision: number;
  type: "pane_output_changed";
  workspace_id: string;
  [k: string]: unknown;
} | {
  pane_id: string;
  type: "pane_exited";
  workspace_id: string;
  [k: string]: unknown;
} | {
  agent?: string | null;
  final_status?: AgentStatus$1 | null;
  pane_id: string;
  released?: boolean;
  type: "pane_agent_detected";
  workspace_id: string;
  [k: string]: unknown;
} | {
  agent?: string | null;
  agent_status: AgentStatus$1;
  display_agent?: string | null;
  pane_id: string;
  state_labels?: {
    [k: string]: string;
  };
  title?: string | null;
  type: "pane_agent_status_changed";
  workspace_id: string;
  [k: string]: unknown;
} | {
  layout: PaneLayoutSnapshot$1;
  type: "layout_updated";
  [k: string]: unknown;
};
type EventKind = "workspace_created" | "workspace_updated" | "workspace_metadata_updated" | "workspace_closed" | "workspace_renamed" | "workspace_moved" | "workspace_reordered" | "workspace_focused" | "worktree_created" | "worktree_opened" | "worktree_removed" | "tab_created" | "tab_closed" | "tab_renamed" | "tab_moved" | "tab_focused" | "pane_created" | "pane_closed" | "pane_updated" | "pane_focused" | "pane_moved" | "pane_output_changed" | "pane_exited" | "pane_agent_detected" | "pane_agent_status_changed" | "layout_updated";
type NotificationShowReason = "shown" | "disabled" | "rate_limited" | "no_foreground_client" | "busy";
type ClientWindowTitleReason = "set" | "cleared" | "no_foreground_client";
type IntegrationState$1 = "not_installed" | "current" | "outdated";
type IntegrationTarget$1 = "pi" | "omp" | "claude" | "codex" | "copilot" | "devin" | "droid" | "kimi" | "opencode" | "kilo" | "hermes" | "qodercli" | "qwen" | "cursor" | "mastracode" | "antigravity_cli" | "grok";
type PluginActionContext$1 = "global" | "workspace" | "tab" | "pane" | "selection";
type PluginPlatform$1 = "linux" | "macos" | "windows";
type PopupSize = number | string;
type PluginCommandStatus = "running" | "succeeded" | "failed";
type ConfigReloadStatus = "applied" | "partial" | "failed";
interface ServerCapabilities$1 {
  detached_server_daemon?: boolean;
  /**
   * Stable client-owned endpoint generation supported by this server.
   */
  endpoint_protocol_generation?: number | null;
  /**
   * Whether this server supports endpoint health probes.
   */
  health_check?: boolean;
  live_handoff: boolean;
  /**
   * Supports connection-scoped `server.ssh_agent.register` on the local JSON API.
   */
  ssh_agent_registration?: boolean;
  /**
   * Whether this server supports explicit client-shell surface interest.
   */
  surface_interest?: boolean;
  [k: string]: unknown;
}
interface SessionSnapshot$1 {
  agents: AgentInfo[];
  focused_pane_id?: string | null;
  focused_tab_id?: string | null;
  focused_workspace_id?: string | null;
  layouts: PaneLayoutSnapshot$1[];
  panes: PaneInfo[];
  protocol: number;
  tabs: TabInfo[];
  version: string;
  workspaces: WorkspaceInfo[];
  [k: string]: unknown;
}
interface AgentInfo {
  agent?: string | null;
  agent_session?: AgentSessionInfo | null;
  agent_status: AgentStatus$1;
  /**
   * The current idle transition completed work, independently of who has viewed it.
   */
  completion_seq?: number | null;
  cwd?: string | null;
  display_agent?: string | null;
  focused: boolean;
  foreground_cwd?: string | null;
  interactive_ready?: boolean;
  launch_pending?: boolean;
  name?: string | null;
  pane_id: string;
  revision: number;
  screen_detection_skipped?: boolean;
  state_change_seq?: number;
  state_labels?: {
    [k: string]: string;
  };
  tab_id: string;
  terminal_id: string;
  terminal_title?: string | null;
  terminal_title_stripped?: string | null;
  title?: string | null;
  tokens?: {
    [k: string]: string;
  };
  workspace_id: string;
  [k: string]: unknown;
}
interface AgentSessionInfo {
  agent: string;
  kind: AgentSessionRefKind;
  source: string;
  value: string;
  [k: string]: unknown;
}
interface PaneLayoutSnapshot$1 {
  area: PaneLayoutRect$1;
  focused_pane_id: string;
  panes: PaneLayoutPane[];
  splits: PaneLayoutSplit[];
  tab_id: string;
  workspace_id: string;
  zoomed: boolean;
  [k: string]: unknown;
}
interface PaneLayoutRect$1 {
  height: number;
  width: number;
  x: number;
  y: number;
  [k: string]: unknown;
}
interface PaneLayoutPane {
  focused: boolean;
  pane_id: string;
  rect: PaneLayoutRect$1;
  [k: string]: unknown;
}
interface PaneLayoutSplit {
  direction: SplitDirection$1;
  id: string;
  ratio: number;
  rect: PaneLayoutRect$1;
  [k: string]: unknown;
}
interface PaneInfo {
  agent?: string | null;
  agent_session?: AgentSessionInfo | null;
  agent_status: AgentStatus$1;
  cwd?: string | null;
  display_agent?: string | null;
  focused: boolean;
  foreground_cwd?: string | null;
  label?: string | null;
  pane_id: string;
  restore_error?: string | null;
  revision: number;
  scroll?: PaneScrollInfo | null;
  state_labels?: {
    [k: string]: string;
  };
  tab_id: string;
  terminal_id: string;
  terminal_title?: string | null;
  terminal_title_stripped?: string | null;
  title?: string | null;
  tokens?: {
    [k: string]: string;
  };
  workspace_id: string;
  [k: string]: unknown;
}
interface PaneScrollInfo {
  max_offset_from_bottom: number;
  offset_from_bottom: number;
  viewport_rows: number;
  [k: string]: unknown;
}
interface TabInfo {
  agent_status: AgentStatus$1;
  focused: boolean;
  label: string;
  number: number;
  pane_count: number;
  tab_id: string;
  workspace_id: string;
  [k: string]: unknown;
}
interface WorkspaceInfo {
  active_tab_id: string;
  agent_status: AgentStatus$1;
  focused: boolean;
  label: string;
  number: number;
  pane_count: number;
  tab_count: number;
  tokens?: {
    [k: string]: string;
  };
  workspace_id: string;
  worktree?: WorkspaceWorktreeInfo | null;
  [k: string]: unknown;
}
interface WorkspaceWorktreeInfo {
  checkout_path: string;
  is_linked_worktree: boolean;
  repo_key: string;
  repo_name: string;
  repo_root: string;
  [k: string]: unknown;
}
interface WorktreeSourceInfo$1 {
  repo_key: string;
  repo_name: string;
  repo_root: string;
  source_checkout_path: string;
  source_workspace_id?: string | null;
  [k: string]: unknown;
}
interface WorktreeInfo {
  branch?: string | null;
  is_bare: boolean;
  is_detached: boolean;
  is_linked_worktree: boolean;
  is_prunable: boolean;
  label: string;
  open_workspace_id?: string | null;
  path: string;
  [k: string]: unknown;
}
interface PaneSwapResult$1 {
  changed: boolean;
  focused_pane_id: string;
  layout: PaneLayoutSnapshot$1;
  reason?: PaneSwapReason | null;
  source_pane_id: string;
  target_pane_id?: string | null;
  [k: string]: unknown;
}
interface PaneMoveResult$1 {
  changed: boolean;
  closed_tab_id?: string | null;
  closed_workspace_id?: string | null;
  created_tab?: TabInfo | null;
  created_workspace?: WorkspaceInfo | null;
  focused_pane_id: string;
  pane: PaneInfo;
  previous_pane_id: string;
  previous_tab_id: string;
  previous_workspace_id: string;
  reason?: PaneMoveReason | null;
  source_layout?: PaneLayoutSnapshot$1 | null;
  target_layout: PaneLayoutSnapshot$1;
  [k: string]: unknown;
}
interface PaneZoomResult$1 {
  changed: boolean;
  focus_changed: boolean;
  focused_pane_id: string;
  layout: PaneLayoutSnapshot$1;
  pane_id: string;
  reason?: PaneZoomReason | null;
  zoom_changed: boolean;
  zoomed: boolean;
  [k: string]: unknown;
}
interface PaneProcessInfo$1 {
  foreground_process_group_id?: number | null;
  foreground_processes?: PaneProcessInfoProcess[];
  pane_id: string;
  shell_pid?: number | null;
  tty?: string | null;
  [k: string]: unknown;
}
interface PaneProcessInfoProcess {
  argv?: string[] | null;
  argv0?: string | null;
  cmdline?: string | null;
  cwd?: string | null;
  name: string;
  pid: number;
  [k: string]: unknown;
}
interface LayoutDescription$1 {
  focused_pane_id: string;
  root: LayoutNode$1;
  tab_id: string;
  workspace_id: string;
  zoomed: boolean;
  [k: string]: unknown;
}
interface PaneNeighborResult$1 {
  direction: PaneDirection$1;
  layout: PaneLayoutSnapshot$1;
  neighbor_pane_id?: string | null;
  pane_id: string;
  [k: string]: unknown;
}
interface PaneEdgesResult$1 {
  down: boolean;
  layout: PaneLayoutSnapshot$1;
  left: boolean;
  pane_id: string;
  right: boolean;
  up: boolean;
  [k: string]: unknown;
}
interface PaneFocusDirectionResult$1 {
  changed: boolean;
  focused_pane_id?: string | null;
  layout: PaneLayoutSnapshot$1;
  reason?: PaneFocusDirectionReason | null;
  source_pane_id: string;
  [k: string]: unknown;
}
interface PaneResizeResult$1 {
  changed: boolean;
  focused_pane_id: string;
  layout: PaneLayoutSnapshot$1;
  pane_id: string;
  reason?: PaneResizeReason | null;
  [k: string]: unknown;
}
interface PaneReadResult$1 {
  format: ReadFormat;
  pane_id: string;
  revision: number;
  source: ReadSource;
  tab_id: string;
  text: string;
  truncated: boolean;
  workspace_id: string;
  [k: string]: unknown;
}
interface PaneTextPoint$1 {
  col: number;
  row: number;
  [k: string]: unknown;
}
interface PaneTextRange$1 {
  end: PaneTextPoint$1;
  start: PaneTextPoint$1;
  [k: string]: unknown;
}
interface EventEnvelope {
  data: EventData;
  event: EventKind;
  [k: string]: unknown;
}
interface IntegrationInfo$1 {
  available: boolean;
  command: string;
  label: string;
  state: IntegrationState$1;
  target: IntegrationTarget$1;
  [k: string]: unknown;
}
interface IntegrationInstallResult {
  messages: string[];
  [k: string]: unknown;
}
interface IntegrationUninstallResult {
  messages: string[];
  [k: string]: unknown;
}
interface AgentManifestInfo {
  active_version?: string | null;
  agent: string;
  cached_remote_version?: string | null;
  local_override_shadowing_remote: boolean;
  remote_last_checked_unix?: number | null;
  remote_update_error?: string | null;
  remote_update_result?: string | null;
  source: string;
  source_kind: string;
  warning?: string | null;
  [k: string]: unknown;
}
interface InstalledPluginInfo {
  actions?: PluginManifestAction$1[];
  build?: PluginManifestBuild[];
  description?: string | null;
  enabled: boolean;
  events?: PluginManifestEventHook$1[];
  link_handlers?: PluginManifestLinkHandler$1[];
  manifest_path: string;
  min_herdr_version?: string;
  name: string;
  panes?: PluginManifestPane$1[];
  platforms?: PluginPlatform$1[] | null;
  plugin_id: string;
  plugin_root: string;
  source?: PluginSourceInfo;
  startup?: PluginManifestStartup[];
  version: string;
  /**
   * Warnings collected at link time or on registry load (e.g. unknown event names,
   * missing manifest file). Non-fatal — the entry is kept and surfaced by plugin.list.
   */
  warnings?: string[];
  [k: string]: unknown;
}
interface PluginManifestAction$1 {
  command: string[];
  contexts?: PluginActionContext$1[];
  description?: string | null;
  id: string;
  platforms?: PluginPlatform$1[] | null;
  title: string;
  [k: string]: unknown;
}
interface PluginManifestBuild {
  command: string[];
  platforms?: PluginPlatform$1[] | null;
  [k: string]: unknown;
}
interface PluginManifestEventHook$1 {
  command: string[];
  on: string;
  platforms?: PluginPlatform$1[] | null;
  [k: string]: unknown;
}
interface PluginManifestLinkHandler$1 {
  action: string;
  id: string;
  pattern: string;
  platforms?: PluginPlatform$1[] | null;
  title: string;
  [k: string]: unknown;
}
interface PluginManifestPane$1 {
  command: string[];
  description?: string | null;
  height?: PopupSize | null;
  id: string;
  placement?: "overlay" | "popup" | "split" | "tab" | "zoomed";
  platforms?: PluginPlatform$1[] | null;
  title: string;
  width?: PopupSize | null;
  [k: string]: unknown;
}
interface PluginSourceInfo {
  installed_unix_ms?: number | null;
  kind?: "local" | "github";
  managed_path?: string | null;
  owner?: string | null;
  repo?: string | null;
  requested_ref?: string | null;
  resolved_commit?: string | null;
  subdir?: string | null;
  [k: string]: unknown;
}
interface PluginManifestStartup {
  command: string[];
  platforms?: PluginPlatform$1[] | null;
  [k: string]: unknown;
}
interface PluginActionInfo {
  action_id: string;
  command: string[];
  contexts?: PluginActionContext$1[];
  description?: string | null;
  platforms?: PluginPlatform$1[] | null;
  plugin_id: string;
  title: string;
  [k: string]: unknown;
}
interface PluginInvocationContext$1 {
  clicked_url?: string | null;
  correlation_id?: string | null;
  focused_pane_agent?: string | null;
  focused_pane_cwd?: string | null;
  focused_pane_id?: string | null;
  focused_pane_status?: AgentStatus$1 | null;
  invocation_source?: string | null;
  link_handler_id?: string | null;
  selected_text?: string | null;
  tab_id?: string | null;
  tab_label?: string | null;
  workspace_cwd?: string | null;
  workspace_id?: string | null;
  workspace_label?: string | null;
  worktree?: WorkspaceWorktreeInfo | null;
  [k: string]: unknown;
}
interface PluginCommandLogInfo {
  action_id?: string | null;
  command: string[];
  error?: string | null;
  event?: string | null;
  exit_code?: number | null;
  finished_unix_ms?: number | null;
  log_id: string;
  plugin_id: string;
  started_unix_ms: number;
  status: PluginCommandStatus;
  stderr?: string | null;
  stdout?: string | null;
  [k: string]: unknown;
}
/**
 * Inclusive display-cell columns on a pane's current viewport.
 */
interface PaneLinkRegion$1 {
  end_col: number;
  row: number;
  start_col: number;
  [k: string]: unknown;
}
interface PluginPaneInfo {
  entrypoint: string;
  pane: PaneInfo;
  plugin_id: string;
  [k: string]: unknown;
}
//#endregion
//#region src/generated/wire-method-map.d.ts
interface WireMethodMap {
  readonly "agent.explain": {
    readonly params: Extract<Request, {
      readonly method: "agent.explain";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_explain";
    }>;
  };
  readonly "agent.focus": {
    readonly params: Extract<Request, {
      readonly method: "agent.focus";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_info";
    }>;
  };
  readonly "agent.get": {
    readonly params: Extract<Request, {
      readonly method: "agent.get";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_info";
    }>;
  };
  readonly "agent.list": {
    readonly params: Extract<Request, {
      readonly method: "agent.list";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_list";
    }>;
  };
  readonly "agent.prompt": {
    readonly params: Extract<Request, {
      readonly method: "agent.prompt";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_prompted";
    }>;
  };
  readonly "agent.read": {
    readonly params: Extract<Request, {
      readonly method: "agent.read";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_read";
    }>;
  };
  readonly "agent.rename": {
    readonly params: Extract<Request, {
      readonly method: "agent.rename";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_info";
    }>;
  };
  readonly "agent.send_keys": {
    readonly params: Extract<Request, {
      readonly method: "agent.send_keys";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "agent.start": {
    readonly params: Extract<Request, {
      readonly method: "agent.start";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_started";
    }>;
  };
  readonly "agent.view.clear": {
    readonly params: Extract<Request, {
      readonly method: "agent.view.clear";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_view";
    }>;
  };
  readonly "agent.view.set": {
    readonly params: Extract<Request, {
      readonly method: "agent.view.set";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_view";
    }>;
  };
  readonly "agent.wait": {
    readonly params: Extract<Request, {
      readonly method: "agent.wait";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_info";
    }>;
  };
  readonly "client_shell.surface.set": {
    readonly params: Extract<Request, {
      readonly method: "client_shell.surface.set";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "client_shell_surface_set";
    }>;
  };
  readonly "client.window_title.clear": {
    readonly params: Extract<Request, {
      readonly method: "client.window_title.clear";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "client_window_title";
    }>;
  };
  readonly "client.window_title.set": {
    readonly params: Extract<Request, {
      readonly method: "client.window_title.set";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "client_window_title";
    }>;
  };
  readonly "command.invoke": {
    readonly params: Extract<Request, {
      readonly method: "command.invoke";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "events.subscribe": {
    readonly params: Extract<Request, {
      readonly method: "events.subscribe";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "subscription_started";
    }>;
  };
  readonly "events.wait": {
    readonly params: Extract<Request, {
      readonly method: "events.wait";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "wait_matched";
    }>;
  };
  readonly "integration.install": {
    readonly params: Extract<Request, {
      readonly method: "integration.install";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "integration_install";
    }>;
  };
  readonly "integration.list": {
    readonly params: Extract<Request, {
      readonly method: "integration.list";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "integration_list";
    }>;
  };
  readonly "integration.uninstall": {
    readonly params: Extract<Request, {
      readonly method: "integration.uninstall";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "integration_uninstall";
    }>;
  };
  readonly "layout.apply": {
    readonly params: Extract<Request, {
      readonly method: "layout.apply";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "layout_apply";
    }>;
  };
  readonly "layout.export": {
    readonly params: Extract<Request, {
      readonly method: "layout.export";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "layout_export";
    }>;
  };
  readonly "layout.set_split_ratio": {
    readonly params: Extract<Request, {
      readonly method: "layout.set_split_ratio";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "layout_split_ratio_set";
    }>;
  };
  readonly "notification.show": {
    readonly params: Extract<Request, {
      readonly method: "notification.show";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "notification_show";
    }>;
  };
  readonly "pane.clear": {
    readonly params: Extract<Request, {
      readonly method: "pane.clear";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.clear_agent_authority": {
    readonly params: Extract<Request, {
      readonly method: "pane.clear_agent_authority";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.close": {
    readonly params: Extract<Request, {
      readonly method: "pane.close";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.copy_motion": {
    readonly params: Extract<Request, {
      readonly method: "pane.copy_motion";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_copy_motion";
    }>;
  };
  readonly "pane.copy_search": {
    readonly params: Extract<Request, {
      readonly method: "pane.copy_search";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_copy_search";
    }>;
  };
  readonly "pane.current": {
    readonly params: Extract<Request, {
      readonly method: "pane.current";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_current";
    }>;
  };
  readonly "pane.edges": {
    readonly params: Extract<Request, {
      readonly method: "pane.edges";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_edges";
    }>;
  };
  readonly "pane.edit_scrollback": {
    readonly params: Extract<Request, {
      readonly method: "pane.edit_scrollback";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.focus": {
    readonly params: Extract<Request, {
      readonly method: "pane.focus";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_info";
    }>;
  };
  readonly "pane.focus_direction": {
    readonly params: Extract<Request, {
      readonly method: "pane.focus_direction";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_focus_direction";
    }>;
  };
  readonly "pane.get": {
    readonly params: Extract<Request, {
      readonly method: "pane.get";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_info";
    }>;
  };
  readonly "pane.input.set": {
    readonly params: Extract<Request, {
      readonly method: "pane.input.set";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.layout": {
    readonly params: Extract<Request, {
      readonly method: "pane.layout";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_layout";
    }>;
  };
  readonly "pane.link.activate": {
    readonly params: Extract<Request, {
      readonly method: "pane.link.activate";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_link_activated";
    }>;
  };
  readonly "pane.link.resolve": {
    readonly params: Extract<Request, {
      readonly method: "pane.link.resolve";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_link_resolved";
    }>;
  };
  readonly "pane.list": {
    readonly params: Extract<Request, {
      readonly method: "pane.list";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_list";
    }>;
  };
  readonly "pane.move": {
    readonly params: Extract<Request, {
      readonly method: "pane.move";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_move";
    }>;
  };
  readonly "pane.neighbor": {
    readonly params: Extract<Request, {
      readonly method: "pane.neighbor";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_neighbor";
    }>;
  };
  readonly "pane.process_info": {
    readonly params: Extract<Request, {
      readonly method: "pane.process_info";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_process_info";
    }>;
  };
  readonly "pane.read": {
    readonly params: Extract<Request, {
      readonly method: "pane.read";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_read";
    }>;
  };
  readonly "pane.release_agent": {
    readonly params: Extract<Request, {
      readonly method: "pane.release_agent";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.rename": {
    readonly params: Extract<Request, {
      readonly method: "pane.rename";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_info";
    }>;
  };
  readonly "pane.report_agent": {
    readonly params: Extract<Request, {
      readonly method: "pane.report_agent";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.report_agent_session": {
    readonly params: Extract<Request, {
      readonly method: "pane.report_agent_session";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.report_metadata": {
    readonly params: Extract<Request, {
      readonly method: "pane.report_metadata";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.resize": {
    readonly params: Extract<Request, {
      readonly method: "pane.resize";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_resize";
    }>;
  };
  readonly "pane.scroll": {
    readonly params: Extract<Request, {
      readonly method: "pane.scroll";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_info";
    }>;
  };
  readonly "pane.selection.read": {
    readonly params: Extract<Request, {
      readonly method: "pane.selection.read";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_selection";
    }>;
  };
  readonly "pane.send_input": {
    readonly params: Extract<Request, {
      readonly method: "pane.send_input";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.send_keys": {
    readonly params: Extract<Request, {
      readonly method: "pane.send_keys";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.send_text": {
    readonly params: Extract<Request, {
      readonly method: "pane.send_text";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "pane.split": {
    readonly params: Extract<Request, {
      readonly method: "pane.split";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_info";
    }>;
  };
  readonly "pane.swap": {
    readonly params: Extract<Request, {
      readonly method: "pane.swap";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_swap";
    }>;
  };
  readonly "pane.wait_for_output": {
    readonly params: Extract<Request, {
      readonly method: "pane.wait_for_output";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "output_matched";
    }>;
  };
  readonly "pane.zoom": {
    readonly params: Extract<Request, {
      readonly method: "pane.zoom";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pane_zoom";
    }>;
  };
  readonly ping: {
    readonly params: Extract<Request, {
      readonly method: "ping";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "pong";
    }>;
  };
  readonly "plugin.action.invoke": {
    readonly params: Extract<Request, {
      readonly method: "plugin.action.invoke";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_action_invoked";
    }>;
  };
  readonly "plugin.action.list": {
    readonly params: Extract<Request, {
      readonly method: "plugin.action.list";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_action_list";
    }>;
  };
  readonly "plugin.disable": {
    readonly params: Extract<Request, {
      readonly method: "plugin.disable";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_disabled";
    }>;
  };
  readonly "plugin.enable": {
    readonly params: Extract<Request, {
      readonly method: "plugin.enable";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_enabled";
    }>;
  };
  readonly "plugin.link": {
    readonly params: Extract<Request, {
      readonly method: "plugin.link";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_linked";
    }>;
  };
  readonly "plugin.list": {
    readonly params: Extract<Request, {
      readonly method: "plugin.list";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_list";
    }>;
  };
  readonly "plugin.log.list": {
    readonly params: Extract<Request, {
      readonly method: "plugin.log.list";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_log_list";
    }>;
  };
  readonly "plugin.pane.close": {
    readonly params: Extract<Request, {
      readonly method: "plugin.pane.close";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_pane_closed";
    }>;
  };
  readonly "plugin.pane.focus": {
    readonly params: Extract<Request, {
      readonly method: "plugin.pane.focus";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_pane_focused";
    }>;
  };
  readonly "plugin.pane.open": {
    readonly params: Extract<Request, {
      readonly method: "plugin.pane.open";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_pane_opened" | "ok";
    }>;
  };
  readonly "plugin.unlink": {
    readonly params: Extract<Request, {
      readonly method: "plugin.unlink";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "plugin_unlinked";
    }>;
  };
  readonly "popup.close": {
    readonly params: Extract<Request, {
      readonly method: "popup.close";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "product_announcement.dismiss": {
    readonly params: Extract<Request, {
      readonly method: "product_announcement.dismiss";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "release_notes.dismiss": {
    readonly params: Extract<Request, {
      readonly method: "release_notes.dismiss";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "server.agent_manifests": {
    readonly params: Extract<Request, {
      readonly method: "server.agent_manifests";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_manifest_status";
    }>;
  };
  readonly "server.live_handoff": {
    readonly params: Extract<Request, {
      readonly method: "server.live_handoff";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "server.reload_agent_manifests": {
    readonly params: Extract<Request, {
      readonly method: "server.reload_agent_manifests";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "agent_manifest_reload";
    }>;
  };
  readonly "server.reload_config": {
    readonly params: Extract<Request, {
      readonly method: "server.reload_config";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "config_reload";
    }>;
  };
  readonly "server.ssh_agent.register": {
    readonly params: Extract<Request, {
      readonly method: "server.ssh_agent.register";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "server.stop": {
    readonly params: Extract<Request, {
      readonly method: "server.stop";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "session.snapshot": {
    readonly params: Extract<Request, {
      readonly method: "session.snapshot";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "session_snapshot";
    }>;
  };
  readonly "tab.close": {
    readonly params: Extract<Request, {
      readonly method: "tab.close";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "tab.create": {
    readonly params: Extract<Request, {
      readonly method: "tab.create";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "tab_created";
    }>;
  };
  readonly "tab.focus": {
    readonly params: Extract<Request, {
      readonly method: "tab.focus";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "tab_info";
    }>;
  };
  readonly "tab.get": {
    readonly params: Extract<Request, {
      readonly method: "tab.get";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "tab_info";
    }>;
  };
  readonly "tab.list": {
    readonly params: Extract<Request, {
      readonly method: "tab.list";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "tab_list";
    }>;
  };
  readonly "tab.move": {
    readonly params: Extract<Request, {
      readonly method: "tab.move";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "tab_list";
    }>;
  };
  readonly "tab.rename": {
    readonly params: Extract<Request, {
      readonly method: "tab.rename";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "tab_info";
    }>;
  };
  readonly "workspace.close": {
    readonly params: Extract<Request, {
      readonly method: "workspace.close";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "workspace.create": {
    readonly params: Extract<Request, {
      readonly method: "workspace.create";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "workspace_created";
    }>;
  };
  readonly "workspace.focus": {
    readonly params: Extract<Request, {
      readonly method: "workspace.focus";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "workspace_info";
    }>;
  };
  readonly "workspace.get": {
    readonly params: Extract<Request, {
      readonly method: "workspace.get";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "workspace_info";
    }>;
  };
  readonly "workspace.list": {
    readonly params: Extract<Request, {
      readonly method: "workspace.list";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "workspace_list";
    }>;
  };
  readonly "workspace.move": {
    readonly params: Extract<Request, {
      readonly method: "workspace.move";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "workspace_list";
    }>;
  };
  readonly "workspace.move_block": {
    readonly params: Extract<Request, {
      readonly method: "workspace.move_block";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "workspace_list";
    }>;
  };
  readonly "workspace.rename": {
    readonly params: Extract<Request, {
      readonly method: "workspace.rename";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "workspace_info";
    }>;
  };
  readonly "workspace.report_metadata": {
    readonly params: Extract<Request, {
      readonly method: "workspace.report_metadata";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "ok";
    }>;
  };
  readonly "worktree.create": {
    readonly params: Extract<Request, {
      readonly method: "worktree.create";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "worktree_created";
    }>;
  };
  readonly "worktree.list": {
    readonly params: Extract<Request, {
      readonly method: "worktree.list";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "worktree_list";
    }>;
  };
  readonly "worktree.open": {
    readonly params: Extract<Request, {
      readonly method: "worktree.open";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "worktree_opened";
    }>;
  };
  readonly "worktree.remove": {
    readonly params: Extract<Request, {
      readonly method: "worktree.remove";
    }>["params"];
    readonly result: Extract<ResponseResult, {
      readonly type: "worktree_removed";
    }>;
  };
}
/** Every schema-declared request method. */
type WireMethod = keyof WireMethodMap;
//#endregion
//#region src/herdr-models.d.ts
/**
 * Agent lifecycle status reported by Herdr resources.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
/**
 * Agent lifecycle status reported by Herdr resources.
 *
 * @category models
 * @since 0.8.2
 */
type AgentStatus = typeof AgentStatus.Type;
/**
 * Agent state accepted by pane reporting operations.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const ReportedAgentState: Schema.Literals<readonly ["idle", "working", "blocked", "unknown"]>;
/**
 * Agent state accepted by pane reporting operations.
 *
 * @category models
 * @since 0.8.2
 */
type ReportedAgentState = typeof ReportedAgentState.Type;
/**
 * How an agent session reference identifies the upstream session.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentSessionReferenceKind: Schema.Literals<readonly ["id", "path"]>;
/**
 * How an agent session reference identifies the upstream session.
 *
 * @category models
 * @since 0.8.2
 */
type AgentSessionReferenceKind = typeof AgentSessionReferenceKind.Type;
/**
 * Stable reference to an upstream agent session.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentSessionReference: Schema.Struct<{
  readonly source: Schema.String;
  readonly agent: Schema.String;
  readonly kind: Schema.Literals<readonly ["id", "path"]>;
  readonly value: Schema.String;
}>;
/**
 * Stable reference to an upstream agent session.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentSessionReference extends Schema.Schema.Type<typeof AgentSessionReference> {}
/**
 * Optional server capabilities reported by the compatibility handshake.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const ServerCapabilities: Schema.encodeKeys<Schema.Struct<{
  readonly liveHandoff: Schema.Boolean;
  readonly detachedServerDaemon: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
  readonly endpointProtocolGeneration: Schema.OptionFromOptionalNullOr<Schema.Natural>;
  readonly surfaceInterest: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
  readonly healthCheck: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
  /** True when this local server accepts connection-scoped SSH agent registration. */
  readonly sshAgentRegistration: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
}>, {
  readonly liveHandoff: "live_handoff";
  readonly detachedServerDaemon: "detached_server_daemon";
  readonly endpointProtocolGeneration: "endpoint_protocol_generation";
  readonly surfaceInterest: "surface_interest";
  readonly healthCheck: "health_check";
  readonly sshAgentRegistration: "ssh_agent_registration";
}>;
/**
 * Optional server capabilities reported by the compatibility handshake.
 *
 * @category models
 * @since 0.8.2
 */
interface ServerCapabilities extends Schema.Schema.Type<typeof ServerCapabilities> {}
/**
 * Successful Herdr compatibility handshake.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PingResult: Schema.Struct<{
  readonly version: Schema.String;
  readonly protocol: Schema.Natural;
  readonly capabilities: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly liveHandoff: Schema.Boolean;
    readonly detachedServerDaemon: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
    readonly endpointProtocolGeneration: Schema.OptionFromOptionalNullOr<Schema.Natural>;
    readonly surfaceInterest: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
    readonly healthCheck: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
    /** True when this local server accepts connection-scoped SSH agent registration. */
    readonly sshAgentRegistration: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
  }>, {
    readonly liveHandoff: "live_handoff";
    readonly detachedServerDaemon: "detached_server_daemon";
    readonly endpointProtocolGeneration: "endpoint_protocol_generation";
    readonly surfaceInterest: "surface_interest";
    readonly healthCheck: "health_check";
    readonly sshAgentRegistration: "ssh_agent_registration";
  }>>;
}>;
/**
 * Successful Herdr compatibility handshake.
 *
 * @category models
 * @since 0.8.2
 */
interface PingResult extends Schema.Schema.Type<typeof PingResult> {}
/**
 * Server configuration reload status and diagnostics.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const ConfigReloadResult: Schema.Struct<{
  readonly status: Schema.Literals<readonly ["applied", "partial", "failed"]>;
  readonly diagnostics: Schema.$Array<Schema.String>;
}>;
/**
 * Server configuration reload status and diagnostics.
 *
 * @category models
 * @since 0.8.2
 */
interface ConfigReloadResult extends Schema.Schema.Type<typeof ConfigReloadResult> {}
/**
 * One discovered agent manifest and its update state.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentManifest: Schema.encodeKeys<Schema.Struct<{
  readonly agent: Schema.String;
  readonly source: Schema.String;
  readonly sourceKind: Schema.String;
  readonly activeVersion: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly cachedRemoteVersion: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly localOverrideShadowingRemote: Schema.Boolean;
  readonly remoteUpdateResult: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly remoteUpdateError: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly remoteLastCheckedUnix: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.Natural, "HerdrUnixSeconds">>;
  readonly warning: Schema.OptionFromOptionalNullOr<Schema.String>;
}>, {
  readonly sourceKind: "source_kind";
  readonly activeVersion: "active_version";
  readonly cachedRemoteVersion: "cached_remote_version";
  readonly localOverrideShadowingRemote: "local_override_shadowing_remote";
  readonly remoteUpdateResult: "remote_update_result";
  readonly remoteUpdateError: "remote_update_error";
  readonly remoteLastCheckedUnix: "remote_last_checked_unix";
}>;
/**
 * One discovered agent manifest and its update state.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentManifest extends Schema.Schema.Type<typeof AgentManifest> {}
/**
 * Current agent-manifest cache and refresh state.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentManifestStatus: Schema.encodeKeys<Schema.Struct<{
  readonly lastCheckUnix: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.Natural, "HerdrUnixSeconds">>;
  readonly lastResult: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly manifests: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly agent: Schema.String;
    readonly source: Schema.String;
    readonly sourceKind: Schema.String;
    readonly activeVersion: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly cachedRemoteVersion: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly localOverrideShadowingRemote: Schema.Boolean;
    readonly remoteUpdateResult: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly remoteUpdateError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly remoteLastCheckedUnix: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.Natural, "HerdrUnixSeconds">>;
    readonly warning: Schema.OptionFromOptionalNullOr<Schema.String>;
  }>, {
    readonly sourceKind: "source_kind";
    readonly activeVersion: "active_version";
    readonly cachedRemoteVersion: "cached_remote_version";
    readonly localOverrideShadowingRemote: "local_override_shadowing_remote";
    readonly remoteUpdateResult: "remote_update_result";
    readonly remoteUpdateError: "remote_update_error";
    readonly remoteLastCheckedUnix: "remote_last_checked_unix";
  }>>;
}>, {
  readonly lastCheckUnix: "last_check_unix";
  readonly lastResult: "last_result";
}>;
/**
 * Current agent-manifest cache and refresh state.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentManifestStatus extends Schema.Schema.Type<typeof AgentManifestStatus> {}
/**
 * Result of showing a foreground notification.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const NotificationShowResult: Schema.Struct<{
  readonly shown: Schema.Boolean;
  readonly reason: Schema.Literals<readonly ["shown", "disabled", "rate_limited", "no_foreground_client", "busy"]>;
}>;
/**
 * Result of showing a foreground notification.
 *
 * @category models
 * @since 0.8.2
 */
interface NotificationShowResult extends Schema.Schema.Type<typeof NotificationShowResult> {}
/**
 * Result of changing the foreground client's window title.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const ClientWindowTitleResult: Schema.Struct<{
  readonly changed: Schema.Boolean;
  readonly reason: Schema.Literals<readonly ["set", "cleared", "no_foreground_client"]>;
}>;
/**
 * Result of changing the foreground client's window title.
 *
 * @category models
 * @since 0.8.2
 */
interface ClientWindowTitleResult extends Schema.Schema.Type<typeof ClientWindowTitleResult> {}
/**
 * Worktree information attached to an open workspace.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorkspaceWorktree: Schema.encodeKeys<Schema.Struct<{
  readonly repoKey: Schema.String;
  readonly repoName: Schema.String;
  readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
  readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
  readonly isLinkedWorktree: Schema.Boolean;
}>, {
  readonly repoKey: "repo_key";
  readonly repoName: "repo_name";
  readonly repoRoot: "repo_root";
  readonly checkoutPath: "checkout_path";
  readonly isLinkedWorktree: "is_linked_worktree";
}>;
/**
 * Worktree information attached to an open workspace.
 *
 * @category models
 * @since 0.8.2
 */
interface WorkspaceWorktree extends Schema.Schema.Type<typeof WorkspaceWorktree> {}
/**
 * Herdr workspace normalized from the private wire representation.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const Workspace: Schema.encodeKeys<Schema.Struct<{
  readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly number: Schema.Natural;
  readonly label: Schema.String;
  readonly focused: Schema.Boolean;
  readonly paneCount: Schema.Natural;
  readonly tabCount: Schema.Natural;
  readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
  readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly repoKey: Schema.String;
    readonly repoName: Schema.String;
    readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly isLinkedWorktree: Schema.Boolean;
  }>, {
    readonly repoKey: "repo_key";
    readonly repoName: "repo_name";
    readonly repoRoot: "repo_root";
    readonly checkoutPath: "checkout_path";
    readonly isLinkedWorktree: "is_linked_worktree";
  }>>;
}>, {
  readonly id: "workspace_id";
  readonly paneCount: "pane_count";
  readonly tabCount: "tab_count";
  readonly activeTabId: "active_tab_id";
  readonly agentStatus: "agent_status";
}>;
/**
 * Herdr workspace normalized from the private wire representation.
 *
 * @category models
 * @since 0.8.2
 */
interface Workspace extends Schema.Schema.Type<typeof Workspace> {}
/**
 * Herdr tab normalized from the private wire representation.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const Tab: Schema.encodeKeys<Schema.Struct<{
  readonly id: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly number: Schema.Natural;
  readonly label: Schema.String;
  readonly focused: Schema.Boolean;
  readonly paneCount: Schema.Natural;
  readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
}>, {
  readonly id: "tab_id";
  readonly workspaceId: "workspace_id";
  readonly paneCount: "pane_count";
  readonly agentStatus: "agent_status";
}>;
/**
 * Herdr tab normalized from the private wire representation.
 *
 * @category models
 * @since 0.8.2
 */
interface Tab extends Schema.Schema.Type<typeof Tab> {}
/**
 * Scroll position attached to a pane snapshot.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneScroll: Schema.encodeKeys<Schema.Struct<{
  readonly offsetFromBottom: Schema.Finite;
  readonly maxOffsetFromBottom: Schema.Finite;
  readonly viewportRows: Schema.Natural;
}>, {
  readonly offsetFromBottom: "offset_from_bottom";
  readonly maxOffsetFromBottom: "max_offset_from_bottom";
  readonly viewportRows: "viewport_rows";
}>;
/**
 * Scroll position attached to a pane snapshot.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneScroll extends Schema.Schema.Type<typeof PaneScroll> {}
/**
 * Herdr pane normalized from the private wire representation.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const Pane: Schema.encodeKeys<Schema.Struct<{
  readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly focused: Schema.Boolean;
  readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
  readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
  readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
  readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
    readonly source: Schema.String;
    readonly agent: Schema.String;
    readonly kind: Schema.Literals<readonly ["id", "path"]>;
    readonly value: Schema.String;
  }>>;
  readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly offsetFromBottom: Schema.Finite;
    readonly maxOffsetFromBottom: Schema.Finite;
    readonly viewportRows: Schema.Natural;
  }>, {
    readonly offsetFromBottom: "offset_from_bottom";
    readonly maxOffsetFromBottom: "max_offset_from_bottom";
    readonly viewportRows: "viewport_rows";
  }>>;
  readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
}>, {
  readonly id: "pane_id";
  readonly terminalId: "terminal_id";
  readonly workspaceId: "workspace_id";
  readonly tabId: "tab_id";
  readonly foregroundCwd: "foreground_cwd";
  readonly restoreError: "restore_error";
  readonly terminalTitle: "terminal_title";
  readonly terminalTitleStripped: "terminal_title_stripped";
  readonly displayAgent: "display_agent";
  readonly agentStatus: "agent_status";
  readonly stateLabels: "state_labels";
  readonly agentSession: "agent_session";
}>;
/**
 * Herdr pane normalized from the private wire representation.
 *
 * @category models
 * @since 0.8.2
 */
interface Pane extends Schema.Schema.Type<typeof Pane> {}
/**
 * Herdr agent normalized from the private wire representation.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const Agent: Schema.encodeKeys<Schema.Struct<{
  readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
  readonly name: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "AgentName">>;
  readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly status: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  readonly screenDetectionSkipped: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
  readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
  readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
  readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
    readonly source: Schema.String;
    readonly agent: Schema.String;
    readonly kind: Schema.Literals<readonly ["id", "path"]>;
    readonly value: Schema.String;
  }>>;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly focused: Schema.Boolean;
  readonly launchPending: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
  readonly interactiveReady: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
  readonly stateChangeSequence: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>, never>;
  /**
   * Set when the current idle transition completed work, independent of who has viewed it.
   * Equals that transition's `stateChangeSequence`; startup, restore, and session changes leave it unset.
   */
  readonly completionSequence: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>;
  readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
}>, {
  readonly terminalId: "terminal_id";
  readonly terminalTitle: "terminal_title";
  readonly terminalTitleStripped: "terminal_title_stripped";
  readonly displayAgent: "display_agent";
  readonly status: "agent_status";
  readonly screenDetectionSkipped: "screen_detection_skipped";
  readonly stateLabels: "state_labels";
  readonly agentSession: "agent_session";
  readonly workspaceId: "workspace_id";
  readonly tabId: "tab_id";
  readonly paneId: "pane_id";
  readonly launchPending: "launch_pending";
  readonly interactiveReady: "interactive_ready";
  readonly stateChangeSequence: "state_change_seq";
  readonly completionSequence: "completion_seq";
  readonly foregroundCwd: "foreground_cwd";
}>;
/**
 * Herdr agent normalized from the private wire representation.
 *
 * @category models
 * @since 0.8.2
 */
interface Agent extends Schema.Schema.Type<typeof Agent> {}
/**
 * Input accepted when creating a workspace.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorkspaceCreateOptions: Schema.Struct<{
  readonly focus: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly label: Schema.OptionFromOptionalKey<Schema.String>;
  readonly env: Schema.OptionFromOptionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>;
/**
 * Normalized input accepted when creating a workspace.
 *
 * @category models
 * @since 0.8.2
 */
interface WorkspaceCreateOptions extends Schema.Schema.Type<typeof WorkspaceCreateOptions> {}
/**
 * Ergonomic external representation accepted by workspace creation.
 *
 * @category models
 * @since 0.8.2
 */
interface WorkspaceCreateOptionsEncoded extends Schema.Codec.Encoded<typeof WorkspaceCreateOptions> {}
/**
 * Workspace, initial tab, and root pane created atomically by Herdr.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorkspaceCreateResult: Schema.encodeKeys<Schema.Struct<{
  readonly workspace: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>;
  readonly tab: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  }>, {
    readonly id: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly paneCount: "pane_count";
    readonly agentStatus: "agent_status";
  }>;
  readonly rootPane: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly focused: Schema.Boolean;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
    readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly offsetFromBottom: Schema.Finite;
      readonly maxOffsetFromBottom: Schema.Finite;
      readonly viewportRows: Schema.Natural;
    }>, {
      readonly offsetFromBottom: "offset_from_bottom";
      readonly maxOffsetFromBottom: "max_offset_from_bottom";
      readonly viewportRows: "viewport_rows";
    }>>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly id: "pane_id";
    readonly terminalId: "terminal_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly restoreError: "restore_error";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly agentStatus: "agent_status";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
  }>;
}>, {
  readonly rootPane: "root_pane";
}>;
/**
 * Workspace, initial tab, and root pane created atomically by Herdr.
 *
 * @category models
 * @since 0.8.2
 */
interface WorkspaceCreateResult extends Schema.Schema.Type<typeof WorkspaceCreateResult> {}
/**
 * Metadata patch reported for a workspace.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorkspaceMetadataReportInput: Schema.Struct<{
  readonly source: Schema.String;
  readonly tokens: Schema.$Record<Schema.String, Schema.NullOr<Schema.String>>;
  readonly sequence: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>;
  readonly ttlMs: Schema.OptionFromOptionalKey<Schema.brand<Schema.Finite, "HerdrMetadataTtl">>;
}>;
/**
 * Normalized workspace metadata patch.
 *
 * @category models
 * @since 0.8.2
 */
interface WorkspaceMetadataReportInput extends Schema.Schema.Type<typeof WorkspaceMetadataReportInput> {}
/**
 * Ergonomic external workspace metadata patch.
 *
 * @category models
 * @since 0.8.2
 */
interface WorkspaceMetadataReportInputEncoded extends Schema.Codec.Encoded<typeof WorkspaceMetadataReportInput> {}
/**
 * Ordered destination for moving one workspace.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorkspaceMoveInput: Schema.Struct<{
  readonly insertIndex: Schema.brand<Schema.Natural, "HerdrInsertIndex">;
}>;
/**
 * Ordered destination for moving one workspace.
 *
 * @category models
 * @since 0.8.2
 */
interface WorkspaceMoveInput extends Schema.Schema.Type<typeof WorkspaceMoveInput> {}
/**
 * External ordered destination accepted by workspace movement.
 *
 * @category models
 * @since 0.8.2
 */
interface WorkspaceMoveInputEncoded extends Schema.Codec.Encoded<typeof WorkspaceMoveInput> {}
/**
 * Optional anchor used when moving a contiguous workspace block.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorkspaceMoveBlockInput: Schema.Struct<{
  readonly beforeWorkspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
}>;
/**
 * Normalized workspace-block move anchor.
 *
 * @category models
 * @since 0.8.2
 */
interface WorkspaceMoveBlockInput extends Schema.Schema.Type<typeof WorkspaceMoveBlockInput> {}
/**
 * External workspace-block move anchor.
 *
 * @category models
 * @since 0.8.2
 */
interface WorkspaceMoveBlockInputEncoded extends Schema.Codec.Encoded<typeof WorkspaceMoveBlockInput> {}
/**
 * Optional compatibility expectations for a live server handoff.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const ServerLiveHandoffInput: Schema.Struct<{
  readonly importExe: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly expectedProtocol: Schema.OptionFromOptionalKey<Schema.Natural>;
  readonly expectedVersion: Schema.OptionFromOptionalKey<Schema.String>;
}>;
/**
 * Normalized live-handoff expectations.
 *
 * @category models
 * @since 0.8.2
 */
interface ServerLiveHandoffInput extends Schema.Schema.Type<typeof ServerLiveHandoffInput> {}
/**
 * Ergonomic live-handoff expectations accepted by the server service.
 *
 * @category models
 * @since 0.8.2
 */
interface ServerLiveHandoffInputEncoded extends Schema.Codec.Encoded<typeof ServerLiveHandoffInput> {}
/**
 * SSH agent socket offered to Herdr panes for as long as one registration connection stays open.
 *
 * Panes reach agents through Herdr's session-local agent address. It keeps a working agent the
 * server inherited, otherwise selects the earliest live registration, so registering does not
 * displace an agent that is already working.
 *
 * @category schemas
 * @since 0.9.5
 */
declare const ServerSshAgentRegisterInput: Schema.Struct<{
  /** Absolute agent socket owned by the same user, on the host running the Herdr server. */
  readonly socketPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
}>;
/**
 * Normalized SSH agent registration request.
 *
 * @category models
 * @since 0.9.5
 */
interface ServerSshAgentRegisterInput extends Schema.Schema.Type<typeof ServerSshAgentRegisterInput> {}
/**
 * Ergonomic SSH agent registration request accepted by the server service.
 *
 * @category models
 * @since 0.9.5
 */
interface ServerSshAgentRegisterInputEncoded extends Schema.Codec.Encoded<typeof ServerSshAgentRegisterInput> {}
/**
 * Foreground notification request.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const NotificationShowInput: Schema.Struct<{
  readonly title: Schema.String;
  readonly body: Schema.OptionFromOptionalKey<Schema.String>;
  readonly position: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["top-left", "top-right", "bottom-left", "bottom-right"]>>;
  readonly sound: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["none", "done", "request"]>>;
}>;
/**
 * Normalized foreground notification request.
 *
 * @category models
 * @since 0.8.2
 */
interface NotificationShowInput extends Schema.Schema.Type<typeof NotificationShowInput> {}
/**
 * Ergonomic foreground notification request.
 *
 * @category models
 * @since 0.8.2
 */
interface NotificationShowInputEncoded extends Schema.Codec.Encoded<typeof NotificationShowInput> {}
/**
 * Built-in terminal-agent integration managed by Herdr.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const IntegrationTarget: Schema.Literals<readonly ["pi", "omp", "claude", "codex", "copilot", "devin", "droid", "kimi", "opencode", "kilo", "hermes", "qodercli", "cursor", "mastracode", "grok", "qwen", "antigravity_cli"]>;
/**
 * Built-in terminal-agent integration managed by Herdr.
 *
 * @category models
 * @since 0.8.2
 */
type IntegrationTarget = typeof IntegrationTarget.Type;
/**
 * Result of installing or uninstalling a built-in integration.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const IntegrationChangeResult: Schema.Struct<{
  readonly target: Schema.Literals<readonly ["pi", "omp", "claude", "codex", "copilot", "devin", "droid", "kimi", "opencode", "kilo", "hermes", "qodercli", "cursor", "mastracode", "grok", "qwen", "antigravity_cli"]>;
  readonly messages: Schema.$Array<Schema.String>;
}>;
/**
 * Result of installing or uninstalling a built-in integration.
 *
 * @category models
 * @since 0.8.2
 */
interface IntegrationChangeResult extends Schema.Schema.Type<typeof IntegrationChangeResult> {}
/**
 * Source repository resolved for worktree operations.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorktreeSourceInfo: Schema.encodeKeys<Schema.Struct<{
  readonly repoKey: Schema.String;
  readonly repoName: Schema.String;
  readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
  readonly sourceCheckoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
  readonly sourceWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
}>, {
  readonly repoKey: "repo_key";
  readonly repoName: "repo_name";
  readonly repoRoot: "repo_root";
  readonly sourceCheckoutPath: "source_checkout_path";
  readonly sourceWorkspaceId: "source_workspace_id";
}>;
/**
 * Source repository resolved for worktree operations.
 *
 * @category models
 * @since 0.8.2
 */
interface WorktreeSourceInfo extends Schema.Schema.Type<typeof WorktreeSourceInfo> {}
/**
 * Git worktree discovered by Herdr.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const Worktree: Schema.encodeKeys<Schema.Struct<{
  readonly path: Schema.brand<Schema.String, "HerdrAbsolutePath">;
  readonly branch: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly isBare: Schema.Boolean;
  readonly isDetached: Schema.Boolean;
  readonly isPrunable: Schema.Boolean;
  readonly isLinkedWorktree: Schema.Boolean;
  readonly openWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly label: Schema.String;
}>, {
  readonly isBare: "is_bare";
  readonly isDetached: "is_detached";
  readonly isPrunable: "is_prunable";
  readonly isLinkedWorktree: "is_linked_worktree";
  readonly openWorkspaceId: "open_workspace_id";
}>;
/**
 * Git worktree discovered by Herdr.
 *
 * @category models
 * @since 0.8.2
 */
interface Worktree extends Schema.Schema.Type<typeof Worktree> {}
/**
 * Resolved source and worktrees returned by listing.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorktreeListResult: Schema.Struct<{
  readonly source: Schema.encodeKeys<Schema.Struct<{
    readonly repoKey: Schema.String;
    readonly repoName: Schema.String;
    readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly sourceCheckoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly sourceWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  }>, {
    readonly repoKey: "repo_key";
    readonly repoName: "repo_name";
    readonly repoRoot: "repo_root";
    readonly sourceCheckoutPath: "source_checkout_path";
    readonly sourceWorkspaceId: "source_workspace_id";
  }>;
  readonly worktrees: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly path: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly branch: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly isBare: Schema.Boolean;
    readonly isDetached: Schema.Boolean;
    readonly isPrunable: Schema.Boolean;
    readonly isLinkedWorktree: Schema.Boolean;
    readonly openWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
    readonly label: Schema.String;
  }>, {
    readonly isBare: "is_bare";
    readonly isDetached: "is_detached";
    readonly isPrunable: "is_prunable";
    readonly isLinkedWorktree: "is_linked_worktree";
    readonly openWorkspaceId: "open_workspace_id";
  }>>;
}>;
/**
 * Resolved source and worktrees returned by listing.
 *
 * @category models
 * @since 0.8.2
 */
interface WorktreeListResult extends Schema.Schema.Type<typeof WorktreeListResult> {}
/**
 * Worktree created together with its initial workspace resources.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorktreeCreateResult: Schema.encodeKeys<Schema.Struct<{
  readonly worktree: Schema.encodeKeys<Schema.Struct<{
    readonly path: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly branch: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly isBare: Schema.Boolean;
    readonly isDetached: Schema.Boolean;
    readonly isPrunable: Schema.Boolean;
    readonly isLinkedWorktree: Schema.Boolean;
    readonly openWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
    readonly label: Schema.String;
  }>, {
    readonly isBare: "is_bare";
    readonly isDetached: "is_detached";
    readonly isPrunable: "is_prunable";
    readonly isLinkedWorktree: "is_linked_worktree";
    readonly openWorkspaceId: "open_workspace_id";
  }>;
  readonly workspace: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>;
  readonly tab: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  }>, {
    readonly id: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly paneCount: "pane_count";
    readonly agentStatus: "agent_status";
  }>;
  readonly rootPane: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly focused: Schema.Boolean;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
    readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly offsetFromBottom: Schema.Finite;
      readonly maxOffsetFromBottom: Schema.Finite;
      readonly viewportRows: Schema.Natural;
    }>, {
      readonly offsetFromBottom: "offset_from_bottom";
      readonly maxOffsetFromBottom: "max_offset_from_bottom";
      readonly viewportRows: "viewport_rows";
    }>>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly id: "pane_id";
    readonly terminalId: "terminal_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly restoreError: "restore_error";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly agentStatus: "agent_status";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
  }>;
}>, {
  readonly rootPane: "root_pane";
}>;
/**
 * Worktree created together with its initial workspace resources.
 *
 * @category models
 * @since 0.8.2
 */
interface WorktreeCreateResult extends Schema.Schema.Type<typeof WorktreeCreateResult> {}
/**
 * Worktree opened together with its initial workspace resources.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorktreeOpenResult: Schema.encodeKeys<Schema.Struct<{
  readonly worktree: Schema.encodeKeys<Schema.Struct<{
    readonly path: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly branch: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly isBare: Schema.Boolean;
    readonly isDetached: Schema.Boolean;
    readonly isPrunable: Schema.Boolean;
    readonly isLinkedWorktree: Schema.Boolean;
    readonly openWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
    readonly label: Schema.String;
  }>, {
    readonly isBare: "is_bare";
    readonly isDetached: "is_detached";
    readonly isPrunable: "is_prunable";
    readonly isLinkedWorktree: "is_linked_worktree";
    readonly openWorkspaceId: "open_workspace_id";
  }>;
  readonly workspace: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>;
  readonly tab: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  }>, {
    readonly id: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly paneCount: "pane_count";
    readonly agentStatus: "agent_status";
  }>;
  readonly rootPane: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly focused: Schema.Boolean;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
    readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly offsetFromBottom: Schema.Finite;
      readonly maxOffsetFromBottom: Schema.Finite;
      readonly viewportRows: Schema.Natural;
    }>, {
      readonly offsetFromBottom: "offset_from_bottom";
      readonly maxOffsetFromBottom: "max_offset_from_bottom";
      readonly viewportRows: "viewport_rows";
    }>>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly id: "pane_id";
    readonly terminalId: "terminal_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly restoreError: "restore_error";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly agentStatus: "agent_status";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
  }>;
  readonly alreadyOpen: Schema.Boolean;
}>, {
  readonly rootPane: "root_pane";
  readonly alreadyOpen: "already_open";
}>;
/**
 * Worktree opened together with its initial workspace resources.
 *
 * @category models
 * @since 0.8.2
 */
interface WorktreeOpenResult extends Schema.Schema.Type<typeof WorktreeOpenResult> {}
/**
 * Worktree removal outcome.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorktreeRemoveResult: Schema.encodeKeys<Schema.Struct<{
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly path: Schema.brand<Schema.String, "HerdrAbsolutePath">;
  readonly forced: Schema.Boolean;
}>, {
  readonly workspaceId: "workspace_id";
}>;
/**
 * Worktree removal outcome.
 *
 * @category models
 * @since 0.8.2
 */
interface WorktreeRemoveResult extends Schema.Schema.Type<typeof WorktreeRemoveResult> {}
type WorktreeSourceSelection = {
  readonly workspaceId: Option.None<WorkspaceId>;
  readonly cwd: Option.Option<HerdrAbsolutePath>;
} | {
  readonly workspaceId: Option.Some<WorkspaceId>;
  readonly cwd: Option.None<HerdrAbsolutePath>;
};
type WorktreeOpenSelection = {
  readonly path: Option.Some<HerdrAbsolutePath>;
  readonly branch: Option.None<string>;
} | {
  readonly path: Option.None<HerdrAbsolutePath>;
  readonly branch: Option.Some<string>;
};
/**
 * Optional workspace or directory selecting a repository for worktree listing.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorktreeListInput: Schema.refine<{
  readonly workspaceId: Option.Option<string & import("effect/Brand").Brand<"WorkspaceId">>;
  readonly cwd: Option.Option<string & import("effect/Brand").Brand<"HerdrAbsolutePath">>;
  readonly trustRepository: Option.Option<boolean>;
} & WorktreeSourceSelection, Schema.Struct<{
  workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  cwd: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  trustRepository: Schema.OptionFromOptionalKey<Schema.Boolean>;
}>>;
/**
 * Normalized worktree-list source selection.
 *
 * @category models
 * @since 0.8.2
 */
type WorktreeListInput = typeof WorktreeListInput.Type;
/**
 * Ergonomic worktree-list source selection.
 *
 * @category models
 * @since 0.8.2
 */
interface WorktreeListInputEncoded extends Schema.Codec.Encoded<typeof WorktreeListInput> {}
/**
 * Parameters accepted when creating a worktree and workspace.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorktreeCreateInput: Schema.refine<{
  readonly workspaceId: Option.Option<string & import("effect/Brand").Brand<"WorkspaceId">>;
  readonly cwd: Option.Option<string & import("effect/Brand").Brand<"HerdrAbsolutePath">>;
  readonly trustRepository: Option.Option<boolean>;
  readonly branch: Option.Option<string>;
  readonly base: Option.Option<string>;
  readonly path: Option.Option<string & import("effect/Brand").Brand<"HerdrAbsolutePath">>;
  readonly label: Option.Option<string>;
  readonly focus: Option.Option<boolean>;
} & WorktreeSourceSelection, Schema.Struct<{
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly cwd: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly trustRepository: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly branch: Schema.OptionFromOptionalKey<Schema.String>;
  readonly base: Schema.OptionFromOptionalKey<Schema.String>;
  readonly path: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly label: Schema.OptionFromOptionalKey<Schema.String>;
  readonly focus: Schema.OptionFromOptionalKey<Schema.Boolean>;
}>>;
/**
 * Normalized worktree-creation parameters.
 *
 * @category models
 * @since 0.8.2
 */
type WorktreeCreateInput = typeof WorktreeCreateInput.Type;
/**
 * Ergonomic worktree-creation parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface WorktreeCreateInputEncoded extends Schema.Codec.Encoded<typeof WorktreeCreateInput> {}
/**
 * Parameters accepted when opening an existing worktree.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorktreeOpenInput: Schema.refine<({
  readonly workspaceId: Option.Option<string & import("effect/Brand").Brand<"WorkspaceId">>;
  readonly cwd: Option.Option<string & import("effect/Brand").Brand<"HerdrAbsolutePath">>;
  readonly trustRepository: Option.Option<boolean>;
  readonly path: Option.Option<string & import("effect/Brand").Brand<"HerdrAbsolutePath">>;
  readonly branch: Option.Option<string>;
  readonly label: Option.Option<string>;
  readonly focus: Option.Option<boolean>;
} & WorktreeSourceSelection) & WorktreeOpenSelection, Schema.refine<{
  readonly workspaceId: Option.Option<string & import("effect/Brand").Brand<"WorkspaceId">>;
  readonly cwd: Option.Option<string & import("effect/Brand").Brand<"HerdrAbsolutePath">>;
  readonly trustRepository: Option.Option<boolean>;
  readonly path: Option.Option<string & import("effect/Brand").Brand<"HerdrAbsolutePath">>;
  readonly branch: Option.Option<string>;
  readonly label: Option.Option<string>;
  readonly focus: Option.Option<boolean>;
} & WorktreeSourceSelection, Schema.Struct<{
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly cwd: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly trustRepository: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly path: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly branch: Schema.OptionFromOptionalKey<Schema.String>;
  readonly label: Schema.OptionFromOptionalKey<Schema.String>;
  readonly focus: Schema.OptionFromOptionalKey<Schema.Boolean>;
}>>>;
/**
 * Normalized worktree-open parameters.
 *
 * @category models
 * @since 0.8.2
 */
type WorktreeOpenInput = typeof WorktreeOpenInput.Type;
/**
 * Ergonomic worktree-open parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface WorktreeOpenInputEncoded extends Schema.Codec.Encoded<typeof WorktreeOpenInput> {}
/**
 * Optional force flag for worktree removal.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const WorktreeRemoveInput: Schema.Struct<{
  readonly force: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly trustRepository: Schema.OptionFromOptionalKey<Schema.Boolean>;
}>;
/**
 * Normalized worktree-removal input.
 *
 * @category models
 * @since 0.8.2
 */
interface WorktreeRemoveInput extends Schema.Schema.Type<typeof WorktreeRemoveInput> {}
/**
 * Ergonomic worktree-removal input.
 *
 * @category models
 * @since 0.8.2
 */
interface WorktreeRemoveInputEncoded extends Schema.Codec.Encoded<typeof WorktreeRemoveInput> {}
/**
 * Input accepted when creating a tab and root pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const TabCreateInput: Schema.Struct<{
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly cwd: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly focus: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly label: Schema.OptionFromOptionalKey<Schema.String>;
  readonly env: Schema.OptionFromOptionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>;
/**
 * Normalized input accepted when creating a tab.
 *
 * @category models
 * @since 0.8.2
 */
interface TabCreateInput extends Schema.Schema.Type<typeof TabCreateInput> {}
/**
 * Ergonomic input accepted when creating a tab.
 *
 * @category models
 * @since 0.8.2
 */
interface TabCreateInputEncoded extends Schema.Codec.Encoded<typeof TabCreateInput> {}
/**
 * Tab and root pane created together.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const TabCreateResult: Schema.encodeKeys<Schema.Struct<{
  readonly tab: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  }>, {
    readonly id: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly paneCount: "pane_count";
    readonly agentStatus: "agent_status";
  }>;
  readonly rootPane: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly focused: Schema.Boolean;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
    readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly offsetFromBottom: Schema.Finite;
      readonly maxOffsetFromBottom: Schema.Finite;
      readonly viewportRows: Schema.Natural;
    }>, {
      readonly offsetFromBottom: "offset_from_bottom";
      readonly maxOffsetFromBottom: "max_offset_from_bottom";
      readonly viewportRows: "viewport_rows";
    }>>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly id: "pane_id";
    readonly terminalId: "terminal_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly restoreError: "restore_error";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly agentStatus: "agent_status";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
  }>;
}>, {
  readonly rootPane: "root_pane";
}>;
/**
 * Tab and root pane created together.
 *
 * @category models
 * @since 0.8.2
 */
interface TabCreateResult extends Schema.Schema.Type<typeof TabCreateResult> {}
/**
 * Optional workspace filter for tab listing.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const TabListInput: Schema.Struct<{
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
}>;
/**
 * Normalized tab-list filter.
 *
 * @category models
 * @since 0.8.2
 */
interface TabListInput extends Schema.Schema.Type<typeof TabListInput> {}
/**
 * Ergonomic tab-list filter.
 *
 * @category models
 * @since 0.8.2
 */
interface TabListInputEncoded extends Schema.Codec.Encoded<typeof TabListInput> {}
/**
 * Ordered destination for moving one tab.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const TabMoveInput: Schema.Struct<{
  readonly insertIndex: Schema.brand<Schema.Natural, "HerdrInsertIndex">;
}>;
/**
 * Ordered destination for moving one tab.
 *
 * @category models
 * @since 0.8.2
 */
interface TabMoveInput extends Schema.Schema.Type<typeof TabMoveInput> {}
/**
 * External ordered destination accepted by tab movement.
 *
 * @category models
 * @since 0.8.2
 */
interface TabMoveInputEncoded extends Schema.Codec.Encoded<typeof TabMoveInput> {}
/**
 * Cardinal pane direction.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneDirection: Schema.Literals<readonly ["left", "right", "up", "down"]>;
/**
 * Cardinal pane direction.
 *
 * @category models
 * @since 0.8.2
 */
type PaneDirection = typeof PaneDirection.Type;
/**
 * Direction accepted when constructing a binary split.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const SplitDirection: Schema.Literals<readonly ["right", "down"]>;
/**
 * Direction accepted when constructing a binary split.
 *
 * @category models
 * @since 0.8.2
 */
type SplitDirection = typeof SplitDirection.Type;
/**
 * Pane-output source selected for reading or waiting.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneReadSource: Schema.Literals<readonly ["visible", "recent", "recent_unwrapped", "detection"]>;
/**
 * Pane-output source selected for reading or waiting.
 *
 * @category models
 * @since 0.8.2
 */
type PaneReadSource = typeof PaneReadSource.Type;
/**
 * Pane-output representation returned by a read.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneReadFormat: Schema.Literals<readonly ["text", "ansi"]>;
/**
 * Pane-output representation returned by a read.
 *
 * @category models
 * @since 0.8.2
 */
type PaneReadFormat = typeof PaneReadFormat.Type;
/**
 * Rectangle in terminal-cell layout coordinates.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneLayoutRect: Schema.Struct<{
  readonly x: Schema.Finite;
  readonly y: Schema.Finite;
  readonly width: Schema.Finite;
  readonly height: Schema.Finite;
}>;
/**
 * Rectangle in terminal-cell layout coordinates.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneLayoutRect extends Schema.Schema.Type<typeof PaneLayoutRect> {}
/**
 * Pane layout snapshot returned by geometry operations.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneLayoutSnapshot: Schema.encodeKeys<Schema.Struct<{
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly zoomed: Schema.Boolean;
  readonly area: Schema.Struct<{
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
  }>;
  readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly focused: Schema.Boolean;
    readonly rect: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
  }>, {
    readonly paneId: "pane_id";
  }>>;
  readonly splits: Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly direction: Schema.Literals<readonly ["right", "down"]>;
    readonly ratio: Schema.Finite;
    readonly rect: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
  }>>;
}>, {
  readonly workspaceId: "workspace_id";
  readonly tabId: "tab_id";
  readonly focusedPaneId: "focused_pane_id";
}>;
/**
 * Pane layout snapshot returned by geometry operations.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneLayoutSnapshot extends Schema.Schema.Type<typeof PaneLayoutSnapshot> {}
/**
 * Pane output read result.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneReadResult: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly source: Schema.Literals<readonly ["visible", "recent", "recent_unwrapped", "detection"]>;
  readonly format: Schema.Literals<readonly ["text", "ansi"]>;
  readonly text: Schema.String;
  readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  readonly truncated: Schema.Boolean;
}>, {
  readonly paneId: "pane_id";
  readonly workspaceId: "workspace_id";
  readonly tabId: "tab_id";
}>;
/**
 * Pane output read result.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneReadResult extends Schema.Schema.Type<typeof PaneReadResult> {}
/**
 * Pane output wait result and the read that contained the match.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneOutputMatchResult: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  readonly matchedLine: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly read: Schema.encodeKeys<Schema.Struct<{
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly source: Schema.Literals<readonly ["visible", "recent", "recent_unwrapped", "detection"]>;
    readonly format: Schema.Literals<readonly ["text", "ansi"]>;
    readonly text: Schema.String;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
    readonly truncated: Schema.Boolean;
  }>, {
    readonly paneId: "pane_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
  }>;
}>, {
  readonly paneId: "pane_id";
  readonly matchedLine: "matched_line";
}>;
/**
 * Pane output wait result and the read that contained the match.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneOutputMatchResult extends Schema.Schema.Type<typeof PaneOutputMatchResult> {}
/**
 * Result of swapping two panes.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneSwapResult: Schema.encodeKeys<Schema.Struct<{
  readonly changed: Schema.Boolean;
  readonly reason: Schema.OptionFromOptionalNullOr<Schema.Literals<readonly ["no_neighbor", "same_pane", "not_found", "cross_tab"]>>;
  readonly sourcePaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly targetPaneId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly layout: Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly zoomed: Schema.Boolean;
    readonly area: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
    readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly focused: Schema.Boolean;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>, {
      readonly paneId: "pane_id";
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly id: Schema.String;
      readonly direction: Schema.Literals<readonly ["right", "down"]>;
      readonly ratio: Schema.Finite;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly focusedPaneId: "focused_pane_id";
  }>;
}>, {
  readonly sourcePaneId: "source_pane_id";
  readonly targetPaneId: "target_pane_id";
  readonly focusedPaneId: "focused_pane_id";
}>;
/**
 * Result of swapping two panes.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneSwapResult extends Schema.Schema.Type<typeof PaneSwapResult> {}
/**
 * Result of moving a pane between tabs or workspaces.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneMoveResult: Schema.encodeKeys<Schema.Struct<{
  readonly changed: Schema.Boolean;
  readonly reason: Schema.OptionFromOptionalNullOr<Schema.Literals<readonly ["same_tab", "zoomed_tab"]>>;
  readonly previousPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly previousWorkspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly previousTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly pane: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly focused: Schema.Boolean;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
    readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly offsetFromBottom: Schema.Finite;
      readonly maxOffsetFromBottom: Schema.Finite;
      readonly viewportRows: Schema.Natural;
    }>, {
      readonly offsetFromBottom: "offset_from_bottom";
      readonly maxOffsetFromBottom: "max_offset_from_bottom";
      readonly viewportRows: "viewport_rows";
    }>>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly id: "pane_id";
    readonly terminalId: "terminal_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly restoreError: "restore_error";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly agentStatus: "agent_status";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
  }>;
  readonly sourceLayout: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly zoomed: Schema.Boolean;
    readonly area: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
    readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly focused: Schema.Boolean;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>, {
      readonly paneId: "pane_id";
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly id: Schema.String;
      readonly direction: Schema.Literals<readonly ["right", "down"]>;
      readonly ratio: Schema.Finite;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly focusedPaneId: "focused_pane_id";
  }>>;
  readonly targetLayout: Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly zoomed: Schema.Boolean;
    readonly area: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
    readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly focused: Schema.Boolean;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>, {
      readonly paneId: "pane_id";
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly id: Schema.String;
      readonly direction: Schema.Literals<readonly ["right", "down"]>;
      readonly ratio: Schema.Finite;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly focusedPaneId: "focused_pane_id";
  }>;
  readonly createdWorkspace: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>>;
  readonly createdTab: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  }>, {
    readonly id: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly paneCount: "pane_count";
    readonly agentStatus: "agent_status";
  }>>;
  readonly closedWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly closedTabId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "TabId">>;
  readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
}>, {
  readonly previousPaneId: "previous_pane_id";
  readonly previousWorkspaceId: "previous_workspace_id";
  readonly previousTabId: "previous_tab_id";
  readonly sourceLayout: "source_layout";
  readonly targetLayout: "target_layout";
  readonly createdWorkspace: "created_workspace";
  readonly createdTab: "created_tab";
  readonly closedWorkspaceId: "closed_workspace_id";
  readonly closedTabId: "closed_tab_id";
  readonly focusedPaneId: "focused_pane_id";
}>;
/**
 * Result of moving a pane between tabs or workspaces.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneMoveResult extends Schema.Schema.Type<typeof PaneMoveResult> {}
/**
 * Result of changing pane zoom or focus state.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneZoomResult: Schema.encodeKeys<Schema.Struct<{
  readonly changed: Schema.Boolean;
  readonly zoomChanged: Schema.Boolean;
  readonly focusChanged: Schema.Boolean;
  readonly reason: Schema.OptionFromOptionalNullOr<Schema.Literals<readonly ["single_pane", "already_zoomed", "already_unzoomed"]>>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly zoomed: Schema.Boolean;
  readonly layout: Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly zoomed: Schema.Boolean;
    readonly area: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
    readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly focused: Schema.Boolean;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>, {
      readonly paneId: "pane_id";
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly id: Schema.String;
      readonly direction: Schema.Literals<readonly ["right", "down"]>;
      readonly ratio: Schema.Finite;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly focusedPaneId: "focused_pane_id";
  }>;
}>, {
  readonly zoomChanged: "zoom_changed";
  readonly focusChanged: "focus_changed";
  readonly paneId: "pane_id";
  readonly focusedPaneId: "focused_pane_id";
}>;
/**
 * Result of changing pane zoom or focus state.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneZoomResult extends Schema.Schema.Type<typeof PaneZoomResult> {}
/**
 * Foreground process reported for a pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneProcess: Schema.Struct<{
  readonly pid: Schema.Natural;
  readonly name: Schema.String;
  readonly argv0: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly argv: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.String>>;
  readonly cmdline: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
}>;
/**
 * Foreground process reported for a pane.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneProcess extends Schema.Schema.Type<typeof PaneProcess> {}
/**
 * Operating-system process information for one pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneProcessInfo: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly shellPid: Schema.OptionFromOptionalNullOr<Schema.Natural>;
  readonly foregroundProcessGroupId: Schema.OptionFromOptionalNullOr<Schema.Natural>;
  readonly tty: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly foregroundProcesses: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Array<Schema.Struct<{
    readonly pid: Schema.Natural;
    readonly name: Schema.String;
    readonly argv0: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly argv: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.String>>;
    readonly cmdline: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  }>>>, never>;
}>, {
  readonly paneId: "pane_id";
  readonly shellPid: "shell_pid";
  readonly foregroundProcessGroupId: "foreground_process_group_id";
  readonly foregroundProcesses: "foreground_processes";
}>;
/**
 * Operating-system process information for one pane.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneProcessInfo extends Schema.Schema.Type<typeof PaneProcessInfo> {}
/**
 * Neighbor lookup result for one pane and direction.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneNeighborResult: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly direction: Schema.Literals<readonly ["left", "right", "up", "down"]>;
  readonly neighborPaneId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly layout: Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly zoomed: Schema.Boolean;
    readonly area: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
    readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly focused: Schema.Boolean;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>, {
      readonly paneId: "pane_id";
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly id: Schema.String;
      readonly direction: Schema.Literals<readonly ["right", "down"]>;
      readonly ratio: Schema.Finite;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly focusedPaneId: "focused_pane_id";
  }>;
}>, {
  readonly paneId: "pane_id";
  readonly neighborPaneId: "neighbor_pane_id";
}>;
/**
 * Neighbor lookup result for one pane and direction.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneNeighborResult extends Schema.Schema.Type<typeof PaneNeighborResult> {}
/**
 * Edge membership result for one pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneEdgesResult: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly left: Schema.Boolean;
  readonly right: Schema.Boolean;
  readonly up: Schema.Boolean;
  readonly down: Schema.Boolean;
  readonly layout: Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly zoomed: Schema.Boolean;
    readonly area: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
    readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly focused: Schema.Boolean;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>, {
      readonly paneId: "pane_id";
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly id: Schema.String;
      readonly direction: Schema.Literals<readonly ["right", "down"]>;
      readonly ratio: Schema.Finite;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly focusedPaneId: "focused_pane_id";
  }>;
}>, {
  readonly paneId: "pane_id";
}>;
/**
 * Edge membership result for one pane.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneEdgesResult extends Schema.Schema.Type<typeof PaneEdgesResult> {}
/**
 * Directional focus outcome.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneFocusDirectionResult: Schema.encodeKeys<Schema.Struct<{
  readonly changed: Schema.Boolean;
  readonly reason: Schema.OptionFromOptionalNullOr<Schema.Literal<"no_neighbor">>;
  readonly sourcePaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly focusedPaneId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly layout: Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly zoomed: Schema.Boolean;
    readonly area: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
    readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly focused: Schema.Boolean;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>, {
      readonly paneId: "pane_id";
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly id: Schema.String;
      readonly direction: Schema.Literals<readonly ["right", "down"]>;
      readonly ratio: Schema.Finite;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly focusedPaneId: "focused_pane_id";
  }>;
}>, {
  readonly sourcePaneId: "source_pane_id";
  readonly focusedPaneId: "focused_pane_id";
}>;
/**
 * Directional focus outcome.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneFocusDirectionResult extends Schema.Schema.Type<typeof PaneFocusDirectionResult> {}
/**
 * Pane resize outcome.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneResizeResult: Schema.encodeKeys<Schema.Struct<{
  readonly changed: Schema.Boolean;
  readonly reason: Schema.OptionFromOptionalNullOr<Schema.Literal<"unchanged">>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly layout: Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly zoomed: Schema.Boolean;
    readonly area: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
    readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly focused: Schema.Boolean;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>, {
      readonly paneId: "pane_id";
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly id: Schema.String;
      readonly direction: Schema.Literals<readonly ["right", "down"]>;
      readonly ratio: Schema.Finite;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly focusedPaneId: "focused_pane_id";
  }>;
}>, {
  readonly paneId: "pane_id";
  readonly focusedPaneId: "focused_pane_id";
}>;
/**
 * Pane resize outcome.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneResizeResult extends Schema.Schema.Type<typeof PaneResizeResult> {}
/**
 * Destination for right-click input handled by a pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneRightClickTarget: Schema.Literals<readonly ["herdr", "pane"]>;
/**
 * Destination for right-click input handled by a pane.
 *
 * @category models
 * @since 0.8.2
 */
type PaneRightClickTarget = typeof PaneRightClickTarget.Type;
/**
 * Pane input-routing update.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneInputRoutingInput: Schema.Struct<{
  readonly rightClick: Schema.Literals<readonly ["herdr", "pane"]>;
}>;
/**
 * Normalized pane input-routing update.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneInputRoutingInput extends Schema.Schema.Type<typeof PaneInputRoutingInput> {}
/**
 * Ergonomic pane input-routing update.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneInputRoutingInputEncoded extends Schema.Codec.Encoded<typeof PaneInputRoutingInput> {}
/**
 * Parameters for splitting a pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneSplitInput: Schema.Struct<{
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly direction: Schema.Literals<readonly ["right", "down"]>;
  readonly ratio: Schema.OptionFromOptionalKey<Schema.brand<Schema.Finite, "HerdrSplitRatio">>;
  readonly cwd: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly focus: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly env: Schema.OptionFromOptionalKey<Schema.$Record<Schema.String, Schema.String>>;
  readonly rightClick: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["herdr", "pane"]>>;
}>;
/**
 * Normalized pane-split parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneSplitInput extends Schema.Schema.Type<typeof PaneSplitInput> {}
/**
 * Ergonomic pane-split parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneSplitInputEncoded extends Schema.Codec.Encoded<typeof PaneSplitInput> {}
/**
 * Parameters for swapping a pane with a neighbor or explicit pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneSwapInput: Schema.Union<readonly [Schema.Struct<{
  readonly paneId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly direction: Schema.Literals<readonly ["left", "right", "up", "down"]>;
  readonly sourcePaneId: Schema.optionalKey<Schema.Never>;
  readonly targetPaneId: Schema.optionalKey<Schema.Never>;
}>, Schema.Struct<{
  readonly sourcePaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly targetPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly paneId: Schema.optionalKey<Schema.Never>;
  readonly direction: Schema.optionalKey<Schema.Never>;
}>]>;
/**
 * Normalized pane-swap parameters.
 *
 * @category models
 * @since 0.8.2
 */
type PaneSwapInput = typeof PaneSwapInput.Type;
/**
 * Ergonomic pane-swap parameters.
 *
 * @category models
 * @since 0.8.2
 */
type PaneSwapInputEncoded = typeof PaneSwapInput.Encoded;
/**
 * Destination used when moving a pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneMoveDestination: Schema.Union<readonly [Schema.Struct<{
  readonly type: Schema.Literal<"tab">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly targetPaneId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly split: Schema.Literals<readonly ["right", "down"]>;
  readonly ratio: Schema.OptionFromOptionalKey<Schema.brand<Schema.Finite, "HerdrSplitRatio">>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"new_tab">;
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly label: Schema.OptionFromOptionalKey<Schema.String>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"new_workspace">;
  readonly label: Schema.OptionFromOptionalKey<Schema.String>;
  readonly tabLabel: Schema.OptionFromOptionalKey<Schema.String>;
}>]>;
/**
 * Destination used when moving a pane.
 *
 * @category models
 * @since 0.8.2
 */
type PaneMoveDestination = typeof PaneMoveDestination.Type;
/**
 * Pane move request.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneMoveInput: Schema.Struct<{
  readonly destination: Schema.Union<readonly [Schema.Struct<{
    readonly type: Schema.Literal<"tab">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly targetPaneId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PaneId">>;
    readonly split: Schema.Literals<readonly ["right", "down"]>;
    readonly ratio: Schema.OptionFromOptionalKey<Schema.brand<Schema.Finite, "HerdrSplitRatio">>;
  }>, Schema.Struct<{
    readonly type: Schema.Literal<"new_tab">;
    readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
    readonly label: Schema.OptionFromOptionalKey<Schema.String>;
  }>, Schema.Struct<{
    readonly type: Schema.Literal<"new_workspace">;
    readonly label: Schema.OptionFromOptionalKey<Schema.String>;
    readonly tabLabel: Schema.OptionFromOptionalKey<Schema.String>;
  }>]>;
  readonly focus: Schema.OptionFromOptionalKey<Schema.Boolean>;
}>;
/**
 * Normalized pane move request.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneMoveInput extends Schema.Schema.Type<typeof PaneMoveInput> {}
/**
 * Ergonomic pane move request.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneMoveInputEncoded extends Schema.Codec.Encoded<typeof PaneMoveInput> {}
/**
 * Pane zoom mode.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneZoomMode: Schema.Literals<readonly ["toggle", "on", "off"]>;
/**
 * Pane zoom mode.
 *
 * @category models
 * @since 0.8.2
 */
type PaneZoomMode = typeof PaneZoomMode.Type;
/**
 * Optional mode for a pane zoom operation.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneZoomInput: Schema.Struct<{
  readonly mode: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["toggle", "on", "off"]>>;
}>;
/**
 * Normalized pane zoom input.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneZoomInput extends Schema.Schema.Type<typeof PaneZoomInput> {}
/**
 * Ergonomic pane zoom input.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneZoomInputEncoded extends Schema.Codec.Encoded<typeof PaneZoomInput> {}
/**
 * Optional pane origin for directional focus.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneFocusDirectionInput: Schema.Struct<{
  readonly paneId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PaneId">>;
}>;
/**
 * Ergonomic directional-focus input.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneFocusDirectionInputEncoded extends Schema.Codec.Encoded<typeof PaneFocusDirectionInput> {}
/**
 * Optional pane origin and cell amount for directional resize.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneResizeInput: Schema.Struct<{
  readonly paneId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly amount: Schema.OptionFromOptionalKey<Schema.Finite>;
}>;
/**
 * Ergonomic directional-resize input.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneResizeInputEncoded extends Schema.Codec.Encoded<typeof PaneResizeInput> {}
/**
 * Optional workspace selector for pane listing.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneListInput: Schema.Struct<{
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
}>;
/**
 * Ergonomic pane-list input.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneListInputEncoded extends Schema.Codec.Encoded<typeof PaneListInput> {}
/**
 * Optional caller identity used to resolve the current pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneCurrentInput: Schema.Struct<{
  readonly callerPaneId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PaneId">>;
}>;
/**
 * Ergonomic current-pane input.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneCurrentInputEncoded extends Schema.Codec.Encoded<typeof PaneCurrentInput> {}
/**
 * Pane output read parameters.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneReadInput: Schema.Struct<{
  readonly source: Schema.Literals<readonly ["visible", "recent", "recent_unwrapped", "detection"]>;
  readonly lines: Schema.OptionFromOptionalKey<Schema.Int>;
  readonly format: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["text", "ansi"]>>;
  readonly stripAnsi: Schema.OptionFromOptionalKey<Schema.Boolean>;
}>;
/**
 * Normalized pane output read parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneReadInput extends Schema.Schema.Type<typeof PaneReadInput> {}
/**
 * Ergonomic pane output read parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneReadInputEncoded extends Schema.Codec.Encoded<typeof PaneReadInput> {}
/**
 * Combined text and key input sent to one pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneInput: Schema.Union<readonly [Schema.Struct<{
  readonly text: Schema.String;
  readonly keys: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>, Schema.Struct<{
  readonly text: Schema.optionalKey<Schema.String>;
  readonly keys: Schema.$Array<Schema.String>;
}>]>;
/**
 * Normalized combined pane input.
 *
 * @category models
 * @since 0.8.2
 */
type PaneInput = typeof PaneInput.Type;
/**
 * Ergonomic combined pane input.
 *
 * @category models
 * @since 0.8.2
 */
type PaneInputEncoded = typeof PaneInput.Encoded;
/**
 * Text or regular-expression output matcher.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneOutputMatch: Schema.Union<readonly [Schema.Struct<{
  readonly type: Schema.Literal<"substring">;
  readonly value: Schema.String;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"regex">;
  readonly value: Schema.String;
}>]>;
/**
 * Text or regular-expression output matcher.
 *
 * @category models
 * @since 0.8.2
 */
type PaneOutputMatch = typeof PaneOutputMatch.Type;
/**
 * Pane output wait parameters.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneWaitForOutputInput: Schema.Struct<{
  readonly source: Schema.Literals<readonly ["visible", "recent", "recent_unwrapped", "detection"]>;
  readonly lines: Schema.OptionFromOptionalKey<Schema.Finite>;
  readonly match: Schema.Union<readonly [Schema.Struct<{
    readonly type: Schema.Literal<"substring">;
    readonly value: Schema.String;
  }>, Schema.Struct<{
    readonly type: Schema.Literal<"regex">;
    readonly value: Schema.String;
  }>]>;
  readonly timeoutMs: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrMilliseconds">>;
  readonly stripAnsi: Schema.OptionFromOptionalKey<Schema.Boolean>;
}>;
/**
 * Normalized pane output wait parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneWaitForOutputInput extends Schema.Schema.Type<typeof PaneWaitForOutputInput> {}
/**
 * Ergonomic pane output wait parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneWaitForOutputInputEncoded extends Schema.Codec.Encoded<typeof PaneWaitForOutputInput> {}
type PaneAgentSessionSelection = {
  readonly sessionId: Option.None<string>;
  readonly sessionPath: Option.Option<HerdrAbsolutePath>;
} | {
  readonly sessionId: Option.Some<string>;
  readonly sessionPath: Option.None<HerdrAbsolutePath>;
};
/**
 * Agent-state report attached to one pane; select its native session by at most one ID or path.
 *
 * `resumeArgv` is kept only while the same `source` and `agent` hold the pane, and takes
 * precedence over Herdr's built-in resume command for that agent.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneAgentReportInput: Schema.refine<{
  readonly source: string;
  readonly agent: string;
  readonly state: "blocked" | "idle" | "unknown" | "working";
  readonly message: Option.Option<string>;
  readonly sequence: Option.Option<number & import("effect/Brand").Brand<"HerdrStateChangeSequence">>;
  readonly sessionId: Option.Option<string>;
  readonly sessionPath: Option.Option<string & import("effect/Brand").Brand<"HerdrAbsolutePath">>;
  readonly resumeArgv: Option.Option<readonly string[]>;
} & PaneAgentSessionSelection, Schema.Struct<{
  readonly source: Schema.String;
  readonly agent: Schema.String;
  readonly state: Schema.Literals<readonly ["idle", "working", "blocked", "unknown"]>;
  readonly message: Schema.OptionFromOptionalKey<Schema.String>;
  readonly sequence: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>;
  readonly sessionId: Schema.OptionFromOptionalKey<Schema.String>;
  readonly sessionPath: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  /** Command Herdr runs to resume this session after a server restart; see `HerdrResumeArgv`. */
  readonly resumeArgv: Schema.OptionFromOptionalKey<Schema.$Array<Schema.String>>;
}>>;
/**
 * Normalized agent-state report.
 *
 * @category models
 * @since 0.8.2
 */
type PaneAgentReportInput = typeof PaneAgentReportInput.Type;
/**
 * Ergonomic agent-state report.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneAgentReportInputEncoded extends Schema.Codec.Encoded<typeof PaneAgentReportInput> {}
/**
 * Agent-session report attached to one pane.
 *
 * Attaching `resumeArgv` requires the reporter to hold the pane through an agent-state report
 * first; otherwise Herdr rejects the report with `resume_not_accepted`.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneAgentSessionReportInput: Schema.refine<{
  readonly source: string;
  readonly agent: string;
  readonly sequence: Option.Option<number & import("effect/Brand").Brand<"HerdrStateChangeSequence">>;
  readonly sessionStartSource: Option.Option<string>;
  readonly sessionId: Option.Option<string>;
  readonly sessionPath: Option.Option<string & import("effect/Brand").Brand<"HerdrAbsolutePath">>;
  readonly resumeArgv: Option.Option<readonly string[]>;
} & PaneAgentSessionSelection, Schema.Struct<{
  readonly source: Schema.String;
  readonly agent: Schema.String;
  readonly sequence: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>;
  readonly sessionStartSource: Schema.OptionFromOptionalKey<Schema.String>;
  readonly sessionId: Schema.OptionFromOptionalKey<Schema.String>;
  readonly sessionPath: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  /** Command Herdr runs to resume this session after a server restart; see `HerdrResumeArgv`. */
  readonly resumeArgv: Schema.OptionFromOptionalKey<Schema.$Array<Schema.String>>;
}>>;
/**
 * Normalized agent-session report.
 *
 * @category models
 * @since 0.8.2
 */
type PaneAgentSessionReportInput = typeof PaneAgentSessionReportInput.Type;
/**
 * Ergonomic agent-session report.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneAgentSessionReportInputEncoded extends Schema.Codec.Encoded<typeof PaneAgentSessionReportInput> {}
/**
 * Pane presentation report with sparse known-status labels and individually patched tokens.
 * Ordinary reports replace this source's title, displayed agent name, and label table;
 * use agent-state reports, not these display labels, to drive lifecycle waits.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneMetadataReportInput: Schema.Struct<{
  readonly source: Schema.String;
  readonly agent: Schema.OptionFromOptionalKey<Schema.String>;
  readonly appliesToSource: Schema.OptionFromOptionalKey<Schema.String>;
  readonly title: Schema.OptionFromOptionalKey<Schema.String>;
  readonly displayAgent: Schema.OptionFromOptionalKey<Schema.String>;
  readonly stateLabels: Schema.OptionFromOptionalKey<Schema.$Record<Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>, Schema.optionalKey<Schema.String>>>;
  readonly tokens: Schema.OptionFromOptionalKey<Schema.$Record<Schema.String, Schema.NullOr<Schema.String>>>;
  readonly clearTitle: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly clearDisplayAgent: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly clearStateLabels: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly sequence: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>;
  readonly ttlMs: Schema.OptionFromOptionalKey<Schema.brand<Schema.Finite, "HerdrMetadataTtl">>;
}>;
/**
 * Normalized pane metadata patch.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneMetadataReportInput extends Schema.Schema.Type<typeof PaneMetadataReportInput> {}
/**
 * Ergonomic pane metadata patch.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneMetadataReportInputEncoded extends Schema.Codec.Encoded<typeof PaneMetadataReportInput> {}
/**
 * Optional authority version used when clearing an agent report.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneClearAgentAuthorityInput: Schema.Struct<{
  readonly source: Schema.OptionFromOptionalKey<Schema.String>;
  readonly sequence: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>;
}>;
/**
 * Normalized clear-agent-authority request.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneClearAgentAuthorityInput extends Schema.Schema.Type<typeof PaneClearAgentAuthorityInput> {}
/**
 * Ergonomic clear-agent-authority request.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneClearAgentAuthorityInputEncoded extends Schema.Codec.Encoded<typeof PaneClearAgentAuthorityInput> {}
/**
 * Authority release request for one pane agent.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PaneReleaseAgentInput: Schema.Struct<{
  readonly source: Schema.String;
  readonly agent: Schema.String;
  readonly sequence: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>;
}>;
/**
 * Normalized pane agent release request.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneReleaseAgentInput extends Schema.Schema.Type<typeof PaneReleaseAgentInput> {}
/**
 * Ergonomic pane agent release request.
 *
 * @category models
 * @since 0.8.2
 */
interface PaneReleaseAgentInputEncoded extends Schema.Codec.Encoded<typeof PaneReleaseAgentInput> {}
interface LayoutPaneNodeValue {
  readonly type: "pane";
  readonly paneId: Option.Option<PaneId>;
  readonly label: Option.Option<string>;
  readonly cwd: Option.Option<HerdrAbsolutePath>;
  readonly command: Option.Option<readonly string[]>;
  readonly env: Option.Option<HerdrEnvironment>;
}
interface LayoutSplitNodeValue {
  readonly type: "split";
  readonly direction: SplitDirection;
  readonly ratio: HerdrSplitRatio;
  readonly first: LayoutNodeValue;
  readonly second: LayoutNodeValue;
}
type LayoutNodeValue = LayoutPaneNodeValue | LayoutSplitNodeValue;
interface LayoutPaneNodeInputEncoded {
  readonly type: "pane";
  readonly paneId?: string | undefined;
  readonly label?: string | undefined;
  readonly cwd?: string | undefined;
  readonly command?: readonly string[] | undefined;
  readonly env?: {
    readonly [key: string]: string;
  } | undefined;
}
interface LayoutSplitNodeInputEncoded {
  readonly type: "split";
  readonly direction: SplitDirection;
  readonly ratio: number;
  readonly first: LayoutNodeInputEncoded;
  readonly second: LayoutNodeInputEncoded;
}
type LayoutNodeInputEncoded = LayoutPaneNodeInputEncoded | LayoutSplitNodeInputEncoded;
interface LayoutPaneNodeWireEncoded {
  readonly type: "pane";
  readonly pane_id?: string | null | undefined;
  readonly label?: string | null | undefined;
  readonly cwd?: string | null | undefined;
  readonly command?: readonly string[] | null | undefined;
  readonly env?: {
    readonly [key: string]: string;
  } | undefined;
}
interface LayoutSplitNodeWireEncoded {
  readonly type: "split";
  readonly direction: SplitDirection;
  readonly ratio: number;
  readonly first: LayoutNodeWireEncoded;
  readonly second: LayoutNodeWireEncoded;
}
type LayoutNodeWireEncoded = LayoutPaneNodeWireEncoded | LayoutSplitNodeWireEncoded;
/**
 * Recursive declarative pane or split layout node.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const LayoutNode: Schema.Codec<LayoutNodeValue, LayoutNodeInputEncoded>;
/**
 * Recursive declarative pane or split layout node.
 *
 * @category models
 * @since 0.8.2
 */
type LayoutNode = typeof LayoutNode.Type;
/**
 * Tab or pane selecting a layout.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const LayoutTarget: Schema.Union<readonly [Schema.Struct<{
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly paneId: Schema.optionalKey<Schema.Never>;
}>, Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly tabId: Schema.optionalKey<Schema.Never>;
}>]>;
/**
 * Tab or pane selecting a layout.
 *
 * @category models
 * @since 0.8.2
 */
type LayoutTarget = typeof LayoutTarget.Type;
/**
 * Ergonomic tab or pane selecting a layout.
 *
 * @category models
 * @since 0.8.2
 */
type LayoutTargetEncoded = typeof LayoutTarget.Encoded;
/**
 * Declarative layout apply request.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const LayoutApplyInput: Schema.Struct<{
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly replaceTabId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "TabId">>;
  readonly tabLabel: Schema.OptionFromOptionalKey<Schema.String>;
  readonly focus: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly root: Schema.Codec<LayoutNodeValue, LayoutNodeInputEncoded, never, never>;
}>;
/**
 * Normalized declarative layout apply request.
 *
 * @category models
 * @since 0.8.2
 */
interface LayoutApplyInput extends Schema.Schema.Type<typeof LayoutApplyInput> {}
/**
 * Ergonomic declarative layout apply request.
 *
 * @category models
 * @since 0.8.2
 */
interface LayoutApplyInputEncoded extends Schema.Codec.Encoded<typeof LayoutApplyInput> {}
/**
 * Split path and ratio used to resize a declarative layout node.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const LayoutSetSplitRatioInput: Schema.Struct<{
  readonly path: Schema.$Array<Schema.Boolean>;
  readonly ratio: Schema.brand<Schema.Finite, "HerdrSplitRatio">;
}>;
/**
 * Normalized split-ratio update.
 *
 * @category models
 * @since 0.8.2
 */
interface LayoutSetSplitRatioInput extends Schema.Schema.Type<typeof LayoutSetSplitRatioInput> {}
/**
 * Ergonomic split-ratio update.
 *
 * @category models
 * @since 0.8.2
 */
interface LayoutSetSplitRatioInputEncoded extends Schema.Codec.Encoded<typeof LayoutSetSplitRatioInput> {}
/**
 * Exported or applied declarative layout.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const LayoutDescription: Schema.encodeKeys<Schema.Struct<{
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly zoomed: Schema.Boolean;
  readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly root: Schema.Codec<LayoutNodeValue, LayoutNodeWireEncoded, never, never>;
}>, {
  readonly workspaceId: "workspace_id";
  readonly tabId: "tab_id";
  readonly focusedPaneId: "focused_pane_id";
}>;
/**
 * Exported or applied declarative layout.
 *
 * @category models
 * @since 0.8.2
 */
interface LayoutDescription extends Schema.Schema.Type<typeof LayoutDescription> {}
/**
 * JSON value returned by currently schema-less Herdr protocol fields.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrJsonValue = typeof HerdrJsonValue.Type;
/**
 * JSON value returned by currently schema-less Herdr protocol fields.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrJsonValue: Schema.Codec<Schema.Json, Schema.Json, never, never>;
/**
 * Exactly one agent selector. Parsing supplies `kind` for existing single-selector inputs;
 * an explicit kind must agree with its selector, and competing selectors are rejected.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentTarget: Schema.Union<readonly [Schema.Struct<{
  readonly kind: Schema.withDecodingDefaultKey<Schema.tag<"pane">, never>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly name: Schema.optionalKey<Schema.Never>;
}>, Schema.Struct<{
  readonly kind: Schema.withDecodingDefaultKey<Schema.tag<"agent">, never>;
  readonly name: Schema.brand<Schema.NonEmptyString, "AgentName">;
  readonly paneId: Schema.optionalKey<Schema.Never>;
}>]>;
/**
 * Pane identifier or assigned name selecting one agent.
 *
 * @category models
 * @since 0.8.2
 */
type AgentTarget = typeof AgentTarget.Type;
/**
 * Ergonomic pane identifier or assigned name selecting one agent.
 *
 * @category models
 * @since 0.8.2
 */
type AgentTargetEncoded = typeof AgentTarget.Encoded;
/**
 * Parameters for launching a named agent in one pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentStartInput: Schema.Struct<{
  readonly name: Schema.brand<Schema.NonEmptyString, "AgentName">;
  readonly kind: Schema.NonEmptyString;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly args: Schema.OptionFromOptionalKey<Schema.$Array<Schema.String>>;
  readonly timeoutMs: Schema.OptionFromOptionalKey<Schema.Finite>;
}>;
/**
 * Normalized agent launch parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentStartInput extends Schema.Schema.Type<typeof AgentStartInput> {}
/**
 * Ergonomic agent launch parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentStartInputEncoded extends Schema.Codec.Encoded<typeof AgentStartInput> {}
/**
 * Agent and command line created by an agent launch.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentStartResult: Schema.Struct<{
  readonly agent: Schema.encodeKeys<Schema.Struct<{
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly name: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "AgentName">>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly status: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly screenDetectionSkipped: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly focused: Schema.Boolean;
    readonly launchPending: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
    readonly interactiveReady: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
    readonly stateChangeSequence: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>, never>;
    /**
     * Set when the current idle transition completed work, independent of who has viewed it.
     * Equals that transition's `stateChangeSequence`; startup, restore, and session changes leave it unset.
     */
    readonly completionSequence: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly terminalId: "terminal_id";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly status: "agent_status";
    readonly screenDetectionSkipped: "screen_detection_skipped";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly paneId: "pane_id";
    readonly launchPending: "launch_pending";
    readonly interactiveReady: "interactive_ready";
    readonly stateChangeSequence: "state_change_seq";
    readonly completionSequence: "completion_seq";
    readonly foregroundCwd: "foreground_cwd";
  }>;
  readonly argv: Schema.$Array<Schema.String>;
}>;
/**
 * Agent and command line created by an agent launch.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentStartResult extends Schema.Schema.Type<typeof AgentStartResult> {}
/**
 * Agent status and server-owned timeout used by wait operations.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentWaitInput: Schema.Struct<{
  readonly until: Schema.OptionFromOptionalKey<Schema.$Array<Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>>>;
  readonly timeoutMs: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrMilliseconds">>;
}>;
/**
 * Normalized agent wait parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentWaitInput extends Schema.Schema.Type<typeof AgentWaitInput> {}
/**
 * Ergonomic agent wait parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentWaitInputEncoded extends Schema.Codec.Encoded<typeof AgentWaitInput> {}
/**
 * Prompt and optional wait policy sent to one agent.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentPromptInput: Schema.Struct<{
  readonly text: Schema.String;
  readonly wait: Schema.OptionFromOptionalKey<Schema.Struct<{
    readonly until: Schema.OptionFromOptionalKey<Schema.$Array<Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>>>;
    readonly timeoutMs: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrMilliseconds">>;
  }>>;
}>;
/**
 * Normalized agent prompt parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentPromptInput extends Schema.Schema.Type<typeof AgentPromptInput> {}
/**
 * Ergonomic agent prompt parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentPromptInputEncoded extends Schema.Codec.Encoded<typeof AgentPromptInput> {}
/**
 * Active agent-view state.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentViewState: Schema.Struct<{
  readonly active: Schema.Boolean;
  readonly source: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
}>;
/**
 * Active agent-view state.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentViewState extends Schema.Schema.Type<typeof AgentViewState> {}
/**
 * Agent-view field selected by name or metadata token.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentViewField: Schema.Union<readonly [Schema.Literals<readonly ["status", "workspace_id", "tab_id", "pane_id", "agent", "seen", "state_change_seq"]>, Schema.Struct<{
  readonly token: Schema.String;
}>]>;
/**
 * Agent-view field selected by name or metadata token.
 *
 * @category models
 * @since 0.8.2
 */
type AgentViewField = typeof AgentViewField.Type;
/**
 * Literal or contextual value used by an agent-view filter.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentViewValue: Schema.Union<readonly [Schema.String, Schema.Boolean, Schema.Natural, Schema.Struct<{
  readonly context: Schema.Literals<readonly ["current_workspace_id", "current_tab_id"]>;
}>]>;
/**
 * Literal or contextual value used by an agent-view filter.
 *
 * @category models
 * @since 0.8.2
 */
type AgentViewValue = typeof AgentViewValue.Type;
interface AgentViewFilterAllValue {
  readonly op: "all" | "any";
  readonly filters: readonly AgentViewFilterValue[];
}
interface AgentViewFilterNotValue {
  readonly op: "not";
  readonly filter: AgentViewFilterValue;
}
interface AgentViewFilterEqualValue {
  readonly op: "eq";
  readonly field: AgentViewField;
  readonly value: AgentViewValue;
}
interface AgentViewFilterInValue {
  readonly op: "in";
  readonly field: AgentViewField;
  readonly values: readonly AgentViewValue[];
}
interface AgentViewFilterExistsValue {
  readonly op: "exists";
  readonly field: AgentViewField;
}
type AgentViewFilterValue = AgentViewFilterAllValue | AgentViewFilterNotValue | AgentViewFilterEqualValue | AgentViewFilterInValue | AgentViewFilterExistsValue;
/**
 * Recursive boolean filter used by the agent view.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentViewFilter: Schema.Codec<AgentViewFilterValue>;
/**
 * Recursive boolean filter used by the agent view.
 *
 * @category models
 * @since 0.8.2
 */
type AgentViewFilter = typeof AgentViewFilter.Type;
/**
 * Agent-view sorting field.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentViewSortField: Schema.Union<readonly [Schema.Literals<readonly ["workspace_order", "tab_order", "pane_order", "attention", "status", "agent", "seen", "state_change_seq"]>, Schema.Struct<{
  readonly token: Schema.String;
}>]>;
/**
 * Agent-view sorting field.
 *
 * @category models
 * @since 0.8.2
 */
type AgentViewSortField = typeof AgentViewSortField.Type;
/**
 * One agent-view sort term.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentViewSort: Schema.Struct<{
  readonly field: Schema.Union<readonly [Schema.Literals<readonly ["workspace_order", "tab_order", "pane_order", "attention", "status", "agent", "seen", "state_change_seq"]>, Schema.Struct<{
    readonly token: Schema.String;
  }>]>;
  readonly order: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["asc", "desc"]>>;
}>;
/**
 * One agent-view sort term.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentViewSort extends Schema.Schema.Type<typeof AgentViewSort> {}
/**
 * Agent-view activation parameters.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentViewSetInput: Schema.Struct<{
  readonly source: Schema.String;
  readonly label: Schema.OptionFromOptionalKey<Schema.String>;
  readonly filter: Schema.OptionFromOptionalKey<Schema.Codec<AgentViewFilterValue, AgentViewFilterValue, never, never>>;
  readonly sort: Schema.OptionFromOptionalKey<Schema.$Array<Schema.Struct<{
    readonly field: Schema.Union<readonly [Schema.Literals<readonly ["workspace_order", "tab_order", "pane_order", "attention", "status", "agent", "seen", "state_change_seq"]>, Schema.Struct<{
      readonly token: Schema.String;
    }>]>;
    readonly order: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["asc", "desc"]>>;
  }>>>;
}>;
/**
 * Normalized agent-view activation parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentViewSetInput extends Schema.Schema.Type<typeof AgentViewSetInput> {}
/**
 * Ergonomic agent-view activation parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentViewSetInputEncoded extends Schema.Codec.Encoded<typeof AgentViewSetInput> {}
/**
 * Optional source used to clear an agent view.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const AgentViewClearInput: Schema.Struct<{
  readonly source: Schema.OptionFromOptionalKey<Schema.String>;
}>;
/**
 * Normalized agent-view clear parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentViewClearInput extends Schema.Schema.Type<typeof AgentViewClearInput> {}
/**
 * Ergonomic agent-view clear parameters.
 *
 * @category models
 * @since 0.8.2
 */
interface AgentViewClearInputEncoded extends Schema.Codec.Encoded<typeof AgentViewClearInput> {}
/**
 * Complete immutable snapshot of the active Herdr session.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const SessionSnapshot: Schema.encodeKeys<Schema.Struct<{
  readonly version: Schema.String;
  readonly protocol: Schema.Natural;
  readonly focusedWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly focusedTabId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "TabId">>;
  readonly focusedPaneId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly workspaces: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>>;
  readonly tabs: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  }>, {
    readonly id: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly paneCount: "pane_count";
    readonly agentStatus: "agent_status";
  }>>;
  readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly focused: Schema.Boolean;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
    readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly offsetFromBottom: Schema.Finite;
      readonly maxOffsetFromBottom: Schema.Finite;
      readonly viewportRows: Schema.Natural;
    }>, {
      readonly offsetFromBottom: "offset_from_bottom";
      readonly maxOffsetFromBottom: "max_offset_from_bottom";
      readonly viewportRows: "viewport_rows";
    }>>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly id: "pane_id";
    readonly terminalId: "terminal_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly restoreError: "restore_error";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly agentStatus: "agent_status";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
  }>>;
  readonly layouts: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly zoomed: Schema.Boolean;
    readonly area: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
    readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly focused: Schema.Boolean;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>, {
      readonly paneId: "pane_id";
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly id: Schema.String;
      readonly direction: Schema.Literals<readonly ["right", "down"]>;
      readonly ratio: Schema.Finite;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly focusedPaneId: "focused_pane_id";
  }>>;
  readonly agents: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly name: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "AgentName">>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly status: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly screenDetectionSkipped: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly focused: Schema.Boolean;
    readonly launchPending: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
    readonly interactiveReady: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
    readonly stateChangeSequence: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>, never>;
    /**
     * Set when the current idle transition completed work, independent of who has viewed it.
     * Equals that transition's `stateChangeSequence`; startup, restore, and session changes leave it unset.
     */
    readonly completionSequence: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.Natural, "HerdrStateChangeSequence">>;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly terminalId: "terminal_id";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly status: "agent_status";
    readonly screenDetectionSkipped: "screen_detection_skipped";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly paneId: "pane_id";
    readonly launchPending: "launch_pending";
    readonly interactiveReady: "interactive_ready";
    readonly stateChangeSequence: "state_change_seq";
    readonly completionSequence: "completion_seq";
    readonly foregroundCwd: "foreground_cwd";
  }>>;
}>, {
  readonly focusedWorkspaceId: "focused_workspace_id";
  readonly focusedTabId: "focused_tab_id";
  readonly focusedPaneId: "focused_pane_id";
}>;
/**
 * Complete immutable snapshot of the active Herdr session.
 *
 * @category models
 * @since 0.8.2
 */
interface SessionSnapshot extends Schema.Schema.Type<typeof SessionSnapshot> {}
/**
 * Schema-owned union of every normalized Herdr event.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrEvent: Schema.Union<readonly [Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"workspace.created">, Schema.Literal<"workspace_created">, never, never>;
  readonly workspace: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>;
}>, Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"workspace.updated">, Schema.Literal<"workspace_updated">, never, never>;
  readonly workspace: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>;
}>, Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"workspace.metadata_updated">, Schema.Literal<"workspace_metadata_updated">, never, never>;
  readonly workspace: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>;
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"workspace.closed">, Schema.Literal<"workspace_closed">, never, never>;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly workspace: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>>;
}>, {
  readonly workspaceId: "workspace_id";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"workspace.renamed">, Schema.Literal<"workspace_renamed">, never, never>;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly label: Schema.String;
}>, {
  readonly workspaceId: "workspace_id";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"workspace.moved">, Schema.Literal<"workspace_moved">, never, never>;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly insertIndex: Schema.brand<Schema.Natural, "HerdrInsertIndex">;
  readonly workspaces: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>>;
}>, {
  readonly workspaceId: "workspace_id";
  readonly insertIndex: "insert_index";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"workspace.reordered">, Schema.Literal<"workspace_reordered">, never, never>;
  readonly workspaceIds: Schema.$Array<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly beforeWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly workspaces: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>>;
}>, {
  readonly workspaceIds: "workspace_ids";
  readonly beforeWorkspaceId: "before_workspace_id";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"workspace.focused">, Schema.Literal<"workspace_focused">, never, never>;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
}>, {
  readonly workspaceId: "workspace_id";
}>, Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"worktree.created">, Schema.Literal<"worktree_created">, never, never>;
  readonly workspace: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>;
  readonly worktree: Schema.encodeKeys<Schema.Struct<{
    readonly path: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly branch: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly isBare: Schema.Boolean;
    readonly isDetached: Schema.Boolean;
    readonly isPrunable: Schema.Boolean;
    readonly isLinkedWorktree: Schema.Boolean;
    readonly openWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
    readonly label: Schema.String;
  }>, {
    readonly isBare: "is_bare";
    readonly isDetached: "is_detached";
    readonly isPrunable: "is_prunable";
    readonly isLinkedWorktree: "is_linked_worktree";
    readonly openWorkspaceId: "open_workspace_id";
  }>;
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"worktree.opened">, Schema.Literal<"worktree_opened">, never, never>;
  readonly workspace: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>;
  readonly worktree: Schema.encodeKeys<Schema.Struct<{
    readonly path: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly branch: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly isBare: Schema.Boolean;
    readonly isDetached: Schema.Boolean;
    readonly isPrunable: Schema.Boolean;
    readonly isLinkedWorktree: Schema.Boolean;
    readonly openWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
    readonly label: Schema.String;
  }>, {
    readonly isBare: "is_bare";
    readonly isDetached: "is_detached";
    readonly isPrunable: "is_prunable";
    readonly isLinkedWorktree: "is_linked_worktree";
    readonly openWorkspaceId: "open_workspace_id";
  }>;
  readonly alreadyOpen: Schema.Boolean;
}>, {
  readonly alreadyOpen: "already_open";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"worktree.removed">, Schema.Literal<"worktree_removed">, never, never>;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly workspace: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>>;
  readonly worktree: Schema.encodeKeys<Schema.Struct<{
    readonly path: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly branch: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly isBare: Schema.Boolean;
    readonly isDetached: Schema.Boolean;
    readonly isPrunable: Schema.Boolean;
    readonly isLinkedWorktree: Schema.Boolean;
    readonly openWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
    readonly label: Schema.String;
  }>, {
    readonly isBare: "is_bare";
    readonly isDetached: "is_detached";
    readonly isPrunable: "is_prunable";
    readonly isLinkedWorktree: "is_linked_worktree";
    readonly openWorkspaceId: "open_workspace_id";
  }>;
  readonly forced: Schema.Boolean;
}>, {
  readonly workspaceId: "workspace_id";
}>, Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"tab.created">, Schema.Literal<"tab_created">, never, never>;
  readonly tab: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  }>, {
    readonly id: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly paneCount: "pane_count";
    readonly agentStatus: "agent_status";
  }>;
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"tab.closed">, Schema.Literal<"tab_closed">, never, never>;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
}>, {
  readonly tabId: "tab_id";
  readonly workspaceId: "workspace_id";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"tab.renamed">, Schema.Literal<"tab_renamed">, never, never>;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly label: Schema.String;
}>, {
  readonly tabId: "tab_id";
  readonly workspaceId: "workspace_id";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"tab.moved">, Schema.Literal<"tab_moved">, never, never>;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly insertIndex: Schema.brand<Schema.Natural, "HerdrInsertIndex">;
  readonly tabs: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  }>, {
    readonly id: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly paneCount: "pane_count";
    readonly agentStatus: "agent_status";
  }>>;
}>, {
  readonly tabId: "tab_id";
  readonly workspaceId: "workspace_id";
  readonly insertIndex: "insert_index";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"tab.focused">, Schema.Literal<"tab_focused">, never, never>;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
}>, {
  readonly tabId: "tab_id";
  readonly workspaceId: "workspace_id";
}>, Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.created">, Schema.Literal<"pane_created">, never, never>;
  readonly pane: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly focused: Schema.Boolean;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
    readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly offsetFromBottom: Schema.Finite;
      readonly maxOffsetFromBottom: Schema.Finite;
      readonly viewportRows: Schema.Natural;
    }>, {
      readonly offsetFromBottom: "offset_from_bottom";
      readonly maxOffsetFromBottom: "max_offset_from_bottom";
      readonly viewportRows: "viewport_rows";
    }>>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly id: "pane_id";
    readonly terminalId: "terminal_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly restoreError: "restore_error";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly agentStatus: "agent_status";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
  }>;
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.closed">, Schema.Literal<"pane_closed">, never, never>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
}>, {
  readonly paneId: "pane_id";
  readonly workspaceId: "workspace_id";
}>, Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.updated">, Schema.Literal<"pane_updated">, never, never>;
  readonly pane: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly focused: Schema.Boolean;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
    readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly offsetFromBottom: Schema.Finite;
      readonly maxOffsetFromBottom: Schema.Finite;
      readonly viewportRows: Schema.Natural;
    }>, {
      readonly offsetFromBottom: "offset_from_bottom";
      readonly maxOffsetFromBottom: "max_offset_from_bottom";
      readonly viewportRows: "viewport_rows";
    }>>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly id: "pane_id";
    readonly terminalId: "terminal_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly restoreError: "restore_error";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly agentStatus: "agent_status";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
  }>;
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.focused">, Schema.Literal<"pane_focused">, never, never>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
}>, {
  readonly paneId: "pane_id";
  readonly workspaceId: "workspace_id";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.moved">, Schema.Literal<"pane_moved">, never, never>;
  readonly previousPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly previousWorkspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly previousTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly pane: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly focused: Schema.Boolean;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
    readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly offsetFromBottom: Schema.Finite;
      readonly maxOffsetFromBottom: Schema.Finite;
      readonly viewportRows: Schema.Natural;
    }>, {
      readonly offsetFromBottom: "offset_from_bottom";
      readonly maxOffsetFromBottom: "max_offset_from_bottom";
      readonly viewportRows: "viewport_rows";
    }>>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly id: "pane_id";
    readonly terminalId: "terminal_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly restoreError: "restore_error";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly agentStatus: "agent_status";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
  }>;
  readonly createdWorkspace: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly tabCount: Schema.Natural;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
  }>, {
    readonly id: "workspace_id";
    readonly paneCount: "pane_count";
    readonly tabCount: "tab_count";
    readonly activeTabId: "active_tab_id";
    readonly agentStatus: "agent_status";
  }>>;
  readonly createdTab: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly focused: Schema.Boolean;
    readonly paneCount: Schema.Natural;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  }>, {
    readonly id: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly paneCount: "pane_count";
    readonly agentStatus: "agent_status";
  }>>;
  readonly closedWorkspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly closedTabId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "TabId">>;
}>, {
  readonly previousPaneId: "previous_pane_id";
  readonly previousWorkspaceId: "previous_workspace_id";
  readonly previousTabId: "previous_tab_id";
  readonly createdWorkspace: "created_workspace";
  readonly createdTab: "created_tab";
  readonly closedWorkspaceId: "closed_workspace_id";
  readonly closedTabId: "closed_tab_id";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.output_changed">, Schema.Literal<"pane_output_changed">, never, never>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
}>, {
  readonly paneId: "pane_id";
  readonly workspaceId: "workspace_id";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.exited">, Schema.Literal<"pane_exited">, never, never>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
}>, {
  readonly paneId: "pane_id";
  readonly workspaceId: "workspace_id";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.agent_detected">, Schema.Literal<"pane_agent_detected">, never, never>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly released: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Boolean>, never>;
  readonly finalStatus: Schema.OptionFromOptionalNullOr<Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>>;
}>, {
  readonly paneId: "pane_id";
  readonly workspaceId: "workspace_id";
  readonly finalStatus: "final_status";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.agent_status_changed">, Schema.Literal<"pane_agent_status_changed">, never, never>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
  readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
}>, {
  readonly paneId: "pane_id";
  readonly workspaceId: "workspace_id";
  readonly agentStatus: "agent_status";
  readonly displayAgent: "display_agent";
  readonly stateLabels: "state_labels";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.scroll_changed">, Schema.Literal<"pane_scroll_changed">, never, never>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly scroll: Schema.encodeKeys<Schema.Struct<{
    readonly offsetFromBottom: Schema.Finite;
    readonly maxOffsetFromBottom: Schema.Finite;
    readonly viewportRows: Schema.Natural;
  }>, {
    readonly offsetFromBottom: "offset_from_bottom";
    readonly maxOffsetFromBottom: "max_offset_from_bottom";
    readonly viewportRows: "viewport_rows";
  }>;
}>, {
  readonly paneId: "pane_id";
  readonly workspaceId: "workspace_id";
}>, Schema.encodeKeys<Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"pane.output_matched">, Schema.Literal<"pane_output_matched">, never, never>;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly matchedLine: Schema.String;
  readonly read: Schema.encodeKeys<Schema.Struct<{
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly source: Schema.Literals<readonly ["visible", "recent", "recent_unwrapped", "detection"]>;
    readonly format: Schema.Literals<readonly ["text", "ansi"]>;
    readonly text: Schema.String;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
    readonly truncated: Schema.Boolean;
  }>, {
    readonly paneId: "pane_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
  }>;
}>, {
  readonly paneId: "pane_id";
  readonly matchedLine: "matched_line";
}>, Schema.Struct<{
  readonly type: Schema.decodeTo<Schema.Literal<"layout.updated">, Schema.Literal<"layout_updated">, never, never>;
  readonly layout: Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly zoomed: Schema.Boolean;
    readonly area: Schema.Struct<{
      readonly x: Schema.Finite;
      readonly y: Schema.Finite;
      readonly width: Schema.Finite;
      readonly height: Schema.Finite;
    }>;
    readonly focusedPaneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly focused: Schema.Boolean;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>, {
      readonly paneId: "pane_id";
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly id: Schema.String;
      readonly direction: Schema.Literals<readonly ["right", "down"]>;
      readonly ratio: Schema.Finite;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
      }>;
    }>>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly focusedPaneId: "focused_pane_id";
  }>;
}>]>;
/**
 * Schema-owned union of every normalized Herdr event.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrEvent = typeof HerdrEvent.Type;
/**
 * Event emitted for one subscription specification.
 *
 * @category models
 * @since 0.8.2
 */
type EventForSubscription<Spec extends {
  readonly type: string;
}> = Extract<HerdrEvent, {
  readonly type: Spec["type"];
}>;
/**
 * Event emitted for one wait matcher.
 *
 * @category models
 * @since 0.8.2
 */
type EventForMatch<Match extends {
  readonly type: string;
}> = Extract<HerdrEvent, {
  readonly type: Match["type"];
}>;
/**
 * Lifecycle event kinds accepted by a simple subscription.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const LifecycleSubscriptionType: Schema.Literals<readonly ["workspace.created", "workspace.updated", "workspace.metadata_updated", "workspace.renamed", "workspace.moved", "workspace.reordered", "workspace.closed", "workspace.focused", "worktree.created", "worktree.opened", "worktree.removed", "tab.created", "tab.closed", "tab.focused", "tab.renamed", "tab.moved", "pane.created", "pane.closed", "pane.updated", "pane.focused", "pane.moved", "pane.exited", "pane.agent_detected", "layout.updated"]>;
/**
 * Lifecycle event kinds accepted by a simple subscription.
 *
 * @category models
 * @since 0.8.2
 */
type LifecycleSubscriptionType = typeof LifecycleSubscriptionType.Type;
/**
 * Event subscription specification sent during stream acquisition.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const EventSubscriptionSpec: Schema.Union<readonly [Schema.Struct<{
  readonly type: Schema.Literals<readonly ["workspace.created", "workspace.updated", "workspace.metadata_updated", "workspace.renamed", "workspace.moved", "workspace.reordered", "workspace.closed", "workspace.focused", "worktree.created", "worktree.opened", "worktree.removed", "tab.created", "tab.closed", "tab.focused", "tab.renamed", "tab.moved", "pane.created", "pane.closed", "pane.updated", "pane.focused", "pane.moved", "pane.exited", "pane.agent_detected", "layout.updated"]>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.output_matched">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly source: Schema.Literals<readonly ["visible", "recent", "recent_unwrapped", "detection"]>;
  readonly lines: Schema.OptionFromOptionalKey<Schema.Finite>;
  readonly match: Schema.Union<readonly [Schema.Struct<{
    readonly type: Schema.Literal<"substring">;
    readonly value: Schema.String;
  }>, Schema.Struct<{
    readonly type: Schema.Literal<"regex">;
    readonly value: Schema.String;
  }>]>;
  readonly stripAnsi: Schema.OptionFromOptionalKey<Schema.Boolean>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.agent_status_changed">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly agentStatus: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.scroll_changed">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
}>]>;
/**
 * Normalized event subscription specification.
 *
 * @category models
 * @since 0.8.2
 */
type EventSubscriptionSpec = typeof EventSubscriptionSpec.Type;
/**
 * Ergonomic event subscription specification.
 *
 * @category models
 * @since 0.8.2
 */
type EventSubscriptionSpecEncoded = typeof EventSubscriptionSpec.Encoded;
/**
 * Event matcher used by a one-shot wait.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const EventMatch: Schema.Union<readonly [Schema.Struct<{
  readonly type: Schema.Literal<"workspace.created">;
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"workspace.updated">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"workspace.closed">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"workspace.renamed">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly label: Schema.OptionFromOptionalKey<Schema.String>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"workspace.moved">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"workspace.focused">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"tab.created">;
  readonly tabId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "TabId">>;
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"tab.closed">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"tab.renamed">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly label: Schema.OptionFromOptionalKey<Schema.String>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"tab.moved">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"tab.focused">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.created">;
  readonly paneId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.closed">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.focused">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.moved">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.output_changed">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly minRevision: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrRevision">>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.exited">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.agent_detected">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly agent: Schema.OptionFromOptionalKey<Schema.String>;
}>, Schema.Struct<{
  readonly type: Schema.Literal<"pane.agent_status_changed">;
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
}>]>;
/**
 * Normalized event matcher used by a one-shot wait.
 *
 * @category models
 * @since 0.8.2
 */
type EventMatch = typeof EventMatch.Type;
/**
 * Ergonomic event matcher used by a one-shot wait.
 *
 * @category models
 * @since 0.8.2
 */
type EventMatchEncoded = typeof EventMatch.Encoded;
/**
 * Optional server-owned timeout for a one-shot event wait.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const EventWaitInput: Schema.Struct<{
  readonly timeoutMs: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrMilliseconds">>;
}>;
/**
 * Normalized server-owned event wait options.
 *
 * @category models
 * @since 0.8.2
 */
interface EventWaitInput extends Schema.Schema.Type<typeof EventWaitInput> {}
/**
 * Ergonomic server-owned event wait options.
 *
 * @category models
 * @since 0.8.2
 */
interface EventWaitInputEncoded extends Schema.Codec.Encoded<typeof EventWaitInput> {}
/**
 * Operating system supported by a plugin command.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginPlatform: Schema.Literals<readonly ["linux", "macos", "windows"]>;
/**
 * Operating system supported by a plugin command.
 *
 * @category models
 * @since 0.8.2
 */
type PluginPlatform = typeof PluginPlatform.Type;
/**
 * Invocation context supported by a plugin action.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginActionContext: Schema.Literals<readonly ["global", "workspace", "tab", "pane", "selection"]>;
/**
 * Invocation context supported by a plugin action.
 *
 * @category models
 * @since 0.8.2
 */
type PluginActionContext = typeof PluginActionContext.Type;
/**
 * Placement used by a plugin-owned pane.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginPanePlacement: Schema.Literals<readonly ["overlay", "popup", "split", "tab", "zoomed"]>;
/**
 * Placement used by a plugin-owned pane.
 *
 * @category models
 * @since 0.8.2
 */
type PluginPanePlacement = typeof PluginPanePlacement.Type;
/**
 * Managed or local source metadata for an installed plugin.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginSource: Schema.encodeKeys<Schema.Struct<{
  readonly kind: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Literals<readonly ["local", "github"]>>, never>;
  readonly owner: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly repo: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly subdir: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly requestedRef: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly resolvedCommit: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly managedPath: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly installedUnixMs: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.Natural, "HerdrUnixMilliseconds">>;
}>, {
  readonly requestedRef: "requested_ref";
  readonly resolvedCommit: "resolved_commit";
  readonly managedPath: "managed_path";
  readonly installedUnixMs: "installed_unix_ms";
}>;
/**
 * Managed or local source metadata for an installed plugin.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginSource extends Schema.Schema.Type<typeof PluginSource> {}
/**
 * Platform-scoped command declared by a plugin manifest.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginManifestCommand: Schema.Struct<{
  readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
  readonly command: Schema.$Array<Schema.String>;
}>;
/**
 * Platform-scoped command declared by a plugin manifest.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginManifestCommand extends Schema.Schema.Type<typeof PluginManifestCommand> {}
/**
 * Action declared by a plugin manifest.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginManifestAction: Schema.Struct<{
  readonly id: Schema.String;
  readonly title: Schema.String;
  readonly description: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly contexts: Schema.$Array<Schema.Literals<readonly ["global", "workspace", "tab", "pane", "selection"]>>;
  readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
  readonly command: Schema.$Array<Schema.String>;
}>;
/**
 * Action declared by a plugin manifest.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginManifestAction extends Schema.Schema.Type<typeof PluginManifestAction> {}
/**
 * Event hook declared by a plugin manifest.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginManifestEventHook: Schema.Struct<{
  readonly on: Schema.String;
  readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
  readonly command: Schema.$Array<Schema.String>;
}>;
/**
 * Event hook declared by a plugin manifest.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginManifestEventHook extends Schema.Schema.Type<typeof PluginManifestEventHook> {}
/**
 * Pane entrypoint declared by a plugin manifest.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginManifestPane: Schema.Struct<{
  readonly id: Schema.String;
  readonly title: Schema.String;
  readonly description: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
  readonly placement: Schema.Literals<readonly ["overlay", "popup", "split", "tab", "zoomed"]>;
  readonly width: Schema.OptionFromOptionalNullOr<Schema.Union<readonly [Schema.Finite, Schema.String]>>;
  readonly height: Schema.OptionFromOptionalNullOr<Schema.Union<readonly [Schema.Finite, Schema.String]>>;
  readonly command: Schema.$Array<Schema.String>;
}>;
/**
 * Pane entrypoint declared by a plugin manifest.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginManifestPane extends Schema.Schema.Type<typeof PluginManifestPane> {}
/**
 * URL link handler declared by a plugin manifest.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginManifestLinkHandler: Schema.Struct<{
  readonly id: Schema.String;
  readonly title: Schema.String;
  readonly pattern: Schema.String;
  readonly action: Schema.String;
  readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
}>;
/**
 * URL link handler declared by a plugin manifest.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginManifestLinkHandler extends Schema.Schema.Type<typeof PluginManifestLinkHandler> {}
/**
 * Fully resolved installed plugin.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const InstalledPlugin: Schema.encodeKeys<Schema.Struct<{
  readonly id: Schema.brand<Schema.NonEmptyString, "PluginId">;
  readonly name: Schema.String;
  readonly version: Schema.String;
  readonly minHerdrVersion: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.String>, never>;
  readonly description: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly manifestPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
  readonly root: Schema.brand<Schema.String, "HerdrAbsolutePath">;
  readonly enabled: Schema.Boolean;
  readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
  readonly build: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Array<Schema.Struct<{
    readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
    readonly command: Schema.$Array<Schema.String>;
  }>>>, never>;
  readonly startup: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Array<Schema.Struct<{
    readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
    readonly command: Schema.$Array<Schema.String>;
  }>>>, never>;
  readonly actions: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly title: Schema.String;
    readonly description: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly contexts: Schema.$Array<Schema.Literals<readonly ["global", "workspace", "tab", "pane", "selection"]>>;
    readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
    readonly command: Schema.$Array<Schema.String>;
  }>>>, never>;
  readonly events: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Array<Schema.Struct<{
    readonly on: Schema.String;
    readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
    readonly command: Schema.$Array<Schema.String>;
  }>>>, never>;
  readonly panes: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly title: Schema.String;
    readonly description: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
    readonly placement: Schema.Literals<readonly ["overlay", "popup", "split", "tab", "zoomed"]>;
    readonly width: Schema.OptionFromOptionalNullOr<Schema.Union<readonly [Schema.Finite, Schema.String]>>;
    readonly height: Schema.OptionFromOptionalNullOr<Schema.Union<readonly [Schema.Finite, Schema.String]>>;
    readonly command: Schema.$Array<Schema.String>;
  }>>>, never>;
  readonly linkHandlers: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly title: Schema.String;
    readonly pattern: Schema.String;
    readonly action: Schema.String;
    readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
  }>>>, never>;
  readonly source: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.encodeKeys<Schema.Struct<{
    readonly kind: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.Literals<readonly ["local", "github"]>>, never>;
    readonly owner: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly repo: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly subdir: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly requestedRef: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly resolvedCommit: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly managedPath: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly installedUnixMs: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.Natural, "HerdrUnixMilliseconds">>;
  }>, {
    readonly requestedRef: "requested_ref";
    readonly resolvedCommit: "resolved_commit";
    readonly managedPath: "managed_path";
    readonly installedUnixMs: "installed_unix_ms";
  }>>, never>;
  readonly warnings: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Array<Schema.String>>, never>;
}>, {
  readonly id: "plugin_id";
  readonly minHerdrVersion: "min_herdr_version";
  readonly manifestPath: "manifest_path";
  readonly root: "plugin_root";
  readonly linkHandlers: "link_handlers";
}>;
/**
 * Fully resolved installed plugin.
 *
 * @category models
 * @since 0.8.2
 */
interface InstalledPlugin extends Schema.Schema.Type<typeof InstalledPlugin> {}
/**
 * Resolved plugin action.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginAction: Schema.encodeKeys<Schema.Struct<{
  readonly pluginId: Schema.brand<Schema.NonEmptyString, "PluginId">;
  readonly id: Schema.brand<Schema.NonEmptyString, "PluginActionId">;
  readonly title: Schema.String;
  readonly description: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly contexts: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["global", "workspace", "tab", "pane", "selection"]>>>, never>;
  readonly command: Schema.$Array<Schema.String>;
  readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
}>, {
  readonly pluginId: "plugin_id";
  readonly id: "action_id";
}>;
/**
 * Resolved plugin action.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginAction extends Schema.Schema.Type<typeof PluginAction> {}
/**
 * Runtime context passed to a plugin action.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginInvocationContext: Schema.encodeKeys<Schema.Struct<{
  readonly workspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly workspaceLabel: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly workspaceCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly repoKey: Schema.String;
    readonly repoName: Schema.String;
    readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly isLinkedWorktree: Schema.Boolean;
  }>, {
    readonly repoKey: "repo_key";
    readonly repoName: "repo_name";
    readonly repoRoot: "repo_root";
    readonly checkoutPath: "checkout_path";
    readonly isLinkedWorktree: "is_linked_worktree";
  }>>;
  readonly tabId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "TabId">>;
  readonly tabLabel: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly focusedPaneId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly focusedPaneCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly focusedPaneAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly focusedPaneStatus: Schema.OptionFromOptionalNullOr<Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>>;
  readonly selectedText: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly invocationSource: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly correlationId: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly clickedUrl: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly linkHandlerId: Schema.OptionFromOptionalNullOr<Schema.String>;
}>, {
  readonly workspaceId: "workspace_id";
  readonly workspaceLabel: "workspace_label";
  readonly workspaceCwd: "workspace_cwd";
  readonly tabId: "tab_id";
  readonly tabLabel: "tab_label";
  readonly focusedPaneId: "focused_pane_id";
  readonly focusedPaneCwd: "focused_pane_cwd";
  readonly focusedPaneAgent: "focused_pane_agent";
  readonly focusedPaneStatus: "focused_pane_status";
  readonly selectedText: "selected_text";
  readonly invocationSource: "invocation_source";
  readonly correlationId: "correlation_id";
  readonly clickedUrl: "clicked_url";
  readonly linkHandlerId: "link_handler_id";
}>;
/**
 * Runtime context passed to a plugin action.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginInvocationContext extends Schema.Schema.Type<typeof PluginInvocationContext> {}
/**
 * Camel-case plugin invocation context accepted from SDK callers.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginInvocationContextInput: Schema.Struct<{
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly workspaceLabel: Schema.OptionFromOptionalKey<Schema.String>;
  readonly workspaceCwd: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly worktree: Schema.OptionFromOptionalKey<Schema.Struct<{
    readonly repoKey: Schema.String;
    readonly repoName: Schema.String;
    readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
    readonly isLinkedWorktree: Schema.Boolean;
  }>>;
  readonly tabId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "TabId">>;
  readonly tabLabel: Schema.OptionFromOptionalKey<Schema.String>;
  readonly focusedPaneId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly focusedPaneCwd: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly focusedPaneAgent: Schema.OptionFromOptionalKey<Schema.String>;
  readonly focusedPaneStatus: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>>;
  readonly selectedText: Schema.OptionFromOptionalKey<Schema.String>;
  readonly invocationSource: Schema.OptionFromOptionalKey<Schema.String>;
  readonly correlationId: Schema.OptionFromOptionalKey<Schema.String>;
  readonly clickedUrl: Schema.OptionFromOptionalKey<Schema.String>;
  readonly linkHandlerId: Schema.OptionFromOptionalKey<Schema.String>;
}>;
/**
 * Normalized camel-case plugin invocation context.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginInvocationContextInput extends Schema.Schema.Type<typeof PluginInvocationContextInput> {}
/**
 * One plugin command execution log.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginCommandLog: Schema.encodeKeys<Schema.Struct<{
  readonly id: Schema.brand<Schema.NonEmptyString, "PluginLogId">;
  readonly pluginId: Schema.brand<Schema.NonEmptyString, "PluginId">;
  readonly actionId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "PluginActionId">>;
  readonly event: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly command: Schema.$Array<Schema.String>;
  readonly status: Schema.Literals<readonly ["running", "succeeded", "failed"]>;
  readonly startedUnixMs: Schema.brand<Schema.Natural, "HerdrUnixMilliseconds">;
  readonly finishedUnixMs: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.Natural, "HerdrUnixMilliseconds">>;
  readonly exitCode: Schema.OptionFromOptionalNullOr<Schema.Finite>;
  readonly stdout: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly stderr: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly error: Schema.OptionFromOptionalNullOr<Schema.String>;
}>, {
  readonly id: "log_id";
  readonly pluginId: "plugin_id";
  readonly actionId: "action_id";
  readonly startedUnixMs: "started_unix_ms";
  readonly finishedUnixMs: "finished_unix_ms";
  readonly exitCode: "exit_code";
}>;
/**
 * One plugin command execution log.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginCommandLog extends Schema.Schema.Type<typeof PluginCommandLog> {}
/**
 * Completed plugin action invocation.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginActionInvocation: Schema.Struct<{
  readonly action: Schema.encodeKeys<Schema.Struct<{
    readonly pluginId: Schema.brand<Schema.NonEmptyString, "PluginId">;
    readonly id: Schema.brand<Schema.NonEmptyString, "PluginActionId">;
    readonly title: Schema.String;
    readonly description: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly contexts: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["global", "workspace", "tab", "pane", "selection"]>>>, never>;
    readonly command: Schema.$Array<Schema.String>;
    readonly platforms: Schema.OptionFromOptionalNullOr<Schema.$Array<Schema.Literals<readonly ["linux", "macos", "windows"]>>>;
  }>, {
    readonly pluginId: "plugin_id";
    readonly id: "action_id";
  }>;
  readonly context: Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
    readonly workspaceLabel: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly workspaceCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly worktree: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly repoKey: "repo_key";
      readonly repoName: "repo_name";
      readonly repoRoot: "repo_root";
      readonly checkoutPath: "checkout_path";
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
    readonly tabId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "TabId">>;
    readonly tabLabel: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly focusedPaneId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "PaneId">>;
    readonly focusedPaneCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly focusedPaneAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly focusedPaneStatus: Schema.OptionFromOptionalNullOr<Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>>;
    readonly selectedText: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly invocationSource: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly correlationId: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly clickedUrl: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly linkHandlerId: Schema.OptionFromOptionalNullOr<Schema.String>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly workspaceLabel: "workspace_label";
    readonly workspaceCwd: "workspace_cwd";
    readonly tabId: "tab_id";
    readonly tabLabel: "tab_label";
    readonly focusedPaneId: "focused_pane_id";
    readonly focusedPaneCwd: "focused_pane_cwd";
    readonly focusedPaneAgent: "focused_pane_agent";
    readonly focusedPaneStatus: "focused_pane_status";
    readonly selectedText: "selected_text";
    readonly invocationSource: "invocation_source";
    readonly correlationId: "correlation_id";
    readonly clickedUrl: "clicked_url";
    readonly linkHandlerId: "link_handler_id";
  }>;
  readonly log: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PluginLogId">;
    readonly pluginId: Schema.brand<Schema.NonEmptyString, "PluginId">;
    readonly actionId: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "PluginActionId">>;
    readonly event: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly command: Schema.$Array<Schema.String>;
    readonly status: Schema.Literals<readonly ["running", "succeeded", "failed"]>;
    readonly startedUnixMs: Schema.brand<Schema.Natural, "HerdrUnixMilliseconds">;
    readonly finishedUnixMs: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.Natural, "HerdrUnixMilliseconds">>;
    readonly exitCode: Schema.OptionFromOptionalNullOr<Schema.Finite>;
    readonly stdout: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly stderr: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly error: Schema.OptionFromOptionalNullOr<Schema.String>;
  }>, {
    readonly id: "log_id";
    readonly pluginId: "plugin_id";
    readonly actionId: "action_id";
    readonly startedUnixMs: "started_unix_ms";
    readonly finishedUnixMs: "finished_unix_ms";
    readonly exitCode: "exit_code";
  }>;
}>;
/**
 * Completed plugin action invocation.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginActionInvocation extends Schema.Schema.Type<typeof PluginActionInvocation> {}
/**
 * Open plugin pane and its owning entrypoint.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginPane: Schema.encodeKeys<Schema.Struct<{
  readonly pluginId: Schema.brand<Schema.NonEmptyString, "PluginId">;
  readonly entrypoint: Schema.String;
  readonly pane: Schema.encodeKeys<Schema.Struct<{
    readonly id: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly focused: Schema.Boolean;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    /** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
    readonly restoreError: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>;
    readonly stateLabels: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly tokens: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>, never>;
    readonly agentSession: Schema.OptionFromOptionalNullOr<Schema.Struct<{
      readonly source: Schema.String;
      readonly agent: Schema.String;
      readonly kind: Schema.Literals<readonly ["id", "path"]>;
      readonly value: Schema.String;
    }>>;
    readonly scroll: Schema.OptionFromOptionalNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly offsetFromBottom: Schema.Finite;
      readonly maxOffsetFromBottom: Schema.Finite;
      readonly viewportRows: Schema.Natural;
    }>, {
      readonly offsetFromBottom: "offset_from_bottom";
      readonly maxOffsetFromBottom: "max_offset_from_bottom";
      readonly viewportRows: "viewport_rows";
    }>>;
    readonly revision: Schema.brand<Schema.Natural, "HerdrRevision">;
  }>, {
    readonly id: "pane_id";
    readonly terminalId: "terminal_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly restoreError: "restore_error";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly displayAgent: "display_agent";
    readonly agentStatus: "agent_status";
    readonly stateLabels: "state_labels";
    readonly agentSession: "agent_session";
  }>;
}>, {
  readonly pluginId: "plugin_id";
}>;
/**
 * Open plugin pane and its owning entrypoint.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginPane extends Schema.Schema.Type<typeof PluginPane> {}
/**
 * Plugin link source supplied by the caller.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginSourceInput: Schema.Struct<{
  readonly kind: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["local", "github"]>>;
  readonly owner: Schema.OptionFromOptionalKey<Schema.String>;
  readonly repo: Schema.OptionFromOptionalKey<Schema.String>;
  readonly subdir: Schema.OptionFromOptionalKey<Schema.String>;
  readonly requestedRef: Schema.OptionFromOptionalKey<Schema.String>;
  readonly resolvedCommit: Schema.OptionFromOptionalKey<Schema.String>;
  readonly managedPath: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly installedUnixMs: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrUnixMilliseconds">>;
}>;
/**
 * Normalized plugin link source.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginSourceInput extends Schema.Schema.Type<typeof PluginSourceInput> {}
/**
 * Plugin link request.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginLinkInput: Schema.Struct<{
  readonly path: Schema.brand<Schema.String, "HerdrAbsolutePath">;
  readonly enabled: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly source: Schema.OptionFromOptionalKey<Schema.Struct<{
    readonly kind: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["local", "github"]>>;
    readonly owner: Schema.OptionFromOptionalKey<Schema.String>;
    readonly repo: Schema.OptionFromOptionalKey<Schema.String>;
    readonly subdir: Schema.OptionFromOptionalKey<Schema.String>;
    readonly requestedRef: Schema.OptionFromOptionalKey<Schema.String>;
    readonly resolvedCommit: Schema.OptionFromOptionalKey<Schema.String>;
    readonly managedPath: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly installedUnixMs: Schema.OptionFromOptionalKey<Schema.brand<Schema.Natural, "HerdrUnixMilliseconds">>;
  }>>;
}>;
/**
 * Normalized plugin link request.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginLinkInput extends Schema.Schema.Type<typeof PluginLinkInput> {}
/**
 * Ergonomic plugin link request.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginLinkInputEncoded extends Schema.Codec.Encoded<typeof PluginLinkInput> {}
/**
 * Optional plugin filter.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginFilterInput: Schema.Struct<{
  readonly pluginId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PluginId">>;
}>;
/**
 * Normalized plugin filter.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginFilterInput extends Schema.Schema.Type<typeof PluginFilterInput> {}
/**
 * Ergonomic plugin filter.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginFilterInputEncoded extends Schema.Codec.Encoded<typeof PluginFilterInput> {}
/**
 * Optional plugin and invocation context for an action.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginActionInvokeInput: Schema.Struct<{
  readonly pluginId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PluginId">>;
  readonly context: Schema.OptionFromOptionalKey<Schema.Struct<{
    readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
    readonly workspaceLabel: Schema.OptionFromOptionalKey<Schema.String>;
    readonly workspaceCwd: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly worktree: Schema.OptionFromOptionalKey<Schema.Struct<{
      readonly repoKey: Schema.String;
      readonly repoName: Schema.String;
      readonly repoRoot: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly checkoutPath: Schema.brand<Schema.String, "HerdrAbsolutePath">;
      readonly isLinkedWorktree: Schema.Boolean;
    }>>;
    readonly tabId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "TabId">>;
    readonly tabLabel: Schema.OptionFromOptionalKey<Schema.String>;
    readonly focusedPaneId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PaneId">>;
    readonly focusedPaneCwd: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
    readonly focusedPaneAgent: Schema.OptionFromOptionalKey<Schema.String>;
    readonly focusedPaneStatus: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>>;
    readonly selectedText: Schema.OptionFromOptionalKey<Schema.String>;
    readonly invocationSource: Schema.OptionFromOptionalKey<Schema.String>;
    readonly correlationId: Schema.OptionFromOptionalKey<Schema.String>;
    readonly clickedUrl: Schema.OptionFromOptionalKey<Schema.String>;
    readonly linkHandlerId: Schema.OptionFromOptionalKey<Schema.String>;
  }>>;
}>;
/**
 * Normalized plugin action invocation input.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginActionInvokeInput extends Schema.Schema.Type<typeof PluginActionInvokeInput> {}
/**
 * Ergonomic plugin action invocation input.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginActionInvokeInputEncoded extends Schema.Codec.Encoded<typeof PluginActionInvokeInput> {}
/**
 * Plugin command-log list filter.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginLogListInput: Schema.Struct<{
  readonly pluginId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PluginId">>;
  readonly limit: Schema.OptionFromOptionalKey<Schema.Finite>;
}>;
/**
 * Normalized plugin command-log list filter.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginLogListInput extends Schema.Schema.Type<typeof PluginLogListInput> {}
/**
 * Ergonomic plugin command-log list filter.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginLogListInputEncoded extends Schema.Codec.Encoded<typeof PluginLogListInput> {}
/**
 * Plugin pane open request.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginPaneOpenInput: Schema.Struct<{
  readonly entrypoint: Schema.String;
  readonly placement: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["overlay", "popup", "split", "tab", "zoomed"]>>;
  readonly width: Schema.OptionFromOptionalKey<Schema.Union<readonly [Schema.Finite, Schema.String]>>;
  readonly height: Schema.OptionFromOptionalKey<Schema.Union<readonly [Schema.Finite, Schema.String]>>;
  readonly workspaceId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly targetPaneId: Schema.OptionFromOptionalKey<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly direction: Schema.OptionFromOptionalKey<Schema.Literals<readonly ["right", "down"]>>;
  readonly cwd: Schema.OptionFromOptionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly focus: Schema.OptionFromOptionalKey<Schema.Boolean>;
  readonly env: Schema.OptionFromOptionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>;
/**
 * Normalized plugin pane open request.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginPaneOpenInput extends Schema.Schema.Type<typeof PluginPaneOpenInput> {}
/**
 * Ergonomic plugin pane open request.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginPaneOpenInputEncoded extends Schema.Codec.Encoded<typeof PluginPaneOpenInput> {}
/**
 * Plugin unlink outcome.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginUnlinkResult: Schema.encodeKeys<Schema.Struct<{
  readonly pluginId: Schema.brand<Schema.NonEmptyString, "PluginId">;
  readonly removed: Schema.Boolean;
}>, {
  readonly pluginId: "plugin_id";
}>;
/**
 * Plugin unlink outcome.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginUnlinkResult extends Schema.Schema.Type<typeof PluginUnlinkResult> {}
/**
 * Closed plugin pane identifier.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const PluginPaneCloseResult: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
}>, {
  readonly paneId: "pane_id";
}>;
/**
 * Closed plugin pane identifier.
 *
 * @category models
 * @since 0.8.2
 */
interface PluginPaneCloseResult extends Schema.Schema.Type<typeof PluginPaneCloseResult> {}
//#endregion
//#region src/herdr-wire-encoder.d.ts
type CamelCaseWireKey<Key extends string> = Key extends `${infer Head}_${infer Tail}` ? `${Head}${Capitalize<CamelCaseWireKey<Tail>>}` : Key;
type CamelCaseWireValue<Value> = Value extends string | number | boolean | null | undefined ? Value : Value extends readonly (infer Item)[] ? readonly CamelCaseWireValue<Item>[] : Value extends object ? { readonly [Key in keyof Value as string extends Key ? unknown extends Value[Key] ? never : Key : Key extends string ? CamelCaseWireKey<Key> : Key]: Key extends "env" | "tokens" | "state_labels" ? Value[Key] : CamelCaseWireValue<Value[Key]>; } : never;
/**
 * Camel-cased protocol parameters retain caller-owned dictionary keys and value types.
 *
 * @category models
 * @since 0.8.2
 */
type HerdrWireParameters<Method extends WireMethod> = Method extends "ping" ? {
  readonly application?: {
    readonly name: string;
    readonly version?: string;
  };
} : CamelCaseWireValue<WireMethodMap[Method]["params"]>;
//#endregion
//#region src/herdr-transport.d.ts
/**
 * Local request options applied by the transport rather than the Herdr server.
 *
 * @category schemas
 * @since 0.8.2
 */
declare const HerdrTransportRequestOptions: Schema.Struct<{
  readonly requestId: Schema.OptionFromOptionalKey<Schema.NonEmptyString>;
  readonly requestTimeout: Schema.OptionFromOptionalKey<Schema.brand<Schema.Duration, "HerdrRequestDeadline">>;
}>;
/**
 * Normalized local request options consumed by transport internals.
 *
 * @category models
 * @since 0.8.2
 */
interface HerdrTransportRequestOptions extends Schema.Schema.Type<typeof HerdrTransportRequestOptions> {}
/**
 * Ergonomic request options accepted by public SDK operations.
 *
 * @category models
 * @since 0.8.2
 */
interface HerdrTransportRequestOptionsEncoded extends Schema.Codec.Encoded<typeof HerdrTransportRequestOptions> {}
/**
 * Expected failures shared by ordinary Herdr transport requests.
 *
 * @category errors
 * @since 0.8.2
 */
type HerdrTransportRequestError = HerdrTransportError | HerdrInvalidInput | HerdrRequestTimeout | HerdrInvalidResponse | HerdrUnsupportedProtocol | HerdrUnsupportedResult | HerdrServerError;
/**
 * Expected request failures for a specific generated Herdr method.
 *
 * @category errors
 * @since 0.8.2
 */
type HerdrTransportMethodError<Method extends WireMethod> = HerdrTransportRequestError | (Method extends "events.wait" ? HerdrUnsupportedEvent : never);
type HerdrOrdinaryWireMethod = Exclude<WireMethod, "events.wait" | HerdrStreamWireMethod>;
/**
 * Wire methods whose accepted response leaves a connection open for its owning scope.
 *
 * @category models
 * @since 0.9.5
 */
type HerdrStreamWireMethod = "events.subscribe" | "server.ssh_agent.register";
/**
 * Correlated success returned after the generated method result contract is checked.
 *
 * @category models
 * @since 0.8.2
 */
interface HerdrTransportSuccess<Method extends WireMethod> {
  /** Wire request identifier echoed by the server. */
  readonly requestId: string;
  /** Generated result variant associated with the requested method. */
  readonly result: WireMethodMap[Method]["result"];
}
/**
 * Scoped stream handshake retaining the socket until the owning scope closes.
 *
 * @category models
 * @since 0.8.2
 */
interface HerdrTransportStream<Method extends HerdrStreamWireMethod> extends HerdrTransportSuccess<Method> {
  /** Pulls ordered socket bytes after the handshake; ends when the server closes the connection. */
  readonly readBytes: Stream.Stream<Uint8Array, HerdrTransportError>;
}
/**
 * Deep Unix-socket and protocol capability shared by every Herdr namespace service.
 *
 * @category services
 * @since 0.8.2
 */
interface IHerdrTransport {
  /** Sends one request after the shared protocol compatibility check. */
  readonly request: {
    <Method extends HerdrOrdinaryWireMethod>(method: Method, params: HerdrWireParameters<Method>, options?: HerdrTransportRequestOptionsEncoded): Effect.Effect<HerdrTransportSuccess<Method>, HerdrTransportRequestError>;
    (method: "events.wait", params: HerdrWireParameters<"events.wait">, options?: HerdrTransportRequestOptionsEncoded): Effect.Effect<HerdrTransportSuccess<"events.wait">, HerdrTransportRequestError | HerdrUnsupportedEvent>;
  };
  /** Acquires a long-lived subscription or connection-scoped lease socket in the current scope. */
  readonly openStream: <Method extends HerdrStreamWireMethod>(method: Method, params: HerdrWireParameters<Method>, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<HerdrTransportStream<Method>, HerdrTransportRequestError, Scope.Scope>;
}
declare const HerdrTransport_base: Context.ServiceClass<HerdrTransport, "@herdr/sdk/HerdrTransport", IHerdrTransport>;
/**
 * Yieldable Effect service owning Herdr Unix-socket and protocol operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class HerdrTransport extends HerdrTransport_base {}
/**
 * Provides the transport while retaining its Herdr configuration requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const herdrTransportLayerWithoutDependencies: Layer.Layer<HerdrTransport, never, HerdrConfig>;
/**
 * Production transport Layer using the ambient Herdr configuration Layer.
 *
 * @category layers
 * @since 0.8.2
 */
declare const herdrTransportLayer: Layer.Layer<HerdrTransport, HerdrConfigurationError, never>;
//#endregion
//#region src/command-service.d.ts
/** Optional parent assertion for a tab-scoped command. @category schemas @since 0.9.0 */
declare const CommandTabInput: Schema.Struct<{
  readonly expectedWorkspaceId: Schema.optionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
}>;
/** Parsed tab-scoped command input. @category models @since 0.9.0 */
interface CommandTabInput extends Schema.Schema.Type<typeof CommandTabInput> {}
/** Caller-supplied tab parent assertion. @category inputs @since 0.9.0 */
type CommandTabInputEncoded = typeof CommandTabInput.Encoded;
/** Pane command selection always belongs to the positional pane target. @category schemas @since 0.9.0 */
declare const CommandPaneInput: Schema.Struct<{
  readonly expectedWorkspaceId: Schema.optionalKey<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly expectedTabId: Schema.optionalKey<Schema.brand<Schema.NonEmptyString, "TabId">>;
  readonly selection: Schema.optionalKey<Schema.Struct<{
    readonly anchor: Schema.Struct<{
      readonly row: Schema.Natural;
      readonly col: Schema.Natural;
    }>;
    readonly cursor: Schema.Struct<{
      readonly row: Schema.Natural;
      readonly col: Schema.Natural;
    }>;
    readonly contentRevision: Schema.optionalKey<Schema.brand<Schema.Natural, "PaneContentRevision">>;
  }>>;
}>;
/** Parsed pane-scoped command input. @category models @since 0.9.0 */
interface CommandPaneInput extends Schema.Schema.Type<typeof CommandPaneInput> {}
/** Caller-supplied pane command selection and parent assertions. @category inputs @since 0.9.0 */
type CommandPaneInputEncoded = typeof CommandPaneInput.Encoded;
/** Custom command execution by opaque ID, never arbitrary shell text. @category services @since 0.9.0 */
interface ICommandService {
  /** Invokes a command in current server context. */
  readonly invoke: (commandId: HerdrCommandId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Invokes a command in an explicit workspace. */
  readonly invokeInWorkspace: (commandId: HerdrCommandId, workspaceId: WorkspaceId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Invokes a command in a tab with an optional workspace assertion. */
  readonly invokeInTab: (commandId: HerdrCommandId, tabId: TabId, input?: CommandTabInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Invokes a command in a pane; selection text is resolved on the server. */
  readonly invokeInPane: (commandId: HerdrCommandId, paneId: PaneId, input?: CommandPaneInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
}
declare const CommandService_base: Context.ServiceClass<CommandService, "@herdr/sdk/CommandService", ICommandService>;
/** Yieldable custom-command capability. @category services @since 0.9.0 */
declare class CommandService extends CommandService_base {}
/** Constructs commands using the shared socket transport. @category constructors @since 0.9.0 */
declare const makeCommandService: Effect.Effect<ICommandService, never, HerdrTransport>;
/** Provides commands while preserving the transport requirement. @category layers @since 0.9.0 */
declare const commandServiceLayerWithoutDependencies: Layer.Layer<CommandService, never, HerdrTransport>;
/** Production custom-command service Layer. @category layers @since 0.9.0 */
declare const commandServiceLayer: Layer.Layer<CommandService, HerdrConfigurationError, never>;
//#endregion
//#region src/product-announcement-service.d.ts
/** Opaque announcement identity within a version. @category schemas @since 0.9.0 */
declare const ProductAnnouncementId: Schema.brand<Schema.NonEmptyString, "ProductAnnouncementId">;
/** Parsed product announcement identifier. @category models @since 0.9.0 */
type ProductAnnouncementId = typeof ProductAnnouncementId.Type;
/** Exact current announcement identity; version is not assumed to be semver. @category schemas @since 0.9.0 */
declare const ProductAnnouncementDismissInput: Schema.Struct<{
  readonly version: Schema.String;
  readonly id: Schema.brand<Schema.NonEmptyString, "ProductAnnouncementId">;
}>;
/** Parsed announcement dismissal. @category models @since 0.9.0 */
interface ProductAnnouncementDismissInput extends Schema.Schema.Type<typeof ProductAnnouncementDismissInput> {}
/** Caller-supplied announcement identity. @category inputs @since 0.9.0 */
type ProductAnnouncementDismissInputEncoded = typeof ProductAnnouncementDismissInput.Encoded;
/** Endpoint product announcement lifecycle. @category services @since 0.9.0 */
interface IProductAnnouncementService {
  /** Dismisses an exact identity; stale_announcement is never retried. */
  readonly dismiss: (input: ProductAnnouncementDismissInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
}
declare const ProductAnnouncementService_base: Context.ServiceClass<ProductAnnouncementService, "@herdr/sdk/ProductAnnouncementService", IProductAnnouncementService>;
/** Yieldable product announcement capability. @category services @since 0.9.0 */
declare class ProductAnnouncementService extends ProductAnnouncementService_base {}
/** Constructs announcement dismissal on the shared transport. @category constructors @since 0.9.0 */
declare const makeProductAnnouncementService: Effect.Effect<IProductAnnouncementService, never, HerdrTransport>;
/** Provides announcement operations with visible transport requirements. @category layers @since 0.9.0 */
declare const productAnnouncementServiceLayerWithoutDependencies: Layer.Layer<ProductAnnouncementService, never, HerdrTransport>;
/** Production announcement-service Layer. @category layers @since 0.9.0 */
declare const productAnnouncementServiceLayer: Layer.Layer<ProductAnnouncementService, HerdrConfigurationError, never>;
//#endregion
//#region src/release-notes-service.d.ts
/** Identifies the currently displayed release notes. @category schemas @since 0.9.0 */
declare const ReleaseNotesDismissInput: Schema.Struct<{
  readonly version: Schema.String;
}>;
/** Parsed release-note dismissal. @category models @since 0.9.0 */
interface ReleaseNotesDismissInput extends Schema.Schema.Type<typeof ReleaseNotesDismissInput> {}
/** Caller-supplied release-note version identity. @category inputs @since 0.9.0 */
type ReleaseNotesDismissInputEncoded = typeof ReleaseNotesDismissInput.Encoded;
/** Endpoint release-note acknowledgement capability. @category services @since 0.9.0 */
interface IReleaseNotesService {
  /** Marks exact current release notes seen; stale_release_notes is not retried. */
  readonly dismiss: (input: ReleaseNotesDismissInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
}
declare const ReleaseNotesService_base: Context.ServiceClass<ReleaseNotesService, "@herdr/sdk/ReleaseNotesService", IReleaseNotesService>;
/** Yieldable release-note capability. @category services @since 0.9.0 */
declare class ReleaseNotesService extends ReleaseNotesService_base {}
/** Constructs release-note dismissal using the shared transport. @category constructors @since 0.9.0 */
declare const makeReleaseNotesService: Effect.Effect<IReleaseNotesService, never, HerdrTransport>;
/** Provides release notes with a visible transport requirement. @category layers @since 0.9.0 */
declare const releaseNotesServiceLayerWithoutDependencies: Layer.Layer<ReleaseNotesService, never, HerdrTransport>;
/** Production release-notes Layer. @category layers @since 0.9.0 */
declare const releaseNotesServiceLayer: Layer.Layer<ReleaseNotesService, HerdrConfigurationError, never>;
//#endregion
//#region src/herdr-client-shell-models.d.ts
/** Identifies one endpoint process boot; changes on server restart. @category schemas @since 0.9.0 */
declare const EndpointBootId: Schema.brand<Schema.NonEmptyString, "EndpointBootId">;
/** Parsed endpoint boot identity. @category models @since 0.9.0 */
type EndpointBootId = typeof EndpointBootId.Type;
/** Replacement projection revision within one boot. @category schemas @since 0.9.0 */
declare const ProjectionRevision: Schema.brand<Schema.Natural, "ProjectionRevision">;
/** Parsed projection revision. @category models @since 0.9.0 */
type ProjectionRevision = typeof ProjectionRevision.Type;
/** Complete or incremental surface revision within one connection. @category schemas @since 0.9.0 */
declare const SurfaceRevision: Schema.brand<Schema.Natural, "SurfaceRevision">;
/** Parsed surface revision. @category models @since 0.9.0 */
type SurfaceRevision = typeof SurfaceRevision.Type;
/** Endpoint-owned linked-worktree display metadata. @category schemas @since 0.9.0 */
declare const ClientShellWorktree: Schema.encodeKeys<Schema.Struct<{
  readonly key: Schema.String;
  readonly label: Schema.String;
  readonly isLinkedWorktree: Schema.Boolean;
}>, {
  readonly isLinkedWorktree: "is_linked_worktree";
}>;
/** Parsed shell worktree metadata. @category models @since 0.9.0 */
type ClientShellWorktree = typeof ClientShellWorktree.Type;
/** Client-shell workspace projection, not an ordinary socket Workspace. @category schemas @since 0.9.0 */
declare const ClientShellWorkspace: Schema.encodeKeys<Schema.Struct<{
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly newWorkspaceCwd: Schema.String;
  readonly number: Schema.Natural;
  readonly label: Schema.String;
  readonly customLabel: Schema.Boolean;
  readonly branch: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly gitAheadBehind: Schema.OptionFromNullOr<Schema.Tuple<readonly [Schema.Natural, Schema.Natural]>>;
  readonly tokens: Schema.$Array<Schema.Tuple<readonly [Schema.String, Schema.String]>>;
  readonly worktree: Schema.OptionFromNullOr<Schema.encodeKeys<Schema.Struct<{
    readonly key: Schema.String;
    readonly label: Schema.String;
    readonly isLinkedWorktree: Schema.Boolean;
  }>, {
    readonly isLinkedWorktree: "is_linked_worktree";
  }>>;
  readonly focused: Schema.Boolean;
  readonly agentStatus: Schema.Union<readonly [Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
}>, {
  readonly workspaceId: "workspace_id";
  readonly activeTabId: "active_tab_id";
  readonly newWorkspaceCwd: "new_workspace_cwd";
  readonly customLabel: "custom_label";
  readonly gitAheadBehind: "git_ahead_behind";
  readonly agentStatus: "agent_status";
}>;
/** Parsed shell workspace projection. @category models @since 0.9.0 */
type ClientShellWorkspace = typeof ClientShellWorkspace.Type;
/** Tab metadata in a client-shell projection. @category schemas @since 0.9.0 */
declare const ClientShellTab: Schema.encodeKeys<Schema.Struct<{
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly number: Schema.Natural;
  readonly label: Schema.String;
  readonly customLabel: Schema.Boolean;
  readonly zoomed: Schema.Boolean;
  readonly focused: Schema.Boolean;
  readonly agentStatus: Schema.Union<readonly [Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
}>, {
  readonly tabId: "tab_id";
  readonly workspaceId: "workspace_id";
  readonly customLabel: "custom_label";
  readonly agentStatus: "agent_status";
}>;
/** Parsed shell tab projection. @category models @since 0.9.0 */
type ClientShellTab = typeof ClientShellTab.Type;
/** Pane metadata in a client-shell projection. @category schemas @since 0.9.0 */
declare const ClientShellPane: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly cwd: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly focused: Schema.Boolean;
  readonly rightClickPassthrough: Schema.Boolean;
}>, {
  readonly paneId: "pane_id";
  readonly workspaceId: "workspace_id";
  readonly tabId: "tab_id";
  readonly foregroundCwd: "foreground_cwd";
  readonly rightClickPassthrough: "right_click_passthrough";
}>;
/** Parsed shell pane projection. @category models @since 0.9.0 */
type ClientShellPane = typeof ClientShellPane.Type;
/** Agent display state; each client owns its viewed-completion presentation. @category schemas @since 0.9.0 */
declare const ClientShellAgent: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
  readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
  readonly name: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "AgentName">>;
  readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly agentStatus: Schema.Union<readonly [Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
  readonly stateChangeSeq: Schema.Natural;
  /**
   * Set when the current idle transition completed work (equal to that transition's
   * `stateChangeSeq`), from the endpoint's revision-bound completion companion.
   */
  readonly completionSeq: Schema.OptionFromOptionalKey<Schema.Natural>;
  readonly stateLabels: Schema.$Array<Schema.Tuple<readonly [Schema.String, Schema.String]>>;
  readonly tokens: Schema.$Array<Schema.Tuple<readonly [Schema.String, Schema.String]>>;
  readonly focused: Schema.Boolean;
}>, {
  readonly paneId: "pane_id";
  readonly workspaceId: "workspace_id";
  readonly tabId: "tab_id";
  readonly displayAgent: "display_agent";
  readonly terminalTitle: "terminal_title";
  readonly terminalTitleStripped: "terminal_title_stripped";
  readonly agentStatus: "agent_status";
  readonly stateChangeSeq: "state_change_seq";
  readonly completionSeq: "completion_seq";
  readonly stateLabels: "state_labels";
}>;
/** Parsed shell agent projection. @category models @since 0.9.0 */
type ClientShellAgent = typeof ClientShellAgent.Type;
/** Extensible endpoint command action; unfamiliar actions remain unknown. @category schemas @since 0.9.0 */
declare const ClientShellCommandAction: Schema.Union<readonly [Schema.decodeTo<Schema.Literal<"shell">, Schema.Literal<"Shell">, never, never>, Schema.decodeTo<Schema.Literal<"pane">, Schema.Literal<"Pane">, never, never>, Schema.decodeTo<Schema.Literal<"popup">, Schema.Literal<"Popup">, never, never>, Schema.decodeTo<Schema.Literal<"pluginAction">, Schema.Literal<"PluginAction">, never, never>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
/** Parsed endpoint command action. @category models @since 0.9.0 */
type ClientShellCommandAction = typeof ClientShellCommandAction.Type;
/** Opaque command identity and display labels; never executable command text. @category schemas @since 0.9.0 */
declare const ClientShellCommand: Schema.encodeKeys<Schema.Struct<{
  readonly commandId: Schema.brand<Schema.NonEmptyString, "HerdrCommandId">;
  readonly bindingLabel: Schema.String;
  readonly bindingLabels: Schema.$Array<Schema.String>;
  readonly action: Schema.Union<readonly [Schema.decodeTo<Schema.Literal<"shell">, Schema.Literal<"Shell">, never, never>, Schema.decodeTo<Schema.Literal<"pane">, Schema.Literal<"Pane">, never, never>, Schema.decodeTo<Schema.Literal<"popup">, Schema.Literal<"Popup">, never, never>, Schema.decodeTo<Schema.Literal<"pluginAction">, Schema.Literal<"PluginAction">, never, never>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
  readonly description: Schema.OptionFromOptionalNullOr<Schema.String>;
}>, {
  readonly commandId: "command_id";
  readonly bindingLabel: "binding_label";
  readonly bindingLabels: "binding_labels";
}>;
/** Parsed discovered command. @category models @since 0.9.0 */
type ClientShellCommand = typeof ClientShellCommand.Type;
/** Current endpoint-owned product announcement. @category schemas @since 0.9.0 */
declare const ClientShellProductAnnouncement: Schema.Struct<{
  readonly version: Schema.String;
  readonly id: Schema.NonEmptyString;
  readonly title: Schema.String;
  readonly body: Schema.String;
  readonly preview: Schema.Boolean;
}>;
/** Parsed current announcement. @category models @since 0.9.0 */
type ClientShellProductAnnouncement = typeof ClientShellProductAnnouncement.Type;
/** Current endpoint-owned release notes. @category schemas @since 0.9.0 */
declare const ClientShellReleaseNotes: Schema.Struct<{
  readonly version: Schema.String;
  readonly body: Schema.String;
  readonly preview: Schema.Boolean;
}>;
/** Parsed endpoint release notes. @category models @since 0.9.0 */
type ClientShellReleaseNotes = typeof ClientShellReleaseNotes.Type;
/** Completed-work sequences by pane, bound to the projection with the same boot and revision. @category schemas @since 0.9.5 */
declare const ClientShellAgentCompletions: Schema.encodeKeys<Schema.Struct<{
  readonly bootId: Schema.brand<Schema.NonEmptyString, "EndpointBootId">;
  readonly revision: Schema.brand<Schema.Natural, "ProjectionRevision">;
  readonly completions: Schema.$Record<Schema.String, Schema.Natural>;
}>, {
  readonly bootId: "boot_id";
}>;
/** Parsed agent-completion companion. @category models @since 0.9.5 */
type ClientShellAgentCompletions = typeof ClientShellAgentCompletions.Type;
/**
 * Agent-view companion envelope (`endpoint.agent-view.v1`) bound to the projection with the same
 * boot and revision. The view stays opaque JSON here; missing or null means the view was cleared.
 * @category schemas @since 0.9.5
 */
declare const ClientShellAgentViewProjection: Schema.encodeKeys<Schema.Struct<{
  readonly bootId: Schema.brand<Schema.NonEmptyString, "EndpointBootId">;
  readonly revision: Schema.brand<Schema.Natural, "ProjectionRevision">;
  readonly view: Schema.OptionFromOptionalNullOr<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
}>, {
  readonly bootId: "boot_id";
}>;
/** Parsed agent-view companion envelope. @category models @since 0.9.5 */
type ClientShellAgentViewProjection = typeof ClientShellAgentViewProjection.Type;
/**
 * Active agent view (filter and sort definition) for one projection: `none` when no view is set,
 * `active` with the decoded definition, or `unrecognized` when the server sent a view this SDK
 * cannot decode (for example a newer view-language addition).
 * @category schemas @since 0.9.5
 */
declare const ClientShellAgentView: Schema.Codec<ClientShellAgentView, ClientShellAgentViewEncoded>;
/** Parsed projection agent view. @category models @since 0.9.5 */
type ClientShellAgentView = {
  readonly status: "none";
} | {
  readonly status: "active";
  readonly view: AgentViewSetInput;
} | {
  readonly status: "unrecognized";
};
/** Encoded projection agent view; the active view uses Herdr's wire agent-view keys. @category models @since 0.9.5 */
type ClientShellAgentViewEncoded = {
  readonly status: "none";
} | {
  readonly status: "active";
  readonly view: AgentViewSetInputEncoded;
} | {
  readonly status: "unrecognized";
};
/**
 * Whole replacement projection for one endpoint boot. Decoding a `shell.snapshot.v1` payload yields
 * `agentView: { status: "none" }`; the endpoint service attaches the snapshot's revision-bound
 * `endpoint.agent-view.v1` companion. `agentView` is SDK-derived: it is never read from or written
 * to the snapshot wire payload.
 * @category schemas @since 0.9.0
 */
declare const ClientShellProjection: Schema.decodeTo<Schema.toType<Schema.Struct<{
  readonly bootId: Schema.brand<Schema.NonEmptyString, "EndpointBootId">;
  readonly revision: Schema.brand<Schema.Natural, "ProjectionRevision">;
  readonly configDiagnostic: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly productAnnouncement: Schema.OptionFromNullOr<Schema.Struct<{
    readonly version: Schema.String;
    readonly id: Schema.NonEmptyString;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly preview: Schema.Boolean;
  }>>;
  readonly updateAvailable: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly updateInstallCommand: Schema.String;
  readonly serverKeybindingsToml: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly latestReleaseNotesAvailable: Schema.Boolean;
  readonly integrationUpdatesAvailable: Schema.Boolean;
  readonly worktreeDirectory: Schema.String;
  readonly releaseNotes: Schema.OptionFromNullOr<Schema.Struct<{
    readonly version: Schema.String;
    readonly body: Schema.String;
    readonly preview: Schema.Boolean;
  }>>;
  readonly focusedWorkspaceId: Schema.OptionFromNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly focusedTabId: Schema.OptionFromNullOr<Schema.brand<Schema.NonEmptyString, "TabId">>;
  readonly focusedPaneId: Schema.OptionFromNullOr<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly tabBarRight: Schema.$Array<Schema.Struct<{
    readonly text: Schema.String;
    readonly accent: Schema.Boolean;
  }>>;
  readonly tabBarRightSeparator: Schema.String;
  readonly agentViewLabel: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly agentOrder: Schema.$Array<Schema.String>;
  readonly workspaces: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly newWorkspaceCwd: Schema.String;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly customLabel: Schema.Boolean;
    readonly branch: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly gitAheadBehind: Schema.OptionFromNullOr<Schema.Tuple<readonly [Schema.Natural, Schema.Natural]>>;
    readonly tokens: Schema.$Array<Schema.Tuple<readonly [Schema.String, Schema.String]>>;
    readonly worktree: Schema.OptionFromNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly key: Schema.String;
      readonly label: Schema.String;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
    readonly focused: Schema.Boolean;
    readonly agentStatus: Schema.Union<readonly [Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly activeTabId: "active_tab_id";
    readonly newWorkspaceCwd: "new_workspace_cwd";
    readonly customLabel: "custom_label";
    readonly gitAheadBehind: "git_ahead_behind";
    readonly agentStatus: "agent_status";
  }>>;
  readonly tabs: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly customLabel: Schema.Boolean;
    readonly zoomed: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly agentStatus: Schema.Union<readonly [Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
  }>, {
    readonly tabId: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly customLabel: "custom_label";
    readonly agentStatus: "agent_status";
  }>>;
  readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly focused: Schema.Boolean;
    readonly rightClickPassthrough: Schema.Boolean;
  }>, {
    readonly paneId: "pane_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly rightClickPassthrough: "right_click_passthrough";
  }>>;
  readonly agents: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly name: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "AgentName">>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Union<readonly [Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
    readonly stateChangeSeq: Schema.Natural;
    /**
     * Set when the current idle transition completed work (equal to that transition's
     * `stateChangeSeq`), from the endpoint's revision-bound completion companion.
     */
    readonly completionSeq: Schema.OptionFromOptionalKey<Schema.Natural>;
    readonly stateLabels: Schema.$Array<Schema.Tuple<readonly [Schema.String, Schema.String]>>;
    readonly tokens: Schema.$Array<Schema.Tuple<readonly [Schema.String, Schema.String]>>;
    readonly focused: Schema.Boolean;
  }>, {
    readonly paneId: "pane_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly displayAgent: "display_agent";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly agentStatus: "agent_status";
    readonly stateChangeSeq: "state_change_seq";
    readonly completionSeq: "completion_seq";
    readonly stateLabels: "state_labels";
  }>>;
  readonly commands: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly commandId: Schema.brand<Schema.NonEmptyString, "HerdrCommandId">;
    readonly bindingLabel: Schema.String;
    readonly bindingLabels: Schema.$Array<Schema.String>;
    readonly action: Schema.Union<readonly [Schema.decodeTo<Schema.Literal<"shell">, Schema.Literal<"Shell">, never, never>, Schema.decodeTo<Schema.Literal<"pane">, Schema.Literal<"Pane">, never, never>, Schema.decodeTo<Schema.Literal<"popup">, Schema.Literal<"Popup">, never, never>, Schema.decodeTo<Schema.Literal<"pluginAction">, Schema.Literal<"PluginAction">, never, never>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
    readonly description: Schema.OptionFromOptionalNullOr<Schema.String>;
  }>, {
    readonly commandId: "command_id";
    readonly bindingLabel: "binding_label";
    readonly bindingLabels: "binding_labels";
  }>>;
  readonly agentView: Schema.Codec<ClientShellAgentView, ClientShellAgentViewEncoded, never, never>;
}>>, Schema.encodeKeys<Schema.Struct<{
  readonly bootId: Schema.brand<Schema.NonEmptyString, "EndpointBootId">;
  readonly revision: Schema.brand<Schema.Natural, "ProjectionRevision">;
  readonly configDiagnostic: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly productAnnouncement: Schema.OptionFromNullOr<Schema.Struct<{
    readonly version: Schema.String;
    readonly id: Schema.NonEmptyString;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly preview: Schema.Boolean;
  }>>;
  readonly updateAvailable: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly updateInstallCommand: Schema.String;
  readonly serverKeybindingsToml: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly latestReleaseNotesAvailable: Schema.Boolean;
  readonly integrationUpdatesAvailable: Schema.Boolean;
  readonly worktreeDirectory: Schema.String;
  readonly releaseNotes: Schema.OptionFromNullOr<Schema.Struct<{
    readonly version: Schema.String;
    readonly body: Schema.String;
    readonly preview: Schema.Boolean;
  }>>;
  readonly focusedWorkspaceId: Schema.OptionFromNullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
  readonly focusedTabId: Schema.OptionFromNullOr<Schema.brand<Schema.NonEmptyString, "TabId">>;
  readonly focusedPaneId: Schema.OptionFromNullOr<Schema.brand<Schema.NonEmptyString, "PaneId">>;
  readonly tabBarRight: Schema.$Array<Schema.Struct<{
    readonly text: Schema.String;
    readonly accent: Schema.Boolean;
  }>>;
  readonly tabBarRightSeparator: Schema.String;
  readonly agentViewLabel: Schema.OptionFromOptionalNullOr<Schema.String>;
  readonly agentOrder: Schema.$Array<Schema.String>;
  readonly workspaces: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly activeTabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly newWorkspaceCwd: Schema.String;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly customLabel: Schema.Boolean;
    readonly branch: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly gitAheadBehind: Schema.OptionFromNullOr<Schema.Tuple<readonly [Schema.Natural, Schema.Natural]>>;
    readonly tokens: Schema.$Array<Schema.Tuple<readonly [Schema.String, Schema.String]>>;
    readonly worktree: Schema.OptionFromNullOr<Schema.encodeKeys<Schema.Struct<{
      readonly key: Schema.String;
      readonly label: Schema.String;
      readonly isLinkedWorktree: Schema.Boolean;
    }>, {
      readonly isLinkedWorktree: "is_linked_worktree";
    }>>;
    readonly focused: Schema.Boolean;
    readonly agentStatus: Schema.Union<readonly [Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
  }>, {
    readonly workspaceId: "workspace_id";
    readonly activeTabId: "active_tab_id";
    readonly newWorkspaceCwd: "new_workspace_cwd";
    readonly customLabel: "custom_label";
    readonly gitAheadBehind: "git_ahead_behind";
    readonly agentStatus: "agent_status";
  }>>;
  readonly tabs: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly number: Schema.Natural;
    readonly label: Schema.String;
    readonly customLabel: Schema.Boolean;
    readonly zoomed: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly agentStatus: Schema.Union<readonly [Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
  }>, {
    readonly tabId: "tab_id";
    readonly workspaceId: "workspace_id";
    readonly customLabel: "custom_label";
    readonly agentStatus: "agent_status";
  }>>;
  readonly panes: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly label: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly cwd: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly foregroundCwd: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly focused: Schema.Boolean;
    readonly rightClickPassthrough: Schema.Boolean;
  }>, {
    readonly paneId: "pane_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly foregroundCwd: "foreground_cwd";
    readonly rightClickPassthrough: "right_click_passthrough";
  }>>;
  readonly agents: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly workspaceId: Schema.brand<Schema.NonEmptyString, "WorkspaceId">;
    readonly tabId: Schema.brand<Schema.NonEmptyString, "TabId">;
    readonly name: Schema.OptionFromOptionalNullOr<Schema.brand<Schema.NonEmptyString, "AgentName">>;
    readonly displayAgent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agent: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly title: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitle: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly terminalTitleStripped: Schema.OptionFromOptionalNullOr<Schema.String>;
    readonly agentStatus: Schema.Union<readonly [Schema.Literals<readonly ["idle", "working", "blocked", "done", "unknown"]>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
    readonly stateChangeSeq: Schema.Natural;
    /**
     * Set when the current idle transition completed work (equal to that transition's
     * `stateChangeSeq`), from the endpoint's revision-bound completion companion.
     */
    readonly completionSeq: Schema.OptionFromOptionalKey<Schema.Natural>;
    readonly stateLabels: Schema.$Array<Schema.Tuple<readonly [Schema.String, Schema.String]>>;
    readonly tokens: Schema.$Array<Schema.Tuple<readonly [Schema.String, Schema.String]>>;
    readonly focused: Schema.Boolean;
  }>, {
    readonly paneId: "pane_id";
    readonly workspaceId: "workspace_id";
    readonly tabId: "tab_id";
    readonly displayAgent: "display_agent";
    readonly terminalTitle: "terminal_title";
    readonly terminalTitleStripped: "terminal_title_stripped";
    readonly agentStatus: "agent_status";
    readonly stateChangeSeq: "state_change_seq";
    readonly completionSeq: "completion_seq";
    readonly stateLabels: "state_labels";
  }>>;
  readonly commands: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly commandId: Schema.brand<Schema.NonEmptyString, "HerdrCommandId">;
    readonly bindingLabel: Schema.String;
    readonly bindingLabels: Schema.$Array<Schema.String>;
    readonly action: Schema.Union<readonly [Schema.decodeTo<Schema.Literal<"shell">, Schema.Literal<"Shell">, never, never>, Schema.decodeTo<Schema.Literal<"pane">, Schema.Literal<"Pane">, never, never>, Schema.decodeTo<Schema.Literal<"popup">, Schema.Literal<"Popup">, never, never>, Schema.decodeTo<Schema.Literal<"pluginAction">, Schema.Literal<"PluginAction">, never, never>, Schema.decodeTo<Schema.Literal<"unknown">, Schema.String, never, never>]>;
    readonly description: Schema.OptionFromOptionalNullOr<Schema.String>;
  }>, {
    readonly commandId: "command_id";
    readonly bindingLabel: "binding_label";
    readonly bindingLabels: "binding_labels";
  }>>;
}>, {
  readonly bootId: "boot_id";
  readonly configDiagnostic: "config_diagnostic";
  readonly productAnnouncement: "product_announcement";
  readonly updateAvailable: "update_available";
  readonly updateInstallCommand: "update_install_command";
  readonly serverKeybindingsToml: "server_keybindings_toml";
  readonly latestReleaseNotesAvailable: "latest_release_notes_available";
  readonly integrationUpdatesAvailable: "integration_updates_available";
  readonly worktreeDirectory: "worktree_directory";
  readonly releaseNotes: "release_notes";
  readonly focusedWorkspaceId: "focused_workspace_id";
  readonly focusedTabId: "focused_tab_id";
  readonly focusedPaneId: "focused_pane_id";
  readonly tabBarRight: "tab_bar_right";
  readonly tabBarRightSeparator: "tab_bar_right_separator";
  readonly agentViewLabel: "agent_view_label";
  readonly agentOrder: "agent_order";
}>, never, never>;
/** Parsed immutable shell projection; commands remain meaningful only for its live boot. @category models @since 0.9.0 */
type ClientShellProjection = typeof ClientShellProjection.Type;
/** Surface-relative rectangle measured in terminal cells. @category schemas @since 0.9.0 */
declare const SurfaceRect: Schema.Struct<{
  readonly x: Schema.Natural;
  readonly y: Schema.Natural;
  readonly width: Schema.Natural;
  readonly height: Schema.Natural;
}>;
/** Parsed cell rectangle. @category models @since 0.9.0 */
type SurfaceRect = typeof SurfaceRect.Type;
/** One terminal cell with packed colors and an optional hyperlink index. @category schemas @since 0.9.0 */
declare const ClientShellCell: Schema.Struct<{
  readonly symbol: Schema.String;
  readonly fg: Schema.Natural;
  readonly bg: Schema.Natural;
  readonly modifier: Schema.Natural;
  readonly skip: Schema.Boolean;
  readonly hyperlink: Schema.OptionFromNullOr<Schema.Natural>;
}>;
/** Parsed terminal cell. @category models @since 0.9.0 */
type ClientShellCell = typeof ClientShellCell.Type;
/** Surface-relative cursor; shape is a DECSCUSR parameter. @category schemas @since 0.9.0 */
declare const ClientShellCursor: Schema.Struct<{
  readonly x: Schema.Natural;
  readonly y: Schema.Natural;
  readonly visible: Schema.Boolean;
  readonly shape: Schema.Natural;
}>;
/** Parsed terminal cursor. @category models @since 0.9.0 */
type ClientShellCursor = typeof ClientShellCursor.Type;
/** Full row-major terminal frame, never applied to the host terminal automatically. @category schemas @since 0.9.0 */
declare const ClientShellFrame: Schema.Struct<{
  readonly cells: Schema.$Array<Schema.Struct<{
    readonly symbol: Schema.String;
    readonly fg: Schema.Natural;
    readonly bg: Schema.Natural;
    readonly modifier: Schema.Natural;
    readonly skip: Schema.Boolean;
    readonly hyperlink: Schema.OptionFromNullOr<Schema.Natural>;
  }>>;
  readonly width: Schema.Natural;
  readonly height: Schema.Natural;
  readonly cursor: Schema.OptionFromNullOr<Schema.Struct<{
    readonly x: Schema.Natural;
    readonly y: Schema.Natural;
    readonly visible: Schema.Boolean;
    readonly shape: Schema.Natural;
  }>>;
  readonly hyperlinks: Schema.$Array<Schema.String>;
  readonly graphics: Schema.Uint8Array;
}>;
/** Parsed complete terminal frame. @category models @since 0.9.0 */
type ClientShellFrame = typeof ClientShellFrame.Type;
/** Pane geometry and revision in one active surface. @category schemas @since 0.9.0 */
declare const ClientShellSurfacePane: Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly contentRevision: Schema.brand<Schema.Natural, "PaneContentRevision">;
  readonly rect: Schema.Struct<{
    readonly x: Schema.Natural;
    readonly y: Schema.Natural;
    readonly width: Schema.Natural;
    readonly height: Schema.Natural;
  }>;
  readonly innerRect: Schema.Struct<{
    readonly x: Schema.Natural;
    readonly y: Schema.Natural;
    readonly width: Schema.Natural;
    readonly height: Schema.Natural;
  }>;
  readonly scrollbarRect: Schema.OptionFromNullOr<Schema.Struct<{
    readonly x: Schema.Natural;
    readonly y: Schema.Natural;
    readonly width: Schema.Natural;
    readonly height: Schema.Natural;
  }>>;
  readonly scroll: Schema.OptionFromNullOr<Schema.Struct<{
    readonly offsetFromBottom: Schema.Natural;
    readonly maxOffsetFromBottom: Schema.Natural;
    readonly viewportRows: Schema.Natural;
  }>>;
  readonly focused: Schema.Boolean;
  readonly mouseReporting: Schema.Boolean;
  readonly sgrPixelMouse: Schema.Boolean;
  readonly alternateScreenActive: Schema.Boolean;
  readonly pixelWidth: Schema.Natural;
  readonly pixelHeight: Schema.Natural;
}>;
/** Parsed pane surface metadata. @category models @since 0.9.0 */
type ClientShellSurfacePane = typeof ClientShellSurfacePane.Type;
/** Surface BSP split handle. @category schemas @since 0.9.0 */
declare const ClientShellSurfaceSplit: Schema.Struct<{
  readonly direction: Schema.Literals<readonly ["horizontal", "vertical"]>;
  readonly pos: Schema.Natural;
  readonly area: Schema.Struct<{
    readonly x: Schema.Natural;
    readonly y: Schema.Natural;
    readonly width: Schema.Natural;
    readonly height: Schema.Natural;
  }>;
  readonly hitRect: Schema.Struct<{
    readonly x: Schema.Natural;
    readonly y: Schema.Natural;
    readonly width: Schema.Natural;
    readonly height: Schema.Natural;
  }>;
  readonly path: Schema.$Array<Schema.Boolean>;
}>;
/** Parsed surface split handle. @category models @since 0.9.0 */
type ClientShellSurfaceSplit = typeof ClientShellSurfaceSplit.Type;
/** Graphics identity preserves the full 64-bit fingerprint as bigint. @category schemas @since 0.9.0 */
declare const ClientShellGraphicsAssetKey: Schema.Struct<{
  readonly source: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"terminal">;
    readonly target: Schema.Union<readonly [Schema.Struct<{
      readonly kind: Schema.Literal<"pane">;
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    }>, Schema.Struct<{
      readonly kind: Schema.Literal<"popup">;
      readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    }>]>;
    readonly imageId: Schema.Natural;
  }>, Schema.Struct<{
    readonly kind: Schema.Literal<"paneLayer">;
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly layerId: Schema.String;
  }>]>;
  readonly imageWidth: Schema.Natural;
  readonly imageHeight: Schema.Natural;
  readonly format: Schema.Literals<readonly ["rgb", "rgba", "png"]>;
  readonly dataLength: Schema.Natural;
  readonly dataFingerprint: Schema.BigInt;
}>;
/** Parsed graphics asset identity. @category models @since 0.9.0 */
type ClientShellGraphicsAssetKey = typeof ClientShellGraphicsAssetKey.Type;
/** Complete desired graphics scene with newly delivered bytes. @category schemas @since 0.9.0 */
declare const ClientShellGraphicsScene: Schema.Struct<{
  readonly assets: Schema.$Array<Schema.Struct<{
    readonly key: Schema.Struct<{
      readonly source: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"terminal">;
        readonly target: Schema.Union<readonly [Schema.Struct<{
          readonly kind: Schema.Literal<"pane">;
          readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
        }>, Schema.Struct<{
          readonly kind: Schema.Literal<"popup">;
          readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
        }>]>;
        readonly imageId: Schema.Natural;
      }>, Schema.Struct<{
        readonly kind: Schema.Literal<"paneLayer">;
        readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
        readonly layerId: Schema.String;
      }>]>;
      readonly imageWidth: Schema.Natural;
      readonly imageHeight: Schema.Natural;
      readonly format: Schema.Literals<readonly ["rgb", "rgba", "png"]>;
      readonly dataLength: Schema.Natural;
      readonly dataFingerprint: Schema.BigInt;
    }>;
    readonly data: Schema.Uint8Array;
  }>>;
  readonly placements: Schema.$Array<Schema.Struct<{
    readonly asset: Schema.Struct<{
      readonly source: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"terminal">;
        readonly target: Schema.Union<readonly [Schema.Struct<{
          readonly kind: Schema.Literal<"pane">;
          readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
        }>, Schema.Struct<{
          readonly kind: Schema.Literal<"popup">;
          readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
        }>]>;
        readonly imageId: Schema.Natural;
      }>, Schema.Struct<{
        readonly kind: Schema.Literal<"paneLayer">;
        readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
        readonly layerId: Schema.String;
      }>]>;
      readonly imageWidth: Schema.Natural;
      readonly imageHeight: Schema.Natural;
      readonly format: Schema.Literals<readonly ["rgb", "rgba", "png"]>;
      readonly dataLength: Schema.Natural;
      readonly dataFingerprint: Schema.BigInt;
    }>;
    readonly logicalPlacementId: Schema.Natural;
    readonly x: Schema.Natural;
    readonly y: Schema.Natural;
    readonly cols: Schema.Natural;
    readonly rows: Schema.Natural;
    readonly sourceX: Schema.Natural;
    readonly sourceY: Schema.Natural;
    readonly sourceWidth: Schema.Natural;
    readonly sourceHeight: Schema.Natural;
    readonly xOffset: Schema.Natural;
    readonly yOffset: Schema.Natural;
    readonly z: Schema.Int;
    readonly scrollbackOffset: Schema.Natural;
  }>>;
  readonly retainedAssets: Schema.$Array<Schema.Struct<{
    readonly source: Schema.Union<readonly [Schema.Struct<{
      readonly kind: Schema.Literal<"terminal">;
      readonly target: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"pane">;
        readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      }>, Schema.Struct<{
        readonly kind: Schema.Literal<"popup">;
        readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
      }>]>;
      readonly imageId: Schema.Natural;
    }>, Schema.Struct<{
      readonly kind: Schema.Literal<"paneLayer">;
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly layerId: Schema.String;
    }>]>;
    readonly imageWidth: Schema.Natural;
    readonly imageHeight: Schema.Natural;
    readonly format: Schema.Literals<readonly ["rgb", "rgba", "png"]>;
    readonly dataLength: Schema.Natural;
    readonly dataFingerprint: Schema.BigInt;
  }>>;
}>;
/** Parsed graphics scene; consumers retain assets referenced by subsequent scenes. @category models @since 0.9.0 */
type ClientShellGraphicsScene = typeof ClientShellGraphicsScene.Type;
/** Popup terminal surface nested in an active client surface. @category schemas @since 0.9.0 */
declare const ClientShellPopupSurface: Schema.Struct<{
  readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
  readonly title: Schema.String;
  readonly width: Schema.OptionFromNullOr<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"cells">;
    readonly value: Schema.Natural;
  }>, Schema.Struct<{
    readonly kind: Schema.Literal<"percent">;
    readonly value: Schema.Natural;
  }>]>>;
  readonly height: Schema.OptionFromNullOr<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"cells">;
    readonly value: Schema.Natural;
  }>, Schema.Struct<{
    readonly kind: Schema.Literal<"percent">;
    readonly value: Schema.Natural;
  }>]>>;
  readonly frame: Schema.Struct<{
    readonly cells: Schema.$Array<Schema.Struct<{
      readonly symbol: Schema.String;
      readonly fg: Schema.Natural;
      readonly bg: Schema.Natural;
      readonly modifier: Schema.Natural;
      readonly skip: Schema.Boolean;
      readonly hyperlink: Schema.OptionFromNullOr<Schema.Natural>;
    }>>;
    readonly width: Schema.Natural;
    readonly height: Schema.Natural;
    readonly cursor: Schema.OptionFromNullOr<Schema.Struct<{
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly visible: Schema.Boolean;
      readonly shape: Schema.Natural;
    }>>;
    readonly hyperlinks: Schema.$Array<Schema.String>;
    readonly graphics: Schema.Uint8Array;
  }>;
  readonly mouseReporting: Schema.Boolean;
  readonly sgrPixelMouse: Schema.Boolean;
  readonly pixelWidth: Schema.Natural;
  readonly pixelHeight: Schema.Natural;
}>;
/** Parsed popup surface. @category models @since 0.9.0 */
type ClientShellPopupSurface = typeof ClientShellPopupSurface.Type;
/** Complete active-tab surface tied to boot, projection, and surface revisions. @category schemas @since 0.9.0 */
declare const ClientShellSurface: Schema.Struct<{
  readonly bootId: Schema.brand<Schema.NonEmptyString, "EndpointBootId">;
  readonly projectionRevision: Schema.brand<Schema.Natural, "ProjectionRevision">;
  readonly surfaceRevision: Schema.brand<Schema.Natural, "SurfaceRevision">;
  readonly frame: Schema.Struct<{
    readonly cells: Schema.$Array<Schema.Struct<{
      readonly symbol: Schema.String;
      readonly fg: Schema.Natural;
      readonly bg: Schema.Natural;
      readonly modifier: Schema.Natural;
      readonly skip: Schema.Boolean;
      readonly hyperlink: Schema.OptionFromNullOr<Schema.Natural>;
    }>>;
    readonly width: Schema.Natural;
    readonly height: Schema.Natural;
    readonly cursor: Schema.OptionFromNullOr<Schema.Struct<{
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly visible: Schema.Boolean;
      readonly shape: Schema.Natural;
    }>>;
    readonly hyperlinks: Schema.$Array<Schema.String>;
    readonly graphics: Schema.Uint8Array;
  }>;
  readonly panes: Schema.$Array<Schema.Struct<{
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly contentRevision: Schema.brand<Schema.Natural, "PaneContentRevision">;
    readonly rect: Schema.Struct<{
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly width: Schema.Natural;
      readonly height: Schema.Natural;
    }>;
    readonly innerRect: Schema.Struct<{
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly width: Schema.Natural;
      readonly height: Schema.Natural;
    }>;
    readonly scrollbarRect: Schema.OptionFromNullOr<Schema.Struct<{
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly width: Schema.Natural;
      readonly height: Schema.Natural;
    }>>;
    readonly scroll: Schema.OptionFromNullOr<Schema.Struct<{
      readonly offsetFromBottom: Schema.Natural;
      readonly maxOffsetFromBottom: Schema.Natural;
      readonly viewportRows: Schema.Natural;
    }>>;
    readonly focused: Schema.Boolean;
    readonly mouseReporting: Schema.Boolean;
    readonly sgrPixelMouse: Schema.Boolean;
    readonly alternateScreenActive: Schema.Boolean;
    readonly pixelWidth: Schema.Natural;
    readonly pixelHeight: Schema.Natural;
  }>>;
  readonly splits: Schema.$Array<Schema.Struct<{
    readonly direction: Schema.Literals<readonly ["horizontal", "vertical"]>;
    readonly pos: Schema.Natural;
    readonly area: Schema.Struct<{
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly width: Schema.Natural;
      readonly height: Schema.Natural;
    }>;
    readonly hitRect: Schema.Struct<{
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly width: Schema.Natural;
      readonly height: Schema.Natural;
    }>;
    readonly path: Schema.$Array<Schema.Boolean>;
  }>>;
  readonly popup: Schema.OptionFromNullOr<Schema.Struct<{
    readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
    readonly title: Schema.String;
    readonly width: Schema.OptionFromNullOr<Schema.Union<readonly [Schema.Struct<{
      readonly kind: Schema.Literal<"cells">;
      readonly value: Schema.Natural;
    }>, Schema.Struct<{
      readonly kind: Schema.Literal<"percent">;
      readonly value: Schema.Natural;
    }>]>>;
    readonly height: Schema.OptionFromNullOr<Schema.Union<readonly [Schema.Struct<{
      readonly kind: Schema.Literal<"cells">;
      readonly value: Schema.Natural;
    }>, Schema.Struct<{
      readonly kind: Schema.Literal<"percent">;
      readonly value: Schema.Natural;
    }>]>>;
    readonly frame: Schema.Struct<{
      readonly cells: Schema.$Array<Schema.Struct<{
        readonly symbol: Schema.String;
        readonly fg: Schema.Natural;
        readonly bg: Schema.Natural;
        readonly modifier: Schema.Natural;
        readonly skip: Schema.Boolean;
        readonly hyperlink: Schema.OptionFromNullOr<Schema.Natural>;
      }>>;
      readonly width: Schema.Natural;
      readonly height: Schema.Natural;
      readonly cursor: Schema.OptionFromNullOr<Schema.Struct<{
        readonly x: Schema.Natural;
        readonly y: Schema.Natural;
        readonly visible: Schema.Boolean;
        readonly shape: Schema.Natural;
      }>>;
      readonly hyperlinks: Schema.$Array<Schema.String>;
      readonly graphics: Schema.Uint8Array;
    }>;
    readonly mouseReporting: Schema.Boolean;
    readonly sgrPixelMouse: Schema.Boolean;
    readonly pixelWidth: Schema.Natural;
    readonly pixelHeight: Schema.Natural;
  }>>;
  readonly graphics: Schema.Struct<{
    readonly assets: Schema.$Array<Schema.Struct<{
      readonly key: Schema.Struct<{
        readonly source: Schema.Union<readonly [Schema.Struct<{
          readonly kind: Schema.Literal<"terminal">;
          readonly target: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"pane">;
            readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
          }>, Schema.Struct<{
            readonly kind: Schema.Literal<"popup">;
            readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
          }>]>;
          readonly imageId: Schema.Natural;
        }>, Schema.Struct<{
          readonly kind: Schema.Literal<"paneLayer">;
          readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
          readonly layerId: Schema.String;
        }>]>;
        readonly imageWidth: Schema.Natural;
        readonly imageHeight: Schema.Natural;
        readonly format: Schema.Literals<readonly ["rgb", "rgba", "png"]>;
        readonly dataLength: Schema.Natural;
        readonly dataFingerprint: Schema.BigInt;
      }>;
      readonly data: Schema.Uint8Array;
    }>>;
    readonly placements: Schema.$Array<Schema.Struct<{
      readonly asset: Schema.Struct<{
        readonly source: Schema.Union<readonly [Schema.Struct<{
          readonly kind: Schema.Literal<"terminal">;
          readonly target: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"pane">;
            readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
          }>, Schema.Struct<{
            readonly kind: Schema.Literal<"popup">;
            readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
          }>]>;
          readonly imageId: Schema.Natural;
        }>, Schema.Struct<{
          readonly kind: Schema.Literal<"paneLayer">;
          readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
          readonly layerId: Schema.String;
        }>]>;
        readonly imageWidth: Schema.Natural;
        readonly imageHeight: Schema.Natural;
        readonly format: Schema.Literals<readonly ["rgb", "rgba", "png"]>;
        readonly dataLength: Schema.Natural;
        readonly dataFingerprint: Schema.BigInt;
      }>;
      readonly logicalPlacementId: Schema.Natural;
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly cols: Schema.Natural;
      readonly rows: Schema.Natural;
      readonly sourceX: Schema.Natural;
      readonly sourceY: Schema.Natural;
      readonly sourceWidth: Schema.Natural;
      readonly sourceHeight: Schema.Natural;
      readonly xOffset: Schema.Natural;
      readonly yOffset: Schema.Natural;
      readonly z: Schema.Int;
      readonly scrollbackOffset: Schema.Natural;
    }>>;
    readonly retainedAssets: Schema.$Array<Schema.Struct<{
      readonly source: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"terminal">;
        readonly target: Schema.Union<readonly [Schema.Struct<{
          readonly kind: Schema.Literal<"pane">;
          readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
        }>, Schema.Struct<{
          readonly kind: Schema.Literal<"popup">;
          readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
        }>]>;
        readonly imageId: Schema.Natural;
      }>, Schema.Struct<{
        readonly kind: Schema.Literal<"paneLayer">;
        readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
        readonly layerId: Schema.String;
      }>]>;
      readonly imageWidth: Schema.Natural;
      readonly imageHeight: Schema.Natural;
      readonly format: Schema.Literals<readonly ["rgb", "rgba", "png"]>;
      readonly dataLength: Schema.Natural;
      readonly dataFingerprint: Schema.BigInt;
    }>>;
  }>;
}>;
/** Parsed active-tab surface. @category models @since 0.9.0 */
type ClientShellSurface = typeof ClientShellSurface.Type;
/** Incremental update requiring an exact previously accepted base surface. @category schemas @since 0.9.0 */
declare const ClientShellSurfacePatch: Schema.Struct<{
  readonly bootId: Schema.brand<Schema.NonEmptyString, "EndpointBootId">;
  readonly projectionRevision: Schema.brand<Schema.Natural, "ProjectionRevision">;
  readonly baseSurfaceRevision: Schema.brand<Schema.Natural, "SurfaceRevision">;
  readonly surfaceRevision: Schema.brand<Schema.Natural, "SurfaceRevision">;
  readonly rows: Schema.$Array<Schema.Struct<{
    readonly x: Schema.Natural;
    readonly y: Schema.Natural;
    readonly cells: Schema.$Array<Schema.Struct<{
      readonly symbol: Schema.String;
      readonly fg: Schema.Natural;
      readonly bg: Schema.Natural;
      readonly modifier: Schema.Natural;
      readonly skip: Schema.Boolean;
      readonly hyperlink: Schema.OptionFromNullOr<Schema.Natural>;
    }>>;
  }>>;
  readonly panes: Schema.$Array<Schema.Struct<{
    readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
    readonly contentRevision: Schema.brand<Schema.Natural, "PaneContentRevision">;
    readonly rect: Schema.Struct<{
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly width: Schema.Natural;
      readonly height: Schema.Natural;
    }>;
    readonly innerRect: Schema.Struct<{
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly width: Schema.Natural;
      readonly height: Schema.Natural;
    }>;
    readonly scrollbarRect: Schema.OptionFromNullOr<Schema.Struct<{
      readonly x: Schema.Natural;
      readonly y: Schema.Natural;
      readonly width: Schema.Natural;
      readonly height: Schema.Natural;
    }>>;
    readonly scroll: Schema.OptionFromNullOr<Schema.Struct<{
      readonly offsetFromBottom: Schema.Natural;
      readonly maxOffsetFromBottom: Schema.Natural;
      readonly viewportRows: Schema.Natural;
    }>>;
    readonly focused: Schema.Boolean;
    readonly mouseReporting: Schema.Boolean;
    readonly sgrPixelMouse: Schema.Boolean;
    readonly alternateScreenActive: Schema.Boolean;
    readonly pixelWidth: Schema.Natural;
    readonly pixelHeight: Schema.Natural;
  }>>;
  readonly cursor: Schema.OptionFromNullOr<Schema.Struct<{
    readonly x: Schema.Natural;
    readonly y: Schema.Natural;
    readonly visible: Schema.Boolean;
    readonly shape: Schema.Natural;
  }>>;
}>;
/** Parsed incremental surface update. @category models @since 0.9.0 */
type ClientShellSurfacePatch = typeof ClientShellSurfacePatch.Type;
/** Surface-interest acknowledgement is not a presentation-delivery acknowledgement. @category schemas @since 0.9.0 */
declare const ClientShellSurfaceAcknowledgement: Schema.encodeKeys<Schema.Struct<{
  readonly active: Schema.Boolean;
  readonly projectionRevision: Schema.brand<Schema.Natural, "ProjectionRevision">;
}>, {
  readonly projectionRevision: "projection_revision";
}>;
/** Parsed surface-interest acknowledgement. @category models @since 0.9.0 */
type ClientShellSurfaceAcknowledgement = typeof ClientShellSurfaceAcknowledgement.Type;
/** Observable surface lifecycle; acknowledgement and presentation readiness are distinct. @category schemas @since 0.9.0 */
declare const ClientShellSurfaceState: Schema.Union<readonly [Schema.Struct<{
  readonly status: Schema.Literals<readonly ["inactive", "activating", "deactivating", "closed"]>;
}>, Schema.Struct<{
  readonly status: Schema.Literal<"awaitingSurface">;
  readonly bootId: Schema.brand<Schema.NonEmptyString, "EndpointBootId">;
  readonly projectionFloor: Schema.brand<Schema.Natural, "ProjectionRevision">;
}>, Schema.Struct<{
  readonly status: Schema.Literal<"active">;
  readonly bootId: Schema.brand<Schema.NonEmptyString, "EndpointBootId">;
  readonly projectionFloor: Schema.brand<Schema.Natural, "ProjectionRevision">;
  readonly surface: Schema.Struct<{
    readonly bootId: Schema.brand<Schema.NonEmptyString, "EndpointBootId">;
    readonly projectionRevision: Schema.brand<Schema.Natural, "ProjectionRevision">;
    readonly surfaceRevision: Schema.brand<Schema.Natural, "SurfaceRevision">;
    readonly frame: Schema.Struct<{
      readonly cells: Schema.$Array<Schema.Struct<{
        readonly symbol: Schema.String;
        readonly fg: Schema.Natural;
        readonly bg: Schema.Natural;
        readonly modifier: Schema.Natural;
        readonly skip: Schema.Boolean;
        readonly hyperlink: Schema.OptionFromNullOr<Schema.Natural>;
      }>>;
      readonly width: Schema.Natural;
      readonly height: Schema.Natural;
      readonly cursor: Schema.OptionFromNullOr<Schema.Struct<{
        readonly x: Schema.Natural;
        readonly y: Schema.Natural;
        readonly visible: Schema.Boolean;
        readonly shape: Schema.Natural;
      }>>;
      readonly hyperlinks: Schema.$Array<Schema.String>;
      readonly graphics: Schema.Uint8Array;
    }>;
    readonly panes: Schema.$Array<Schema.Struct<{
      readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
      readonly contentRevision: Schema.brand<Schema.Natural, "PaneContentRevision">;
      readonly rect: Schema.Struct<{
        readonly x: Schema.Natural;
        readonly y: Schema.Natural;
        readonly width: Schema.Natural;
        readonly height: Schema.Natural;
      }>;
      readonly innerRect: Schema.Struct<{
        readonly x: Schema.Natural;
        readonly y: Schema.Natural;
        readonly width: Schema.Natural;
        readonly height: Schema.Natural;
      }>;
      readonly scrollbarRect: Schema.OptionFromNullOr<Schema.Struct<{
        readonly x: Schema.Natural;
        readonly y: Schema.Natural;
        readonly width: Schema.Natural;
        readonly height: Schema.Natural;
      }>>;
      readonly scroll: Schema.OptionFromNullOr<Schema.Struct<{
        readonly offsetFromBottom: Schema.Natural;
        readonly maxOffsetFromBottom: Schema.Natural;
        readonly viewportRows: Schema.Natural;
      }>>;
      readonly focused: Schema.Boolean;
      readonly mouseReporting: Schema.Boolean;
      readonly sgrPixelMouse: Schema.Boolean;
      readonly alternateScreenActive: Schema.Boolean;
      readonly pixelWidth: Schema.Natural;
      readonly pixelHeight: Schema.Natural;
    }>>;
    readonly splits: Schema.$Array<Schema.Struct<{
      readonly direction: Schema.Literals<readonly ["horizontal", "vertical"]>;
      readonly pos: Schema.Natural;
      readonly area: Schema.Struct<{
        readonly x: Schema.Natural;
        readonly y: Schema.Natural;
        readonly width: Schema.Natural;
        readonly height: Schema.Natural;
      }>;
      readonly hitRect: Schema.Struct<{
        readonly x: Schema.Natural;
        readonly y: Schema.Natural;
        readonly width: Schema.Natural;
        readonly height: Schema.Natural;
      }>;
      readonly path: Schema.$Array<Schema.Boolean>;
    }>>;
    readonly popup: Schema.OptionFromNullOr<Schema.Struct<{
      readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
      readonly title: Schema.String;
      readonly width: Schema.OptionFromNullOr<Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"cells">;
        readonly value: Schema.Natural;
      }>, Schema.Struct<{
        readonly kind: Schema.Literal<"percent">;
        readonly value: Schema.Natural;
      }>]>>;
      readonly height: Schema.OptionFromNullOr<Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"cells">;
        readonly value: Schema.Natural;
      }>, Schema.Struct<{
        readonly kind: Schema.Literal<"percent">;
        readonly value: Schema.Natural;
      }>]>>;
      readonly frame: Schema.Struct<{
        readonly cells: Schema.$Array<Schema.Struct<{
          readonly symbol: Schema.String;
          readonly fg: Schema.Natural;
          readonly bg: Schema.Natural;
          readonly modifier: Schema.Natural;
          readonly skip: Schema.Boolean;
          readonly hyperlink: Schema.OptionFromNullOr<Schema.Natural>;
        }>>;
        readonly width: Schema.Natural;
        readonly height: Schema.Natural;
        readonly cursor: Schema.OptionFromNullOr<Schema.Struct<{
          readonly x: Schema.Natural;
          readonly y: Schema.Natural;
          readonly visible: Schema.Boolean;
          readonly shape: Schema.Natural;
        }>>;
        readonly hyperlinks: Schema.$Array<Schema.String>;
        readonly graphics: Schema.Uint8Array;
      }>;
      readonly mouseReporting: Schema.Boolean;
      readonly sgrPixelMouse: Schema.Boolean;
      readonly pixelWidth: Schema.Natural;
      readonly pixelHeight: Schema.Natural;
    }>>;
    readonly graphics: Schema.Struct<{
      readonly assets: Schema.$Array<Schema.Struct<{
        readonly key: Schema.Struct<{
          readonly source: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"terminal">;
            readonly target: Schema.Union<readonly [Schema.Struct<{
              readonly kind: Schema.Literal<"pane">;
              readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
            }>, Schema.Struct<{
              readonly kind: Schema.Literal<"popup">;
              readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
            }>]>;
            readonly imageId: Schema.Natural;
          }>, Schema.Struct<{
            readonly kind: Schema.Literal<"paneLayer">;
            readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
            readonly layerId: Schema.String;
          }>]>;
          readonly imageWidth: Schema.Natural;
          readonly imageHeight: Schema.Natural;
          readonly format: Schema.Literals<readonly ["rgb", "rgba", "png"]>;
          readonly dataLength: Schema.Natural;
          readonly dataFingerprint: Schema.BigInt;
        }>;
        readonly data: Schema.Uint8Array;
      }>>;
      readonly placements: Schema.$Array<Schema.Struct<{
        readonly asset: Schema.Struct<{
          readonly source: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"terminal">;
            readonly target: Schema.Union<readonly [Schema.Struct<{
              readonly kind: Schema.Literal<"pane">;
              readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
            }>, Schema.Struct<{
              readonly kind: Schema.Literal<"popup">;
              readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
            }>]>;
            readonly imageId: Schema.Natural;
          }>, Schema.Struct<{
            readonly kind: Schema.Literal<"paneLayer">;
            readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
            readonly layerId: Schema.String;
          }>]>;
          readonly imageWidth: Schema.Natural;
          readonly imageHeight: Schema.Natural;
          readonly format: Schema.Literals<readonly ["rgb", "rgba", "png"]>;
          readonly dataLength: Schema.Natural;
          readonly dataFingerprint: Schema.BigInt;
        }>;
        readonly logicalPlacementId: Schema.Natural;
        readonly x: Schema.Natural;
        readonly y: Schema.Natural;
        readonly cols: Schema.Natural;
        readonly rows: Schema.Natural;
        readonly sourceX: Schema.Natural;
        readonly sourceY: Schema.Natural;
        readonly sourceWidth: Schema.Natural;
        readonly sourceHeight: Schema.Natural;
        readonly xOffset: Schema.Natural;
        readonly yOffset: Schema.Natural;
        readonly z: Schema.Int;
        readonly scrollbackOffset: Schema.Natural;
      }>>;
      readonly retainedAssets: Schema.$Array<Schema.Struct<{
        readonly source: Schema.Union<readonly [Schema.Struct<{
          readonly kind: Schema.Literal<"terminal">;
          readonly target: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"pane">;
            readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
          }>, Schema.Struct<{
            readonly kind: Schema.Literal<"popup">;
            readonly terminalId: Schema.brand<Schema.NonEmptyString, "TerminalId">;
          }>]>;
          readonly imageId: Schema.Natural;
        }>, Schema.Struct<{
          readonly kind: Schema.Literal<"paneLayer">;
          readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
          readonly layerId: Schema.String;
        }>]>;
        readonly imageWidth: Schema.Natural;
        readonly imageHeight: Schema.Natural;
        readonly format: Schema.Literals<readonly ["rgb", "rgba", "png"]>;
        readonly dataLength: Schema.Natural;
        readonly dataFingerprint: Schema.BigInt;
      }>>;
    }>;
  }>;
}>]>;
/** Parsed surface lifecycle state. @category models @since 0.9.0 */
type ClientShellSurfaceState = typeof ClientShellSurfaceState.Type;
/** Ephemeral host presentation instructions; the SDK never executes clipboard, sound, or terminal effects itself. @category schemas @since 0.9.0 */
declare const ClientShellPresentationEvent: Schema.Union<readonly [Schema.Struct<{
  readonly kind: Schema.Literal<"graphics">;
  readonly bytes: Schema.Uint8Array;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"notify">;
  readonly delivery: Schema.Literals<readonly ["sound", "toast", "systemToast"]>;
  readonly message: Schema.String;
  readonly body: Schema.NullOr<Schema.String>;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"clipboard">;
  readonly data: Schema.String;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"windowTitle">;
  readonly title: Schema.NullOr<Schema.String>;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"reloadSoundConfig">;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"mouseCapture">;
  readonly enabled: Schema.Boolean;
  readonly sgrPixels: Schema.Boolean;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"terminalBell">;
  readonly count: Schema.Natural;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"keyboardProtocol">;
  readonly flags: Schema.Natural;
  readonly modifyOtherKeysLevel: Schema.Natural;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"keyboardReportAll">;
  readonly enabled: Schema.Boolean;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"error">;
  readonly message: Schema.String;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"notification">;
  readonly notification: Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["needsAttention", "finished", "updateInstalled", "custom"]>;
    readonly title: Schema.String;
    readonly body: Schema.NullOr<Schema.String>;
    readonly sound: Schema.NullOr<Schema.Literals<readonly ["done", "request"]>>;
    readonly agent: Schema.NullOr<Schema.String>;
    readonly workspaceId: Schema.NullOr<Schema.brand<Schema.NonEmptyString, "WorkspaceId">>;
    readonly tabId: Schema.NullOr<Schema.brand<Schema.NonEmptyString, "TabId">>;
    readonly paneId: Schema.NullOr<Schema.brand<Schema.NonEmptyString, "PaneId">>;
    readonly position: Schema.NullOr<Schema.Literals<readonly ["topLeft", "topRight", "bottomLeft", "bottomRight"]>>;
  }>;
}>]>;
/** Parsed live host-presentation event. @category models @since 0.9.0 */
type ClientShellPresentationEvent = typeof ClientShellPresentationEvent.Type;
//#endregion
//#region src/herdr-endpoint-errors.d.ts
declare const HerdrEndpointNegotiationError_base: Schema.Class<HerdrEndpointNegotiationError, Schema.TaggedStruct<"HerdrEndpointNegotiationError", {
  readonly reason: Schema.Literals<readonly ["welcome", "generation", "codec", "rejected", "capability"]>;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/** Endpoint generation or required codec negotiation failed. @category errors @since 0.9.0 */
declare class HerdrEndpointNegotiationError extends HerdrEndpointNegotiationError_base {
  /** Creates a bounded negotiation failure without server payloads. */
  constructor(reason: HerdrEndpointNegotiationError["reason"]);
}
declare const HerdrEndpointTransportError_base: Schema.Class<HerdrEndpointTransportError, Schema.TaggedStruct<"HerdrEndpointTransportError", {
  readonly reason: Schema.Literals<readonly ["connect", "read", "write", "premature_close"]>;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/** Endpoint socket acquisition or I/O failed. @category errors @since 0.9.0 */
declare class HerdrEndpointTransportError extends HerdrEndpointTransportError_base {
  /** Creates a safe I/O failure; remote write outcomes can be uncertain. */
  constructor(reason: HerdrEndpointTransportError["reason"]);
}
declare const HerdrEndpointInvalidMessage_base: Schema.Class<HerdrEndpointInvalidMessage, Schema.TaggedStruct<"HerdrEndpointInvalidMessage", {
  readonly reason: Schema.Literals<readonly ["framing", "oversized_frame", "schema", "correlation", "revision", "unsupported_message", "resource_limit"]>;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/** Endpoint framing, chunking, or presentation data violated its negotiated contract. @category errors @since 0.9.0 */
declare class HerdrEndpointInvalidMessage extends HerdrEndpointInvalidMessage_base {
  /** Creates a bounded binary/JSON protocol failure without embedding content. */
  constructor(reason: HerdrEndpointInvalidMessage["reason"]);
}
declare const HerdrEndpointRequestTimeout_base: Schema.Class<HerdrEndpointRequestTimeout, Schema.TaggedStruct<"HerdrEndpointRequestTimeout", {
  readonly operation: Schema.Literals<readonly ["connect", "request", "write", "health", "surface"]>;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/** A bounded endpoint acquisition, request, or health probe expired. @category errors @since 0.9.0 */
declare class HerdrEndpointRequestTimeout extends HerdrEndpointRequestTimeout_base {
  /** Creates a deadline failure that does not imply an operation was never delivered. */
  constructor(operation: HerdrEndpointRequestTimeout["operation"]);
}
declare const HerdrEndpointClosed_base: Schema.Class<HerdrEndpointClosed, Schema.TaggedStruct<"HerdrEndpointClosed", {
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/** A connection handle was used after its owning session ended. @category errors @since 0.9.0 */
declare class HerdrEndpointClosed extends HerdrEndpointClosed_base {
  /** Creates a use-after-close failure. */
  constructor();
}
declare const HerdrEndpointUnsupportedMethod_base: Schema.Class<HerdrEndpointUnsupportedMethod, Schema.TaggedStruct<"HerdrEndpointUnsupportedMethod", {
  readonly method: Schema.String;
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/** Endpoint does not advertise a requested optional API method. @category errors @since 0.9.0 */
declare class HerdrEndpointUnsupportedMethod extends HerdrEndpointUnsupportedMethod_base {
  /** Records the method name, never its parameters. */
  constructor(method: string);
}
declare const HerdrEndpointStaleReference_base: Schema.Class<HerdrEndpointStaleReference, Schema.TaggedStruct<"HerdrEndpointStaleReference", {
  readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/** An endpoint-issued handle belongs to another connection or boot. @category errors @since 0.9.0 */
declare class HerdrEndpointStaleReference extends HerdrEndpointStaleReference_base {
  /** Creates a stale-handle failure without replaying the requested operation. */
  constructor();
}
/** Failures that terminate a client-shell resource lifetime. @category errors @since 0.9.0 */
type HerdrEndpointFailure = HerdrEndpointNegotiationError | HerdrEndpointTransportError | HerdrEndpointInvalidMessage | HerdrEndpointRequestTimeout | HerdrEndpointClosed;
//#endregion
//#region src/herdr-client-shell-input.d.ts
/** A named key, Unicode scalar, or function key for semantic endpoint input. @category schemas @since 0.9.0 */
declare const ClientShellKeyCode: Schema.Union<readonly [Schema.Struct<{
  readonly kind: Schema.Literal<"named">;
  readonly name: Schema.Literals<readonly ["backspace", "enter", "left", "right", "up", "down", "home", "end", "pageUp", "pageDown", "tab", "backTab", "delete", "insert", "escape", "null"]>;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"character">;
  readonly character: Schema.String;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"function">;
  readonly number: Schema.Natural;
}>]>;
/** Parsed semantic key code. @category models @since 0.9.0 */
type ClientShellKeyCode = typeof ClientShellKeyCode.Type;
/** Windows console key identity, when input originates from a native record. @category schemas @since 0.9.0 */
declare const ClientShellWindowsKeyRecord: Schema.Struct<{
  readonly keyDown: Schema.Boolean;
  readonly repeatCount: Schema.Natural;
  readonly virtualKeyCode: Schema.Natural;
  readonly virtualScanCode: Schema.Natural;
  readonly unicode: Schema.Natural;
  readonly controlKeyState: Schema.Natural;
}>;
/** Semantic key lifecycle and optional native identity. @category schemas @since 0.9.0 */
declare const ClientShellKeyInput: Schema.Struct<{
  readonly code: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"named">;
    readonly name: Schema.Literals<readonly ["backspace", "enter", "left", "right", "up", "down", "home", "end", "pageUp", "pageDown", "tab", "backTab", "delete", "insert", "escape", "null"]>;
  }>, Schema.Struct<{
    readonly kind: Schema.Literal<"character">;
    readonly character: Schema.String;
  }>, Schema.Struct<{
    readonly kind: Schema.Literal<"function">;
    readonly number: Schema.Natural;
  }>]>;
  readonly modifiers: Schema.optionalKey<Schema.Natural>;
  readonly phase: Schema.optionalKey<Schema.Literals<readonly ["press", "repeat", "release"]>>;
  readonly repeatCount: Schema.optionalKey<Schema.Natural>;
  readonly shiftedCodepoint: Schema.optionalKey<Schema.Natural>;
  readonly generatedText: Schema.optionalKey<Schema.String>;
  readonly tracksRelease: Schema.optionalKey<Schema.Boolean>;
  readonly physicalKeyId: Schema.optionalKey<Schema.Natural>;
  readonly windowsRecord: Schema.optionalKey<Schema.Struct<{
    readonly keyDown: Schema.Boolean;
    readonly repeatCount: Schema.Natural;
    readonly virtualKeyCode: Schema.Natural;
    readonly virtualScanCode: Schema.Natural;
    readonly unicode: Schema.Natural;
    readonly controlKeyState: Schema.Natural;
  }>>;
}>;
/** Parsed semantic key event. @category models @since 0.9.0 */
type ClientShellKeyInput = typeof ClientShellKeyInput.Type;
/** Caller-supplied semantic key event. @category inputs @since 0.9.0 */
type ClientShellKeyInputEncoded = typeof ClientShellKeyInput.Encoded;
/** Mouse action, optionally identifying a button. @category schemas @since 0.9.0 */
declare const ClientShellMouseAction: Schema.Union<readonly [Schema.Struct<{
  readonly action: Schema.Literals<readonly ["down", "up", "drag"]>;
  readonly button: Schema.Literals<readonly ["left", "right", "middle"]>;
}>, Schema.Struct<{
  readonly action: Schema.Literals<readonly ["move", "scrollUp", "scrollDown", "scrollLeft", "scrollRight"]>;
}>]>;
/** Mouse coordinates distinguish terminal cells from exact pixels. @category schemas @since 0.9.0 */
declare const ClientShellMousePosition: Schema.Union<readonly [Schema.Struct<{
  readonly units: Schema.Literal<"cells">;
  readonly column: Schema.Natural;
  readonly row: Schema.Natural;
}>, Schema.Struct<{
  readonly units: Schema.Literal<"pixels">;
  readonly x: Schema.Natural;
  readonly y: Schema.Natural;
  readonly column: Schema.Natural;
  readonly row: Schema.Natural;
}>]>;
/** Semantic mouse input with optional coherent target geometry. @category schemas @since 0.9.0 */
declare const ClientShellMouseInput: Schema.Struct<{
  readonly gesture: Schema.Union<readonly [Schema.Struct<{
    readonly action: Schema.Literals<readonly ["down", "up", "drag"]>;
    readonly button: Schema.Literals<readonly ["left", "right", "middle"]>;
  }>, Schema.Struct<{
    readonly action: Schema.Literals<readonly ["move", "scrollUp", "scrollDown", "scrollLeft", "scrollRight"]>;
  }>]>;
  readonly position: Schema.Union<readonly [Schema.Struct<{
    readonly units: Schema.Literal<"cells">;
    readonly column: Schema.Natural;
    readonly row: Schema.Natural;
  }>, Schema.Struct<{
    readonly units: Schema.Literal<"pixels">;
    readonly x: Schema.Natural;
    readonly y: Schema.Natural;
    readonly column: Schema.Natural;
    readonly row: Schema.Natural;
  }>]>;
  readonly geometry: Schema.optionalKey<Schema.Struct<{
    readonly columns: Schema.Natural;
    readonly rows: Schema.Natural;
    readonly widthPixels: Schema.Natural;
    readonly heightPixels: Schema.Natural;
  }>>;
  readonly modifiers: Schema.optionalKey<Schema.Natural>;
  readonly lines: Schema.optionalKey<Schema.Natural>;
}>;
/** Parsed semantic mouse event. @category models @since 0.9.0 */
type ClientShellMouseInput = typeof ClientShellMouseInput.Type;
/** Caller-supplied semantic mouse event. @category inputs @since 0.9.0 */
type ClientShellMouseInputEncoded = typeof ClientShellMouseInput.Encoded;
/** One host terminal RGB color; each channel is an 8-bit integer from 0 to 255. @category schemas @since 0.9.5 */
declare const ClientShellHostColor: Schema.Struct<{
  readonly r: Schema.Natural;
  readonly g: Schema.Natural;
  readonly b: Schema.Natural;
}>;
/** Parsed host terminal RGB color. @category models @since 0.9.5 */
type ClientShellHostColor = typeof ClientShellHostColor.Type;
/** Caller-supplied host terminal RGB color. @category inputs @since 0.9.5 */
type ClientShellHostColorEncoded = typeof ClientShellHostColor.Encoded;
/**
 * Maximum palette entries in one host theme update, matching Herdr's client-side batching bound.
 * @category constants @since 0.9.5
 */
declare const CLIENT_SHELL_HOST_PALETTE_MAX_ENTRIES = 256;
/**
 * One outer (host) terminal theme update forwarded so pane applications pick matching colors:
 * a default foreground/background color, 1–256 indexed palette colors, or the light/dark appearance.
 * A background color also infers appearance on the server unless one was set explicitly.
 * @category schemas @since 0.9.5
 */
declare const ClientShellHostThemeInput: Schema.Union<readonly [Schema.Struct<{
  readonly kind: Schema.Literal<"defaultColor">;
  readonly target: Schema.Literals<readonly ["foreground", "background"]>;
  readonly color: Schema.Struct<{
    readonly r: Schema.Natural;
    readonly g: Schema.Natural;
    readonly b: Schema.Natural;
  }>;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"palette">;
  readonly colors: Schema.$Array<Schema.Struct<{
    readonly index: Schema.Natural;
    readonly color: Schema.Struct<{
      readonly r: Schema.Natural;
      readonly g: Schema.Natural;
      readonly b: Schema.Natural;
    }>;
  }>>;
}>, Schema.Struct<{
  readonly kind: Schema.Literal<"appearance">;
  readonly appearance: Schema.Literals<readonly ["dark", "light"]>;
}>]>;
/** Parsed host terminal theme update. @category models @since 0.9.5 */
type ClientShellHostThemeInput = typeof ClientShellHostThemeInput.Type;
/** Caller-supplied host terminal theme update. @category inputs @since 0.9.5 */
type ClientShellHostThemeInputEncoded = typeof ClientShellHostThemeInput.Encoded;
//#endregion
//#region src/herdr-endpoint-transport.d.ts
/** Request errors preserve server rejection separately from connection failure. @category errors @since 0.9.0 */
type EndpointRequestError = HerdrEndpointFailure | HerdrEndpointUnsupportedMethod | HerdrServerError | HerdrUnsupportedResult;
//#endregion
//#region src/client-shell-service.d.ts
/** Geometry and resource bounds for one explicit endpoint session. @category schemas @since 0.9.0 */
declare const ClientShellConnectInput: Schema.Struct<{
  readonly socketPath: Schema.optionalKey<Schema.brand<Schema.String, "HerdrAbsolutePath">>;
  readonly surface: Schema.Struct<{
    readonly columns: Schema.Int;
    readonly rows: Schema.Int;
  }>;
  readonly cellPixels: Schema.Struct<{
    readonly width: Schema.Natural;
    readonly height: Schema.Natural;
  }>;
  readonly initialSurface: Schema.optionalKey<Schema.Literals<readonly ["inactive", "active"]>>;
  readonly mouseCapture: Schema.optionalKey<Schema.Boolean>;
  readonly endpointKeybindings: Schema.optionalKey<Schema.Boolean>;
  readonly timeoutMs: Schema.optionalKey<Schema.Int>;
  readonly healthIntervalMs: Schema.optionalKey<Schema.Int>;
  readonly maximumMessageBytes: Schema.optionalKey<Schema.Int>;
}>;
/** Parsed endpoint connection options. @category models @since 0.9.0 */
type ClientShellConnectInput = typeof ClientShellConnectInput.Type;
/** Caller-supplied endpoint geometry; socketPath denotes herdr-client.sock, not herdr.sock. @category inputs @since 0.9.0 */
type ClientShellConnectInputEncoded = typeof ClientShellConnectInput.Encoded;
/** Connection acquisition also checks the SDK's protocol-22 baseline on the configured API socket. @category errors @since 0.9.0 */
type HerdrEndpointConnectError = HerdrTransportRequestError | EndpointRequestError;
/** Domain operation failures for one live endpoint connection. @category errors @since 0.9.0 */
type ClientShellOperationError = EndpointRequestError | HerdrInvalidInput | HerdrEndpointStaleReference;
declare const TextInput: Schema.Struct<{
  readonly text: Schema.String;
}>;
declare const ResizeInput: Schema.Struct<{
  readonly surface: Schema.Struct<{
    readonly columns: Schema.Int;
    readonly rows: Schema.Int;
  }>;
  readonly cellPixels: Schema.Struct<{
    readonly width: Schema.Natural;
    readonly height: Schema.Natural;
  }>;
}>;
/** Scoped endpoint handle; using it after its callback/Scope ends fails rather than reopening. @category services @since 0.9.0 */
interface ClientShellConnection {
  /** Reads the latest accepted whole projection without marking agents seen. */
  readonly snapshot: () => Effect.Effect<ClientShellProjection, HerdrEndpointClosed>;
  /** Current projection followed by coalesced whole replacements; consume inside the session. */
  readonly projections: Stream.Stream<ClientShellProjection, HerdrEndpointFailure>;
  /** Live presentation instructions; a consumer exceeding the eight-message backlog fails the connection rather than losing effects silently. */
  readonly events: Stream.Stream<ClientShellPresentationEvent, HerdrEndpointFailure>;
  /** Connection-local surface interest and presentation state. */
  readonly surface: {
    /** Changes this connection's surface interest; acknowledgement is not frame delivery. */
    readonly set: (input: {
      readonly active: boolean;
    }) => Effect.Effect<ClientShellSurfaceAcknowledgement, EndpointRequestError | HerdrInvalidInput>;
    /** Reads the latest presentation lifecycle state. */
    readonly state: () => Effect.Effect<ClientShellSurfaceState, HerdrEndpointClosed>;
    /** Waits for a complete surface at the acknowledged projection floor, with a deadline. */
    readonly awaitReady: () => Effect.Effect<ClientShellSurface, HerdrEndpointFailure>;
    /** Coalesced lifecycle states; never exposes incomplete patches as complete frames. */
    readonly states: Stream.Stream<ClientShellSurfaceState, HerdrEndpointFailure>;
    /** Updates this client's active-tab viewport geometry. */
    readonly resize: (input: typeof ResizeInput.Encoded) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
  };
  /** Semantic text delivery to a stable target; never inferred from a stale focused ID. */
  readonly input: {
    /** Sends a semantic key press/repeat/release to an explicit pane. */
    readonly key: (paneId: PaneId, input: ClientShellKeyInputEncoded) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
    /** Sends cell/pixel mouse input to an explicit pane. */
    readonly mouse: (paneId: PaneId, input: ClientShellMouseInputEncoded) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
    /** Sends a semantic key to an explicitly identified popup. */
    readonly keyInPopup: (terminalId: TerminalId, input: ClientShellKeyInputEncoded) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
    /** Sends mouse input to an explicitly identified popup. */
    readonly mouseInPopup: (terminalId: TerminalId, input: ClientShellMouseInputEncoded) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
    /** Commits text to a popup without synthesizing a paste. */
    readonly textInPopup: (terminalId: TerminalId, input: typeof TextInput.Encoded) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
    /** Pastes multiline text as one semantic paste event to a pane. */
    readonly paste: (paneId: PaneId, input: typeof TextInput.Encoded) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
    /** Commits text without converting it to a paste or Enter. */
    readonly text: (paneId: PaneId, input: typeof TextInput.Encoded) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
    /** Pastes into an explicitly identified popup terminal. */
    readonly pasteInPopup: (terminalId: TerminalId, input: typeof TextInput.Encoded) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
  };
  /** Commands discovered on this connection; arbitrary ID-only handles are rejected. */
  readonly commands: {
    /** Invokes a current discovered command using current endpoint context. */
    readonly invoke: (command: ClientShellCommand) => Effect.Effect<void, ClientShellOperationError>;
    /** Invokes a discovered command in an explicit workspace. */
    readonly invokeInWorkspace: (command: ClientShellCommand, workspaceId: WorkspaceId) => Effect.Effect<void, ClientShellOperationError>;
    /** Invokes a discovered command in a tab with an optional parent assertion. */
    readonly invokeInTab: (command: ClientShellCommand, tabId: TabId, input?: CommandTabInputEncoded) => Effect.Effect<void, ClientShellOperationError>;
    /** Invokes a discovered command with pane-bound selection coordinates. */
    readonly invokeInPane: (command: ClientShellCommand, paneId: PaneId, input?: CommandPaneInputEncoded) => Effect.Effect<void, ClientShellOperationError>;
  };
  /** Endpoint-owned announcement acknowledgement. */
  readonly productAnnouncements: {
    readonly dismiss: (input: ProductAnnouncementDismissInputEncoded) => Effect.Effect<void, ClientShellOperationError>;
  };
  /** Endpoint-owned release-note acknowledgement. */
  readonly releaseNotes: {
    readonly dismiss: (input: ReleaseNotesDismissInputEncoded) => Effect.Effect<void, ClientShellOperationError>;
  };
  /** Reports outer-terminal focus for this connection, not a global pane-focus operation. */
  readonly setFocused: (focused: boolean) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
  /** Updates this connection's mouse-capture preference. */
  readonly setMouseCapture: (enabled: boolean) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
  /**
   * Forwards one outer (host) terminal default color, palette batch (1–256 entries), or
   * light/dark appearance so pane applications choose matching colors. Fire-and-forget: Herdr
   * sends no acknowledgement, and an oversized palette is rejected rather than split.
   */
  readonly setHostTheme: (input: ClientShellHostThemeInputEncoded) => Effect.Effect<void, HerdrInvalidInput | HerdrEndpointFailure>;
  /** Reads connection liveness without probing a second socket. */
  readonly connectionState: () => Effect.Effect<"ready" | "closed">;
  /** Waits until the connection fails or its owner closes it, preserving the termination reason. */
  readonly awaitClosed: () => Effect.Effect<never, HerdrEndpointFailure>;
}
/** Client-shell acquisition is lazy; ordinary SDK construction opens no endpoint. @category services @since 0.9.0 */
interface IClientShellService {
  /** Owns a connection for the callback and preserves callback errors and requirements. */
  readonly withConnection: <A, E, R>(input: ClientShellConnectInputEncoded, use: (connection: ClientShellConnection) => Effect.Effect<A, E, R>) => Effect.Effect<A, E | HerdrEndpointConnectError, R>;
  /** Advanced acquisition for callers composing their own scoped resource lifetime. */
  readonly connectScoped: (input: ClientShellConnectInputEncoded) => Effect.Effect<ClientShellConnection, HerdrEndpointConnectError, Scope.Scope>;
  /** Each consumption opens an inactive connection and closes it when consumption ends. */
  readonly projections: (input: ClientShellConnectInputEncoded) => Stream.Stream<ClientShellProjection, HerdrEndpointConnectError>;
}
declare const ClientShellService_base: Context.ServiceClass<ClientShellService, "@herdr/sdk/ClientShellService", IClientShellService>;
/** Yieldable client-shell endpoint capability. @category services @since 0.9.0 */
declare class ClientShellService extends ClientShellService_base {}
/** Constructs lazy endpoint acquisition using the shared API configuration and compatibility gate. @category constructors @since 0.9.0 */
declare const makeClientShellService: Effect.Effect<IClientShellService, never, HerdrConfig | HerdrTransport>;
/** Provides lazy endpoint sessions with visible configuration and API transport dependencies. @category layers @since 0.9.0 */
declare const clientShellServiceLayerWithoutDependencies: Layer.Layer<ClientShellService, never, HerdrConfig | HerdrTransport>;
/** Production client-shell Layer; connections remain lazy and callback/stream owned. @category layers @since 0.9.0 */
declare const clientShellServiceLayer: Layer.Layer<ClientShellService, HerdrConfigurationError, never>;
//#endregion
//#region src/agent-service.d.ts
/**
 * Nested persistent agent-view capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IAgentView {
  /** Activates or updates the foreground agent view. */
  readonly set: (input: AgentViewSetInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<AgentViewState, HerdrTransportRequestError>;
  /** Clears an agent view, optionally only for one source. */
  readonly clear: (input?: AgentViewClearInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<AgentViewState, HerdrTransportRequestError>;
}
/**
 * Agent discovery, control, prompting, waiting, and view capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IAgentService {
  /** Nested persistent agent-view operations. */
  readonly view: IAgentView;
  /** Lists every detected or launched agent. */
  readonly list: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly Agent[], HerdrTransportRequestError>;
  /** Reads one agent by pane or assigned name. */
  readonly get: (target: AgentTargetEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Agent, HerdrTransportRequestError>;
  /** Reads pane output through an agent target. */
  readonly read: (target: AgentTargetEncoded, input: PaneReadInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneReadResult, HerdrTransportRequestError>;
  /** Reads schema-less detection diagnostics for one agent. */
  readonly explain: (target: AgentTargetEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<HerdrJsonValue, HerdrTransportRequestError>;
  /** Sends named keys to one agent. */
  readonly sendKeys: (target: AgentTargetEncoded, keys: HerdrKeySequence, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Assigns or clears one agent name. */
  readonly rename: (target: AgentTargetEncoded, name: AgentName | null, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Agent, HerdrTransportRequestError>;
  /** Focuses one agent. */
  readonly focus: (target: AgentTargetEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Agent, HerdrTransportRequestError>;
  /** Launches one agent. */
  readonly start: (input: AgentStartInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<AgentStartResult, HerdrTransportRequestError>;
  /** Sends a prompt and optional server-owned wait policy. */
  readonly prompt: (target: AgentTargetEncoded, input: AgentPromptInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Agent, HerdrTransportRequestError>;
  /** Waits for one agent to reach a requested status. */
  readonly wait: (target: AgentTargetEncoded, input?: AgentWaitInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Agent, HerdrTransportRequestError>;
}
declare const AgentService_base: Context.ServiceClass<AgentService, "@herdr/sdk/AgentService", IAgentService>;
/**
 * Yieldable Effect service for Herdr agent operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class AgentService extends AgentService_base {}
/**
 * Constructs agent operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeAgentService: Effect.Effect<IAgentService, never, HerdrTransport>;
/**
 * Provides agent operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const agentServiceLayerWithoutDependencies: Layer.Layer<AgentService, never, HerdrTransport>;
/**
 * Production agent-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const agentServiceLayer: Layer.Layer<AgentService, HerdrConfigurationError, never>;
//#endregion
//#region src/client-service.d.ts
/**
 * Foreground window-title operations owned by the client service.
 *
 * @category services
 * @since 0.8.2
 */
interface IClientWindowTitle {
  /** Sets the foreground client's window title. */
  readonly set: (title: string, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<ClientWindowTitleResult, HerdrTransportRequestError>;
  /** Clears the foreground client's window-title override. */
  readonly clear: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<ClientWindowTitleResult, HerdrTransportRequestError>;
}
/**
 * Foreground Herdr client capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IClientService {
  /** Nested foreground window-title operations. */
  readonly windowTitle: IClientWindowTitle;
}
declare const ClientService_base: Context.ServiceClass<ClientService, "@herdr/sdk/ClientService", IClientService>;
/**
 * Yieldable Effect service for foreground Herdr client operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class ClientService extends ClientService_base {}
/**
 * Constructs client operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeClientService: Effect.Effect<IClientService, never, HerdrTransport>;
/**
 * Provides client operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const clientServiceLayerWithoutDependencies: Layer.Layer<ClientService, never, HerdrTransport>;
/**
 * Production client-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const clientServiceLayer: Layer.Layer<ClientService, HerdrConfigurationError, never>;
//#endregion
//#region src/event-service.d.ts
/**
 * Expected failures for subscription and one-shot event operations.
 *
 * @category errors
 * @since 0.8.2
 */
type EventOperationError = HerdrTransportRequestError | HerdrUnsupportedEvent;
/**
 * Expected failures for a live event subscription, including history overrun.
 *
 * @category errors
 * @since 0.9.5
 */
type EventSubscriptionError = EventOperationError | HerdrEventsLost;
/**
 * Typed event subscription and one-shot wait capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IEventService {
  /**
   * Creates a cold, live-only stream whose acceptance defines the event sequence start.
   * Fails with `HerdrEventsLost` when the subscriber falls behind; resubscribe and reconcile
   * with `session.snapshot` rather than replaying buffered events onto a snapshot.
   */
  readonly subscribe: <const Subscriptions extends readonly EventSubscriptionSpecEncoded[]>(subscriptions: Subscriptions, options?: HerdrTransportRequestOptionsEncoded) => Stream.Stream<EventForSubscription<Subscriptions[number]>, EventSubscriptionError>;
  /** Waits for one event and preserves its match-specific result type. */
  readonly wait: <const Match extends EventMatchEncoded>(match: Match, input?: EventWaitInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<EventForMatch<Match>, EventOperationError>;
}
declare const EventService_base: Context.ServiceClass<EventService, "@herdr/sdk/EventService", IEventService>;
/**
 * Yieldable Effect service for Herdr event operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class EventService extends EventService_base {}
/**
 * Constructs event operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeEventService: Effect.Effect<IEventService, never, HerdrTransport>;
/**
 * Provides event operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const eventServiceLayerWithoutDependencies: Layer.Layer<EventService, never, HerdrTransport>;
/**
 * Production event-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const eventServiceLayer: Layer.Layer<EventService, HerdrConfigurationError, never>;
//#endregion
//#region src/integration-service.d.ts
/** Installation freshness reported by Herdr, independent of executable availability. @category schemas @since 0.9.0 */
declare const IntegrationState: Schema.Union<readonly [Schema.decodeTo<Schema.Literal<"notInstalled">, Schema.Literal<"not_installed">, never, never>, Schema.Literal<"current">, Schema.Literal<"outdated">]>;
/** Parsed integration installation state. @category models @since 0.9.0 */
type IntegrationState = typeof IntegrationState.Type;
/** Discovered integration executable and installation state. @category schemas @since 0.9.0 */
declare const IntegrationInfo: Schema.Struct<{
  readonly target: Schema.Literals<readonly ["pi", "omp", "claude", "codex", "copilot", "devin", "droid", "kimi", "opencode", "kilo", "hermes", "qodercli", "cursor", "mastracode", "grok", "qwen", "antigravity_cli"]>;
  readonly label: Schema.String;
  readonly command: Schema.String;
  readonly available: Schema.Boolean;
  readonly state: Schema.Union<readonly [Schema.decodeTo<Schema.Literal<"notInstalled">, Schema.Literal<"not_installed">, never, never>, Schema.Literal<"current">, Schema.Literal<"outdated">]>;
}>;
/** One integration discovered by the server. @category models @since 0.9.0 */
interface IntegrationInfo extends Schema.Schema.Type<typeof IntegrationInfo> {}
/**
 * Built-in integration installation and removal capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IIntegrationService {
  /** Lists available executables and integration installation freshness. */
  readonly list: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly IntegrationInfo[], HerdrTransportRequestError>;
  /** Installs one built-in terminal-agent integration. */
  readonly install: (target: IntegrationTarget, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<IntegrationChangeResult, HerdrTransportRequestError>;
  /** Removes one built-in terminal-agent integration. */
  readonly uninstall: (target: IntegrationTarget, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<IntegrationChangeResult, HerdrTransportRequestError>;
}
declare const IntegrationService_base: Context.ServiceClass<IntegrationService, "@herdr/sdk/IntegrationService", IIntegrationService>;
/**
 * Yieldable Effect service for Herdr integrations.
 *
 * @category services
 * @since 0.8.2
 */
declare class IntegrationService extends IntegrationService_base {}
/**
 * Constructs integration operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeIntegrationService: Effect.Effect<IIntegrationService, never, HerdrTransport>;
/**
 * Provides integrations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const integrationServiceLayerWithoutDependencies: Layer.Layer<IntegrationService, never, HerdrTransport>;
/**
 * Production integration-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const integrationServiceLayer: Layer.Layer<IntegrationService, HerdrConfigurationError, never>;
//#endregion
//#region src/layout-service.d.ts
/**
 * Declarative layout export, application, and split-ratio capability.
 *
 * @category services
 * @since 0.8.2
 */
interface ILayoutService {
  /** Exports a tab layout selected by tab, pane, or foreground focus. */
  readonly export: (target?: LayoutTargetEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<LayoutDescription, HerdrTransportRequestError>;
  /** Applies a recursive declarative layout. */
  readonly apply: (input: LayoutApplyInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<LayoutDescription, HerdrTransportRequestError>;
  /** Updates one split ratio addressed by a boolean tree path. */
  readonly setSplitRatio: (target: LayoutTargetEncoded | undefined, input: LayoutSetSplitRatioInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<LayoutDescription, HerdrTransportRequestError>;
}
declare const LayoutService_base: Context.ServiceClass<LayoutService, "@herdr/sdk/LayoutService", ILayoutService>;
/**
 * Yieldable Effect service for Herdr declarative layout operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class LayoutService extends LayoutService_base {}
/**
 * Constructs layout operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeLayoutService: Effect.Effect<ILayoutService, never, HerdrTransport>;
/**
 * Provides layout operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const layoutServiceLayerWithoutDependencies: Layer.Layer<LayoutService, never, HerdrTransport>;
/**
 * Production layout-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const layoutServiceLayer: Layer.Layer<LayoutService, HerdrConfigurationError, never>;
//#endregion
//#region src/notification-service.d.ts
/**
 * Foreground notification capability.
 *
 * @category services
 * @since 0.8.2
 */
interface INotificationService {
  /** Shows a notification through the active foreground Herdr client. */
  readonly show: (input: NotificationShowInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<NotificationShowResult, HerdrTransportRequestError>;
}
declare const NotificationService_base: Context.ServiceClass<NotificationService, "@herdr/sdk/NotificationService", INotificationService>;
/**
 * Yieldable Effect service for foreground notifications.
 *
 * @category services
 * @since 0.8.2
 */
declare class NotificationService extends NotificationService_base {}
/**
 * Constructs notification operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeNotificationService: Effect.Effect<INotificationService, never, HerdrTransport>;
/**
 * Provides notifications while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const notificationServiceLayerWithoutDependencies: Layer.Layer<NotificationService, never, HerdrTransport>;
/**
 * Production notification-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const notificationServiceLayer: Layer.Layer<NotificationService, HerdrConfigurationError, never>;
//#endregion
//#region src/herdr-pane-interaction-models.d.ts
/** Content revision guards selection against terminal mutation; distinct from surface revisions. @category schemas @since 0.9.0 */
declare const PaneContentRevision: Schema.brand<Schema.Natural, "PaneContentRevision">;
/** Parsed terminal content revision. @category models @since 0.9.0 */
type PaneContentRevision = typeof PaneContentRevision.Type;
/** Scroll offset measured in rows from the terminal's bottom. @category schemas @since 0.9.0 */
declare const PaneScrollOffset: Schema.brand<Schema.Natural, "PaneScrollOffset">;
/** Parsed scroll offset in rows. @category models @since 0.9.0 */
type PaneScrollOffset = typeof PaneScrollOffset.Type;
/** Absolute terminal text coordinates, not viewport coordinates. @category schemas @since 0.9.0 */
declare const PaneTextPoint: Schema.Struct<{
  readonly row: Schema.Natural;
  readonly col: Schema.Natural;
}>;
/** Absolute terminal text point. @category models @since 0.9.0 */
interface PaneTextPoint extends Schema.Schema.Type<typeof PaneTextPoint> {}
/** Caller-supplied terminal text coordinates. @category inputs @since 0.9.0 */
type PaneTextPointEncoded = typeof PaneTextPoint.Encoded;
/** Terminal text match range returned by copy search. @category schemas @since 0.9.0 */
declare const PaneTextRange: Schema.Struct<{
  readonly start: Schema.Struct<{
    readonly row: Schema.Natural;
    readonly col: Schema.Natural;
  }>;
  readonly end: Schema.Struct<{
    readonly row: Schema.Natural;
    readonly col: Schema.Natural;
  }>;
}>;
/** Terminal text match range. @category models @since 0.9.0 */
interface PaneTextRange extends Schema.Schema.Type<typeof PaneTextRange> {}
/** Caller-supplied previous match range. @category inputs @since 0.9.0 */
type PaneTextRangeEncoded = typeof PaneTextRange.Encoded;
/** Sets a terminal scroll offset; the server clamps it to available history. @category schemas @since 0.9.0 */
declare const PaneScrollInput: Schema.Struct<{
  readonly offsetFromBottom: Schema.brand<Schema.Natural, "PaneScrollOffset">;
}>;
/** Parsed pane scroll input. @category models @since 0.9.0 */
interface PaneScrollInput extends Schema.Schema.Type<typeof PaneScrollInput> {}
/** Caller-supplied scroll offset. @category inputs @since 0.9.0 */
type PaneScrollInputEncoded = typeof PaneScrollInput.Encoded;
/** Reads absolute selection coordinates, optionally rejecting changed content. @category schemas @since 0.9.0 */
declare const PaneSelectionReadInput: Schema.Struct<{
  readonly anchor: Schema.Struct<{
    readonly row: Schema.Natural;
    readonly col: Schema.Natural;
  }>;
  readonly cursor: Schema.Struct<{
    readonly row: Schema.Natural;
    readonly col: Schema.Natural;
  }>;
  readonly contentRevision: Schema.optionalKey<Schema.brand<Schema.Natural, "PaneContentRevision">>;
}>;
/** Parsed pane selection input. @category models @since 0.9.0 */
interface PaneSelectionReadInput extends Schema.Schema.Type<typeof PaneSelectionReadInput> {}
/** Caller-supplied selection coordinates and optional revision. @category inputs @since 0.9.0 */
type PaneSelectionReadInputEncoded = typeof PaneSelectionReadInput.Encoded;
/** Selected text returned without changing the system clipboard. @category schemas @since 0.9.0 */
declare const PaneSelectionResult: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly text: Schema.String;
}>, {
  readonly paneId: "pane_id";
}>;
/** Selected terminal text. @category models @since 0.9.0 */
interface PaneSelectionResult extends Schema.Schema.Type<typeof PaneSelectionResult> {}
/** Navigation motion evaluated against server-owned terminal text. @category schemas @since 0.9.0 */
declare const PaneCopyMotion: Schema.Literals<readonly ["lineEnd", "firstNonBlank", "nextWordStart", "previousWordStart", "nextWordEnd", "nextBigWordStart", "previousBigWordStart", "nextBigWordEnd", "previousParagraph", "nextParagraph"]>;
/** Supported terminal copy motion. @category models @since 0.9.0 */
type PaneCopyMotion = typeof PaneCopyMotion.Type;
/** Calculates a cursor target without typing terminal input. @category schemas @since 0.9.0 */
declare const PaneCopyMotionInput: Schema.Struct<{
  readonly cursor: Schema.Struct<{
    readonly row: Schema.Natural;
    readonly col: Schema.Natural;
  }>;
  readonly motion: Schema.Literals<readonly ["lineEnd", "firstNonBlank", "nextWordStart", "previousWordStart", "nextWordEnd", "nextBigWordStart", "previousBigWordStart", "nextBigWordEnd", "previousParagraph", "nextParagraph"]>;
  readonly contentRevision: Schema.optionalKey<Schema.brand<Schema.Natural, "PaneContentRevision">>;
}>;
/** Parsed copy motion request. @category models @since 0.9.0 */
interface PaneCopyMotionInput extends Schema.Schema.Type<typeof PaneCopyMotionInput> {}
/** Caller-supplied copy motion request. @category inputs @since 0.9.0 */
type PaneCopyMotionInputEncoded = typeof PaneCopyMotionInput.Encoded;
/** Cursor and content revision observed by copy motion. @category schemas @since 0.9.0 */
declare const PaneCopyMotionResult: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly cursor: Schema.Struct<{
    readonly row: Schema.Natural;
    readonly col: Schema.Natural;
  }>;
  readonly contentRevision: Schema.brand<Schema.Natural, "PaneContentRevision">;
}>, {
  readonly paneId: "pane_id";
  readonly contentRevision: "content_revision";
}>;
/** Copy motion result. @category models @since 0.9.0 */
interface PaneCopyMotionResult extends Schema.Schema.Type<typeof PaneCopyMotionResult> {}
/** Search against an exact content revision; the query is at most 4096 UTF-8 bytes. @category schemas @since 0.9.0 */
declare const PaneCopySearchInput: Schema.Struct<{
  readonly query: Schema.String;
  readonly direction: Schema.Literals<readonly ["forward", "backward"]>;
  readonly cursor: Schema.Struct<{
    readonly row: Schema.Natural;
    readonly col: Schema.Natural;
  }>;
  readonly contentRevision: Schema.brand<Schema.Natural, "PaneContentRevision">;
  readonly previous: Schema.optionalKey<Schema.Struct<{
    readonly start: Schema.Struct<{
      readonly row: Schema.Natural;
      readonly col: Schema.Natural;
    }>;
    readonly end: Schema.Struct<{
      readonly row: Schema.Natural;
      readonly col: Schema.Natural;
    }>;
  }>>;
}>;
/** Parsed pane copy search request. @category models @since 0.9.0 */
interface PaneCopySearchInput extends Schema.Schema.Type<typeof PaneCopySearchInput> {}
/** Caller-supplied pane copy search request. @category inputs @since 0.9.0 */
type PaneCopySearchInputEncoded = typeof PaneCopySearchInput.Encoded;
/** Bounded match window; total may exceed the returned range count. @category schemas @since 0.9.0 */
declare const PaneCopySearchResult: Schema.encodeKeys<Schema.Struct<{
  readonly paneId: Schema.brand<Schema.NonEmptyString, "PaneId">;
  readonly contentRevision: Schema.brand<Schema.Natural, "PaneContentRevision">;
  readonly matches: Schema.$Array<Schema.Struct<{
    readonly start: Schema.Struct<{
      readonly row: Schema.Natural;
      readonly col: Schema.Natural;
    }>;
    readonly end: Schema.Struct<{
      readonly row: Schema.Natural;
      readonly col: Schema.Natural;
    }>;
  }>>;
  readonly total: Schema.Natural;
  readonly current: Schema.OptionFromOptionalKey<Schema.Natural>;
  readonly currentGlobal: Schema.OptionFromOptionalKey<Schema.Natural>;
}>, {
  readonly paneId: "pane_id";
  readonly contentRevision: "content_revision";
  readonly currentGlobal: "current_global";
}>;
/** Copy search match window and total count. @category models @since 0.9.0 */
interface PaneCopySearchResult extends Schema.Schema.Type<typeof PaneCopySearchResult> {}
/** Activates a visible pane link with optional content and viewport guards. @category schemas @since 0.9.0 */
declare const PaneLinkActivateInput: Schema.Struct<{
  readonly viewportRow: Schema.Natural;
  readonly col: Schema.Natural;
  readonly contentRevision: Schema.optionalKey<Schema.brand<Schema.Natural, "PaneContentRevision">>;
  readonly offsetFromBottom: Schema.optionalKey<Schema.brand<Schema.Natural, "PaneScrollOffset">>;
}>;
/** Parsed visible-link activation. @category models @since 0.9.0 */
interface PaneLinkActivateInput extends Schema.Schema.Type<typeof PaneLinkActivateInput> {}
/** Caller-supplied link activation coordinates. @category inputs @since 0.9.0 */
type PaneLinkActivateInputEncoded = typeof PaneLinkActivateInput.Encoded;
/** Resolves the visible link under a viewport cell with the same guards as activation; has no side effects. @category schemas @since 0.9.5 */
declare const PaneLinkResolveInput: Schema.Struct<{
  readonly viewportRow: Schema.Natural;
  readonly col: Schema.Natural;
  readonly contentRevision: Schema.optionalKey<Schema.brand<Schema.Natural, "PaneContentRevision">>;
  readonly offsetFromBottom: Schema.optionalKey<Schema.brand<Schema.Natural, "PaneScrollOffset">>;
}>;
/** Parsed visible-link resolution. @category models @since 0.9.5 */
interface PaneLinkResolveInput extends Schema.Schema.Type<typeof PaneLinkResolveInput> {}
/** Caller-supplied link resolution coordinates. @category inputs @since 0.9.5 */
type PaneLinkResolveInputEncoded = typeof PaneLinkResolveInput.Encoded;
/** One viewport row's inclusive display-cell column span covered by a link. @category schemas @since 0.9.5 */
declare const PaneLinkRegion: Schema.encodeKeys<Schema.Struct<{
  readonly row: Schema.Natural;
  readonly startCol: Schema.Natural;
  readonly endCol: Schema.Natural;
}>, {
  readonly startCol: "start_col";
  readonly endCol: "end_col";
}>;
/** Viewport cells covered by a resolved link. @category models @since 0.9.5 */
interface PaneLinkRegion extends Schema.Schema.Type<typeof PaneLinkRegion> {}
/** Regions of the link under the requested cell; empty when no link is there. Wrapped links span several rows. @category schemas @since 0.9.5 */
declare const PaneLinkResolvedResult: Schema.Struct<{
  readonly regions: Schema.$Array<Schema.encodeKeys<Schema.Struct<{
    readonly row: Schema.Natural;
    readonly startCol: Schema.Natural;
    readonly endCol: Schema.Natural;
  }>, {
    readonly startCol: "start_col";
    readonly endCol: "end_col";
  }>>;
}>;
/** Visible-link resolution result. @category models @since 0.9.5 */
interface PaneLinkResolvedResult extends Schema.Schema.Type<typeof PaneLinkResolvedResult> {}
/** Plugin handling result; an unhandled URL does not mean a browser was opened. @category schemas @since 0.9.0 */
declare const PaneLinkActivatedResult: Schema.Struct<{
  readonly url: Schema.OptionFromOptionalKey<Schema.String>;
  readonly handled: Schema.Boolean;
}>;
/** Visible-link activation result. @category models @since 0.9.0 */
interface PaneLinkActivatedResult extends Schema.Schema.Type<typeof PaneLinkActivatedResult> {}
//#endregion
//#region src/pane-interaction.d.ts
/** PaneService's text navigation, screen clearing, and visible-link capability. @category services @since 0.9.0 */
interface IPaneInteraction {
  /** Clears the pane's screen and scrollback, keeping the current prompt line; full-screen apps are left alone. */
  readonly clear: (id: PaneId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Scrolls the server terminal and returns its pane information. */
  readonly scroll: (id: PaneId, input: PaneScrollInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Pane, HerdrTransportRequestError>;
  /** Opens the focused pane's scrollback in its configured editor; never focuses implicitly. */
  readonly editScrollback: (id: PaneId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Absolute selection reads do not change the system clipboard. */
  readonly selection: {
    /** Reads terminal selection text; stale revisions are not retried. */
    readonly read: (id: PaneId, input: PaneSelectionReadInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneSelectionResult, HerdrTransportRequestError>;
  };
  /** Calculates a copy-mode cursor without sending input. */
  readonly copyMotion: (id: PaneId, input: PaneCopyMotionInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneCopyMotionResult, HerdrTransportRequestError>;
  /** Searches an exact revision; total can exceed the bounded match window. */
  readonly copySearch: (id: PaneId, input: PaneCopySearchInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneCopySearchResult, HerdrTransportRequestError>;
  /** Visible-link resolution and plugin activation. */
  readonly link: {
    /** Reports the viewport cells covered by the link under a cell without activating it. */
    readonly resolve: (id: PaneId, input: PaneLinkResolveInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneLinkResolvedResult, HerdrTransportRequestError>;
    /** Invokes a matching plugin link handler; does not open a browser. */
    readonly activate: (id: PaneId, input: PaneLinkActivateInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneLinkActivatedResult, HerdrTransportRequestError>;
  };
}
//#endregion
//#region src/pane-service.d.ts
/**
 * Pane lifecycle, geometry, I/O, and reporting capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IPaneService extends IPaneInteraction {
  /** Splits a pane or the focused pane. */
  readonly split: (targetPaneId: PaneId | undefined, input: PaneSplitInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Pane, HerdrTransportRequestError>;
  /** Swaps panes by direction or explicit identifiers. */
  readonly swap: (input: PaneSwapInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneSwapResult, HerdrTransportRequestError>;
  /** Moves one pane to another tab or a new container. */
  readonly move: (paneId: PaneId, input: PaneMoveInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneMoveResult, HerdrTransportRequestError>;
  /** Changes pane zoom state. */
  readonly zoom: (paneId?: PaneId, input?: PaneZoomInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneZoomResult, HerdrTransportRequestError>;
  /** Reads the layout containing a pane or the focused pane. */
  readonly layout: (paneId?: PaneId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneLayoutSnapshot, HerdrTransportRequestError>;
  /** Reads process information for a pane or the focused pane. */
  readonly processInfo: (paneId?: PaneId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneProcessInfo, HerdrTransportRequestError>;
  /** Finds a pane neighbor. */
  readonly neighbor: (paneId: PaneId | undefined, direction: PaneDirection, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneNeighborResult, HerdrTransportRequestError>;
  /** Reads which layout edges contain a pane. */
  readonly edges: (paneId?: PaneId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneEdgesResult, HerdrTransportRequestError>;
  /** Focuses a pane in one direction. */
  readonly focusDirection: (direction: PaneDirection, input?: PaneFocusDirectionInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneFocusDirectionResult, HerdrTransportRequestError>;
  /** Resizes a pane in one direction. */
  readonly resize: (direction: PaneDirection, input?: PaneResizeInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneResizeResult, HerdrTransportRequestError>;
  /** Lists panes, optionally within a workspace. */
  readonly list: (input?: PaneListInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly Pane[], HerdrTransportRequestError>;
  /** Resolves the current pane for a caller or foreground client. */
  readonly current: (input?: PaneCurrentInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Pane, HerdrTransportRequestError>;
  /** Reads one pane. */
  readonly get: (id: PaneId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Pane, HerdrTransportRequestError>;
  /** Focuses one pane. */
  readonly focus: (id: PaneId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Pane, HerdrTransportRequestError>;
  /** Replaces or clears a pane label. */
  readonly rename: (id: PaneId, label: string | null, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Pane, HerdrTransportRequestError>;
  /** Selects whether right-click input is handled by Herdr or the pane application. */
  readonly setInputRouting: (id: PaneId, input: PaneInputRoutingInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Sends literal text to one pane. */
  readonly sendText: (id: PaneId, text: string, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Sends named keys to one pane. */
  readonly sendKeys: (id: PaneId, keys: HerdrKeySequence, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Sends combined text and key input to one pane. */
  readonly sendInput: (id: PaneId, input: PaneInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Reads pane output. */
  readonly read: (id: PaneId, input: PaneReadInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneReadResult, HerdrTransportRequestError>;
  /** Waits for matching pane output. */
  readonly waitForOutput: (id: PaneId, input: PaneWaitForOutputInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PaneOutputMatchResult, HerdrTransportRequestError>;
  /** Reports an agent state for one pane. */
  readonly reportAgent: (id: PaneId, input: PaneAgentReportInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Reports an agent session for one pane. */
  readonly reportAgentSession: (id: PaneId, input: PaneAgentSessionReportInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Reports pane labels and metadata tokens. */
  readonly reportMetadata: (id: PaneId, input: PaneMetadataReportInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Clears agent-report authority for one pane. */
  readonly clearAgentAuthority: (id: PaneId, input?: PaneClearAgentAuthorityInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Releases one agent report. */
  readonly releaseAgent: (id: PaneId, input: PaneReleaseAgentInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
  /** Closes one pane. */
  readonly close: (id: PaneId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
}
declare const PaneService_base: Context.ServiceClass<PaneService, "@herdr/sdk/PaneService", IPaneService>;
/**
 * Yieldable Effect service for Herdr pane operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class PaneService extends PaneService_base {}
/**
 * Constructs pane operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makePaneService: Effect.Effect<IPaneService, never, HerdrTransport>;
/**
 * Provides pane operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const paneServiceLayerWithoutDependencies: Layer.Layer<PaneService, never, HerdrTransport>;
/**
 * Production pane-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const paneServiceLayer: Layer.Layer<PaneService, HerdrConfigurationError, never>;
//#endregion
//#region src/plugin-service.d.ts
/**
 * Nested plugin action capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IPluginActions {
  /** Lists actions, optionally for one plugin. */
  readonly list: (input?: PluginFilterInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly PluginAction[], HerdrTransportRequestError>;
  /** Invokes one qualified or plugin-scoped action. */
  readonly invoke: (id: PluginActionId, input?: PluginActionInvokeInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PluginActionInvocation, HerdrTransportRequestError>;
}
/**
 * Nested plugin command-log capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IPluginLogs {
  /** Lists recent plugin command logs. */
  readonly list: (input?: PluginLogListInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly PluginCommandLog[], HerdrTransportRequestError>;
}
/**
 * Nested plugin pane capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IPluginPanes {
  /** Opens a popup plugin pane without a persistent pane identifier. */
  readonly open: {
    (pluginId: PluginId, input: PluginPaneOpenInputEncoded & {
      readonly placement: "popup";
    }, options?: HerdrTransportRequestOptionsEncoded): Effect.Effect<void, HerdrTransportRequestError>;
    (pluginId: PluginId, input: PluginPaneOpenInputEncoded & {
      readonly placement: "overlay" | "split" | "tab" | "zoomed";
    }, options?: HerdrTransportRequestOptionsEncoded): Effect.Effect<PluginPane, HerdrTransportRequestError>;
    (pluginId: PluginId, input: PluginPaneOpenInputEncoded, options?: HerdrTransportRequestOptionsEncoded): Effect.Effect<PluginPane | void, HerdrTransportRequestError>;
  };
  /** Focuses one plugin-owned pane. */
  readonly focus: (paneId: PaneId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PluginPane, HerdrTransportRequestError>;
  /** Closes one plugin-owned pane. */
  readonly close: (paneId: PaneId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PluginPaneCloseResult, HerdrTransportRequestError>;
}
/**
 * Plugin lifecycle plus nested action, log, and pane capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IPluginService {
  /** Nested plugin action operations. */
  readonly actions: IPluginActions;
  /** Nested plugin command-log operations. */
  readonly logs: IPluginLogs;
  /** Nested plugin pane operations. */
  readonly panes: IPluginPanes;
  /** Links a plugin manifest from an absolute path. */
  readonly link: (input: PluginLinkInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<InstalledPlugin, HerdrTransportRequestError>;
  /** Lists installed plugins, optionally selecting one. */
  readonly list: (input?: PluginFilterInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly InstalledPlugin[], HerdrTransportRequestError>;
  /** Unlinks one installed plugin. */
  readonly unlink: (id: PluginId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PluginUnlinkResult, HerdrTransportRequestError>;
  /** Enables one installed plugin. */
  readonly enable: (id: PluginId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<InstalledPlugin, HerdrTransportRequestError>;
  /** Disables one installed plugin. */
  readonly disable: (id: PluginId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<InstalledPlugin, HerdrTransportRequestError>;
}
declare const PluginService_base: Context.ServiceClass<PluginService, "@herdr/sdk/PluginService", IPluginService>;
/**
 * Yieldable Effect service for Herdr plugin operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class PluginService extends PluginService_base {}
/**
 * Constructs plugin operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makePluginService: Effect.Effect<IPluginService, never, HerdrTransport>;
/**
 * Provides plugin operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const pluginServiceLayerWithoutDependencies: Layer.Layer<PluginService, never, HerdrTransport>;
/**
 * Production plugin-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const pluginServiceLayer: Layer.Layer<PluginService, HerdrConfigurationError, never>;
//#endregion
//#region src/popup-service.d.ts
/**
 * Foreground popup lifecycle capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IPopupService {
  /** Closes the active foreground popup. */
  readonly close: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
}
declare const PopupService_base: Context.ServiceClass<PopupService, "@herdr/sdk/PopupService", IPopupService>;
/**
 * Yieldable Effect service for foreground popup operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class PopupService extends PopupService_base {}
/**
 * Constructs popup operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makePopupService: Effect.Effect<IPopupService, never, HerdrTransport>;
/**
 * Provides popup operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const popupServiceLayerWithoutDependencies: Layer.Layer<PopupService, never, HerdrTransport>;
/**
 * Production popup-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const popupServiceLayer: Layer.Layer<PopupService, HerdrConfigurationError, never>;
//#endregion
//#region src/server-service.d.ts
/**
 * Expected failure union for server lifecycle and compatibility operations.
 *
 * @category errors
 * @since 0.8.2
 */
type ServerOperationError = HerdrTransportRequestError;
/**
 * Failure ending an accepted SSH agent registration before its owner released it.
 *
 * @category errors
 * @since 0.9.5
 */
type ServerSshAgentRegistrationError = HerdrSshAgentRegistrationClosed | HerdrTransportError;
/**
 * Accepted SSH agent registration; Herdr keeps it only while this handle's connection is open.
 *
 * @category services
 * @since 0.9.5
 */
interface ServerSshAgentRegistration {
  /** Wire request identifier of the accepted registration. */
  readonly requestId: string;
  /** Registered agent socket path on the server host. */
  readonly socketPath: HerdrAbsolutePath;
  /** Reads whether the registration connection is still open, without probing the server. */
  readonly registrationState: () => Effect.Effect<"registered" | "closed">;
  /** Waits until Herdr ends the registration, preserving why it ended; never succeeds. */
  readonly awaitClosed: () => Effect.Effect<never, ServerSshAgentRegistrationError>;
}
/**
 * Connection-scoped SSH agent registration behind Herdr's session-local agent address.
 *
 * Herdr rejects sockets that are not absolute and user-owned with `invalid_ssh_agent`, and reports
 * `ssh_agent_unavailable` when this server cannot manage agent forwarding.
 *
 * @category services
 * @since 0.9.5
 */
interface IServerSshAgent {
  /**
   * Registers an agent socket for the callback; releases it on success, failure, and interruption.
   * If Herdr ends the registration first, the callback is interrupted and the closure is returned.
   */
  readonly withRegistration: <A, E, R>(input: ServerSshAgentRegisterInputEncoded, use: (registration: ServerSshAgentRegistration) => Effect.Effect<A, E, R>, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<A, E | ServerOperationError | ServerSshAgentRegistrationError, R>;
  /** Advanced acquisition whose registration lasts until the caller's Scope closes. */
  readonly registerScoped: (input: ServerSshAgentRegisterInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<ServerSshAgentRegistration, ServerOperationError, Scope.Scope>;
}
/**
 * Server lifecycle, compatibility, configuration, and manifest capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IServerService {
  /** Pings the server and verifies protocol compatibility. */
  readonly ping: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<PingResult, ServerOperationError>;
  /** Requests a graceful Herdr server stop. */
  readonly stop: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, ServerOperationError>;
  /** Hands the running server to a compatible executable. */
  readonly liveHandoff: (input?: ServerLiveHandoffInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, ServerOperationError>;
  /** Reloads the running server's configuration. */
  readonly reloadConfig: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<ConfigReloadResult, ServerOperationError>;
  /** Reads the current agent-manifest cache status. */
  readonly getAgentManifests: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<AgentManifestStatus, ServerOperationError>;
  /** Refreshes agent manifests and returns the resulting set. */
  readonly reloadAgentManifests: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly AgentManifest[], ServerOperationError>;
  /** Connection-scoped SSH agent registration; check `ping` capabilities for `sshAgentRegistration`. */
  readonly sshAgent: IServerSshAgent;
}
declare const ServerService_base: Context.ServiceClass<ServerService, "@herdr/sdk/ServerService", IServerService>;
/**
 * Yieldable Effect service for Herdr server operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class ServerService extends ServerService_base {}
/**
 * Constructs server operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeServerService: Effect.Effect<IServerService, never, HerdrTransport>;
/**
 * Provides server operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const serverServiceLayerWithoutDependencies: Layer.Layer<ServerService, never, HerdrTransport>;
/**
 * Production server-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const serverServiceLayer: Layer.Layer<ServerService, HerdrConfigurationError, never>;
//#endregion
//#region src/session-service.d.ts
/**
 * Session snapshot capability.
 *
 * @category services
 * @since 0.8.2
 */
interface ISessionService {
  /** Reads one consistent snapshot of all session resources. */
  readonly snapshot: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<SessionSnapshot, HerdrTransportRequestError>;
}
declare const SessionService_base: Context.ServiceClass<SessionService, "@herdr/sdk/SessionService", ISessionService>;
/**
 * Yieldable Effect service for Herdr session operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class SessionService extends SessionService_base {}
/**
 * Constructs session operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeSessionService: Effect.Effect<ISessionService, never, HerdrTransport>;
/**
 * Provides session operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const sessionServiceLayerWithoutDependencies: Layer.Layer<SessionService, never, HerdrTransport>;
/**
 * Production session-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const sessionServiceLayer: Layer.Layer<SessionService, HerdrConfigurationError, never>;
//#endregion
//#region src/tab-service.d.ts
/**
 * Tab lifecycle, ordering, and focus capability.
 *
 * @category services
 * @since 0.8.2
 */
interface ITabService {
  /** Creates a tab and root pane. */
  readonly create: (input?: TabCreateInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<TabCreateResult, HerdrTransportRequestError>;
  /** Lists tabs, optionally within one workspace. */
  readonly list: (input?: TabListInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly Tab[], HerdrTransportRequestError>;
  /** Reads one tab. */
  readonly get: (id: TabId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Tab, HerdrTransportRequestError>;
  /** Focuses one tab. */
  readonly focus: (id: TabId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Tab, HerdrTransportRequestError>;
  /** Renames one tab. */
  readonly rename: (id: TabId, label: string, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Tab, HerdrTransportRequestError>;
  /** Moves one tab to an insertion index. */
  readonly move: (id: TabId, input: TabMoveInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly Tab[], HerdrTransportRequestError>;
  /** Closes one tab. */
  readonly close: (id: TabId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, HerdrTransportRequestError>;
}
declare const TabService_base: Context.ServiceClass<TabService, "@herdr/sdk/TabService", ITabService>;
/**
 * Yieldable Effect service for Herdr tab operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class TabService extends TabService_base {}
/**
 * Constructs tab operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeTabService: Effect.Effect<ITabService, never, HerdrTransport>;
/**
 * Provides tab operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const tabServiceLayerWithoutDependencies: Layer.Layer<TabService, never, HerdrTransport>;
/**
 * Production tab-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const tabServiceLayer: Layer.Layer<TabService, HerdrConfigurationError, never>;
//#endregion
//#region src/workspace-service.d.ts
/**
 * Expected failure union for workspace protocol operations.
 *
 * @category errors
 * @since 0.8.2
 */
type WorkspaceOperationError = HerdrTransportRequestError;
/**
 * Workspace lifecycle, ordering, focus, and metadata capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IWorkspaceService {
  /** Creates a workspace and its initial tab and root pane. */
  readonly create: (input?: WorkspaceCreateOptionsEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<WorkspaceCreateResult, WorkspaceOperationError>;
  /** Creates a workspace in an explicit absolute directory. */
  readonly createInDirectory: (cwd: string, input?: WorkspaceCreateOptionsEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<WorkspaceCreateResult, WorkspaceOperationError>;
  /** Uses another workspace's directory policy; does not clone its layout or session. */
  readonly createFromWorkspace: (sourceWorkspaceId: WorkspaceId, input?: WorkspaceCreateOptionsEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<WorkspaceCreateResult, WorkspaceOperationError>;
  /** Lists workspaces in Herdr display order. */
  readonly list: (options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly Workspace[], WorkspaceOperationError>;
  /** Reads one workspace by its parsed identifier. */
  readonly get: (id: WorkspaceId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Workspace, WorkspaceOperationError>;
  /** Focuses one workspace and returns its updated state. */
  readonly focus: (id: WorkspaceId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Workspace, WorkspaceOperationError>;
  /** Renames one workspace. */
  readonly rename: (id: WorkspaceId, label: string, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<Workspace, WorkspaceOperationError>;
  /** Moves one workspace to an insertion index. */
  readonly move: (id: WorkspaceId, input: WorkspaceMoveInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly Workspace[], WorkspaceOperationError>;
  /** Moves a contiguous workspace block before an optional anchor. */
  readonly moveBlock: (ids: readonly WorkspaceId[], input?: WorkspaceMoveBlockInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<readonly Workspace[], WorkspaceOperationError>;
  /** Reports replace-or-remove metadata tokens for one workspace. */
  readonly reportMetadata: (id: WorkspaceId, input: WorkspaceMetadataReportInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, WorkspaceOperationError>;
  /** Closes one workspace. */
  readonly close: (id: WorkspaceId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, WorkspaceOperationError>;
  /** Closes the selected workspace and every workspace in its group. */
  readonly closeGroup: (id: WorkspaceId, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<void, WorkspaceOperationError>;
}
declare const WorkspaceService_base: Context.ServiceClass<WorkspaceService, "@herdr/sdk/WorkspaceService", IWorkspaceService>;
/**
 * Yieldable Effect service for Herdr workspace operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class WorkspaceService extends WorkspaceService_base {}
/**
 * Constructs workspace operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeWorkspaceService: Effect.Effect<IWorkspaceService, never, HerdrTransport>;
/**
 * Provides workspace operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const workspaceServiceLayerWithoutDependencies: Layer.Layer<WorkspaceService, never, HerdrTransport>;
/**
 * Production workspace-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const workspaceServiceLayer: Layer.Layer<WorkspaceService, HerdrConfigurationError, never>;
//#endregion
//#region src/worktree-service.d.ts
/**
 * Git worktree discovery, creation, opening, and removal capability.
 *
 * @category services
 * @since 0.8.2
 */
interface IWorktreeService {
  /** Lists worktrees in a resolved repository. */
  readonly list: (input?: WorktreeListInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<WorktreeListResult, HerdrTransportRequestError>;
  /** Creates a worktree and opens it in a new workspace. */
  readonly create: (input?: WorktreeCreateInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<WorktreeCreateResult, HerdrTransportRequestError>;
  /** Opens an existing worktree by path or branch. */
  readonly open: (input: WorktreeOpenInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<WorktreeOpenResult, HerdrTransportRequestError>;
  /** Closes a workspace and removes its linked worktree. */
  readonly remove: (workspaceId: WorkspaceId, input?: WorktreeRemoveInputEncoded, options?: HerdrTransportRequestOptionsEncoded) => Effect.Effect<WorktreeRemoveResult, HerdrTransportRequestError>;
}
declare const WorktreeService_base: Context.ServiceClass<WorktreeService, "@herdr/sdk/WorktreeService", IWorktreeService>;
/**
 * Yieldable Effect service for Git worktree operations.
 *
 * @category services
 * @since 0.8.2
 */
declare class WorktreeService extends WorktreeService_base {}
/**
 * Constructs worktree operations while preserving the shared transport requirement.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeWorktreeService: Effect.Effect<IWorktreeService, never, HerdrTransport>;
/**
 * Provides worktree operations while retaining the shared transport requirement.
 *
 * @category layers
 * @since 0.8.2
 */
declare const worktreeServiceLayerWithoutDependencies: Layer.Layer<WorktreeService, never, HerdrTransport>;
/**
 * Production worktree-service Layer using the ambient Herdr transport graph.
 *
 * @category layers
 * @since 0.8.2
 */
declare const worktreeServiceLayer: Layer.Layer<WorktreeService, HerdrConfigurationError, never>;
//#endregion
//#region src/herdr-sdk.d.ts
/**
 * Stripe-style aggregate of the exact Herdr configuration and namespace services.
 *
 * @category services
 * @since 0.8.2
 */
interface IHerdrSdk {
  /** Callback-owned client-shell endpoint sessions; no connection is opened at SDK construction. */
  readonly clientShell: IClientShellService;
  /** Executes opaque custom commands with explicit target intent. */
  readonly commands: ICommandService;
  /** Dismisses current endpoint announcements. */
  readonly productAnnouncements: IProductAnnouncementService;
  /** Marks current endpoint release notes seen. */
  readonly releaseNotes: IReleaseNotesService;
  /** Immutable configuration snapshot shared by the full SDK graph. */
  readonly config: IHerdrConfig;
  /** Pure schema-owned identifier constructors. */
  readonly ids: IHerdrIds;
  /** Server lifecycle, compatibility, and SSH agent registration operations. */
  readonly server: IServerService;
  /** Session snapshot operations. */
  readonly session: ISessionService;
  /** Foreground notification operations. */
  readonly notifications: INotificationService;
  /** Foreground client operations. */
  readonly client: IClientService;
  /** Workspace operations. */
  readonly workspaces: IWorkspaceService;
  /** Git worktree operations. */
  readonly worktrees: IWorktreeService;
  /** Tab operations. */
  readonly tabs: ITabService;
  /** Pane lifecycle, terminal I/O, and interaction operations. */
  readonly panes: IPaneService;
  /** Declarative layout operations. */
  readonly layouts: ILayoutService;
  /** Agent and nested view operations. */
  readonly agents: IAgentService;
  /** Event stream and wait operations. */
  readonly events: IEventService;
  /** Built-in integration operations. */
  readonly integrations: IIntegrationService;
  /** Plugin and nested plugin-resource operations. */
  readonly plugins: IPluginService;
  /** Foreground popup operations. */
  readonly popups: IPopupService;
}
declare const HerdrSdk_base: Context.ServiceClass<HerdrSdk, "@herdr/sdk/HerdrSdk", IHerdrSdk>;
/**
 * Yieldable Effect service aggregating the independently constructed Herdr namespaces.
 *
 * @category services
 * @since 0.8.2
 */
declare class HerdrSdk extends HerdrSdk_base {}
/**
 * Aggregates exact contextual service values without constructing or proxying them.
 *
 * @category constructors
 * @since 0.8.2
 */
declare const makeHerdrSdk: Effect.Effect<IHerdrSdk, never, AgentService | ClientService | ClientShellService | CommandService | EventService | HerdrConfig | IntegrationService | LayoutService | NotificationService | PaneService | PluginService | PopupService | ProductAnnouncementService | ReleaseNotesService | ServerService | SessionService | TabService | WorkspaceService | WorktreeService>;
/**
 * Bundles Herdr namespace services while preserving their requirements.
 *
 * @category layers
 * @since 0.8.2
 */
declare const herdrSdkLayerWithoutDependencies: Layer.Layer<HerdrSdk, never, AgentService | ClientService | ClientShellService | CommandService | EventService | HerdrConfig | IntegrationService | LayoutService | NotificationService | PaneService | PluginService | PopupService | ProductAnnouncementService | ReleaseNotesService | ServerService | SessionService | TabService | WorkspaceService | WorktreeService>;
/**
 * Production SDK Layer sharing one ambient configuration and transport instance.
 *
 * @category layers
 * @since 0.8.2
 */
declare const herdrSdkLayer: Layer.Layer<HerdrSdk, HerdrConfigurationError, never>;
/**
 * Creates a production SDK Layer with explicit options ahead of ambient configuration.
 *
 * @category layers
 * @since 0.8.2
 */
declare function herdrSdkLayerFromOptions(options: HerdrConfigOptions): Layer.Layer<HerdrSdk, HerdrConfigurationError>;
//#endregion
export { Agent, AgentManifest, AgentManifestStatus, AgentName, AgentPromptInput, AgentPromptInputEncoded, AgentService, AgentSessionReference, AgentSessionReferenceKind, AgentStartInput, AgentStartInputEncoded, AgentStartResult, AgentStatus, AgentTarget, AgentTargetEncoded, AgentViewClearInput, AgentViewClearInputEncoded, AgentViewField, AgentViewFilter, AgentViewSetInput, AgentViewSetInputEncoded, AgentViewSort, AgentViewSortField, AgentViewState, AgentViewValue, AgentWaitInput, AgentWaitInputEncoded, CLIENT_SHELL_HOST_PALETTE_MAX_ENTRIES, ClientService, ClientShellAgent, ClientShellAgentCompletions, ClientShellAgentView, ClientShellAgentViewEncoded, ClientShellAgentViewProjection, ClientShellCell, ClientShellCommand, ClientShellCommandAction, ClientShellConnectInput, ClientShellConnectInputEncoded, ClientShellConnection, ClientShellCursor, ClientShellFrame, ClientShellGraphicsAssetKey, ClientShellGraphicsScene, ClientShellHostColor, ClientShellHostColorEncoded, ClientShellHostThemeInput, ClientShellHostThemeInputEncoded, ClientShellKeyCode, ClientShellKeyInput, ClientShellKeyInputEncoded, ClientShellMouseAction, ClientShellMouseInput, ClientShellMouseInputEncoded, ClientShellMousePosition, ClientShellOperationError, ClientShellPane, ClientShellPopupSurface, ClientShellPresentationEvent, ClientShellProductAnnouncement, ClientShellProjection, ClientShellReleaseNotes, ClientShellService, ClientShellSurface, ClientShellSurfaceAcknowledgement, ClientShellSurfacePane, ClientShellSurfacePatch, ClientShellSurfaceSplit, ClientShellSurfaceState, ClientShellTab, ClientShellWindowsKeyRecord, ClientShellWorkspace, ClientShellWorktree, ClientWindowTitleResult, CommandPaneInput, CommandPaneInputEncoded, CommandService, CommandTabInput, CommandTabInputEncoded, ConfigReloadResult, EndpointBootId, EventForMatch, EventForSubscription, EventMatch, EventMatchEncoded, EventOperationError, EventService, EventSubscriptionError, EventSubscriptionSpec, EventSubscriptionSpecEncoded, EventWaitInput, EventWaitInputEncoded, HerdrAbsolutePath, HerdrApplication, HerdrCommandId, HerdrConfig, HerdrConfigOptions, HerdrConfigurationError, HerdrEndpointClosed, HerdrEndpointConnectError, HerdrEndpointFailure, HerdrEndpointInvalidMessage, HerdrEndpointNegotiationError, HerdrEndpointRequestTimeout, HerdrEndpointStaleReference, HerdrEndpointTransportError, HerdrEndpointUnsupportedMethod, HerdrEnvironment, HerdrEvent, HerdrEventsLost, HerdrInsertIndex, HerdrInvalidInput, HerdrInvalidResponse, HerdrJsonValue, HerdrKeySequence, HerdrMetadataTokenPatch, HerdrMetadataTokens, HerdrMetadataTtl, HerdrMilliseconds, HerdrPopupSize, HerdrProtocolVersion, HerdrRequestDeadline, HerdrRequestTimeout, HerdrResumeArgv, HerdrRevision, HerdrSdk, HerdrServerError, HerdrSessionName, HerdrSplitRatio, HerdrSshAgentRegistrationClosed, HerdrStateChangeSequence, type HerdrStreamWireMethod, HerdrTransport, HerdrTransportError, type HerdrTransportMethodError, type HerdrTransportRequestError, HerdrTransportRequestOptions, type HerdrTransportRequestOptionsEncoded, HerdrUnixMilliseconds, HerdrUnixSeconds, HerdrUnsupportedEvent, HerdrUnsupportedProtocol, HerdrUnsupportedResult, IAgentService, IAgentView, IClientService, IClientShellService, IClientWindowTitle, ICommandService, IEventService, IHerdrConfig, IHerdrIds, IHerdrSdk, IIntegrationService, ILayoutService, INotificationService, type IPaneInteraction, IPaneService, IPluginActions, IPluginLogs, IPluginPanes, IPluginService, IPopupService, IProductAnnouncementService, IReleaseNotesService, IServerService, IServerSshAgent, ISessionService, ITabService, IWorkspaceService, IWorktreeService, InstalledPlugin, IntegrationChangeResult, IntegrationInfo, IntegrationService, IntegrationState, IntegrationTarget, LayoutApplyInput, LayoutApplyInputEncoded, LayoutDescription, LayoutNode, LayoutService, LayoutSetSplitRatioInput, LayoutSetSplitRatioInputEncoded, LayoutTarget, LayoutTargetEncoded, LifecycleSubscriptionType, NotificationService, NotificationShowInput, NotificationShowInputEncoded, NotificationShowResult, Pane, PaneAgentReportInput, PaneAgentReportInputEncoded, PaneAgentSessionReportInput, PaneAgentSessionReportInputEncoded, PaneClearAgentAuthorityInput, PaneClearAgentAuthorityInputEncoded, PaneContentRevision, PaneCopyMotion, PaneCopyMotionInput, PaneCopyMotionInputEncoded, PaneCopyMotionResult, PaneCopySearchInput, PaneCopySearchInputEncoded, PaneCopySearchResult, PaneCurrentInput, PaneCurrentInputEncoded, PaneDirection, PaneEdgesResult, PaneFocusDirectionInput, PaneFocusDirectionInputEncoded, PaneFocusDirectionResult, PaneId, PaneInput, PaneInputEncoded, PaneInputRoutingInput, PaneInputRoutingInputEncoded, PaneLayoutRect, PaneLayoutSnapshot, PaneLinkActivateInput, PaneLinkActivateInputEncoded, PaneLinkActivatedResult, PaneLinkRegion, PaneLinkResolveInput, PaneLinkResolveInputEncoded, PaneLinkResolvedResult, PaneListInput, PaneListInputEncoded, PaneMetadataReportInput, PaneMetadataReportInputEncoded, PaneMoveDestination, PaneMoveInput, PaneMoveInputEncoded, PaneMoveResult, PaneNeighborResult, PaneOutputMatch, PaneOutputMatchResult, PaneProcess, PaneProcessInfo, PaneReadFormat, PaneReadInput, PaneReadInputEncoded, PaneReadResult, PaneReadSource, PaneReleaseAgentInput, PaneReleaseAgentInputEncoded, PaneResizeInput, PaneResizeInputEncoded, PaneResizeResult, PaneRightClickTarget, PaneScroll, PaneScrollInput, PaneScrollInputEncoded, PaneScrollOffset, PaneSelectionReadInput, PaneSelectionReadInputEncoded, PaneSelectionResult, PaneService, PaneSplitInput, PaneSplitInputEncoded, PaneSwapInput, PaneSwapInputEncoded, PaneSwapResult, PaneTextPoint, PaneTextPointEncoded, PaneTextRange, PaneTextRangeEncoded, PaneWaitForOutputInput, PaneWaitForOutputInputEncoded, PaneZoomInput, PaneZoomInputEncoded, PaneZoomMode, PaneZoomResult, PingResult, PluginAction, PluginActionContext, PluginActionId, PluginActionInvocation, PluginActionInvokeInput, PluginActionInvokeInputEncoded, PluginCommandLog, PluginFilterInput, PluginFilterInputEncoded, PluginId, PluginInvocationContext, PluginInvocationContextInput, PluginLinkInput, PluginLinkInputEncoded, PluginLogId, PluginLogListInput, PluginLogListInputEncoded, PluginManifestAction, PluginManifestCommand, PluginManifestEventHook, PluginManifestLinkHandler, PluginManifestPane, PluginPane, PluginPaneCloseResult, PluginPaneOpenInput, PluginPaneOpenInputEncoded, PluginPanePlacement, PluginPlatform, PluginService, PluginSource, PluginSourceInput, PluginUnlinkResult, PopupService, ProductAnnouncementDismissInput, ProductAnnouncementDismissInputEncoded, ProductAnnouncementId, ProductAnnouncementService, ProjectionRevision, ReleaseNotesDismissInput, ReleaseNotesDismissInputEncoded, ReleaseNotesService, ReportedAgentState, ServerCapabilities, ServerLiveHandoffInput, ServerLiveHandoffInputEncoded, ServerOperationError, ServerService, ServerSshAgentRegisterInput, ServerSshAgentRegisterInputEncoded, ServerSshAgentRegistration, ServerSshAgentRegistrationError, SessionService, SessionSnapshot, SplitDirection, SurfaceRect, SurfaceRevision, Tab, TabCreateInput, TabCreateInputEncoded, TabCreateResult, TabId, TabListInput, TabListInputEncoded, TabMoveInput, TabMoveInputEncoded, TabService, TerminalId, Workspace, WorkspaceCreateOptions, WorkspaceCreateOptionsEncoded, WorkspaceCreateResult, WorkspaceId, WorkspaceMetadataReportInput, WorkspaceMetadataReportInputEncoded, WorkspaceMoveBlockInput, WorkspaceMoveBlockInputEncoded, WorkspaceMoveInput, WorkspaceMoveInputEncoded, WorkspaceOperationError, WorkspaceService, WorkspaceWorktree, Worktree, WorktreeCreateInput, WorktreeCreateInputEncoded, WorktreeCreateResult, WorktreeListInput, WorktreeListInputEncoded, WorktreeListResult, WorktreeOpenInput, WorktreeOpenInputEncoded, WorktreeOpenResult, WorktreeRemoveInput, WorktreeRemoveInputEncoded, WorktreeRemoveResult, WorktreeService, WorktreeSourceInfo, agentServiceLayer, agentServiceLayerWithoutDependencies, clientServiceLayer, clientServiceLayerWithoutDependencies, clientShellServiceLayer, clientShellServiceLayerWithoutDependencies, commandServiceLayer, commandServiceLayerWithoutDependencies, eventServiceLayer, eventServiceLayerWithoutDependencies, herdrConfigLayer, herdrConfigLayerFromOptions, herdrConfigLayerFromValue, herdrConfigLayerWithoutDependencies, herdrConfigRecipe, herdrIds, herdrSdkLayer, herdrSdkLayerFromOptions, herdrSdkLayerWithoutDependencies, herdrTransportLayer, herdrTransportLayerWithoutDependencies, integrationServiceLayer, integrationServiceLayerWithoutDependencies, layoutServiceLayer, layoutServiceLayerWithoutDependencies, makeAgentService, makeClientService, makeClientShellService, makeCommandService, makeEventService, makeHerdrConfig, makeHerdrSdk, makeIntegrationService, makeLayoutService, makeNotificationService, makePaneService, makePluginService, makePopupService, makeProductAnnouncementService, makeReleaseNotesService, makeServerService, makeSessionService, makeTabService, makeWorkspaceService, makeWorktreeService, notificationServiceLayer, notificationServiceLayerWithoutDependencies, paneServiceLayer, paneServiceLayerWithoutDependencies, parseAgentName, parseHerdrAbsolutePath, parseHerdrInsertIndex, parseHerdrMetadataTtl, parseHerdrMilliseconds, parseHerdrPopupSize, parseHerdrResumeArgv, parseHerdrRevision, parseHerdrSessionName, parseHerdrSplitRatio, parseHerdrStateChangeSequence, parseHerdrUnixMilliseconds, parseHerdrUnixSeconds, parsePaneId, parsePluginActionId, parsePluginId, parsePluginLogId, parseTabId, parseTerminalId, parseWorkspaceId, pluginServiceLayer, pluginServiceLayerWithoutDependencies, popupServiceLayer, popupServiceLayerWithoutDependencies, productAnnouncementServiceLayer, productAnnouncementServiceLayerWithoutDependencies, releaseNotesServiceLayer, releaseNotesServiceLayerWithoutDependencies, serverServiceLayer, serverServiceLayerWithoutDependencies, sessionServiceLayer, sessionServiceLayerWithoutDependencies, tabServiceLayer, tabServiceLayerWithoutDependencies, workspaceServiceLayer, workspaceServiceLayerWithoutDependencies, worktreeServiceLayer, worktreeServiceLayerWithoutDependencies };