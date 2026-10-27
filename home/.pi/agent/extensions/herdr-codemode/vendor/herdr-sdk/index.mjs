import { Cache, Cause, Clock, Config, Context, Deferred, Duration, Effect, Exit, Layer, Option, PubSub, Ref, Result, Schema, SchemaGetter, SchemaTransformation, Scope, Semaphore, Stream, Struct, Tracer } from "effect";
import { dirname, isAbsolute, join } from "node:path";
import { Buffer as Buffer$1 } from "node:buffer";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { NodeStream } from "@effect/platform-node-shared";
import { Ajv2020 } from "ajv/dist/2020.js";
//#region src/herdr-domain.ts
/**
* Defines schema-owned primitive values used throughout the Herdr SDK.
*
* Branded identifiers, paths, units, sizes, metadata, and parser functions keep external primitives from entering services without normalization.
*
* @since 0.8.2
*/
const NonEmptyHerdrIdentifier = Schema.NonEmptyString;
const HerdrNaturalNumber = Schema.Natural;
const HerdrMetadataTokenName = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,32}$/));
/**
* Environment variables supplied to a newly created Herdr process.
*
* @category schemas
* @since 0.8.2
*/
const HerdrEnvironment = Schema.Record(Schema.String, Schema.String);
/**
* String metadata tokens reported by a Herdr resource owner.
*
* @category schemas
* @since 0.8.2
*/
const HerdrMetadataTokens = Schema.Record(Schema.String, Schema.String);
/**
* Updates at most 16 metadata tokens; null removes a token. Names match `^[A-Za-z0-9_-]{1,32}$`.
*
* @category schemas
* @since 0.8.2
*/
const HerdrMetadataTokenPatch = Schema.Record(Schema.String, Schema.NullOr(Schema.String)).check(Schema.isMaxProperties(16), Schema.isPropertyNames(HerdrMetadataTokenName));
/**
* Immutable named-key sequence accepted by pane and agent input operations.
*
* @category schemas
* @since 0.8.2
*/
const HerdrKeySequence = Schema.Array(Schema.String);
/**
* Non-empty identifier for a Herdr workspace.
*
* @category schemas
* @since 0.8.2
*/
const WorkspaceId = NonEmptyHerdrIdentifier.pipe(Schema.brand("WorkspaceId"));
/**
* Parses an external workspace identifier before it enters SDK services.
*
* @category decoding
* @since 0.8.2
*/
const parseWorkspaceId = Schema.decodeUnknownEffect(WorkspaceId);
/**
* Non-empty identifier for a Herdr tab.
*
* @category schemas
* @since 0.8.2
*/
const TabId = NonEmptyHerdrIdentifier.pipe(Schema.brand("TabId"));
/**
* Parses an external tab identifier before it enters SDK services.
*
* @category decoding
* @since 0.8.2
*/
const parseTabId = Schema.decodeUnknownEffect(TabId);
/**
* Non-empty identifier for a Herdr pane.
*
* @category schemas
* @since 0.8.2
*/
const PaneId = NonEmptyHerdrIdentifier.pipe(Schema.brand("PaneId"));
/**
* Parses an external pane identifier before it enters SDK services.
*
* @category decoding
* @since 0.8.2
*/
const parsePaneId = Schema.decodeUnknownEffect(PaneId);
/**
* Non-empty identifier for a Herdr terminal.
*
* @category schemas
* @since 0.8.2
*/
const TerminalId = NonEmptyHerdrIdentifier.pipe(Schema.brand("TerminalId"));
/**
* Parses an external terminal identifier before it enters SDK services.
*
* @category decoding
* @since 0.8.2
*/
const parseTerminalId = Schema.decodeUnknownEffect(TerminalId);
/**
* Non-empty identifier for an installed Herdr plugin.
*
* @category schemas
* @since 0.8.2
*/
const PluginId = NonEmptyHerdrIdentifier.pipe(Schema.brand("PluginId"));
/**
* Parses an external plugin identifier before it enters SDK services.
*
* @category decoding
* @since 0.8.2
*/
const parsePluginId = Schema.decodeUnknownEffect(PluginId);
/**
* Non-empty identifier for a Herdr plugin action.
*
* @category schemas
* @since 0.8.2
*/
const PluginActionId = NonEmptyHerdrIdentifier.pipe(Schema.brand("PluginActionId"));
/**
* Parses an external plugin action identifier before it enters SDK services.
*
* @category decoding
* @since 0.8.2
*/
const parsePluginActionId = Schema.decodeUnknownEffect(PluginActionId);
/**
* Non-empty identifier for a Herdr plugin command log.
*
* @category schemas
* @since 0.8.2
*/
const PluginLogId = NonEmptyHerdrIdentifier.pipe(Schema.brand("PluginLogId"));
/**
* Parses an external plugin command-log identifier before it enters SDK services.
*
* @category decoding
* @since 0.8.2
*/
const parsePluginLogId = Schema.decodeUnknownEffect(PluginLogId);
/**
* Non-empty caller-assigned name for a Herdr agent.
*
* @category schemas
* @since 0.8.2
*/
const AgentName = NonEmptyHerdrIdentifier.pipe(Schema.brand("AgentName"));
/**
* Parses an external agent name before it enters SDK services.
*
* @category decoding
* @since 0.8.2
*/
const parseAgentName = Schema.decodeUnknownEffect(AgentName);
/**
* Absolute filesystem path accepted by Herdr SDK operations and configuration.
*
* @category schemas
* @since 0.8.2
*/
const HerdrAbsolutePath = Schema.String.check(Schema.makeFilter((value) => isAbsolute(value) && !value.includes("\0") ? void 0 : "must be an absolute path without NUL bytes")).pipe(Schema.brand("HerdrAbsolutePath"));
/**
* Parses an external absolute path before it enters SDK services.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrAbsolutePath = Schema.decodeUnknownEffect(HerdrAbsolutePath);
/**
* Herdr session name that cannot escape its session directory.
*
* @category schemas
* @since 0.8.2
*/
const HerdrSessionName = Schema.String.check(Schema.isMinLength(1), Schema.makeFilter((value) => value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\") && !value.includes("\0") ? void 0 : "must not be '.', '..', or contain path separators or NUL bytes")).pipe(Schema.brand("HerdrSessionName"));
/**
* Parses an external session name before socket-path resolution.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrSessionName = Schema.decodeUnknownEffect(HerdrSessionName);
/**
* Finite, non-negative integer duration measured in milliseconds.
*
* @category schemas
* @since 0.8.2
*/
const HerdrMilliseconds = HerdrNaturalNumber.pipe(Schema.brand("HerdrMilliseconds"));
/**
* Parses an external millisecond duration before it enters SDK services.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrMilliseconds = Schema.decodeUnknownEffect(HerdrMilliseconds);
/**
* Finite, non-negative Unix timestamp measured in milliseconds.
*
* @category schemas
* @since 0.8.2
*/
const HerdrUnixMilliseconds = HerdrNaturalNumber.pipe(Schema.brand("HerdrUnixMilliseconds"));
/**
* Parses an external Unix millisecond timestamp.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrUnixMilliseconds = Schema.decodeUnknownEffect(HerdrUnixMilliseconds);
/**
* Finite, non-negative Unix timestamp measured in seconds.
*
* @category schemas
* @since 0.8.2
*/
const HerdrUnixSeconds = HerdrNaturalNumber.pipe(Schema.brand("HerdrUnixSeconds"));
/**
* Parses an external Unix second timestamp.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrUnixSeconds = Schema.decodeUnknownEffect(HerdrUnixSeconds);
/**
* Finite, non-negative pane-output revision.
*
* @category schemas
* @since 0.8.2
*/
const HerdrRevision = HerdrNaturalNumber.pipe(Schema.brand("HerdrRevision"));
/**
* Parses an external pane-output revision.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrRevision = Schema.decodeUnknownEffect(HerdrRevision);
/**
* Finite, non-negative sequence used to order reported agent state.
*
* @category schemas
* @since 0.8.2
*/
const HerdrStateChangeSequence = HerdrNaturalNumber.pipe(Schema.brand("HerdrStateChangeSequence"));
/**
* Parses an external agent state-change sequence.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrStateChangeSequence = Schema.decodeUnknownEffect(HerdrStateChangeSequence);
/**
* Finite split ratio strictly between zero and one.
*
* @category schemas
* @since 0.8.2
*/
const HerdrSplitRatio = Schema.Finite.check(Schema.isBetween({
	minimum: 0,
	maximum: 1,
	exclusiveMinimum: true,
	exclusiveMaximum: true
})).pipe(Schema.brand("HerdrSplitRatio"));
/**
* Parses an external split ratio before it enters layout or pane services.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrSplitRatio = Schema.decodeUnknownEffect(HerdrSplitRatio);
/**
* Metadata time-to-live between one millisecond and one day, inclusive.
*
* @category schemas
* @since 0.8.2
*/
const HerdrMetadataTtl = Schema.Finite.check(Schema.isInt(), Schema.isBetween({
	minimum: 1,
	maximum: 864e5
})).pipe(Schema.brand("HerdrMetadataTtl"));
/**
* Parses an external metadata time-to-live before report operations.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrMetadataTtl = Schema.decodeUnknownEffect(HerdrMetadataTtl);
/**
* Non-negative insertion index used by ordered workspace and tab operations.
*
* @category schemas
* @since 0.8.2
*/
const HerdrInsertIndex = HerdrNaturalNumber.pipe(Schema.brand("HerdrInsertIndex"));
/**
* Parses an external insertion index before it enters ordering services.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrInsertIndex = Schema.decodeUnknownEffect(HerdrInsertIndex);
const HERDR_RESUME_ARGV_MAX_ARGUMENTS = 64;
const HERDR_RESUME_ARGV_MAX_BYTES = 8192;
const herdrResumeCommandName = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/;
const herdrResumeControlCharacter = /\p{Cc}/u;
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
const HerdrResumeArgv = Schema.Array(Schema.String).check(Schema.makeFilter((argv) => {
	const command = argv[0];
	if (command === void 0) return "Herdr resume argv must not be empty";
	if (argv.length > HERDR_RESUME_ARGV_MAX_ARGUMENTS) return `Herdr resume argv allows at most ${HERDR_RESUME_ARGV_MAX_ARGUMENTS} arguments`;
	let totalBytes = 0;
	for (const argument of argv) totalBytes += Buffer$1.byteLength(argument, "utf8");
	if (totalBytes > HERDR_RESUME_ARGV_MAX_BYTES) return `Herdr resume argv allows at most ${HERDR_RESUME_ARGV_MAX_BYTES} UTF-8 bytes`;
	if (argv.some((argument) => herdrResumeControlCharacter.test(argument))) return "Herdr resume argv must not contain control characters";
	if (argv.some((argument) => argument.includes("'"))) return "Herdr resume argv must not contain apostrophes";
	if (!herdrResumeCommandName.test(command)) return "Herdr resume argv must start with a plain command name, not a path";
	return true;
}));
/**
* Parses an external resume command before it is attached to an agent report.
*
* @category decoding
* @since 0.9.5
*/
const parseHerdrResumeArgv = Schema.decodeUnknownEffect(HerdrResumeArgv);
/**
* Popup size in terminal cells or an integer percentage from one through one hundred.
*
* @category schemas
* @since 0.8.2
*/
const HerdrPopupSize = Schema.Union([Schema.Finite.check(Schema.isInt(), Schema.isBetween({
	minimum: 0,
	maximum: 65535
})), Schema.String.check(Schema.isPattern(/^(100|[1-9][0-9]?)%$/))]);
/**
* Parses an external popup size before plugin pane operations.
*
* @category decoding
* @since 0.8.2
*/
const parseHerdrPopupSize = Schema.decodeUnknownEffect(HerdrPopupSize);
/** Opaque endpoint-issued custom command identifier; never command text. @category schemas @since 0.9.0 */
const HerdrCommandId = NonEmptyHerdrIdentifier.pipe(Schema.brand("HerdrCommandId"));
/**
* Pure schema-owned constructors exposed as `herdr.ids`.
*
* @category constructors
* @since 0.8.2
*/
const herdrIds = {
	command: Schema.decodeUnknownSync(HerdrCommandId),
	workspace: Schema.decodeUnknownSync(WorkspaceId),
	tab: Schema.decodeUnknownSync(TabId),
	pane: Schema.decodeUnknownSync(PaneId),
	terminal: Schema.decodeUnknownSync(TerminalId),
	plugin: Schema.decodeUnknownSync(PluginId),
	pluginAction: Schema.decodeUnknownSync(PluginActionId),
	pluginLog: Schema.decodeUnknownSync(PluginLogId),
	agentName: Schema.decodeUnknownSync(AgentName),
	absolutePath: Schema.decodeUnknownSync(HerdrAbsolutePath)
};
//#endregion
//#region src/herdr-errors.ts
/**
* Defines the typed failures exposed by Herdr SDK operations.
*
* Schema-backed tagged errors distinguish configuration, input, transport, timeout, compatibility, server, response, event, and SSH agent registration failures for targeted recovery.
*
* @since 0.8.2
*/
/**
* Failure to decode or resolve Herdr SDK configuration.
*
* @category errors
* @since 0.8.2
*/
var HerdrConfigurationError = class extends Schema.TaggedError()("HerdrConfigurationError", {
	operation: Schema.Literal("loadHerdrConfig"),
	message: Schema.String,
	cause: Schema.Defect()
}) {
	/** Creates a safe configuration failure while retaining the diagnostic cause. */
	constructor(cause) {
		super({
			operation: "loadHerdrConfig",
			message: "Herdr configuration loading failed. Correct the SDK options or Herdr environment configuration and try again.",
			cause
		});
	}
};
/**
* Failure to parse caller input into the domain value required by one SDK operation.
*
* @category errors
* @since 0.8.2
*/
var HerdrInvalidInput = class extends Schema.TaggedError()("HerdrInvalidInput", {
	operation: Schema.String,
	message: Schema.String,
	cause: Schema.Defect()
}) {
	/** Creates an input parse failure at a named public operation boundary. */
	constructor(operation, cause) {
		super({
			operation,
			message: `Herdr input parsing failed for ${operation}. Correct the supplied value and try again.`,
			cause
		});
	}
};
/**
* Local Unix-socket connection, read, write, or premature-close failure.
*
* @category errors
* @since 0.8.2
*/
var HerdrTransportError = class extends Schema.TaggedError()("HerdrTransportError", {
	operation: Schema.Literals([
		"request",
		"compatibility_check",
		"event_subscription",
		"ssh_agent_registration"
	]),
	reason: Schema.Literals([
		"connect",
		"read",
		"write",
		"premature_close"
	]),
	requestId: Schema.String,
	message: Schema.String,
	cause: Schema.Defect()
}) {
	/** Creates a classified transport failure with its wire correlation identifier. */
	constructor(operation, reason, requestId, cause) {
		super({
			operation,
			reason,
			requestId,
			message: `Herdr transport failed during ${operation}: ${reason}. The server outcome may be uncertain; inspect the affected resources before retrying.`,
			cause
		});
	}
};
/**
* Local deadline elapsed before a Herdr operation completed.
*
* @category errors
* @since 0.8.2
*/
var HerdrRequestTimeout = class extends Schema.TaggedError()("HerdrRequestTimeout", {
	operation: Schema.Literals([
		"request",
		"compatibility_check",
		"event_subscription",
		"ssh_agent_registration"
	]),
	requestId: Schema.String,
	timeoutMilliseconds: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
	message: Schema.String
}) {
	/** Creates a local deadline failure without classifying fiber interruption as a timeout. */
	constructor(operation, requestId, timeoutMilliseconds) {
		super({
			operation,
			requestId,
			timeoutMilliseconds,
			message: `Herdr request timed out during ${operation} after ${timeoutMilliseconds} milliseconds. The server outcome may be uncertain; inspect the affected resources before retrying with a longer deadline.`
		});
	}
};
/**
* Malformed, oversized, mismatched, or schema-invalid Herdr response.
*
* @category errors
* @since 0.8.2
*/
var HerdrInvalidResponse = class extends Schema.TaggedError()("HerdrInvalidResponse", {
	reason: Schema.Literals([
		"malformed_json",
		"oversized_frame",
		"correlation_mismatch",
		"schema_mismatch",
		"missing_result",
		"unsupported_value"
	]),
	requestId: Schema.String,
	message: Schema.String,
	cause: Schema.Defect()
}) {
	/** Creates a classified response-boundary failure. */
	constructor(reason, requestId, cause) {
		super({
			reason,
			requestId,
			message: `Herdr response parsing failed: ${reason}. The server response is incompatible with this SDK build.`,
			cause
		});
	}
};
/**
* Server protocol version differs from protocol 22 supported by this SDK.
*
* @category errors
* @since 0.8.2
*/
var HerdrUnsupportedProtocol = class extends Schema.TaggedError()("HerdrUnsupportedProtocol", {
	actualProtocol: Schema.Finite.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
	supportedProtocol: Schema.Literal(22),
	requestId: Schema.String,
	message: Schema.String
}) {
	/** Creates a protocol compatibility failure from the ping handshake. */
	constructor(actualProtocol, supportedProtocol, requestId) {
		super({
			actualProtocol,
			supportedProtocol,
			requestId,
			message: `Herdr protocol is unsupported: server uses ${actualProtocol}, SDK requires ${supportedProtocol}. Install compatible Herdr and SDK versions.`
		});
	}
};
/**
* Success result discriminant is not supported for the requested operation.
*
* @category errors
* @since 0.8.2
*/
var HerdrUnsupportedResult = class extends Schema.TaggedError()("HerdrUnsupportedResult", {
	operation: Schema.String,
	actualType: Schema.String,
	expectedType: Schema.String,
	requestId: Schema.String,
	message: Schema.String
}) {
	/** Creates an unsupported success-result failure. */
	constructor(operation, actualType, expectedType, requestId) {
		super({
			operation,
			actualType,
			expectedType,
			requestId,
			message: `Herdr result is unsupported for ${operation}: received ${actualType}, expected ${expectedType}. Update the SDK or use a compatible server.`
		});
	}
};
/**
* Event discriminant is not supported by this SDK build.
*
* @category errors
* @since 0.8.2
*/
var HerdrUnsupportedEvent = class extends Schema.TaggedError()("HerdrUnsupportedEvent", {
	eventType: Schema.String,
	requestId: Schema.String,
	message: Schema.String
}) {
	/** Creates an unsupported event failure from a subscription or wait boundary. */
	constructor(eventType, requestId) {
		super({
			eventType,
			requestId,
			message: `Herdr event is unsupported: ${eventType}. Update the SDK or narrow the subscription to supported events.`
		});
	}
};
/**
* Open-code server-returned failure correlated to one request.
*
* @category errors
* @since 0.8.2
*/
var HerdrServerError = class extends Schema.TaggedError()("HerdrServerError", {
	serverCode: Schema.String,
	serverMessage: Schema.String,
	requestId: Schema.String,
	message: Schema.String
}) {
	/** Creates a typed boundary error while preserving the server's open code space. */
	constructor(serverCode, serverMessage, requestId) {
		super({
			serverCode,
			serverMessage,
			requestId,
			message: `Herdr server rejected the request with ${serverCode}: ${serverMessage}`
		});
	}
};
/**
* Event subscription fell behind Herdr's retained history and was closed by the server.
*
* Cached state derived from the subscription is stale. Open a new subscription, wait for it to be
* accepted, then reconcile through authoritative reads such as `session.snapshot`.
*
* @category errors
* @since 0.9.5
*/
var HerdrEventsLost = class extends Schema.TaggedError()("HerdrEventsLost", {
	serverMessage: Schema.String,
	requestId: Schema.String,
	message: Schema.String
}) {
	/** Creates a subscription overrun failure from the server's `events_lost` response. */
	constructor(serverMessage, requestId) {
		super({
			serverMessage,
			requestId,
			message: "Herdr event subscription fell behind retained history and was closed; events were missed. Resubscribe, then reconcile cached state with session.snapshot."
		});
	}
};
/**
* Herdr ended a connection-scoped SSH agent registration before its owner released it.
*
* @category errors
* @since 0.9.5
*/
var HerdrSshAgentRegistrationClosed = class extends Schema.TaggedError()("HerdrSshAgentRegistrationClosed", {
	requestId: Schema.String,
	message: Schema.String
}) {
	/** Creates a lease-ended failure when the server closes the registration connection. */
	constructor(requestId) {
		super({
			requestId,
			message: "Herdr SSH agent registration ended because the server closed its connection. Herdr panes can no longer reach this agent through the registration; register it again if the server is still running."
		});
	}
};
//#endregion
//#region src/herdr-config.ts
/**
* Resolves and provides immutable Herdr SDK configuration.
*
* Configuration selects a Unix socket from explicit options or ambient inputs, validates request deadlines and caller identity, and exposes Layers for production and controlled composition.
*
* @since 0.8.2
*/
const DEFAULT_REQUEST_TIMEOUT = Duration.seconds(5);
const SUPPORTED_HERDR_PROTOCOL = 22;
/**
* Finite, non-negative deadline for ordinary Herdr transport requests.
*
* @category schemas
* @since 0.8.2
*/
const HerdrRequestDeadline = Schema.Duration.check(Schema.makeFilter((value) => Duration.isFinite(value) && !Duration.isNegative(value) ? void 0 : "must be a finite, non-negative duration")).pipe(Schema.brand("HerdrRequestDeadline"));
/**
* Application identity sent during the Herdr compatibility handshake.
*
* @category schemas
* @since 0.8.2
*/
const HerdrApplication = Schema.Struct({
	name: Schema.NonEmptyString,
	version: Schema.OptionFromOptionalKey(Schema.NonEmptyString)
});
/**
* Supported Herdr wire protocol version.
*
* @category schemas
* @since 0.8.2
*/
const HerdrProtocolVersion = Schema.Literal(SUPPORTED_HERDR_PROTOCOL);
/**
* Explicit SDK configuration accepted by {@link makeHerdrConfig}.
*
* @category schemas
* @since 0.8.2
*/
const HerdrConfigOptions = Schema.Struct({
	socketPath: Schema.optionalKey(HerdrAbsolutePath),
	session: Schema.optionalKey(HerdrSessionName),
	requestTimeout: Schema.optionalKey(HerdrRequestDeadline),
	application: Schema.optionalKey(HerdrApplication)
}).pipe(Schema.refine((value) => value.socketPath === void 0 || value.session === void 0, { expected: "socketPath and session are mutually exclusive" }));
const parseHerdrConfigOptions = Schema.decodeEffect(HerdrConfigOptions);
const parseHerdrRequestDeadlineFromString = Schema.decodeEffect(Schema.DurationFromString.pipe(Schema.decodeTo(HerdrRequestDeadline)));
const parseHerdrAbsolutePath$1 = Schema.decodeEffect(HerdrAbsolutePath);
const parseHerdrSessionName$1 = Schema.decodeEffect(HerdrSessionName);
/**
* Yieldable Effect service containing resolved Herdr SDK configuration.
*
* @category services
* @since 0.8.2
*/
var HerdrConfig = class extends Context.Service()("@herdr/sdk/HerdrConfig") {};
const ambientHerdrConfig = Config.all({
	socketPath: Config.option(Config.string("HERDR_SOCKET_PATH")),
	session: Config.option(Config.string("HERDR_SESSION")),
	configDirectory: Config.option(Config.string("HERDR_CONFIG_DIR")),
	xdgConfigHome: Config.option(Config.string("XDG_CONFIG_HOME")),
	appData: Config.option(Config.string("APPDATA")),
	requestTimeout: Config.option(Config.string("HERDR_REQUEST_TIMEOUT"))
});
/**
* Effect Config recipe that resolves ambient Herdr SDK configuration.
*
* @category configuration
* @since 0.8.2
*/
const herdrConfigRecipe = ambientHerdrConfig.pipe(Config.mapOrFail((ambient) => resolveHerdrConfig({}, ambient).pipe(Effect.mapError((cause) => new Config.ConfigError(cause)))));
const makeHerdrConfigEffect = Effect.fn("HerdrConfig.make")(function* (options) {
	const config = yield* resolveHerdrConfig(yield* parseHerdrConfigOptions(options), yield* ambientHerdrConfig);
	return HerdrConfig.of(config);
}, Effect.mapError((cause) => new HerdrConfigurationError(cause)));
/**
* Constructs Herdr configuration using explicit options before ambient configuration.
*
* @category constructors
* @since 0.8.2
*/
function makeHerdrConfig(options = {}) {
	return makeHerdrConfigEffect(options);
}
/**
* Provides Herdr configuration while preserving the active ConfigProvider.
*
* @category layers
* @since 0.8.2
*/
const herdrConfigLayerWithoutDependencies = Layer.effect(HerdrConfig, makeHerdrConfig());
/**
* Production Layer that loads Herdr configuration from the active ConfigProvider.
*
* @category layers
* @since 0.8.2
*/
const herdrConfigLayer = herdrConfigLayerWithoutDependencies;
/**
* Provides Herdr configuration resolved from explicit and ambient options.
*
* @category layers
* @since 0.8.2
*/
function herdrConfigLayerFromOptions(options) {
	return Layer.effect(HerdrConfig, makeHerdrConfig(options));
}
/**
* Provides an already parsed Herdr configuration value.
*
* @category layers
* @since 0.8.2
*/
function herdrConfigLayerFromValue(config) {
	return Layer.succeed(HerdrConfig, HerdrConfig.of(config));
}
function resolveHerdrConfig(options, ambient) {
	return Effect.gen(function* () {
		const selection = yield* resolveHerdrSocketSelection(options, ambient);
		const requestTimeout = yield* resolveHerdrRequestTimeout(options, ambient);
		return {
			...selection,
			requestTimeout,
			application: Option.fromNullishOr(options.application),
			supportedProtocol: SUPPORTED_HERDR_PROTOCOL
		};
	});
}
function resolveHerdrSocketSelection(options, ambient) {
	return Effect.gen(function* () {
		if (options.socketPath !== void 0) return {
			socketPath: options.socketPath,
			session: Option.none()
		};
		if (options.session !== void 0) {
			const configDirectory = yield* resolveHerdrConfigDirectory(ambient);
			return {
				socketPath: HerdrAbsolutePath.make(join(configDirectory, "sessions", options.session, "herdr.sock")),
				session: Option.some(options.session)
			};
		}
		if (Option.isSome(ambient.socketPath)) return {
			socketPath: yield* parseHerdrAbsolutePath$1(ambient.socketPath.value),
			session: Option.none()
		};
		const configDirectory = yield* resolveHerdrConfigDirectory(ambient);
		if (Option.isSome(ambient.session)) {
			const session = yield* parseHerdrSessionName$1(ambient.session.value);
			return {
				socketPath: HerdrAbsolutePath.make(join(configDirectory, "sessions", session, "herdr.sock")),
				session: Option.some(session)
			};
		}
		return {
			socketPath: HerdrAbsolutePath.make(join(configDirectory, "herdr.sock")),
			session: Option.none()
		};
	});
}
function resolveHerdrRequestTimeout(options, ambient) {
	if (options.requestTimeout !== void 0) return Effect.succeed(options.requestTimeout);
	if (Option.isNone(ambient.requestTimeout)) return Effect.succeed(HerdrRequestDeadline.make(DEFAULT_REQUEST_TIMEOUT));
	return parseHerdrRequestDeadlineFromString(ambient.requestTimeout.value);
}
function resolveHerdrConfigDirectory(ambient) {
	if (Option.isSome(ambient.configDirectory)) return parseHerdrAbsolutePath$1(ambient.configDirectory.value);
	if (process.platform === "win32") {
		if (Option.isSome(ambient.appData)) return parseHerdrAbsolutePath$1(ambient.appData.value).pipe(Effect.map((base) => HerdrAbsolutePath.make(join(base, "herdr"))));
		return Effect.succeed(HerdrAbsolutePath.make(join(homedir(), "herdr")));
	}
	if (Option.isSome(ambient.xdgConfigHome)) return parseHerdrAbsolutePath$1(ambient.xdgConfigHome.value).pipe(Effect.map((base) => HerdrAbsolutePath.make(join(base, "herdr"))));
	return Effect.succeed(HerdrAbsolutePath.make(join(homedir(), ".config", "herdr")));
}
//#endregion
//#region src/generated/wire-method-map.ts
/** Success discriminants accepted for each correlated wire method. */
const wireResultTypesByMethod = {
	"agent.explain": ["agent_explain"],
	"agent.focus": ["agent_info"],
	"agent.get": ["agent_info"],
	"agent.list": ["agent_list"],
	"agent.prompt": ["agent_prompted"],
	"agent.read": ["pane_read"],
	"agent.rename": ["agent_info"],
	"agent.send_keys": ["ok"],
	"agent.start": ["agent_started"],
	"agent.view.clear": ["agent_view"],
	"agent.view.set": ["agent_view"],
	"agent.wait": ["agent_info"],
	"client_shell.surface.set": ["client_shell_surface_set"],
	"client.window_title.clear": ["client_window_title"],
	"client.window_title.set": ["client_window_title"],
	"command.invoke": ["ok"],
	"events.subscribe": ["subscription_started"],
	"events.wait": ["wait_matched"],
	"integration.install": ["integration_install"],
	"integration.list": ["integration_list"],
	"integration.uninstall": ["integration_uninstall"],
	"layout.apply": ["layout_apply"],
	"layout.export": ["layout_export"],
	"layout.set_split_ratio": ["layout_split_ratio_set"],
	"notification.show": ["notification_show"],
	"pane.clear": ["ok"],
	"pane.clear_agent_authority": ["ok"],
	"pane.close": ["ok"],
	"pane.copy_motion": ["pane_copy_motion"],
	"pane.copy_search": ["pane_copy_search"],
	"pane.current": ["pane_current"],
	"pane.edges": ["pane_edges"],
	"pane.edit_scrollback": ["ok"],
	"pane.focus": ["pane_info"],
	"pane.focus_direction": ["pane_focus_direction"],
	"pane.get": ["pane_info"],
	"pane.input.set": ["ok"],
	"pane.layout": ["pane_layout"],
	"pane.link.activate": ["pane_link_activated"],
	"pane.link.resolve": ["pane_link_resolved"],
	"pane.list": ["pane_list"],
	"pane.move": ["pane_move"],
	"pane.neighbor": ["pane_neighbor"],
	"pane.process_info": ["pane_process_info"],
	"pane.read": ["pane_read"],
	"pane.release_agent": ["ok"],
	"pane.rename": ["pane_info"],
	"pane.report_agent": ["ok"],
	"pane.report_agent_session": ["ok"],
	"pane.report_metadata": ["ok"],
	"pane.resize": ["pane_resize"],
	"pane.scroll": ["pane_info"],
	"pane.selection.read": ["pane_selection"],
	"pane.send_input": ["ok"],
	"pane.send_keys": ["ok"],
	"pane.send_text": ["ok"],
	"pane.split": ["pane_info"],
	"pane.swap": ["pane_swap"],
	"pane.wait_for_output": ["output_matched"],
	"pane.zoom": ["pane_zoom"],
	ping: ["pong"],
	"plugin.action.invoke": ["plugin_action_invoked"],
	"plugin.action.list": ["plugin_action_list"],
	"plugin.disable": ["plugin_disabled"],
	"plugin.enable": ["plugin_enabled"],
	"plugin.link": ["plugin_linked"],
	"plugin.list": ["plugin_list"],
	"plugin.log.list": ["plugin_log_list"],
	"plugin.pane.close": ["plugin_pane_closed"],
	"plugin.pane.focus": ["plugin_pane_focused"],
	"plugin.pane.open": ["plugin_pane_opened", "ok"],
	"plugin.unlink": ["plugin_unlinked"],
	"popup.close": ["ok"],
	"product_announcement.dismiss": ["ok"],
	"release_notes.dismiss": ["ok"],
	"server.agent_manifests": ["agent_manifest_status"],
	"server.live_handoff": ["ok"],
	"server.reload_agent_manifests": ["agent_manifest_reload"],
	"server.reload_config": ["config_reload"],
	"server.ssh_agent.register": ["ok"],
	"server.stop": ["ok"],
	"session.snapshot": ["session_snapshot"],
	"tab.close": ["ok"],
	"tab.create": ["tab_created"],
	"tab.focus": ["tab_info"],
	"tab.get": ["tab_info"],
	"tab.list": ["tab_list"],
	"tab.move": ["tab_list"],
	"tab.rename": ["tab_info"],
	"workspace.close": ["ok"],
	"workspace.create": ["workspace_created"],
	"workspace.focus": ["workspace_info"],
	"workspace.get": ["workspace_info"],
	"workspace.list": ["workspace_list"],
	"workspace.move": ["workspace_list"],
	"workspace.move_block": ["workspace_list"],
	"workspace.rename": ["workspace_info"],
	"workspace.report_metadata": ["ok"],
	"worktree.create": ["worktree_created"],
	"worktree.list": ["worktree_list"],
	"worktree.open": ["worktree_opened"],
	"worktree.remove": ["worktree_removed"]
};
//#endregion
//#region schema/herdr-api.schema.json
var herdr_api_schema_default = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	protocol: 22,
	schema_version: 1,
	schemas: {
		"error_response": {
			"$defs": { "ErrorBody": {
				"properties": {
					"code": { "type": "string" },
					"message": { "type": "string" }
				},
				"required": ["code", "message"],
				"type": "object"
			} },
			"$schema": "https://json-schema.org/draft/2020-12/schema",
			"properties": {
				"error": { "$ref": "#/schemas/error_response/$defs/ErrorBody" },
				"id": { "type": "string" }
			},
			"required": ["id", "error"],
			"title": "ErrorResponse",
			"type": "object"
		},
		"event": {
			"$defs": {
				"AgentSessionInfo": {
					"properties": {
						"agent": { "type": "string" },
						"kind": { "$ref": "#/schemas/event/$defs/AgentSessionRefKind" },
						"source": { "type": "string" },
						"value": { "type": "string" }
					},
					"required": [
						"source",
						"agent",
						"kind",
						"value"
					],
					"type": "object"
				},
				"AgentSessionRefKind": {
					"enum": ["id", "path"],
					"type": "string"
				},
				"AgentStatus": {
					"enum": [
						"idle",
						"working",
						"blocked",
						"done",
						"unknown"
					],
					"type": "string"
				},
				"EventData": { "oneOf": [
					{
						"properties": {
							"type": {
								"const": "workspace_created",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/event/$defs/WorkspaceInfo" }
						},
						"required": ["type", "workspace"],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "workspace_updated",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/event/$defs/WorkspaceInfo" }
						},
						"required": ["type", "workspace"],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "workspace_metadata_updated",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/event/$defs/WorkspaceInfo" }
						},
						"required": ["type", "workspace"],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "workspace_closed",
								"type": "string"
							},
							"workspace": { "anyOf": [{ "$ref": "#/schemas/event/$defs/WorkspaceInfo" }, { "type": "null" }] },
							"workspace_id": { "type": "string" }
						},
						"required": ["type", "workspace_id"],
						"type": "object"
					},
					{
						"properties": {
							"label": { "type": "string" },
							"type": {
								"const": "workspace_renamed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"workspace_id",
							"label"
						],
						"type": "object"
					},
					{
						"properties": {
							"insert_index": {
								"format": "uint",
								"minimum": 0,
								"type": "integer"
							},
							"type": {
								"const": "workspace_moved",
								"type": "string"
							},
							"workspace_id": { "type": "string" },
							"workspaces": {
								"items": { "$ref": "#/schemas/event/$defs/WorkspaceInfo" },
								"type": "array"
							}
						},
						"required": [
							"type",
							"workspace_id",
							"insert_index",
							"workspaces"
						],
						"type": "object"
					},
					{
						"properties": {
							"before_workspace_id": { "type": ["string", "null"] },
							"type": {
								"const": "workspace_reordered",
								"type": "string"
							},
							"workspace_ids": {
								"items": { "type": "string" },
								"type": "array"
							},
							"workspaces": {
								"items": { "$ref": "#/schemas/event/$defs/WorkspaceInfo" },
								"type": "array"
							}
						},
						"required": [
							"type",
							"workspace_ids",
							"workspaces"
						],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "workspace_focused",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": ["type", "workspace_id"],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "worktree_created",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/event/$defs/WorkspaceInfo" },
							"worktree": { "$ref": "#/schemas/event/$defs/WorktreeInfo" }
						},
						"required": [
							"type",
							"workspace",
							"worktree"
						],
						"type": "object"
					},
					{
						"properties": {
							"already_open": { "type": "boolean" },
							"type": {
								"const": "worktree_opened",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/event/$defs/WorkspaceInfo" },
							"worktree": { "$ref": "#/schemas/event/$defs/WorktreeInfo" }
						},
						"required": [
							"type",
							"workspace",
							"worktree",
							"already_open"
						],
						"type": "object"
					},
					{
						"properties": {
							"forced": { "type": "boolean" },
							"type": {
								"const": "worktree_removed",
								"type": "string"
							},
							"workspace": { "anyOf": [{ "$ref": "#/schemas/event/$defs/WorkspaceInfo" }, { "type": "null" }] },
							"workspace_id": { "type": "string" },
							"worktree": { "$ref": "#/schemas/event/$defs/WorktreeInfo" }
						},
						"required": [
							"type",
							"workspace_id",
							"worktree",
							"forced"
						],
						"type": "object"
					},
					{
						"properties": {
							"tab": { "$ref": "#/schemas/event/$defs/TabInfo" },
							"type": {
								"const": "tab_created",
								"type": "string"
							}
						},
						"required": ["type", "tab"],
						"type": "object"
					},
					{
						"properties": {
							"tab_id": { "type": "string" },
							"type": {
								"const": "tab_closed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"tab_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"label": { "type": "string" },
							"tab_id": { "type": "string" },
							"type": {
								"const": "tab_renamed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"tab_id",
							"workspace_id",
							"label"
						],
						"type": "object"
					},
					{
						"properties": {
							"insert_index": {
								"format": "uint",
								"minimum": 0,
								"type": "integer"
							},
							"tab_id": { "type": "string" },
							"tabs": {
								"items": { "$ref": "#/schemas/event/$defs/TabInfo" },
								"type": "array"
							},
							"type": {
								"const": "tab_moved",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"tab_id",
							"workspace_id",
							"insert_index",
							"tabs"
						],
						"type": "object"
					},
					{
						"properties": {
							"tab_id": { "type": "string" },
							"type": {
								"const": "tab_focused",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"tab_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"pane": { "$ref": "#/schemas/event/$defs/PaneInfo" },
							"type": {
								"const": "pane_created",
								"type": "string"
							}
						},
						"required": ["type", "pane"],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"type": {
								"const": "pane_closed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"pane": { "$ref": "#/schemas/event/$defs/PaneInfo" },
							"type": {
								"const": "pane_updated",
								"type": "string"
							}
						},
						"required": ["type", "pane"],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"type": {
								"const": "pane_focused",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"closed_tab_id": { "type": ["string", "null"] },
							"closed_workspace_id": { "type": ["string", "null"] },
							"created_tab": { "anyOf": [{ "$ref": "#/schemas/event/$defs/TabInfo" }, { "type": "null" }] },
							"created_workspace": { "anyOf": [{ "$ref": "#/schemas/event/$defs/WorkspaceInfo" }, { "type": "null" }] },
							"pane": { "$ref": "#/schemas/event/$defs/PaneInfo" },
							"previous_pane_id": { "type": "string" },
							"previous_tab_id": { "type": "string" },
							"previous_workspace_id": { "type": "string" },
							"type": {
								"const": "pane_moved",
								"type": "string"
							}
						},
						"required": [
							"type",
							"previous_pane_id",
							"previous_workspace_id",
							"previous_tab_id",
							"pane"
						],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"revision": {
								"format": "uint64",
								"minimum": 0,
								"type": "integer"
							},
							"type": {
								"const": "pane_output_changed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id",
							"revision"
						],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"type": {
								"const": "pane_exited",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"agent": { "type": ["string", "null"] },
							"final_status": { "anyOf": [{ "$ref": "#/schemas/event/$defs/AgentStatus" }, { "type": "null" }] },
							"pane_id": { "type": "string" },
							"released": { "type": "boolean" },
							"type": {
								"const": "pane_agent_detected",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"agent": { "type": ["string", "null"] },
							"agent_status": { "$ref": "#/schemas/event/$defs/AgentStatus" },
							"display_agent": { "type": ["string", "null"] },
							"pane_id": { "type": "string" },
							"state_labels": {
								"additionalProperties": { "type": "string" },
								"type": "object"
							},
							"title": { "type": ["string", "null"] },
							"type": {
								"const": "pane_agent_status_changed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id",
							"agent_status"
						],
						"type": "object"
					},
					{
						"properties": {
							"layout": { "$ref": "#/schemas/event/$defs/PaneLayoutSnapshot" },
							"type": {
								"const": "layout_updated",
								"type": "string"
							}
						},
						"required": ["type", "layout"],
						"type": "object"
					}
				] },
				"EventKind": {
					"enum": [
						"workspace_created",
						"workspace_updated",
						"workspace_metadata_updated",
						"workspace_closed",
						"workspace_renamed",
						"workspace_moved",
						"workspace_reordered",
						"workspace_focused",
						"worktree_created",
						"worktree_opened",
						"worktree_removed",
						"tab_created",
						"tab_closed",
						"tab_renamed",
						"tab_moved",
						"tab_focused",
						"pane_created",
						"pane_closed",
						"pane_updated",
						"pane_focused",
						"pane_moved",
						"pane_output_changed",
						"pane_exited",
						"pane_agent_detected",
						"pane_agent_status_changed",
						"layout_updated"
					],
					"type": "string"
				},
				"PaneInfo": {
					"properties": {
						"agent": { "type": ["string", "null"] },
						"agent_session": { "anyOf": [{ "$ref": "#/schemas/event/$defs/AgentSessionInfo" }, { "type": "null" }] },
						"agent_status": { "$ref": "#/schemas/event/$defs/AgentStatus" },
						"cwd": { "type": ["string", "null"] },
						"display_agent": { "type": ["string", "null"] },
						"focused": { "type": "boolean" },
						"foreground_cwd": { "type": ["string", "null"] },
						"label": { "type": ["string", "null"] },
						"pane_id": { "type": "string" },
						"restore_error": { "type": ["string", "null"] },
						"revision": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"scroll": { "anyOf": [{ "$ref": "#/schemas/event/$defs/PaneScrollInfo" }, { "type": "null" }] },
						"state_labels": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"tab_id": { "type": "string" },
						"terminal_id": { "type": "string" },
						"terminal_title": { "type": ["string", "null"] },
						"terminal_title_stripped": { "type": ["string", "null"] },
						"title": { "type": ["string", "null"] },
						"tokens": {
							"additionalProperties": { "type": "string" },
							"maxProperties": 32,
							"propertyNames": { "pattern": "^[A-Za-z0-9_-]{1,32}$" },
							"type": "object"
						},
						"workspace_id": { "type": "string" }
					},
					"required": [
						"pane_id",
						"terminal_id",
						"workspace_id",
						"tab_id",
						"focused",
						"agent_status",
						"revision"
					],
					"type": "object"
				},
				"PaneLayoutPane": {
					"properties": {
						"focused": { "type": "boolean" },
						"pane_id": { "type": "string" },
						"rect": { "$ref": "#/schemas/event/$defs/PaneLayoutRect" }
					},
					"required": [
						"pane_id",
						"focused",
						"rect"
					],
					"type": "object"
				},
				"PaneLayoutRect": {
					"properties": {
						"height": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"width": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"x": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"y": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						}
					},
					"required": [
						"x",
						"y",
						"width",
						"height"
					],
					"type": "object"
				},
				"PaneLayoutSnapshot": {
					"properties": {
						"area": { "$ref": "#/schemas/event/$defs/PaneLayoutRect" },
						"focused_pane_id": { "type": "string" },
						"panes": {
							"items": { "$ref": "#/schemas/event/$defs/PaneLayoutPane" },
							"type": "array"
						},
						"splits": {
							"items": { "$ref": "#/schemas/event/$defs/PaneLayoutSplit" },
							"type": "array"
						},
						"tab_id": { "type": "string" },
						"workspace_id": { "type": "string" },
						"zoomed": { "type": "boolean" }
					},
					"required": [
						"workspace_id",
						"tab_id",
						"zoomed",
						"area",
						"focused_pane_id",
						"panes",
						"splits"
					],
					"type": "object"
				},
				"PaneLayoutSplit": {
					"properties": {
						"direction": { "$ref": "#/schemas/event/$defs/SplitDirection" },
						"id": { "type": "string" },
						"ratio": {
							"format": "float",
							"type": "number"
						},
						"rect": { "$ref": "#/schemas/event/$defs/PaneLayoutRect" }
					},
					"required": [
						"id",
						"direction",
						"ratio",
						"rect"
					],
					"type": "object"
				},
				"PaneScrollInfo": {
					"properties": {
						"max_offset_from_bottom": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"offset_from_bottom": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"viewport_rows": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						}
					},
					"required": [
						"offset_from_bottom",
						"max_offset_from_bottom",
						"viewport_rows"
					],
					"type": "object"
				},
				"SplitDirection": {
					"enum": ["right", "down"],
					"type": "string"
				},
				"TabInfo": {
					"properties": {
						"agent_status": { "$ref": "#/schemas/event/$defs/AgentStatus" },
						"focused": { "type": "boolean" },
						"label": { "type": "string" },
						"number": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"pane_count": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"tab_id": { "type": "string" },
						"workspace_id": { "type": "string" }
					},
					"required": [
						"tab_id",
						"workspace_id",
						"number",
						"label",
						"focused",
						"pane_count",
						"agent_status"
					],
					"type": "object"
				},
				"WorkspaceInfo": {
					"properties": {
						"active_tab_id": { "type": "string" },
						"agent_status": { "$ref": "#/schemas/event/$defs/AgentStatus" },
						"focused": { "type": "boolean" },
						"label": { "type": "string" },
						"number": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"pane_count": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"tab_count": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"tokens": {
							"additionalProperties": { "type": "string" },
							"maxProperties": 32,
							"propertyNames": { "pattern": "^[A-Za-z0-9_-]{1,32}$" },
							"type": "object"
						},
						"workspace_id": { "type": "string" },
						"worktree": { "anyOf": [{ "$ref": "#/schemas/event/$defs/WorkspaceWorktreeInfo" }, { "type": "null" }] }
					},
					"required": [
						"workspace_id",
						"number",
						"label",
						"focused",
						"pane_count",
						"tab_count",
						"active_tab_id",
						"agent_status"
					],
					"type": "object"
				},
				"WorkspaceWorktreeInfo": {
					"properties": {
						"checkout_path": { "type": "string" },
						"is_linked_worktree": { "type": "boolean" },
						"repo_key": { "type": "string" },
						"repo_name": { "type": "string" },
						"repo_root": { "type": "string" }
					},
					"required": [
						"repo_key",
						"repo_name",
						"repo_root",
						"checkout_path",
						"is_linked_worktree"
					],
					"type": "object"
				},
				"WorktreeInfo": {
					"properties": {
						"branch": { "type": ["string", "null"] },
						"is_bare": { "type": "boolean" },
						"is_detached": { "type": "boolean" },
						"is_linked_worktree": { "type": "boolean" },
						"is_prunable": { "type": "boolean" },
						"label": { "type": "string" },
						"open_workspace_id": { "type": ["string", "null"] },
						"path": { "type": "string" }
					},
					"required": [
						"path",
						"is_bare",
						"is_detached",
						"is_prunable",
						"is_linked_worktree",
						"label"
					],
					"type": "object"
				}
			},
			"$schema": "https://json-schema.org/draft/2020-12/schema",
			"properties": {
				"data": { "$ref": "#/schemas/event/$defs/EventData" },
				"event": { "$ref": "#/schemas/event/$defs/EventKind" }
			},
			"required": ["event", "data"],
			"title": "EventEnvelope",
			"type": "object"
		},
		"request": {
			"$defs": {
				"AgentPromptParams": {
					"properties": {
						"target": { "type": "string" },
						"text": { "type": "string" },
						"wait": { "anyOf": [{ "$ref": "#/schemas/request/$defs/AgentPromptWaitOptions" }, { "type": "null" }] }
					},
					"required": ["target", "text"],
					"type": "object"
				},
				"AgentPromptWaitOptions": {
					"properties": {
						"timeout_ms": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"until": {
							"items": { "$ref": "#/schemas/request/$defs/AgentStatus" },
							"type": "array"
						}
					},
					"type": "object"
				},
				"AgentReadParams": {
					"properties": {
						"format": {
							"$ref": "#/schemas/request/$defs/ReadFormat",
							"default": "text"
						},
						"lines": {
							"format": "uint32",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"source": { "$ref": "#/schemas/request/$defs/ReadSource" },
						"strip_ansi": {
							"default": true,
							"type": "boolean"
						},
						"target": { "type": "string" }
					},
					"required": ["target", "source"],
					"type": "object"
				},
				"AgentRenameParams": {
					"properties": {
						"name": { "type": ["string", "null"] },
						"target": { "type": "string" }
					},
					"required": ["target"],
					"type": "object"
				},
				"AgentSendKeysParams": {
					"properties": {
						"keys": {
							"items": { "type": "string" },
							"type": "array"
						},
						"target": { "type": "string" }
					},
					"required": ["target", "keys"],
					"type": "object"
				},
				"AgentStartParams": {
					"properties": {
						"args": {
							"items": { "type": "string" },
							"type": "array"
						},
						"kind": { "type": "string" },
						"name": { "type": "string" },
						"pane_id": { "type": "string" },
						"timeout_ms": {
							"description": "Startup timeout in milliseconds. Values must be greater than 3000 and at most 300000.",
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						}
					},
					"required": [
						"name",
						"kind",
						"pane_id"
					],
					"type": "object"
				},
				"AgentStatus": {
					"enum": [
						"idle",
						"working",
						"blocked",
						"done",
						"unknown"
					],
					"type": "string"
				},
				"AgentTarget": {
					"properties": { "target": { "type": "string" } },
					"required": ["target"],
					"type": "object"
				},
				"AgentViewBuiltinField": {
					"enum": [
						"status",
						"workspace_id",
						"tab_id",
						"pane_id",
						"agent",
						"seen",
						"state_change_seq"
					],
					"type": "string"
				},
				"AgentViewBuiltinSortField": {
					"enum": [
						"workspace_order",
						"tab_order",
						"pane_order",
						"attention",
						"status",
						"agent",
						"seen",
						"state_change_seq"
					],
					"type": "string"
				},
				"AgentViewClearParams": {
					"properties": { "source": { "type": ["string", "null"] } },
					"type": "object"
				},
				"AgentViewContext": {
					"enum": ["current_workspace_id", "current_tab_id"],
					"type": "string"
				},
				"AgentViewField": { "anyOf": [{ "$ref": "#/schemas/request/$defs/AgentViewBuiltinField" }, {
					"properties": { "token": { "type": "string" } },
					"required": ["token"],
					"type": "object"
				}] },
				"AgentViewFilter": { "oneOf": [
					{
						"properties": {
							"filters": {
								"items": { "$ref": "#/schemas/request/$defs/AgentViewFilter" },
								"type": "array"
							},
							"op": {
								"const": "all",
								"type": "string"
							}
						},
						"required": ["op", "filters"],
						"type": "object"
					},
					{
						"properties": {
							"filters": {
								"items": { "$ref": "#/schemas/request/$defs/AgentViewFilter" },
								"type": "array"
							},
							"op": {
								"const": "any",
								"type": "string"
							}
						},
						"required": ["op", "filters"],
						"type": "object"
					},
					{
						"properties": {
							"filter": { "$ref": "#/schemas/request/$defs/AgentViewFilter" },
							"op": {
								"const": "not",
								"type": "string"
							}
						},
						"required": ["op", "filter"],
						"type": "object"
					},
					{
						"properties": {
							"field": { "$ref": "#/schemas/request/$defs/AgentViewField" },
							"op": {
								"const": "eq",
								"type": "string"
							},
							"value": { "$ref": "#/schemas/request/$defs/AgentViewValue" }
						},
						"required": [
							"op",
							"field",
							"value"
						],
						"type": "object"
					},
					{
						"properties": {
							"field": { "$ref": "#/schemas/request/$defs/AgentViewField" },
							"op": {
								"const": "in",
								"type": "string"
							},
							"values": {
								"items": { "$ref": "#/schemas/request/$defs/AgentViewValue" },
								"type": "array"
							}
						},
						"required": [
							"op",
							"field",
							"values"
						],
						"type": "object"
					},
					{
						"properties": {
							"field": { "$ref": "#/schemas/request/$defs/AgentViewField" },
							"op": {
								"const": "exists",
								"type": "string"
							}
						},
						"required": ["op", "field"],
						"type": "object"
					}
				] },
				"AgentViewSetParams": {
					"properties": {
						"filter": { "anyOf": [{ "$ref": "#/schemas/request/$defs/AgentViewFilter" }, { "type": "null" }] },
						"label": { "type": ["string", "null"] },
						"sort": {
							"items": { "$ref": "#/schemas/request/$defs/AgentViewSort" },
							"type": "array"
						},
						"source": { "type": "string" }
					},
					"required": ["source"],
					"type": "object"
				},
				"AgentViewSort": {
					"properties": {
						"field": { "$ref": "#/schemas/request/$defs/AgentViewSortField" },
						"order": {
							"$ref": "#/schemas/request/$defs/AgentViewSortOrder",
							"default": "asc"
						}
					},
					"required": ["field"],
					"type": "object"
				},
				"AgentViewSortField": { "anyOf": [{ "$ref": "#/schemas/request/$defs/AgentViewBuiltinSortField" }, {
					"properties": { "token": { "type": "string" } },
					"required": ["token"],
					"type": "object"
				}] },
				"AgentViewSortOrder": {
					"enum": ["asc", "desc"],
					"type": "string"
				},
				"AgentViewValue": { "anyOf": [
					{ "type": "string" },
					{ "type": "boolean" },
					{
						"format": "uint64",
						"minimum": 0,
						"type": "integer"
					},
					{
						"properties": { "context": { "$ref": "#/schemas/request/$defs/AgentViewContext" } },
						"required": ["context"],
						"type": "object"
					}
				] },
				"AgentWaitParams": {
					"properties": {
						"target": { "type": "string" },
						"timeout_ms": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"until": {
							"items": { "$ref": "#/schemas/request/$defs/AgentStatus" },
							"type": "array"
						}
					},
					"required": ["target"],
					"type": "object"
				},
				"ClientShellSurfaceSetParams": {
					"description": "Updates whether the requesting client shell receives and controls pane presentation.",
					"properties": { "active": { "type": "boolean" } },
					"required": ["active"],
					"type": "object"
				},
				"ClientWindowTitleSetParams": {
					"properties": { "title": { "type": "string" } },
					"required": ["title"],
					"type": "object"
				},
				"CommandInvokeParams": {
					"properties": {
						"command_id": {
							"description": "Opaque endpoint-issued command identifier from the client-shell projection.",
							"type": "string"
						},
						"pane_id": { "type": ["string", "null"] },
						"selection": {
							"anyOf": [{ "$ref": "#/schemas/request/$defs/PaneSelectionReadParams" }, { "type": "null" }],
							"description": "Client-owned selection coordinates, validated against the pane's content revision."
						},
						"tab_id": { "type": ["string", "null"] },
						"workspace_id": { "type": ["string", "null"] }
					},
					"required": ["command_id"],
					"type": "object"
				},
				"EmptyParams": { "type": "object" },
				"EventMatch": { "oneOf": [
					{
						"properties": {
							"event": {
								"const": "workspace_created",
								"type": "string"
							},
							"workspace_id": { "type": ["string", "null"] }
						},
						"required": ["event"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "workspace_updated",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": ["event", "workspace_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "workspace_closed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": ["event", "workspace_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "workspace_renamed",
								"type": "string"
							},
							"label": { "type": ["string", "null"] },
							"workspace_id": { "type": "string" }
						},
						"required": ["event", "workspace_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "workspace_moved",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": ["event", "workspace_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "workspace_focused",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": ["event", "workspace_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "tab_created",
								"type": "string"
							},
							"tab_id": { "type": ["string", "null"] },
							"workspace_id": { "type": ["string", "null"] }
						},
						"required": ["event"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "tab_closed",
								"type": "string"
							},
							"tab_id": { "type": "string" }
						},
						"required": ["event", "tab_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "tab_renamed",
								"type": "string"
							},
							"label": { "type": ["string", "null"] },
							"tab_id": { "type": "string" }
						},
						"required": ["event", "tab_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "tab_moved",
								"type": "string"
							},
							"tab_id": { "type": "string" }
						},
						"required": ["event", "tab_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "tab_focused",
								"type": "string"
							},
							"tab_id": { "type": "string" }
						},
						"required": ["event", "tab_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "pane_created",
								"type": "string"
							},
							"pane_id": { "type": ["string", "null"] },
							"workspace_id": { "type": ["string", "null"] }
						},
						"required": ["event"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "pane_closed",
								"type": "string"
							},
							"pane_id": { "type": "string" }
						},
						"required": ["event", "pane_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "pane_focused",
								"type": "string"
							},
							"pane_id": { "type": "string" }
						},
						"required": ["event", "pane_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "pane_moved",
								"type": "string"
							},
							"pane_id": { "type": "string" }
						},
						"required": ["event", "pane_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "pane_output_changed",
								"type": "string"
							},
							"min_revision": {
								"format": "uint64",
								"minimum": 0,
								"type": ["integer", "null"]
							},
							"pane_id": { "type": "string" }
						},
						"required": ["event", "pane_id"],
						"type": "object"
					},
					{
						"properties": {
							"event": {
								"const": "pane_exited",
								"type": "string"
							},
							"pane_id": { "type": "string" }
						},
						"required": ["event", "pane_id"],
						"type": "object"
					},
					{
						"properties": {
							"agent": { "type": ["string", "null"] },
							"event": {
								"const": "pane_agent_detected",
								"type": "string"
							},
							"pane_id": { "type": "string" }
						},
						"required": ["event", "pane_id"],
						"type": "object"
					},
					{
						"properties": {
							"agent_status": { "$ref": "#/schemas/request/$defs/AgentStatus" },
							"event": {
								"const": "pane_agent_status_changed",
								"type": "string"
							},
							"pane_id": { "type": "string" }
						},
						"required": [
							"event",
							"pane_id",
							"agent_status"
						],
						"type": "object"
					}
				] },
				"EventsSubscribeParams": {
					"properties": { "subscriptions": {
						"items": { "$ref": "#/schemas/request/$defs/Subscription" },
						"type": "array"
					} },
					"required": ["subscriptions"],
					"type": "object"
				},
				"EventsWaitParams": {
					"properties": {
						"match_event": { "$ref": "#/schemas/request/$defs/EventMatch" },
						"timeout_ms": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						}
					},
					"required": ["match_event"],
					"type": "object"
				},
				"IntegrationInstallParams": {
					"properties": { "target": { "$ref": "#/schemas/request/$defs/IntegrationTarget" } },
					"required": ["target"],
					"type": "object"
				},
				"IntegrationTarget": {
					"enum": [
						"pi",
						"omp",
						"claude",
						"codex",
						"copilot",
						"devin",
						"droid",
						"kimi",
						"opencode",
						"kilo",
						"hermes",
						"qodercli",
						"qwen",
						"cursor",
						"mastracode",
						"antigravity_cli",
						"grok"
					],
					"type": "string"
				},
				"IntegrationUninstallParams": {
					"properties": { "target": { "$ref": "#/schemas/request/$defs/IntegrationTarget" } },
					"required": ["target"],
					"type": "object"
				},
				"LayoutApplyParams": {
					"properties": {
						"focus": {
							"default": false,
							"type": "boolean"
						},
						"root": { "$ref": "#/schemas/request/$defs/LayoutNode" },
						"tab_id": { "type": ["string", "null"] },
						"tab_label": { "type": ["string", "null"] },
						"workspace_id": { "type": ["string", "null"] }
					},
					"required": ["root"],
					"type": "object"
				},
				"LayoutExportParams": {
					"properties": {
						"pane_id": { "type": ["string", "null"] },
						"tab_id": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"LayoutNode": { "oneOf": [{
					"properties": {
						"command": {
							"items": { "type": "string" },
							"type": ["array", "null"]
						},
						"cwd": { "type": ["string", "null"] },
						"env": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"label": { "type": ["string", "null"] },
						"pane_id": { "type": ["string", "null"] },
						"type": {
							"const": "pane",
							"type": "string"
						}
					},
					"required": ["type"],
					"type": "object"
				}, {
					"properties": {
						"direction": { "$ref": "#/schemas/request/$defs/SplitDirection" },
						"first": { "$ref": "#/schemas/request/$defs/LayoutNode" },
						"ratio": {
							"format": "float",
							"type": "number"
						},
						"second": { "$ref": "#/schemas/request/$defs/LayoutNode" },
						"type": {
							"const": "split",
							"type": "string"
						}
					},
					"required": [
						"type",
						"direction",
						"ratio",
						"first",
						"second"
					],
					"type": "object"
				}] },
				"LayoutSetSplitRatioParams": {
					"properties": {
						"pane_id": { "type": ["string", "null"] },
						"path": {
							"items": { "type": "boolean" },
							"type": "array"
						},
						"ratio": {
							"format": "float",
							"type": "number"
						},
						"tab_id": { "type": ["string", "null"] }
					},
					"required": ["path", "ratio"],
					"type": "object"
				},
				"NotificationShowParams": {
					"properties": {
						"body": { "type": ["string", "null"] },
						"position": { "anyOf": [{ "$ref": "#/schemas/request/$defs/ToastHerdrPosition" }, { "type": "null" }] },
						"sound": { "$ref": "#/schemas/request/$defs/NotificationShowSound" },
						"title": { "type": "string" }
					},
					"required": ["title"],
					"type": "object"
				},
				"NotificationShowSound": {
					"enum": [
						"none",
						"done",
						"request"
					],
					"type": "string"
				},
				"OutputMatch": { "oneOf": [{
					"properties": {
						"type": {
							"const": "substring",
							"type": "string"
						},
						"value": { "type": "string" }
					},
					"required": ["type", "value"],
					"type": "object"
				}, {
					"properties": {
						"type": {
							"const": "regex",
							"type": "string"
						},
						"value": { "type": "string" }
					},
					"required": ["type", "value"],
					"type": "object"
				}] },
				"PaneAgentState": {
					"enum": [
						"idle",
						"working",
						"blocked",
						"unknown"
					],
					"type": "string"
				},
				"PaneClearAgentAuthorityParams": {
					"properties": {
						"pane_id": { "type": "string" },
						"seq": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"source": { "type": ["string", "null"] }
					},
					"required": ["pane_id"],
					"type": "object"
				},
				"PaneCopyMotion": {
					"enum": [
						"line_end",
						"first_non_blank",
						"next_word_start",
						"previous_word_start",
						"next_word_end",
						"next_big_word_start",
						"previous_big_word_start",
						"next_big_word_end",
						"previous_paragraph",
						"next_paragraph"
					],
					"type": "string"
				},
				"PaneCopyMotionParams": {
					"properties": {
						"content_revision": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"cursor": { "$ref": "#/schemas/request/$defs/PaneTextPoint" },
						"motion": { "$ref": "#/schemas/request/$defs/PaneCopyMotion" },
						"pane_id": { "type": "string" }
					},
					"required": [
						"pane_id",
						"cursor",
						"motion"
					],
					"type": "object"
				},
				"PaneCopySearchDirection": {
					"enum": ["forward", "backward"],
					"type": "string"
				},
				"PaneCopySearchParams": {
					"properties": {
						"content_revision": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"cursor": { "$ref": "#/schemas/request/$defs/PaneTextPoint" },
						"direction": { "$ref": "#/schemas/request/$defs/PaneCopySearchDirection" },
						"pane_id": { "type": "string" },
						"previous": { "anyOf": [{ "$ref": "#/schemas/request/$defs/PaneTextRange" }, { "type": "null" }] },
						"query": { "type": "string" }
					},
					"required": [
						"pane_id",
						"query",
						"direction",
						"cursor",
						"content_revision"
					],
					"type": "object"
				},
				"PaneCurrentParams": {
					"properties": { "caller_pane_id": { "type": ["string", "null"] } },
					"type": "object"
				},
				"PaneDirection": {
					"enum": [
						"left",
						"right",
						"up",
						"down"
					],
					"type": "string"
				},
				"PaneEdgesParams": {
					"properties": { "pane_id": { "type": ["string", "null"] } },
					"type": "object"
				},
				"PaneFocusDirectionParams": {
					"properties": {
						"direction": { "$ref": "#/schemas/request/$defs/PaneDirection" },
						"pane_id": { "type": ["string", "null"] }
					},
					"required": ["direction"],
					"type": "object"
				},
				"PaneInputSetParams": {
					"properties": {
						"pane_id": { "type": "string" },
						"right_click": { "$ref": "#/schemas/request/$defs/PaneRightClickTarget" }
					},
					"required": ["pane_id", "right_click"],
					"type": "object"
				},
				"PaneLayoutParams": {
					"properties": { "pane_id": { "type": ["string", "null"] } },
					"type": "object"
				},
				"PaneLinkActivateParams": {
					"properties": {
						"col": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"content_revision": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"offset_from_bottom": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"pane_id": { "type": "string" },
						"viewport_row": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						}
					},
					"required": [
						"pane_id",
						"viewport_row",
						"col"
					],
					"type": "object"
				},
				"PaneListParams": {
					"properties": { "workspace_id": { "type": ["string", "null"] } },
					"type": "object"
				},
				"PaneMoveDestination": { "oneOf": [
					{
						"properties": {
							"ratio": {
								"format": "float",
								"type": ["number", "null"]
							},
							"split": { "$ref": "#/schemas/request/$defs/SplitDirection" },
							"tab_id": { "type": "string" },
							"target_pane_id": { "type": ["string", "null"] },
							"type": {
								"const": "tab",
								"type": "string"
							}
						},
						"required": [
							"type",
							"tab_id",
							"split"
						],
						"type": "object"
					},
					{
						"properties": {
							"label": { "type": ["string", "null"] },
							"type": {
								"const": "new_tab",
								"type": "string"
							},
							"workspace_id": { "type": ["string", "null"] }
						},
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": {
							"label": { "type": ["string", "null"] },
							"tab_label": { "type": ["string", "null"] },
							"type": {
								"const": "new_workspace",
								"type": "string"
							}
						},
						"required": ["type"],
						"type": "object"
					}
				] },
				"PaneMoveParams": {
					"properties": {
						"destination": { "$ref": "#/schemas/request/$defs/PaneMoveDestination" },
						"focus": {
							"default": false,
							"type": "boolean"
						},
						"pane_id": { "type": "string" }
					},
					"required": ["pane_id", "destination"],
					"type": "object"
				},
				"PaneNeighborParams": {
					"properties": {
						"direction": { "$ref": "#/schemas/request/$defs/PaneDirection" },
						"pane_id": { "type": ["string", "null"] }
					},
					"required": ["direction"],
					"type": "object"
				},
				"PaneProcessInfoParams": {
					"properties": { "pane_id": { "type": ["string", "null"] } },
					"type": "object"
				},
				"PaneReadParams": {
					"properties": {
						"format": {
							"$ref": "#/schemas/request/$defs/ReadFormat",
							"default": "text"
						},
						"lines": {
							"format": "uint32",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"pane_id": { "type": "string" },
						"source": { "$ref": "#/schemas/request/$defs/ReadSource" },
						"strip_ansi": {
							"default": true,
							"type": "boolean"
						}
					},
					"required": ["pane_id", "source"],
					"type": "object"
				},
				"PaneReleaseAgentParams": {
					"properties": {
						"agent": { "type": "string" },
						"pane_id": { "type": "string" },
						"seq": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"source": { "type": "string" }
					},
					"required": [
						"pane_id",
						"source",
						"agent"
					],
					"type": "object"
				},
				"PaneRenameParams": {
					"properties": {
						"label": { "type": ["string", "null"] },
						"pane_id": { "type": "string" }
					},
					"required": ["pane_id"],
					"type": "object"
				},
				"PaneReportAgentParams": {
					"properties": {
						"agent": { "type": "string" },
						"agent_session_id": { "type": ["string", "null"] },
						"agent_session_path": { "type": ["string", "null"] },
						"message": { "type": ["string", "null"] },
						"pane_id": { "type": "string" },
						"resume_argv": {
							"description": "Command that resumes this agent's session after a Herdr restart. The\nfirst element must be a plain command name.",
							"items": { "type": "string" },
							"type": ["array", "null"]
						},
						"seq": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"source": { "type": "string" },
						"state": { "$ref": "#/schemas/request/$defs/PaneAgentState" }
					},
					"required": [
						"pane_id",
						"source",
						"agent",
						"state"
					],
					"type": "object"
				},
				"PaneReportAgentSessionParams": {
					"properties": {
						"agent": { "type": "string" },
						"agent_session_id": { "type": ["string", "null"] },
						"agent_session_path": { "type": ["string", "null"] },
						"pane_id": { "type": "string" },
						"resume_argv": {
							"description": "Command that resumes this agent's session after a Herdr restart. The\nfirst element must be a plain command name.",
							"items": { "type": "string" },
							"type": ["array", "null"]
						},
						"seq": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"session_start_source": { "type": ["string", "null"] },
						"source": { "type": "string" }
					},
					"required": [
						"pane_id",
						"source",
						"agent"
					],
					"type": "object"
				},
				"PaneReportMetadataParams": {
					"properties": {
						"agent": { "type": ["string", "null"] },
						"applies_to_source": { "type": ["string", "null"] },
						"clear_display_agent": {
							"default": false,
							"type": "boolean"
						},
						"clear_state_labels": {
							"default": false,
							"type": "boolean"
						},
						"clear_title": {
							"default": false,
							"type": "boolean"
						},
						"display_agent": { "type": ["string", "null"] },
						"pane_id": { "type": "string" },
						"seq": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"source": { "type": "string" },
						"state_labels": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"title": { "type": ["string", "null"] },
						"tokens": {
							"additionalProperties": { "type": ["string", "null"] },
							"maxProperties": 16,
							"propertyNames": { "pattern": "^[A-Za-z0-9_-]{1,32}$" },
							"type": "object"
						},
						"ttl_ms": {
							"format": "uint64",
							"maximum": 864e5,
							"minimum": 1,
							"type": ["integer", "null"]
						}
					},
					"required": ["pane_id", "source"],
					"type": "object"
				},
				"PaneResizeParams": {
					"properties": {
						"amount": {
							"format": "float",
							"type": ["number", "null"]
						},
						"direction": { "$ref": "#/schemas/request/$defs/PaneDirection" },
						"pane_id": { "type": ["string", "null"] }
					},
					"required": ["direction"],
					"type": "object"
				},
				"PaneRightClickTarget": {
					"enum": ["herdr", "pane"],
					"type": "string"
				},
				"PaneScrollParams": {
					"properties": {
						"offset_from_bottom": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"pane_id": { "type": "string" }
					},
					"required": ["pane_id", "offset_from_bottom"],
					"type": "object"
				},
				"PaneSelectionReadParams": {
					"properties": {
						"anchor": { "$ref": "#/schemas/request/$defs/PaneTextPoint" },
						"content_revision": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"cursor": { "$ref": "#/schemas/request/$defs/PaneTextPoint" },
						"pane_id": { "type": "string" }
					},
					"required": [
						"pane_id",
						"anchor",
						"cursor"
					],
					"type": "object"
				},
				"PaneSendInputParams": {
					"properties": {
						"keys": {
							"items": { "type": "string" },
							"type": "array"
						},
						"pane_id": { "type": "string" },
						"text": { "type": "string" }
					},
					"required": ["pane_id"],
					"type": "object"
				},
				"PaneSendKeysParams": {
					"properties": {
						"keys": {
							"items": { "type": "string" },
							"type": "array"
						},
						"pane_id": { "type": "string" }
					},
					"required": ["pane_id", "keys"],
					"type": "object"
				},
				"PaneSendTextParams": {
					"properties": {
						"pane_id": { "type": "string" },
						"text": { "type": "string" }
					},
					"required": ["pane_id", "text"],
					"type": "object"
				},
				"PaneSplitParams": {
					"properties": {
						"cwd": { "type": ["string", "null"] },
						"direction": { "$ref": "#/schemas/request/$defs/SplitDirection" },
						"env": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"focus": {
							"default": false,
							"type": "boolean"
						},
						"ratio": {
							"format": "float",
							"type": ["number", "null"]
						},
						"right_click": {
							"$ref": "#/schemas/request/$defs/PaneRightClickTarget",
							"default": "herdr"
						},
						"target_pane_id": { "type": ["string", "null"] },
						"workspace_id": { "type": ["string", "null"] }
					},
					"required": ["direction"],
					"type": "object"
				},
				"PaneSwapParams": {
					"properties": {
						"direction": { "anyOf": [{ "$ref": "#/schemas/request/$defs/PaneDirection" }, { "type": "null" }] },
						"pane_id": { "type": ["string", "null"] },
						"source_pane_id": { "type": ["string", "null"] },
						"target_pane_id": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"PaneTarget": {
					"properties": { "pane_id": { "type": "string" } },
					"required": ["pane_id"],
					"type": "object"
				},
				"PaneTextPoint": {
					"properties": {
						"col": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"row": {
							"format": "uint32",
							"minimum": 0,
							"type": "integer"
						}
					},
					"required": ["row", "col"],
					"type": "object"
				},
				"PaneTextRange": {
					"properties": {
						"end": { "$ref": "#/schemas/request/$defs/PaneTextPoint" },
						"start": { "$ref": "#/schemas/request/$defs/PaneTextPoint" }
					},
					"required": ["start", "end"],
					"type": "object"
				},
				"PaneWaitForOutputParams": {
					"properties": {
						"lines": {
							"format": "uint32",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"match": { "$ref": "#/schemas/request/$defs/OutputMatch" },
						"pane_id": { "type": "string" },
						"source": { "$ref": "#/schemas/request/$defs/ReadSource" },
						"strip_ansi": {
							"default": true,
							"type": "boolean"
						},
						"timeout_ms": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						}
					},
					"required": [
						"pane_id",
						"source",
						"match"
					],
					"type": "object"
				},
				"PaneZoomMode": {
					"enum": [
						"toggle",
						"on",
						"off"
					],
					"type": "string"
				},
				"PaneZoomParams": {
					"properties": {
						"mode": {
							"$ref": "#/schemas/request/$defs/PaneZoomMode",
							"default": "toggle"
						},
						"pane_id": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"PingParams": { "type": "object" },
				"PluginActionInvokeParams": {
					"properties": {
						"action_id": { "type": "string" },
						"context": { "anyOf": [{ "$ref": "#/schemas/request/$defs/PluginInvocationContext" }, { "type": "null" }] },
						"plugin_id": { "type": ["string", "null"] }
					},
					"required": ["action_id"],
					"type": "object"
				},
				"PluginActionListParams": {
					"properties": { "plugin_id": { "type": ["string", "null"] } },
					"type": "object"
				},
				"PluginInvocationContext": {
					"properties": {
						"clicked_url": { "type": ["string", "null"] },
						"correlation_id": { "type": ["string", "null"] },
						"focused_pane_agent": { "type": ["string", "null"] },
						"focused_pane_cwd": { "type": ["string", "null"] },
						"focused_pane_id": { "type": ["string", "null"] },
						"focused_pane_status": { "anyOf": [{ "$ref": "#/schemas/request/$defs/AgentStatus" }, { "type": "null" }] },
						"invocation_source": { "type": ["string", "null"] },
						"link_handler_id": { "type": ["string", "null"] },
						"selected_text": { "type": ["string", "null"] },
						"tab_id": { "type": ["string", "null"] },
						"tab_label": { "type": ["string", "null"] },
						"workspace_cwd": { "type": ["string", "null"] },
						"workspace_id": { "type": ["string", "null"] },
						"workspace_label": { "type": ["string", "null"] },
						"worktree": { "anyOf": [{ "$ref": "#/schemas/request/$defs/WorkspaceWorktreeInfo" }, { "type": "null" }] }
					},
					"type": "object"
				},
				"PluginLinkParams": {
					"properties": {
						"enabled": {
							"default": true,
							"type": "boolean"
						},
						"path": { "type": "string" },
						"source": { "anyOf": [{ "$ref": "#/schemas/request/$defs/PluginSourceInfo" }, { "type": "null" }] }
					},
					"required": ["path"],
					"type": "object"
				},
				"PluginListParams": {
					"properties": { "plugin_id": { "type": ["string", "null"] } },
					"type": "object"
				},
				"PluginLogListParams": {
					"properties": {
						"limit": {
							"format": "uint",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"plugin_id": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"PluginPaneCloseParams": {
					"properties": { "pane_id": { "type": "string" } },
					"required": ["pane_id"],
					"type": "object"
				},
				"PluginPaneFocusParams": {
					"properties": { "pane_id": { "type": "string" } },
					"required": ["pane_id"],
					"type": "object"
				},
				"PluginPaneOpenParams": {
					"properties": {
						"cwd": { "type": ["string", "null"] },
						"direction": { "anyOf": [{ "$ref": "#/schemas/request/$defs/SplitDirection" }, { "type": "null" }] },
						"entrypoint": { "type": "string" },
						"env": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"focus": {
							"default": false,
							"type": "boolean"
						},
						"height": { "anyOf": [{ "$ref": "#/schemas/request/$defs/PopupSize" }, { "type": "null" }] },
						"placement": { "anyOf": [{ "$ref": "#/schemas/request/$defs/PluginPanePlacement" }, { "type": "null" }] },
						"plugin_id": { "type": "string" },
						"target_pane_id": { "type": ["string", "null"] },
						"width": { "anyOf": [{ "$ref": "#/schemas/request/$defs/PopupSize" }, { "type": "null" }] },
						"workspace_id": { "type": ["string", "null"] }
					},
					"required": ["plugin_id", "entrypoint"],
					"type": "object"
				},
				"PluginPanePlacement": {
					"enum": [
						"overlay",
						"popup",
						"split",
						"tab",
						"zoomed"
					],
					"type": "string"
				},
				"PluginSetEnabledParams": {
					"properties": { "plugin_id": { "type": "string" } },
					"required": ["plugin_id"],
					"type": "object"
				},
				"PluginSourceInfo": {
					"properties": {
						"installed_unix_ms": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"kind": {
							"$ref": "#/schemas/request/$defs/PluginSourceKind",
							"default": "local"
						},
						"managed_path": { "type": ["string", "null"] },
						"owner": { "type": ["string", "null"] },
						"repo": { "type": ["string", "null"] },
						"requested_ref": { "type": ["string", "null"] },
						"resolved_commit": { "type": ["string", "null"] },
						"subdir": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"PluginSourceKind": {
					"enum": ["local", "github"],
					"type": "string"
				},
				"PluginUnlinkParams": {
					"properties": { "plugin_id": { "type": "string" } },
					"required": ["plugin_id"],
					"type": "object"
				},
				"PopupSize": { "oneOf": [{
					"description": "Outer popup size in terminal cells, including the border.",
					"maximum": 65535,
					"minimum": 0,
					"type": "integer"
				}, {
					"description": "Outer popup size as a percentage of the terminal area, for example 80%.",
					"pattern": "^(100|[1-9][0-9]?)%$",
					"type": "string"
				}] },
				"ProductAnnouncementDismissParams": {
					"properties": {
						"id": { "type": "string" },
						"version": { "type": "string" }
					},
					"required": ["version", "id"],
					"type": "object"
				},
				"ReadFormat": {
					"enum": ["text", "ansi"],
					"type": "string"
				},
				"ReadSource": {
					"enum": [
						"visible",
						"recent",
						"recent_unwrapped",
						"detection"
					],
					"type": "string"
				},
				"ReleaseNotesDismissParams": {
					"properties": { "version": { "type": "string" } },
					"required": ["version"],
					"type": "object"
				},
				"ServerLiveHandoffParams": {
					"properties": {
						"expected_protocol": {
							"format": "uint32",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"expected_version": { "type": ["string", "null"] },
						"import_exe": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"ServerSshAgentRegisterParams": {
					"properties": { "socket_path": {
						"description": "Absolute remote-host agent socket. Registration lasts until this API connection closes.",
						"type": "string"
					} },
					"required": ["socket_path"],
					"type": "object"
				},
				"SplitDirection": {
					"enum": ["right", "down"],
					"type": "string"
				},
				"Subscription": { "oneOf": [
					{
						"properties": { "type": {
							"const": "workspace.created",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "workspace.updated",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "workspace.metadata_updated",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "workspace.renamed",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "workspace.moved",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "workspace.reordered",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "workspace.closed",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "workspace.focused",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "worktree.created",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "worktree.opened",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "worktree.removed",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "tab.created",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "tab.closed",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "tab.focused",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "tab.renamed",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "tab.moved",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "pane.created",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "pane.closed",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "pane.updated",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "pane.focused",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "pane.moved",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "pane.exited",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "pane.agent_detected",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": {
							"lines": {
								"format": "uint32",
								"minimum": 0,
								"type": ["integer", "null"]
							},
							"match": { "$ref": "#/schemas/request/$defs/OutputMatch" },
							"pane_id": { "type": "string" },
							"source": { "$ref": "#/schemas/request/$defs/ReadSource" },
							"strip_ansi": {
								"default": true,
								"type": "boolean"
							},
							"type": {
								"const": "pane.output_matched",
								"type": "string"
							}
						},
						"required": [
							"type",
							"pane_id",
							"source",
							"match"
						],
						"type": "object"
					},
					{
						"properties": {
							"agent_status": { "anyOf": [{ "$ref": "#/schemas/request/$defs/AgentStatus" }, { "type": "null" }] },
							"pane_id": { "type": "string" },
							"type": {
								"const": "pane.agent_status_changed",
								"type": "string"
							}
						},
						"required": ["type", "pane_id"],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"type": {
								"const": "pane.scroll_changed",
								"type": "string"
							}
						},
						"required": ["type", "pane_id"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "layout.updated",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					}
				] },
				"TabCreateParams": {
					"properties": {
						"cwd": { "type": ["string", "null"] },
						"env": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"focus": {
							"default": false,
							"type": "boolean"
						},
						"label": { "type": ["string", "null"] },
						"workspace_id": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"TabListParams": {
					"properties": { "workspace_id": { "type": ["string", "null"] } },
					"type": "object"
				},
				"TabMoveParams": {
					"properties": {
						"insert_index": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"tab_id": { "type": "string" }
					},
					"required": ["tab_id", "insert_index"],
					"type": "object"
				},
				"TabRenameParams": {
					"properties": {
						"label": { "type": "string" },
						"tab_id": { "type": "string" }
					},
					"required": ["tab_id", "label"],
					"type": "object"
				},
				"TabTarget": {
					"properties": { "tab_id": { "type": "string" } },
					"required": ["tab_id"],
					"type": "object"
				},
				"ToastHerdrPosition": {
					"enum": [
						"top-left",
						"top-right",
						"bottom-left",
						"bottom-right"
					],
					"type": "string"
				},
				"WorkspaceCloseParams": {
					"properties": {
						"close_group": { "type": "boolean" },
						"workspace_id": { "type": "string" }
					},
					"required": ["workspace_id"],
					"type": "object"
				},
				"WorkspaceCreateParams": {
					"properties": {
						"cwd": { "type": ["string", "null"] },
						"env": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"focus": {
							"default": false,
							"type": "boolean"
						},
						"label": { "type": ["string", "null"] },
						"source_workspace_id": {
							"description": "Workspace whose focused pane supplies the `follow` cwd policy.",
							"type": ["string", "null"]
						}
					},
					"type": "object"
				},
				"WorkspaceMoveBlockParams": {
					"properties": {
						"before_workspace_id": { "type": ["string", "null"] },
						"workspace_ids": {
							"items": { "type": "string" },
							"type": "array"
						}
					},
					"required": ["workspace_ids"],
					"type": "object"
				},
				"WorkspaceMoveParams": {
					"properties": {
						"insert_index": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"workspace_id": { "type": "string" }
					},
					"required": ["workspace_id", "insert_index"],
					"type": "object"
				},
				"WorkspaceRenameParams": {
					"properties": {
						"label": { "type": "string" },
						"workspace_id": { "type": "string" }
					},
					"required": ["workspace_id", "label"],
					"type": "object"
				},
				"WorkspaceReportMetadataParams": {
					"properties": {
						"seq": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"source": { "type": "string" },
						"tokens": {
							"additionalProperties": { "type": ["string", "null"] },
							"maxProperties": 16,
							"propertyNames": { "pattern": "^[A-Za-z0-9_-]{1,32}$" },
							"type": "object"
						},
						"ttl_ms": {
							"format": "uint64",
							"maximum": 864e5,
							"minimum": 1,
							"type": ["integer", "null"]
						},
						"workspace_id": { "type": "string" }
					},
					"required": [
						"workspace_id",
						"source",
						"tokens"
					],
					"type": "object"
				},
				"WorkspaceTarget": {
					"properties": { "workspace_id": { "type": "string" } },
					"required": ["workspace_id"],
					"type": "object"
				},
				"WorkspaceWorktreeInfo": {
					"properties": {
						"checkout_path": { "type": "string" },
						"is_linked_worktree": { "type": "boolean" },
						"repo_key": { "type": "string" },
						"repo_name": { "type": "string" },
						"repo_root": { "type": "string" }
					},
					"required": [
						"repo_key",
						"repo_name",
						"repo_root",
						"checkout_path",
						"is_linked_worktree"
					],
					"type": "object"
				},
				"WorktreeCreateParams": {
					"properties": {
						"base": { "type": ["string", "null"] },
						"branch": { "type": ["string", "null"] },
						"cwd": { "type": ["string", "null"] },
						"focus": {
							"default": false,
							"type": "boolean"
						},
						"label": { "type": ["string", "null"] },
						"path": { "type": ["string", "null"] },
						"trust_repository": { "type": "boolean" },
						"workspace_id": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"WorktreeListParams": {
					"properties": {
						"cwd": { "type": ["string", "null"] },
						"trust_repository": { "type": "boolean" },
						"workspace_id": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"WorktreeOpenParams": {
					"properties": {
						"branch": { "type": ["string", "null"] },
						"cwd": { "type": ["string", "null"] },
						"focus": {
							"default": false,
							"type": "boolean"
						},
						"label": { "type": ["string", "null"] },
						"path": { "type": ["string", "null"] },
						"trust_repository": { "type": "boolean" },
						"workspace_id": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"WorktreeRemoveParams": {
					"properties": {
						"force": {
							"default": false,
							"type": "boolean"
						},
						"trust_repository": { "type": "boolean" },
						"workspace_id": { "type": "string" }
					},
					"required": ["workspace_id"],
					"type": "object"
				}
			},
			"$schema": "https://json-schema.org/draft/2020-12/schema",
			"oneOf": [
				{
					"properties": {
						"method": {
							"const": "ping",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PingParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "server.stop",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EmptyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "server.live_handoff",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/ServerLiveHandoffParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "server.reload_config",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EmptyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "server.ssh_agent.register",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/ServerSshAgentRegisterParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "server.agent_manifests",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EmptyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "server.reload_agent_manifests",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EmptyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "notification.show",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/NotificationShowParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "product_announcement.dismiss",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/ProductAnnouncementDismissParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "release_notes.dismiss",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/ReleaseNotesDismissParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "command.invoke",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/CommandInvokeParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "client.window_title.set",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/ClientWindowTitleSetParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "client.window_title.clear",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EmptyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "client_shell.surface.set",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/ClientShellSurfaceSetParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "session.snapshot",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EmptyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "workspace.create",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorkspaceCreateParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "workspace.list",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EmptyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "workspace.get",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorkspaceTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "workspace.focus",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorkspaceTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "workspace.rename",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorkspaceRenameParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "workspace.move",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorkspaceMoveParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "workspace.move_block",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorkspaceMoveBlockParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "workspace.report_metadata",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorkspaceReportMetadataParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "workspace.close",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorkspaceCloseParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "worktree.list",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorktreeListParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "worktree.create",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorktreeCreateParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "worktree.open",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorktreeOpenParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "worktree.remove",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/WorktreeRemoveParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "tab.create",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/TabCreateParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "tab.list",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/TabListParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "tab.get",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/TabTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "tab.focus",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/TabTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "tab.rename",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/TabRenameParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "tab.move",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/TabMoveParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "tab.close",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/TabTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.list",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EmptyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.get",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.read",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentReadParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.explain",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.send_keys",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentSendKeysParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.rename",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentRenameParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.view.set",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentViewSetParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.view.clear",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentViewClearParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.focus",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.start",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentStartParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.prompt",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentPromptParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "agent.wait",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/AgentWaitParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.split",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneSplitParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.swap",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneSwapParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.move",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneMoveParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.zoom",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneZoomParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.layout",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneLayoutParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.process_info",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneProcessInfoParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "layout.export",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/LayoutExportParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "layout.apply",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/LayoutApplyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "layout.set_split_ratio",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/LayoutSetSplitRatioParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.neighbor",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneNeighborParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.edges",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneEdgesParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.focus_direction",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneFocusDirectionParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.resize",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneResizeParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.scroll",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneScrollParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.clear",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.edit_scrollback",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.selection.read",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneSelectionReadParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.copy_motion",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneCopyMotionParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.copy_search",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneCopySearchParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.list",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneListParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.current",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneCurrentParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.get",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.focus",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.input.set",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneInputSetParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.link.activate",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneLinkActivateParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.link.resolve",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneLinkActivateParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.rename",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneRenameParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.send_text",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneSendTextParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.send_keys",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneSendKeysParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.send_input",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneSendInputParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.read",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneReadParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.report_agent",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneReportAgentParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.report_agent_session",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneReportAgentSessionParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.report_metadata",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneReportMetadataParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.clear_agent_authority",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneClearAgentAuthorityParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.release_agent",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneReleaseAgentParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.close",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneTarget" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "popup.close",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EmptyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "events.subscribe",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EventsSubscribeParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "events.wait",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EventsWaitParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "pane.wait_for_output",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PaneWaitForOutputParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "integration.list",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/EmptyParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "integration.install",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/IntegrationInstallParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "integration.uninstall",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/IntegrationUninstallParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.link",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginLinkParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.list",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginListParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.unlink",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginUnlinkParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.enable",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginSetEnabledParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.disable",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginSetEnabledParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.action.list",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginActionListParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.action.invoke",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginActionInvokeParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.log.list",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginLogListParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.pane.open",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginPaneOpenParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.pane.focus",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginPaneFocusParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				},
				{
					"properties": {
						"method": {
							"const": "plugin.pane.close",
							"type": "string"
						},
						"params": { "$ref": "#/schemas/request/$defs/PluginPaneCloseParams" }
					},
					"required": ["method", "params"],
					"type": "object"
				}
			],
			"properties": { "id": { "type": "string" } },
			"required": ["id"],
			"title": "Request",
			"type": "object"
		},
		"subscription_event": {
			"$defs": {
				"AgentStatus": {
					"enum": [
						"idle",
						"working",
						"blocked",
						"done",
						"unknown"
					],
					"type": "string"
				},
				"PaneAgentStatusChangedEvent": {
					"properties": {
						"agent": { "type": ["string", "null"] },
						"agent_status": { "$ref": "#/schemas/subscription_event/$defs/AgentStatus" },
						"display_agent": { "type": ["string", "null"] },
						"pane_id": { "type": "string" },
						"state_labels": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"title": { "type": ["string", "null"] },
						"workspace_id": { "type": "string" }
					},
					"required": [
						"pane_id",
						"workspace_id",
						"agent_status"
					],
					"type": "object"
				},
				"PaneOutputMatchedEvent": {
					"properties": {
						"matched_line": { "type": "string" },
						"pane_id": { "type": "string" },
						"read": { "$ref": "#/schemas/subscription_event/$defs/PaneReadResult" }
					},
					"required": [
						"pane_id",
						"matched_line",
						"read"
					],
					"type": "object"
				},
				"PaneReadResult": {
					"properties": {
						"format": { "$ref": "#/schemas/subscription_event/$defs/ReadFormat" },
						"pane_id": { "type": "string" },
						"revision": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"source": { "$ref": "#/schemas/subscription_event/$defs/ReadSource" },
						"tab_id": { "type": "string" },
						"text": { "type": "string" },
						"truncated": { "type": "boolean" },
						"workspace_id": { "type": "string" }
					},
					"required": [
						"pane_id",
						"workspace_id",
						"tab_id",
						"source",
						"format",
						"text",
						"revision",
						"truncated"
					],
					"type": "object"
				},
				"PaneScrollChangedEvent": {
					"properties": {
						"pane_id": { "type": "string" },
						"scroll": { "$ref": "#/schemas/subscription_event/$defs/PaneScrollInfo" },
						"workspace_id": { "type": "string" }
					},
					"required": [
						"pane_id",
						"workspace_id",
						"scroll"
					],
					"type": "object"
				},
				"PaneScrollInfo": {
					"properties": {
						"max_offset_from_bottom": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"offset_from_bottom": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"viewport_rows": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						}
					},
					"required": [
						"offset_from_bottom",
						"max_offset_from_bottom",
						"viewport_rows"
					],
					"type": "object"
				},
				"ReadFormat": {
					"enum": ["text", "ansi"],
					"type": "string"
				},
				"ReadSource": {
					"enum": [
						"visible",
						"recent",
						"recent_unwrapped",
						"detection"
					],
					"type": "string"
				},
				"SubscriptionEventData": { "anyOf": [
					{ "$ref": "#/schemas/subscription_event/$defs/PaneOutputMatchedEvent" },
					{ "$ref": "#/schemas/subscription_event/$defs/PaneAgentStatusChangedEvent" },
					{ "$ref": "#/schemas/subscription_event/$defs/PaneScrollChangedEvent" }
				] },
				"SubscriptionEventKind": {
					"enum": [
						"pane.output_matched",
						"pane.agent_status_changed",
						"pane.scroll_changed"
					],
					"type": "string"
				}
			},
			"$schema": "https://json-schema.org/draft/2020-12/schema",
			"properties": {
				"data": { "$ref": "#/schemas/subscription_event/$defs/SubscriptionEventData" },
				"event": { "$ref": "#/schemas/subscription_event/$defs/SubscriptionEventKind" }
			},
			"required": ["event", "data"],
			"title": "SubscriptionEventEnvelope",
			"type": "object"
		},
		"success_response": {
			"$defs": {
				"AgentInfo": {
					"properties": {
						"agent": { "type": ["string", "null"] },
						"agent_session": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/AgentSessionInfo" }, { "type": "null" }] },
						"agent_status": { "$ref": "#/schemas/success_response/$defs/AgentStatus" },
						"completion_seq": {
							"description": "The current idle transition completed work, independently of who has viewed it.",
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"cwd": { "type": ["string", "null"] },
						"display_agent": { "type": ["string", "null"] },
						"focused": { "type": "boolean" },
						"foreground_cwd": { "type": ["string", "null"] },
						"interactive_ready": { "type": "boolean" },
						"launch_pending": { "type": "boolean" },
						"name": { "type": ["string", "null"] },
						"pane_id": { "type": "string" },
						"revision": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"screen_detection_skipped": { "type": "boolean" },
						"state_change_seq": {
							"default": 0,
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"state_labels": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"tab_id": { "type": "string" },
						"terminal_id": { "type": "string" },
						"terminal_title": { "type": ["string", "null"] },
						"terminal_title_stripped": { "type": ["string", "null"] },
						"title": { "type": ["string", "null"] },
						"tokens": {
							"additionalProperties": { "type": "string" },
							"maxProperties": 32,
							"propertyNames": { "pattern": "^[A-Za-z0-9_-]{1,32}$" },
							"type": "object"
						},
						"workspace_id": { "type": "string" }
					},
					"required": [
						"terminal_id",
						"agent_status",
						"workspace_id",
						"tab_id",
						"pane_id",
						"focused",
						"revision"
					],
					"type": "object"
				},
				"AgentManifestInfo": {
					"properties": {
						"active_version": { "type": ["string", "null"] },
						"agent": { "type": "string" },
						"cached_remote_version": { "type": ["string", "null"] },
						"local_override_shadowing_remote": { "type": "boolean" },
						"remote_last_checked_unix": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"remote_update_error": { "type": ["string", "null"] },
						"remote_update_result": { "type": ["string", "null"] },
						"source": { "type": "string" },
						"source_kind": { "type": "string" },
						"warning": { "type": ["string", "null"] }
					},
					"required": [
						"agent",
						"source",
						"source_kind",
						"local_override_shadowing_remote"
					],
					"type": "object"
				},
				"AgentSessionInfo": {
					"properties": {
						"agent": { "type": "string" },
						"kind": { "$ref": "#/schemas/success_response/$defs/AgentSessionRefKind" },
						"source": { "type": "string" },
						"value": { "type": "string" }
					},
					"required": [
						"source",
						"agent",
						"kind",
						"value"
					],
					"type": "object"
				},
				"AgentSessionRefKind": {
					"enum": ["id", "path"],
					"type": "string"
				},
				"AgentStatus": {
					"enum": [
						"idle",
						"working",
						"blocked",
						"done",
						"unknown"
					],
					"type": "string"
				},
				"ClientWindowTitleReason": {
					"enum": [
						"set",
						"cleared",
						"no_foreground_client"
					],
					"type": "string"
				},
				"ConfigReloadStatus": {
					"enum": [
						"applied",
						"partial",
						"failed"
					],
					"type": "string"
				},
				"EventData": { "oneOf": [
					{
						"properties": {
							"type": {
								"const": "workspace_created",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" }
						},
						"required": ["type", "workspace"],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "workspace_updated",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" }
						},
						"required": ["type", "workspace"],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "workspace_metadata_updated",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" }
						},
						"required": ["type", "workspace"],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "workspace_closed",
								"type": "string"
							},
							"workspace": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" }, { "type": "null" }] },
							"workspace_id": { "type": "string" }
						},
						"required": ["type", "workspace_id"],
						"type": "object"
					},
					{
						"properties": {
							"label": { "type": "string" },
							"type": {
								"const": "workspace_renamed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"workspace_id",
							"label"
						],
						"type": "object"
					},
					{
						"properties": {
							"insert_index": {
								"format": "uint",
								"minimum": 0,
								"type": "integer"
							},
							"type": {
								"const": "workspace_moved",
								"type": "string"
							},
							"workspace_id": { "type": "string" },
							"workspaces": {
								"items": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" },
								"type": "array"
							}
						},
						"required": [
							"type",
							"workspace_id",
							"insert_index",
							"workspaces"
						],
						"type": "object"
					},
					{
						"properties": {
							"before_workspace_id": { "type": ["string", "null"] },
							"type": {
								"const": "workspace_reordered",
								"type": "string"
							},
							"workspace_ids": {
								"items": { "type": "string" },
								"type": "array"
							},
							"workspaces": {
								"items": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" },
								"type": "array"
							}
						},
						"required": [
							"type",
							"workspace_ids",
							"workspaces"
						],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "workspace_focused",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": ["type", "workspace_id"],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "worktree_created",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" },
							"worktree": { "$ref": "#/schemas/success_response/$defs/WorktreeInfo" }
						},
						"required": [
							"type",
							"workspace",
							"worktree"
						],
						"type": "object"
					},
					{
						"properties": {
							"already_open": { "type": "boolean" },
							"type": {
								"const": "worktree_opened",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" },
							"worktree": { "$ref": "#/schemas/success_response/$defs/WorktreeInfo" }
						},
						"required": [
							"type",
							"workspace",
							"worktree",
							"already_open"
						],
						"type": "object"
					},
					{
						"properties": {
							"forced": { "type": "boolean" },
							"type": {
								"const": "worktree_removed",
								"type": "string"
							},
							"workspace": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" }, { "type": "null" }] },
							"workspace_id": { "type": "string" },
							"worktree": { "$ref": "#/schemas/success_response/$defs/WorktreeInfo" }
						},
						"required": [
							"type",
							"workspace_id",
							"worktree",
							"forced"
						],
						"type": "object"
					},
					{
						"properties": {
							"tab": { "$ref": "#/schemas/success_response/$defs/TabInfo" },
							"type": {
								"const": "tab_created",
								"type": "string"
							}
						},
						"required": ["type", "tab"],
						"type": "object"
					},
					{
						"properties": {
							"tab_id": { "type": "string" },
							"type": {
								"const": "tab_closed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"tab_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"label": { "type": "string" },
							"tab_id": { "type": "string" },
							"type": {
								"const": "tab_renamed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"tab_id",
							"workspace_id",
							"label"
						],
						"type": "object"
					},
					{
						"properties": {
							"insert_index": {
								"format": "uint",
								"minimum": 0,
								"type": "integer"
							},
							"tab_id": { "type": "string" },
							"tabs": {
								"items": { "$ref": "#/schemas/success_response/$defs/TabInfo" },
								"type": "array"
							},
							"type": {
								"const": "tab_moved",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"tab_id",
							"workspace_id",
							"insert_index",
							"tabs"
						],
						"type": "object"
					},
					{
						"properties": {
							"tab_id": { "type": "string" },
							"type": {
								"const": "tab_focused",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"tab_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
							"type": {
								"const": "pane_created",
								"type": "string"
							}
						},
						"required": ["type", "pane"],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"type": {
								"const": "pane_closed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
							"type": {
								"const": "pane_updated",
								"type": "string"
							}
						},
						"required": ["type", "pane"],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"type": {
								"const": "pane_focused",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"closed_tab_id": { "type": ["string", "null"] },
							"closed_workspace_id": { "type": ["string", "null"] },
							"created_tab": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/TabInfo" }, { "type": "null" }] },
							"created_workspace": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" }, { "type": "null" }] },
							"pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
							"previous_pane_id": { "type": "string" },
							"previous_tab_id": { "type": "string" },
							"previous_workspace_id": { "type": "string" },
							"type": {
								"const": "pane_moved",
								"type": "string"
							}
						},
						"required": [
							"type",
							"previous_pane_id",
							"previous_workspace_id",
							"previous_tab_id",
							"pane"
						],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"revision": {
								"format": "uint64",
								"minimum": 0,
								"type": "integer"
							},
							"type": {
								"const": "pane_output_changed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id",
							"revision"
						],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"type": {
								"const": "pane_exited",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"agent": { "type": ["string", "null"] },
							"final_status": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/AgentStatus" }, { "type": "null" }] },
							"pane_id": { "type": "string" },
							"released": { "type": "boolean" },
							"type": {
								"const": "pane_agent_detected",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id"
						],
						"type": "object"
					},
					{
						"properties": {
							"agent": { "type": ["string", "null"] },
							"agent_status": { "$ref": "#/schemas/success_response/$defs/AgentStatus" },
							"display_agent": { "type": ["string", "null"] },
							"pane_id": { "type": "string" },
							"state_labels": {
								"additionalProperties": { "type": "string" },
								"type": "object"
							},
							"title": { "type": ["string", "null"] },
							"type": {
								"const": "pane_agent_status_changed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"pane_id",
							"workspace_id",
							"agent_status"
						],
						"type": "object"
					},
					{
						"properties": {
							"layout": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" },
							"type": {
								"const": "layout_updated",
								"type": "string"
							}
						},
						"required": ["type", "layout"],
						"type": "object"
					}
				] },
				"EventEnvelope": {
					"properties": {
						"data": { "$ref": "#/schemas/success_response/$defs/EventData" },
						"event": { "$ref": "#/schemas/success_response/$defs/EventKind" }
					},
					"required": ["event", "data"],
					"type": "object"
				},
				"EventKind": {
					"enum": [
						"workspace_created",
						"workspace_updated",
						"workspace_metadata_updated",
						"workspace_closed",
						"workspace_renamed",
						"workspace_moved",
						"workspace_reordered",
						"workspace_focused",
						"worktree_created",
						"worktree_opened",
						"worktree_removed",
						"tab_created",
						"tab_closed",
						"tab_renamed",
						"tab_moved",
						"tab_focused",
						"pane_created",
						"pane_closed",
						"pane_updated",
						"pane_focused",
						"pane_moved",
						"pane_output_changed",
						"pane_exited",
						"pane_agent_detected",
						"pane_agent_status_changed",
						"layout_updated"
					],
					"type": "string"
				},
				"InstalledPluginInfo": {
					"properties": {
						"actions": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginManifestAction" },
							"type": "array"
						},
						"build": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginManifestBuild" },
							"type": "array"
						},
						"description": { "type": ["string", "null"] },
						"enabled": { "type": "boolean" },
						"events": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginManifestEventHook" },
							"type": "array"
						},
						"link_handlers": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginManifestLinkHandler" },
							"type": "array"
						},
						"manifest_path": { "type": "string" },
						"min_herdr_version": {
							"default": "",
							"type": "string"
						},
						"name": { "type": "string" },
						"panes": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginManifestPane" },
							"type": "array"
						},
						"platforms": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginPlatform" },
							"type": ["array", "null"]
						},
						"plugin_id": { "type": "string" },
						"plugin_root": { "type": "string" },
						"source": {
							"$ref": "#/schemas/success_response/$defs/PluginSourceInfo",
							"default": { "kind": "local" }
						},
						"startup": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginManifestStartup" },
							"type": "array"
						},
						"version": { "type": "string" },
						"warnings": {
							"description": "Warnings collected at link time or on registry load (e.g. unknown event names,\nmissing manifest file). Non-fatal — the entry is kept and surfaced by plugin.list.",
							"items": { "type": "string" },
							"type": "array"
						}
					},
					"required": [
						"plugin_id",
						"name",
						"version",
						"manifest_path",
						"plugin_root",
						"enabled"
					],
					"type": "object"
				},
				"IntegrationInfo": {
					"properties": {
						"available": { "type": "boolean" },
						"command": { "type": "string" },
						"label": { "type": "string" },
						"state": { "$ref": "#/schemas/success_response/$defs/IntegrationState" },
						"target": { "$ref": "#/schemas/success_response/$defs/IntegrationTarget" }
					},
					"required": [
						"target",
						"label",
						"command",
						"available",
						"state"
					],
					"type": "object"
				},
				"IntegrationInstallResult": {
					"properties": { "messages": {
						"items": { "type": "string" },
						"type": "array"
					} },
					"required": ["messages"],
					"type": "object"
				},
				"IntegrationState": {
					"enum": [
						"not_installed",
						"current",
						"outdated"
					],
					"type": "string"
				},
				"IntegrationTarget": {
					"enum": [
						"pi",
						"omp",
						"claude",
						"codex",
						"copilot",
						"devin",
						"droid",
						"kimi",
						"opencode",
						"kilo",
						"hermes",
						"qodercli",
						"qwen",
						"cursor",
						"mastracode",
						"antigravity_cli",
						"grok"
					],
					"type": "string"
				},
				"IntegrationUninstallResult": {
					"properties": { "messages": {
						"items": { "type": "string" },
						"type": "array"
					} },
					"required": ["messages"],
					"type": "object"
				},
				"LayoutDescription": {
					"properties": {
						"focused_pane_id": { "type": "string" },
						"root": { "$ref": "#/schemas/success_response/$defs/LayoutNode" },
						"tab_id": { "type": "string" },
						"workspace_id": { "type": "string" },
						"zoomed": { "type": "boolean" }
					},
					"required": [
						"workspace_id",
						"tab_id",
						"zoomed",
						"focused_pane_id",
						"root"
					],
					"type": "object"
				},
				"LayoutNode": { "oneOf": [{
					"properties": {
						"command": {
							"items": { "type": "string" },
							"type": ["array", "null"]
						},
						"cwd": { "type": ["string", "null"] },
						"env": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"label": { "type": ["string", "null"] },
						"pane_id": { "type": ["string", "null"] },
						"type": {
							"const": "pane",
							"type": "string"
						}
					},
					"required": ["type"],
					"type": "object"
				}, {
					"properties": {
						"direction": { "$ref": "#/schemas/success_response/$defs/SplitDirection" },
						"first": { "$ref": "#/schemas/success_response/$defs/LayoutNode" },
						"ratio": {
							"format": "float",
							"type": "number"
						},
						"second": { "$ref": "#/schemas/success_response/$defs/LayoutNode" },
						"type": {
							"const": "split",
							"type": "string"
						}
					},
					"required": [
						"type",
						"direction",
						"ratio",
						"first",
						"second"
					],
					"type": "object"
				}] },
				"NotificationShowReason": {
					"enum": [
						"shown",
						"disabled",
						"rate_limited",
						"no_foreground_client",
						"busy"
					],
					"type": "string"
				},
				"PaneDirection": {
					"enum": [
						"left",
						"right",
						"up",
						"down"
					],
					"type": "string"
				},
				"PaneEdgesResult": {
					"properties": {
						"down": { "type": "boolean" },
						"layout": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" },
						"left": { "type": "boolean" },
						"pane_id": { "type": "string" },
						"right": { "type": "boolean" },
						"up": { "type": "boolean" }
					},
					"required": [
						"pane_id",
						"left",
						"right",
						"up",
						"down",
						"layout"
					],
					"type": "object"
				},
				"PaneFocusDirectionReason": {
					"enum": ["no_neighbor"],
					"type": "string"
				},
				"PaneFocusDirectionResult": {
					"properties": {
						"changed": { "type": "boolean" },
						"focused_pane_id": { "type": ["string", "null"] },
						"layout": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" },
						"reason": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/PaneFocusDirectionReason" }, { "type": "null" }] },
						"source_pane_id": { "type": "string" }
					},
					"required": [
						"changed",
						"source_pane_id",
						"layout"
					],
					"type": "object"
				},
				"PaneInfo": {
					"properties": {
						"agent": { "type": ["string", "null"] },
						"agent_session": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/AgentSessionInfo" }, { "type": "null" }] },
						"agent_status": { "$ref": "#/schemas/success_response/$defs/AgentStatus" },
						"cwd": { "type": ["string", "null"] },
						"display_agent": { "type": ["string", "null"] },
						"focused": { "type": "boolean" },
						"foreground_cwd": { "type": ["string", "null"] },
						"label": { "type": ["string", "null"] },
						"pane_id": { "type": "string" },
						"restore_error": { "type": ["string", "null"] },
						"revision": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"scroll": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/PaneScrollInfo" }, { "type": "null" }] },
						"state_labels": {
							"additionalProperties": { "type": "string" },
							"type": "object"
						},
						"tab_id": { "type": "string" },
						"terminal_id": { "type": "string" },
						"terminal_title": { "type": ["string", "null"] },
						"terminal_title_stripped": { "type": ["string", "null"] },
						"title": { "type": ["string", "null"] },
						"tokens": {
							"additionalProperties": { "type": "string" },
							"maxProperties": 32,
							"propertyNames": { "pattern": "^[A-Za-z0-9_-]{1,32}$" },
							"type": "object"
						},
						"workspace_id": { "type": "string" }
					},
					"required": [
						"pane_id",
						"terminal_id",
						"workspace_id",
						"tab_id",
						"focused",
						"agent_status",
						"revision"
					],
					"type": "object"
				},
				"PaneLayoutPane": {
					"properties": {
						"focused": { "type": "boolean" },
						"pane_id": { "type": "string" },
						"rect": { "$ref": "#/schemas/success_response/$defs/PaneLayoutRect" }
					},
					"required": [
						"pane_id",
						"focused",
						"rect"
					],
					"type": "object"
				},
				"PaneLayoutRect": {
					"properties": {
						"height": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"width": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"x": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"y": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						}
					},
					"required": [
						"x",
						"y",
						"width",
						"height"
					],
					"type": "object"
				},
				"PaneLayoutSnapshot": {
					"properties": {
						"area": { "$ref": "#/schemas/success_response/$defs/PaneLayoutRect" },
						"focused_pane_id": { "type": "string" },
						"panes": {
							"items": { "$ref": "#/schemas/success_response/$defs/PaneLayoutPane" },
							"type": "array"
						},
						"splits": {
							"items": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSplit" },
							"type": "array"
						},
						"tab_id": { "type": "string" },
						"workspace_id": { "type": "string" },
						"zoomed": { "type": "boolean" }
					},
					"required": [
						"workspace_id",
						"tab_id",
						"zoomed",
						"area",
						"focused_pane_id",
						"panes",
						"splits"
					],
					"type": "object"
				},
				"PaneLayoutSplit": {
					"properties": {
						"direction": { "$ref": "#/schemas/success_response/$defs/SplitDirection" },
						"id": { "type": "string" },
						"ratio": {
							"format": "float",
							"type": "number"
						},
						"rect": { "$ref": "#/schemas/success_response/$defs/PaneLayoutRect" }
					},
					"required": [
						"id",
						"direction",
						"ratio",
						"rect"
					],
					"type": "object"
				},
				"PaneLinkRegion": {
					"description": "Inclusive display-cell columns on a pane's current viewport.",
					"properties": {
						"end_col": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"row": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"start_col": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						}
					},
					"required": [
						"row",
						"start_col",
						"end_col"
					],
					"type": "object"
				},
				"PaneMoveReason": {
					"enum": ["same_tab", "zoomed_tab"],
					"type": "string"
				},
				"PaneMoveResult": {
					"properties": {
						"changed": { "type": "boolean" },
						"closed_tab_id": { "type": ["string", "null"] },
						"closed_workspace_id": { "type": ["string", "null"] },
						"created_tab": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/TabInfo" }, { "type": "null" }] },
						"created_workspace": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" }, { "type": "null" }] },
						"focused_pane_id": { "type": "string" },
						"pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
						"previous_pane_id": { "type": "string" },
						"previous_tab_id": { "type": "string" },
						"previous_workspace_id": { "type": "string" },
						"reason": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/PaneMoveReason" }, { "type": "null" }] },
						"source_layout": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" }, { "type": "null" }] },
						"target_layout": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" }
					},
					"required": [
						"changed",
						"previous_pane_id",
						"previous_workspace_id",
						"previous_tab_id",
						"pane",
						"target_layout",
						"focused_pane_id"
					],
					"type": "object"
				},
				"PaneNeighborResult": {
					"properties": {
						"direction": { "$ref": "#/schemas/success_response/$defs/PaneDirection" },
						"layout": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" },
						"neighbor_pane_id": { "type": ["string", "null"] },
						"pane_id": { "type": "string" }
					},
					"required": [
						"pane_id",
						"direction",
						"layout"
					],
					"type": "object"
				},
				"PaneProcessInfo": {
					"properties": {
						"foreground_process_group_id": {
							"format": "uint32",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"foreground_processes": {
							"items": { "$ref": "#/schemas/success_response/$defs/PaneProcessInfoProcess" },
							"type": "array"
						},
						"pane_id": { "type": "string" },
						"shell_pid": {
							"format": "uint32",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"tty": { "type": ["string", "null"] }
					},
					"required": ["pane_id"],
					"type": "object"
				},
				"PaneProcessInfoProcess": {
					"properties": {
						"argv": {
							"items": { "type": "string" },
							"type": ["array", "null"]
						},
						"argv0": { "type": ["string", "null"] },
						"cmdline": { "type": ["string", "null"] },
						"cwd": { "type": ["string", "null"] },
						"name": { "type": "string" },
						"pid": {
							"format": "uint32",
							"minimum": 0,
							"type": "integer"
						}
					},
					"required": ["pid", "name"],
					"type": "object"
				},
				"PaneReadResult": {
					"properties": {
						"format": { "$ref": "#/schemas/success_response/$defs/ReadFormat" },
						"pane_id": { "type": "string" },
						"revision": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"source": { "$ref": "#/schemas/success_response/$defs/ReadSource" },
						"tab_id": { "type": "string" },
						"text": { "type": "string" },
						"truncated": { "type": "boolean" },
						"workspace_id": { "type": "string" }
					},
					"required": [
						"pane_id",
						"workspace_id",
						"tab_id",
						"source",
						"format",
						"text",
						"revision",
						"truncated"
					],
					"type": "object"
				},
				"PaneResizeReason": {
					"enum": ["unchanged"],
					"type": "string"
				},
				"PaneResizeResult": {
					"properties": {
						"changed": { "type": "boolean" },
						"focused_pane_id": { "type": "string" },
						"layout": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" },
						"pane_id": { "type": "string" },
						"reason": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/PaneResizeReason" }, { "type": "null" }] }
					},
					"required": [
						"changed",
						"pane_id",
						"focused_pane_id",
						"layout"
					],
					"type": "object"
				},
				"PaneScrollInfo": {
					"properties": {
						"max_offset_from_bottom": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"offset_from_bottom": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"viewport_rows": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						}
					},
					"required": [
						"offset_from_bottom",
						"max_offset_from_bottom",
						"viewport_rows"
					],
					"type": "object"
				},
				"PaneSwapReason": {
					"enum": [
						"no_neighbor",
						"same_pane",
						"not_found",
						"cross_tab"
					],
					"type": "string"
				},
				"PaneSwapResult": {
					"properties": {
						"changed": { "type": "boolean" },
						"focused_pane_id": { "type": "string" },
						"layout": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" },
						"reason": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/PaneSwapReason" }, { "type": "null" }] },
						"source_pane_id": { "type": "string" },
						"target_pane_id": { "type": ["string", "null"] }
					},
					"required": [
						"changed",
						"source_pane_id",
						"focused_pane_id",
						"layout"
					],
					"type": "object"
				},
				"PaneTextPoint": {
					"properties": {
						"col": {
							"format": "uint16",
							"maximum": 65535,
							"minimum": 0,
							"type": "integer"
						},
						"row": {
							"format": "uint32",
							"minimum": 0,
							"type": "integer"
						}
					},
					"required": ["row", "col"],
					"type": "object"
				},
				"PaneTextRange": {
					"properties": {
						"end": { "$ref": "#/schemas/success_response/$defs/PaneTextPoint" },
						"start": { "$ref": "#/schemas/success_response/$defs/PaneTextPoint" }
					},
					"required": ["start", "end"],
					"type": "object"
				},
				"PaneZoomReason": {
					"enum": [
						"single_pane",
						"already_zoomed",
						"already_unzoomed"
					],
					"type": "string"
				},
				"PaneZoomResult": {
					"properties": {
						"changed": { "type": "boolean" },
						"focus_changed": { "type": "boolean" },
						"focused_pane_id": { "type": "string" },
						"layout": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" },
						"pane_id": { "type": "string" },
						"reason": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/PaneZoomReason" }, { "type": "null" }] },
						"zoom_changed": { "type": "boolean" },
						"zoomed": { "type": "boolean" }
					},
					"required": [
						"changed",
						"zoom_changed",
						"focus_changed",
						"pane_id",
						"focused_pane_id",
						"zoomed",
						"layout"
					],
					"type": "object"
				},
				"PluginActionContext": {
					"enum": [
						"global",
						"workspace",
						"tab",
						"pane",
						"selection"
					],
					"type": "string"
				},
				"PluginActionInfo": {
					"properties": {
						"action_id": { "type": "string" },
						"command": {
							"items": { "type": "string" },
							"type": "array"
						},
						"contexts": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginActionContext" },
							"type": "array"
						},
						"description": { "type": ["string", "null"] },
						"platforms": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginPlatform" },
							"type": ["array", "null"]
						},
						"plugin_id": { "type": "string" },
						"title": { "type": "string" }
					},
					"required": [
						"plugin_id",
						"action_id",
						"title",
						"command"
					],
					"type": "object"
				},
				"PluginCommandLogInfo": {
					"properties": {
						"action_id": { "type": ["string", "null"] },
						"command": {
							"items": { "type": "string" },
							"type": "array"
						},
						"error": { "type": ["string", "null"] },
						"event": { "type": ["string", "null"] },
						"exit_code": {
							"format": "int32",
							"type": ["integer", "null"]
						},
						"finished_unix_ms": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"log_id": { "type": "string" },
						"plugin_id": { "type": "string" },
						"started_unix_ms": {
							"format": "uint64",
							"minimum": 0,
							"type": "integer"
						},
						"status": { "$ref": "#/schemas/success_response/$defs/PluginCommandStatus" },
						"stderr": { "type": ["string", "null"] },
						"stdout": { "type": ["string", "null"] }
					},
					"required": [
						"log_id",
						"plugin_id",
						"command",
						"status",
						"started_unix_ms"
					],
					"type": "object"
				},
				"PluginCommandStatus": {
					"enum": [
						"running",
						"succeeded",
						"failed"
					],
					"type": "string"
				},
				"PluginInvocationContext": {
					"properties": {
						"clicked_url": { "type": ["string", "null"] },
						"correlation_id": { "type": ["string", "null"] },
						"focused_pane_agent": { "type": ["string", "null"] },
						"focused_pane_cwd": { "type": ["string", "null"] },
						"focused_pane_id": { "type": ["string", "null"] },
						"focused_pane_status": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/AgentStatus" }, { "type": "null" }] },
						"invocation_source": { "type": ["string", "null"] },
						"link_handler_id": { "type": ["string", "null"] },
						"selected_text": { "type": ["string", "null"] },
						"tab_id": { "type": ["string", "null"] },
						"tab_label": { "type": ["string", "null"] },
						"workspace_cwd": { "type": ["string", "null"] },
						"workspace_id": { "type": ["string", "null"] },
						"workspace_label": { "type": ["string", "null"] },
						"worktree": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/WorkspaceWorktreeInfo" }, { "type": "null" }] }
					},
					"type": "object"
				},
				"PluginManifestAction": {
					"properties": {
						"command": {
							"items": { "type": "string" },
							"type": "array"
						},
						"contexts": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginActionContext" },
							"type": "array"
						},
						"description": { "type": ["string", "null"] },
						"id": { "type": "string" },
						"platforms": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginPlatform" },
							"type": ["array", "null"]
						},
						"title": { "type": "string" }
					},
					"required": [
						"id",
						"title",
						"command"
					],
					"type": "object"
				},
				"PluginManifestBuild": {
					"properties": {
						"command": {
							"items": { "type": "string" },
							"type": "array"
						},
						"platforms": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginPlatform" },
							"type": ["array", "null"]
						}
					},
					"required": ["command"],
					"type": "object"
				},
				"PluginManifestEventHook": {
					"properties": {
						"command": {
							"items": { "type": "string" },
							"type": "array"
						},
						"on": { "type": "string" },
						"platforms": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginPlatform" },
							"type": ["array", "null"]
						}
					},
					"required": ["on", "command"],
					"type": "object"
				},
				"PluginManifestLinkHandler": {
					"properties": {
						"action": { "type": "string" },
						"id": { "type": "string" },
						"pattern": { "type": "string" },
						"platforms": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginPlatform" },
							"type": ["array", "null"]
						},
						"title": { "type": "string" }
					},
					"required": [
						"id",
						"title",
						"pattern",
						"action"
					],
					"type": "object"
				},
				"PluginManifestPane": {
					"properties": {
						"command": {
							"items": { "type": "string" },
							"type": "array"
						},
						"description": { "type": ["string", "null"] },
						"height": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/PopupSize" }, { "type": "null" }] },
						"id": { "type": "string" },
						"placement": {
							"$ref": "#/schemas/success_response/$defs/PluginPanePlacement",
							"default": "overlay"
						},
						"platforms": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginPlatform" },
							"type": ["array", "null"]
						},
						"title": { "type": "string" },
						"width": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/PopupSize" }, { "type": "null" }] }
					},
					"required": [
						"id",
						"title",
						"command"
					],
					"type": "object"
				},
				"PluginManifestStartup": {
					"properties": {
						"command": {
							"items": { "type": "string" },
							"type": "array"
						},
						"platforms": {
							"items": { "$ref": "#/schemas/success_response/$defs/PluginPlatform" },
							"type": ["array", "null"]
						}
					},
					"required": ["command"],
					"type": "object"
				},
				"PluginPaneInfo": {
					"properties": {
						"entrypoint": { "type": "string" },
						"pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
						"plugin_id": { "type": "string" }
					},
					"required": [
						"plugin_id",
						"entrypoint",
						"pane"
					],
					"type": "object"
				},
				"PluginPanePlacement": {
					"enum": [
						"overlay",
						"popup",
						"split",
						"tab",
						"zoomed"
					],
					"type": "string"
				},
				"PluginPlatform": {
					"enum": [
						"linux",
						"macos",
						"windows"
					],
					"type": "string"
				},
				"PluginSourceInfo": {
					"properties": {
						"installed_unix_ms": {
							"format": "uint64",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"kind": {
							"$ref": "#/schemas/success_response/$defs/PluginSourceKind",
							"default": "local"
						},
						"managed_path": { "type": ["string", "null"] },
						"owner": { "type": ["string", "null"] },
						"repo": { "type": ["string", "null"] },
						"requested_ref": { "type": ["string", "null"] },
						"resolved_commit": { "type": ["string", "null"] },
						"subdir": { "type": ["string", "null"] }
					},
					"type": "object"
				},
				"PluginSourceKind": {
					"enum": ["local", "github"],
					"type": "string"
				},
				"PopupSize": { "oneOf": [{
					"description": "Outer popup size in terminal cells, including the border.",
					"maximum": 65535,
					"minimum": 0,
					"type": "integer"
				}, {
					"description": "Outer popup size as a percentage of the terminal area, for example 80%.",
					"pattern": "^(100|[1-9][0-9]?)%$",
					"type": "string"
				}] },
				"ReadFormat": {
					"enum": ["text", "ansi"],
					"type": "string"
				},
				"ReadSource": {
					"enum": [
						"visible",
						"recent",
						"recent_unwrapped",
						"detection"
					],
					"type": "string"
				},
				"ResponseResult": { "oneOf": [
					{
						"properties": {
							"capabilities": {
								"anyOf": [{ "$ref": "#/schemas/success_response/$defs/ServerCapabilities" }, { "type": "null" }],
								"default": null
							},
							"protocol": {
								"format": "uint32",
								"minimum": 0,
								"type": "integer"
							},
							"type": {
								"const": "pong",
								"type": "string"
							},
							"version": { "type": "string" }
						},
						"required": [
							"type",
							"version",
							"protocol"
						],
						"type": "object"
					},
					{
						"properties": {
							"snapshot": { "$ref": "#/schemas/success_response/$defs/SessionSnapshot" },
							"type": {
								"const": "session_snapshot",
								"type": "string"
							}
						},
						"required": ["type", "snapshot"],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "workspace_info",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" }
						},
						"required": ["type", "workspace"],
						"type": "object"
					},
					{
						"properties": {
							"root_pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
							"tab": { "$ref": "#/schemas/success_response/$defs/TabInfo" },
							"type": {
								"const": "workspace_created",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" }
						},
						"required": [
							"type",
							"workspace",
							"tab",
							"root_pane"
						],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "workspace_list",
								"type": "string"
							},
							"workspaces": {
								"items": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" },
								"type": "array"
							}
						},
						"required": ["type", "workspaces"],
						"type": "object"
					},
					{
						"properties": {
							"source": { "$ref": "#/schemas/success_response/$defs/WorktreeSourceInfo" },
							"type": {
								"const": "worktree_list",
								"type": "string"
							},
							"worktrees": {
								"items": { "$ref": "#/schemas/success_response/$defs/WorktreeInfo" },
								"type": "array"
							}
						},
						"required": [
							"type",
							"source",
							"worktrees"
						],
						"type": "object"
					},
					{
						"properties": {
							"root_pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
							"tab": { "$ref": "#/schemas/success_response/$defs/TabInfo" },
							"type": {
								"const": "worktree_created",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" },
							"worktree": { "$ref": "#/schemas/success_response/$defs/WorktreeInfo" }
						},
						"required": [
							"type",
							"workspace",
							"tab",
							"root_pane",
							"worktree"
						],
						"type": "object"
					},
					{
						"properties": {
							"already_open": { "type": "boolean" },
							"root_pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
							"tab": { "$ref": "#/schemas/success_response/$defs/TabInfo" },
							"type": {
								"const": "worktree_opened",
								"type": "string"
							},
							"workspace": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" },
							"worktree": { "$ref": "#/schemas/success_response/$defs/WorktreeInfo" }
						},
						"required": [
							"type",
							"workspace",
							"tab",
							"root_pane",
							"worktree",
							"already_open"
						],
						"type": "object"
					},
					{
						"properties": {
							"forced": { "type": "boolean" },
							"path": { "type": "string" },
							"type": {
								"const": "worktree_removed",
								"type": "string"
							},
							"workspace_id": { "type": "string" }
						},
						"required": [
							"type",
							"workspace_id",
							"path",
							"forced"
						],
						"type": "object"
					},
					{
						"properties": {
							"tab": { "$ref": "#/schemas/success_response/$defs/TabInfo" },
							"type": {
								"const": "tab_info",
								"type": "string"
							}
						},
						"required": ["type", "tab"],
						"type": "object"
					},
					{
						"properties": {
							"root_pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
							"tab": { "$ref": "#/schemas/success_response/$defs/TabInfo" },
							"type": {
								"const": "tab_created",
								"type": "string"
							}
						},
						"required": [
							"type",
							"tab",
							"root_pane"
						],
						"type": "object"
					},
					{
						"properties": {
							"tabs": {
								"items": { "$ref": "#/schemas/success_response/$defs/TabInfo" },
								"type": "array"
							},
							"type": {
								"const": "tab_list",
								"type": "string"
							}
						},
						"required": ["type", "tabs"],
						"type": "object"
					},
					{
						"properties": {
							"agent": { "$ref": "#/schemas/success_response/$defs/AgentInfo" },
							"type": {
								"const": "agent_info",
								"type": "string"
							}
						},
						"required": ["type", "agent"],
						"type": "object"
					},
					{
						"properties": {
							"agent": { "$ref": "#/schemas/success_response/$defs/AgentInfo" },
							"argv": {
								"items": { "type": "string" },
								"type": "array"
							},
							"type": {
								"const": "agent_started",
								"type": "string"
							}
						},
						"required": [
							"type",
							"agent",
							"argv"
						],
						"type": "object"
					},
					{
						"properties": {
							"agent": { "$ref": "#/schemas/success_response/$defs/AgentInfo" },
							"type": {
								"const": "agent_prompted",
								"type": "string"
							}
						},
						"required": ["type", "agent"],
						"type": "object"
					},
					{
						"properties": {
							"agents": {
								"items": { "$ref": "#/schemas/success_response/$defs/AgentInfo" },
								"type": "array"
							},
							"type": {
								"const": "agent_list",
								"type": "string"
							}
						},
						"required": ["type", "agents"],
						"type": "object"
					},
					{
						"properties": {
							"active": { "type": "boolean" },
							"label": { "type": ["string", "null"] },
							"source": { "type": ["string", "null"] },
							"type": {
								"const": "agent_view",
								"type": "string"
							}
						},
						"required": ["type", "active"],
						"type": "object"
					},
					{
						"properties": {
							"pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
							"type": {
								"const": "pane_info",
								"type": "string"
							}
						},
						"required": ["type", "pane"],
						"type": "object"
					},
					{
						"properties": {
							"panes": {
								"items": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
								"type": "array"
							},
							"type": {
								"const": "pane_list",
								"type": "string"
							}
						},
						"required": ["type", "panes"],
						"type": "object"
					},
					{
						"properties": {
							"pane": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
							"type": {
								"const": "pane_current",
								"type": "string"
							}
						},
						"required": ["type", "pane"],
						"type": "object"
					},
					{
						"properties": {
							"swap": { "$ref": "#/schemas/success_response/$defs/PaneSwapResult" },
							"type": {
								"const": "pane_swap",
								"type": "string"
							}
						},
						"required": ["type", "swap"],
						"type": "object"
					},
					{
						"properties": {
							"move_result": { "$ref": "#/schemas/success_response/$defs/PaneMoveResult" },
							"type": {
								"const": "pane_move",
								"type": "string"
							}
						},
						"required": ["type", "move_result"],
						"type": "object"
					},
					{
						"properties": {
							"type": {
								"const": "pane_zoom",
								"type": "string"
							},
							"zoom": { "$ref": "#/schemas/success_response/$defs/PaneZoomResult" }
						},
						"required": ["type", "zoom"],
						"type": "object"
					},
					{
						"properties": {
							"layout": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" },
							"type": {
								"const": "pane_layout",
								"type": "string"
							}
						},
						"required": ["type", "layout"],
						"type": "object"
					},
					{
						"properties": {
							"process_info": { "$ref": "#/schemas/success_response/$defs/PaneProcessInfo" },
							"type": {
								"const": "pane_process_info",
								"type": "string"
							}
						},
						"required": ["type", "process_info"],
						"type": "object"
					},
					{
						"properties": {
							"layout": { "$ref": "#/schemas/success_response/$defs/LayoutDescription" },
							"type": {
								"const": "layout_export",
								"type": "string"
							}
						},
						"required": ["type", "layout"],
						"type": "object"
					},
					{
						"properties": {
							"layout": { "$ref": "#/schemas/success_response/$defs/LayoutDescription" },
							"type": {
								"const": "layout_apply",
								"type": "string"
							}
						},
						"required": ["type", "layout"],
						"type": "object"
					},
					{
						"properties": {
							"layout": { "$ref": "#/schemas/success_response/$defs/LayoutDescription" },
							"type": {
								"const": "layout_split_ratio_set",
								"type": "string"
							}
						},
						"required": ["type", "layout"],
						"type": "object"
					},
					{
						"properties": {
							"neighbor": { "$ref": "#/schemas/success_response/$defs/PaneNeighborResult" },
							"type": {
								"const": "pane_neighbor",
								"type": "string"
							}
						},
						"required": ["type", "neighbor"],
						"type": "object"
					},
					{
						"properties": {
							"edges": { "$ref": "#/schemas/success_response/$defs/PaneEdgesResult" },
							"type": {
								"const": "pane_edges",
								"type": "string"
							}
						},
						"required": ["type", "edges"],
						"type": "object"
					},
					{
						"properties": {
							"focus": { "$ref": "#/schemas/success_response/$defs/PaneFocusDirectionResult" },
							"type": {
								"const": "pane_focus_direction",
								"type": "string"
							}
						},
						"required": ["type", "focus"],
						"type": "object"
					},
					{
						"properties": {
							"resize": { "$ref": "#/schemas/success_response/$defs/PaneResizeResult" },
							"type": {
								"const": "pane_resize",
								"type": "string"
							}
						},
						"required": ["type", "resize"],
						"type": "object"
					},
					{
						"properties": {
							"read": { "$ref": "#/schemas/success_response/$defs/PaneReadResult" },
							"type": {
								"const": "pane_read",
								"type": "string"
							}
						},
						"required": ["type", "read"],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"text": { "type": "string" },
							"type": {
								"const": "pane_selection",
								"type": "string"
							}
						},
						"required": [
							"type",
							"pane_id",
							"text"
						],
						"type": "object"
					},
					{
						"properties": {
							"content_revision": {
								"format": "uint64",
								"minimum": 0,
								"type": "integer"
							},
							"cursor": { "$ref": "#/schemas/success_response/$defs/PaneTextPoint" },
							"pane_id": { "type": "string" },
							"type": {
								"const": "pane_copy_motion",
								"type": "string"
							}
						},
						"required": [
							"type",
							"pane_id",
							"cursor",
							"content_revision"
						],
						"type": "object"
					},
					{
						"properties": {
							"content_revision": {
								"format": "uint64",
								"minimum": 0,
								"type": "integer"
							},
							"current": {
								"format": "uint32",
								"minimum": 0,
								"type": ["integer", "null"]
							},
							"current_global": {
								"format": "uint64",
								"minimum": 0,
								"type": ["integer", "null"]
							},
							"matches": {
								"items": { "$ref": "#/schemas/success_response/$defs/PaneTextRange" },
								"type": "array"
							},
							"pane_id": { "type": "string" },
							"total": {
								"format": "uint64",
								"minimum": 0,
								"type": "integer"
							},
							"type": {
								"const": "pane_copy_search",
								"type": "string"
							}
						},
						"required": [
							"type",
							"pane_id",
							"content_revision",
							"matches",
							"total"
						],
						"type": "object"
					},
					{
						"properties": {
							"explain": true,
							"type": {
								"const": "agent_explain",
								"type": "string"
							}
						},
						"required": ["type", "explain"],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "subscription_started",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					},
					{
						"properties": {
							"event": { "$ref": "#/schemas/success_response/$defs/EventEnvelope" },
							"type": {
								"const": "wait_matched",
								"type": "string"
							}
						},
						"required": ["type", "event"],
						"type": "object"
					},
					{
						"properties": {
							"matched_line": { "type": ["string", "null"] },
							"pane_id": { "type": "string" },
							"read": { "$ref": "#/schemas/success_response/$defs/PaneReadResult" },
							"revision": {
								"format": "uint64",
								"minimum": 0,
								"type": "integer"
							},
							"type": {
								"const": "output_matched",
								"type": "string"
							}
						},
						"required": [
							"type",
							"pane_id",
							"revision",
							"read"
						],
						"type": "object"
					},
					{
						"properties": {
							"reason": { "$ref": "#/schemas/success_response/$defs/NotificationShowReason" },
							"shown": { "type": "boolean" },
							"type": {
								"const": "notification_show",
								"type": "string"
							}
						},
						"required": [
							"type",
							"shown",
							"reason"
						],
						"type": "object"
					},
					{
						"properties": {
							"changed": { "type": "boolean" },
							"reason": { "$ref": "#/schemas/success_response/$defs/ClientWindowTitleReason" },
							"type": {
								"const": "client_window_title",
								"type": "string"
							}
						},
						"required": [
							"type",
							"changed",
							"reason"
						],
						"type": "object"
					},
					{
						"properties": {
							"integrations": {
								"items": { "$ref": "#/schemas/success_response/$defs/IntegrationInfo" },
								"type": "array"
							},
							"type": {
								"const": "integration_list",
								"type": "string"
							}
						},
						"required": ["type", "integrations"],
						"type": "object"
					},
					{
						"properties": {
							"details": { "$ref": "#/schemas/success_response/$defs/IntegrationInstallResult" },
							"target": { "$ref": "#/schemas/success_response/$defs/IntegrationTarget" },
							"type": {
								"const": "integration_install",
								"type": "string"
							}
						},
						"required": [
							"type",
							"target",
							"details"
						],
						"type": "object"
					},
					{
						"properties": {
							"details": { "$ref": "#/schemas/success_response/$defs/IntegrationUninstallResult" },
							"target": { "$ref": "#/schemas/success_response/$defs/IntegrationTarget" },
							"type": {
								"const": "integration_uninstall",
								"type": "string"
							}
						},
						"required": [
							"type",
							"target",
							"details"
						],
						"type": "object"
					},
					{
						"properties": {
							"manifests": {
								"items": { "$ref": "#/schemas/success_response/$defs/AgentManifestInfo" },
								"type": "array"
							},
							"type": {
								"const": "agent_manifest_reload",
								"type": "string"
							}
						},
						"required": ["type", "manifests"],
						"type": "object"
					},
					{
						"properties": {
							"last_check_unix": {
								"format": "uint64",
								"minimum": 0,
								"type": ["integer", "null"]
							},
							"last_result": { "type": ["string", "null"] },
							"manifests": {
								"items": { "$ref": "#/schemas/success_response/$defs/AgentManifestInfo" },
								"type": "array"
							},
							"type": {
								"const": "agent_manifest_status",
								"type": "string"
							}
						},
						"required": ["type", "manifests"],
						"type": "object"
					},
					{
						"properties": {
							"plugin": { "$ref": "#/schemas/success_response/$defs/InstalledPluginInfo" },
							"type": {
								"const": "plugin_linked",
								"type": "string"
							}
						},
						"required": ["type", "plugin"],
						"type": "object"
					},
					{
						"properties": {
							"plugins": {
								"items": { "$ref": "#/schemas/success_response/$defs/InstalledPluginInfo" },
								"type": "array"
							},
							"type": {
								"const": "plugin_list",
								"type": "string"
							}
						},
						"required": ["type", "plugins"],
						"type": "object"
					},
					{
						"properties": {
							"plugin_id": { "type": "string" },
							"removed": { "type": "boolean" },
							"type": {
								"const": "plugin_unlinked",
								"type": "string"
							}
						},
						"required": [
							"type",
							"plugin_id",
							"removed"
						],
						"type": "object"
					},
					{
						"properties": {
							"plugin": { "$ref": "#/schemas/success_response/$defs/InstalledPluginInfo" },
							"type": {
								"const": "plugin_enabled",
								"type": "string"
							}
						},
						"required": ["type", "plugin"],
						"type": "object"
					},
					{
						"properties": {
							"plugin": { "$ref": "#/schemas/success_response/$defs/InstalledPluginInfo" },
							"type": {
								"const": "plugin_disabled",
								"type": "string"
							}
						},
						"required": ["type", "plugin"],
						"type": "object"
					},
					{
						"properties": {
							"actions": {
								"items": { "$ref": "#/schemas/success_response/$defs/PluginActionInfo" },
								"type": "array"
							},
							"type": {
								"const": "plugin_action_list",
								"type": "string"
							}
						},
						"required": ["type", "actions"],
						"type": "object"
					},
					{
						"properties": {
							"action": { "$ref": "#/schemas/success_response/$defs/PluginActionInfo" },
							"context": { "$ref": "#/schemas/success_response/$defs/PluginInvocationContext" },
							"log": { "$ref": "#/schemas/success_response/$defs/PluginCommandLogInfo" },
							"type": {
								"const": "plugin_action_invoked",
								"type": "string"
							}
						},
						"required": [
							"type",
							"action",
							"context",
							"log"
						],
						"type": "object"
					},
					{
						"properties": {
							"regions": {
								"items": { "$ref": "#/schemas/success_response/$defs/PaneLinkRegion" },
								"type": "array"
							},
							"type": {
								"const": "pane_link_resolved",
								"type": "string"
							}
						},
						"required": ["type", "regions"],
						"type": "object"
					},
					{
						"properties": {
							"handled": { "type": "boolean" },
							"type": {
								"const": "pane_link_activated",
								"type": "string"
							},
							"url": { "type": ["string", "null"] }
						},
						"required": ["type", "handled"],
						"type": "object"
					},
					{
						"properties": {
							"logs": {
								"items": { "$ref": "#/schemas/success_response/$defs/PluginCommandLogInfo" },
								"type": "array"
							},
							"type": {
								"const": "plugin_log_list",
								"type": "string"
							}
						},
						"required": ["type", "logs"],
						"type": "object"
					},
					{
						"properties": {
							"plugin_pane": { "$ref": "#/schemas/success_response/$defs/PluginPaneInfo" },
							"type": {
								"const": "plugin_pane_opened",
								"type": "string"
							}
						},
						"required": ["type", "plugin_pane"],
						"type": "object"
					},
					{
						"properties": {
							"plugin_pane": { "$ref": "#/schemas/success_response/$defs/PluginPaneInfo" },
							"type": {
								"const": "plugin_pane_focused",
								"type": "string"
							}
						},
						"required": ["type", "plugin_pane"],
						"type": "object"
					},
					{
						"properties": {
							"pane_id": { "type": "string" },
							"type": {
								"const": "plugin_pane_closed",
								"type": "string"
							}
						},
						"required": ["type", "pane_id"],
						"type": "object"
					},
					{
						"properties": {
							"diagnostics": {
								"items": { "type": "string" },
								"type": "array"
							},
							"status": { "$ref": "#/schemas/success_response/$defs/ConfigReloadStatus" },
							"type": {
								"const": "config_reload",
								"type": "string"
							}
						},
						"required": [
							"type",
							"status",
							"diagnostics"
						],
						"type": "object"
					},
					{
						"description": "Acknowledgement for the client-shell surface interest lease. This method is new on the\nendpoint protocol, so its revision-bearing result can establish an activation floor.",
						"properties": {
							"active": { "type": "boolean" },
							"projection_revision": {
								"format": "uint64",
								"minimum": 0,
								"type": "integer"
							},
							"type": {
								"const": "client_shell_surface_set",
								"type": "string"
							}
						},
						"required": [
							"type",
							"active",
							"projection_revision"
						],
						"type": "object"
					},
					{
						"properties": { "type": {
							"const": "ok",
							"type": "string"
						} },
						"required": ["type"],
						"type": "object"
					}
				] },
				"ServerCapabilities": {
					"properties": {
						"detached_server_daemon": {
							"default": false,
							"type": "boolean"
						},
						"endpoint_protocol_generation": {
							"description": "Stable client-owned endpoint generation supported by this server.",
							"format": "uint32",
							"minimum": 0,
							"type": ["integer", "null"]
						},
						"health_check": {
							"default": false,
							"description": "Whether this server supports endpoint health probes.",
							"type": "boolean"
						},
						"live_handoff": { "type": "boolean" },
						"ssh_agent_registration": {
							"default": false,
							"description": "Supports connection-scoped `server.ssh_agent.register` on the local JSON API.",
							"type": "boolean"
						},
						"surface_interest": {
							"default": false,
							"description": "Whether this server supports explicit client-shell surface interest.",
							"type": "boolean"
						}
					},
					"required": ["live_handoff"],
					"type": "object"
				},
				"SessionSnapshot": {
					"properties": {
						"agents": {
							"items": { "$ref": "#/schemas/success_response/$defs/AgentInfo" },
							"type": "array"
						},
						"focused_pane_id": { "type": ["string", "null"] },
						"focused_tab_id": { "type": ["string", "null"] },
						"focused_workspace_id": { "type": ["string", "null"] },
						"layouts": {
							"items": { "$ref": "#/schemas/success_response/$defs/PaneLayoutSnapshot" },
							"type": "array"
						},
						"panes": {
							"items": { "$ref": "#/schemas/success_response/$defs/PaneInfo" },
							"type": "array"
						},
						"protocol": {
							"format": "uint32",
							"minimum": 0,
							"type": "integer"
						},
						"tabs": {
							"items": { "$ref": "#/schemas/success_response/$defs/TabInfo" },
							"type": "array"
						},
						"version": { "type": "string" },
						"workspaces": {
							"items": { "$ref": "#/schemas/success_response/$defs/WorkspaceInfo" },
							"type": "array"
						}
					},
					"required": [
						"version",
						"protocol",
						"workspaces",
						"tabs",
						"panes",
						"layouts",
						"agents"
					],
					"type": "object"
				},
				"SplitDirection": {
					"enum": ["right", "down"],
					"type": "string"
				},
				"TabInfo": {
					"properties": {
						"agent_status": { "$ref": "#/schemas/success_response/$defs/AgentStatus" },
						"focused": { "type": "boolean" },
						"label": { "type": "string" },
						"number": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"pane_count": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"tab_id": { "type": "string" },
						"workspace_id": { "type": "string" }
					},
					"required": [
						"tab_id",
						"workspace_id",
						"number",
						"label",
						"focused",
						"pane_count",
						"agent_status"
					],
					"type": "object"
				},
				"WorkspaceInfo": {
					"properties": {
						"active_tab_id": { "type": "string" },
						"agent_status": { "$ref": "#/schemas/success_response/$defs/AgentStatus" },
						"focused": { "type": "boolean" },
						"label": { "type": "string" },
						"number": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"pane_count": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"tab_count": {
							"format": "uint",
							"minimum": 0,
							"type": "integer"
						},
						"tokens": {
							"additionalProperties": { "type": "string" },
							"maxProperties": 32,
							"propertyNames": { "pattern": "^[A-Za-z0-9_-]{1,32}$" },
							"type": "object"
						},
						"workspace_id": { "type": "string" },
						"worktree": { "anyOf": [{ "$ref": "#/schemas/success_response/$defs/WorkspaceWorktreeInfo" }, { "type": "null" }] }
					},
					"required": [
						"workspace_id",
						"number",
						"label",
						"focused",
						"pane_count",
						"tab_count",
						"active_tab_id",
						"agent_status"
					],
					"type": "object"
				},
				"WorkspaceWorktreeInfo": {
					"properties": {
						"checkout_path": { "type": "string" },
						"is_linked_worktree": { "type": "boolean" },
						"repo_key": { "type": "string" },
						"repo_name": { "type": "string" },
						"repo_root": { "type": "string" }
					},
					"required": [
						"repo_key",
						"repo_name",
						"repo_root",
						"checkout_path",
						"is_linked_worktree"
					],
					"type": "object"
				},
				"WorktreeInfo": {
					"properties": {
						"branch": { "type": ["string", "null"] },
						"is_bare": { "type": "boolean" },
						"is_detached": { "type": "boolean" },
						"is_linked_worktree": { "type": "boolean" },
						"is_prunable": { "type": "boolean" },
						"label": { "type": "string" },
						"open_workspace_id": { "type": ["string", "null"] },
						"path": { "type": "string" }
					},
					"required": [
						"path",
						"is_bare",
						"is_detached",
						"is_prunable",
						"is_linked_worktree",
						"label"
					],
					"type": "object"
				},
				"WorktreeSourceInfo": {
					"properties": {
						"repo_key": { "type": "string" },
						"repo_name": { "type": "string" },
						"repo_root": { "type": "string" },
						"source_checkout_path": { "type": "string" },
						"source_workspace_id": { "type": ["string", "null"] }
					},
					"required": [
						"repo_key",
						"repo_name",
						"repo_root",
						"source_checkout_path"
					],
					"type": "object"
				}
			},
			"$schema": "https://json-schema.org/draft/2020-12/schema",
			"properties": {
				"id": { "type": "string" },
				"result": { "$ref": "#/schemas/success_response/$defs/ResponseResult" }
			},
			"required": ["id", "result"],
			"title": "SuccessResponse",
			"type": "object"
		}
	},
	title: "Herdr API"
};
//#endregion
//#region src/herdr-wire-parser.ts
/**
* Decodes generated Herdr wire envelopes into normalized protocol values.
*
* Response and event parsers keep generated snake-case contracts at the transport boundary and report malformed JSON as typed SDK failures.
*
* @since 0.8.2
*/
/** Narrows a schema-validated result using the exhaustively generated method contract. @category decoding @since 0.9.0 */
function isExpectedWireResult(method, result) {
	return wireResultTypesByMethod[method].includes(result.type);
}
const SCHEMA_ID = "https://herdr.dev/herdr-api.schema.json";
const ajv = new Ajv2020({
	allErrors: true,
	strict: false,
	validateFormats: false
});
ajv.addSchema({
	...herdr_api_schema_default,
	$id: SCHEMA_ID
});
const parseSuccessResponse = ajv.compile({ $ref: `${SCHEMA_ID}#/schemas/success_response` });
const parseErrorResponse = ajv.compile({ $ref: `${SCHEMA_ID}#/schemas/error_response` });
const parseLifecycleEvent = ajv.compile({ $ref: `${SCHEMA_ID}#/schemas/event` });
const parseSubscriptionEvent = ajv.compile({ $ref: `${SCHEMA_ID}#/schemas/subscription_event` });
/**
* Parses an untrusted wire response into the generated success or error contract.
*
* @category decoding
* @since 0.8.2
*/
function parseHerdrWireResponse(value, requestId) {
	if (parseSuccessResponse(value) || parseErrorResponse(value)) return value;
	throw invalidWireValue("response", requestId, [...parseSuccessResponse.errors ?? [], ...parseErrorResponse.errors ?? []]);
}
/**
* Parses an untrusted event line into one generated Herdr envelope family.
*
* @category decoding
* @since 0.8.2
*/
function parseHerdrWireEvent(value, requestId) {
	if (parseLifecycleEvent(value) || parseSubscriptionEvent(value)) return value;
	throw invalidWireValue("event", requestId, [...parseLifecycleEvent.errors ?? [], ...parseSubscriptionEvent.errors ?? []]);
}
function invalidWireValue(kind, requestId, errors) {
	const detail = ajv.errorsText(errors.slice(0, 5), { separator: "; " });
	return /* @__PURE__ */ new Error(`Herdr wire ${kind} failed schema parsing for request ${requestId}: ${detail}`);
}
//#endregion
//#region src/herdr-models.ts
/**
* Defines public Herdr resource, input, result, and event schemas.
*
* Each schema owns runtime decoding and its corresponding TypeScript model so protocol data becomes normalized domain values at SDK boundaries.
*
* @since 0.8.2
*/
const optionalString = Schema.OptionFromOptionalNullOr(Schema.String);
const optionalAbsolutePath = Schema.OptionFromOptionalNullOr(HerdrAbsolutePath);
/**
* Agent lifecycle status reported by Herdr resources.
*
* @category schemas
* @since 0.8.2
*/
const AgentStatus = Schema.Literals([
	"idle",
	"working",
	"blocked",
	"done",
	"unknown"
]);
/**
* Agent state accepted by pane reporting operations.
*
* @category schemas
* @since 0.8.2
*/
const ReportedAgentState = Schema.Literals([
	"idle",
	"working",
	"blocked",
	"unknown"
]);
/**
* How an agent session reference identifies the upstream session.
*
* @category schemas
* @since 0.8.2
*/
const AgentSessionReferenceKind = Schema.Literals(["id", "path"]);
/**
* Stable reference to an upstream agent session.
*
* @category schemas
* @since 0.8.2
*/
const AgentSessionReference = Schema.Struct({
	source: Schema.String,
	agent: Schema.String,
	kind: AgentSessionReferenceKind,
	value: Schema.String
});
/**
* Optional server capabilities reported by the compatibility handshake.
*
* @category schemas
* @since 0.8.2
*/
const ServerCapabilities = Schema.Struct({
	liveHandoff: Schema.Boolean,
	detachedServerDaemon: Schema.optionalKey(Schema.Boolean).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false), { encodingStrategy: "omit" })),
	endpointProtocolGeneration: Schema.OptionFromOptionalNullOr(Schema.Natural),
	surfaceInterest: Schema.optionalKey(Schema.Boolean).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false), { encodingStrategy: "omit" })),
	healthCheck: Schema.optionalKey(Schema.Boolean).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false), { encodingStrategy: "omit" })),
	/** True when this local server accepts connection-scoped SSH agent registration. */
	sshAgentRegistration: Schema.optionalKey(Schema.Boolean).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false), { encodingStrategy: "omit" }))
}).pipe(Schema.encodeKeys({
	liveHandoff: "live_handoff",
	detachedServerDaemon: "detached_server_daemon",
	endpointProtocolGeneration: "endpoint_protocol_generation",
	surfaceInterest: "surface_interest",
	healthCheck: "health_check",
	sshAgentRegistration: "ssh_agent_registration"
}));
/**
* Successful Herdr compatibility handshake.
*
* @category schemas
* @since 0.8.2
*/
const PingResult = Schema.Struct({
	version: Schema.String,
	protocol: Schema.Natural,
	capabilities: Schema.OptionFromOptionalNullOr(ServerCapabilities)
});
/**
* Server configuration reload status and diagnostics.
*
* @category schemas
* @since 0.8.2
*/
const ConfigReloadResult = Schema.Struct({
	status: Schema.Literals([
		"applied",
		"partial",
		"failed"
	]),
	diagnostics: Schema.Array(Schema.String)
});
/**
* One discovered agent manifest and its update state.
*
* @category schemas
* @since 0.8.2
*/
const AgentManifest = Schema.Struct({
	agent: Schema.String,
	source: Schema.String,
	sourceKind: Schema.String,
	activeVersion: optionalString,
	cachedRemoteVersion: optionalString,
	localOverrideShadowingRemote: Schema.Boolean,
	remoteUpdateResult: optionalString,
	remoteUpdateError: optionalString,
	remoteLastCheckedUnix: Schema.OptionFromOptionalNullOr(HerdrUnixSeconds),
	warning: optionalString
}).pipe(Schema.encodeKeys({
	sourceKind: "source_kind",
	activeVersion: "active_version",
	cachedRemoteVersion: "cached_remote_version",
	localOverrideShadowingRemote: "local_override_shadowing_remote",
	remoteUpdateResult: "remote_update_result",
	remoteUpdateError: "remote_update_error",
	remoteLastCheckedUnix: "remote_last_checked_unix"
}));
/**
* Current agent-manifest cache and refresh state.
*
* @category schemas
* @since 0.8.2
*/
const AgentManifestStatus = Schema.Struct({
	lastCheckUnix: Schema.OptionFromOptionalNullOr(HerdrUnixSeconds),
	lastResult: optionalString,
	manifests: Schema.Array(AgentManifest)
}).pipe(Schema.encodeKeys({
	lastCheckUnix: "last_check_unix",
	lastResult: "last_result"
}));
/**
* Result of showing a foreground notification.
*
* @category schemas
* @since 0.8.2
*/
const NotificationShowResult = Schema.Struct({
	shown: Schema.Boolean,
	reason: Schema.Literals([
		"shown",
		"disabled",
		"rate_limited",
		"no_foreground_client",
		"busy"
	])
});
/**
* Result of changing the foreground client's window title.
*
* @category schemas
* @since 0.8.2
*/
const ClientWindowTitleResult = Schema.Struct({
	changed: Schema.Boolean,
	reason: Schema.Literals([
		"set",
		"cleared",
		"no_foreground_client"
	])
});
const WorkspaceWorktreeInput = Schema.Struct({
	repoKey: Schema.String,
	repoName: Schema.String,
	repoRoot: HerdrAbsolutePath,
	checkoutPath: HerdrAbsolutePath,
	isLinkedWorktree: Schema.Boolean
});
/**
* Worktree information attached to an open workspace.
*
* @category schemas
* @since 0.8.2
*/
const WorkspaceWorktree = WorkspaceWorktreeInput.pipe(Schema.encodeKeys({
	repoKey: "repo_key",
	repoName: "repo_name",
	repoRoot: "repo_root",
	checkoutPath: "checkout_path",
	isLinkedWorktree: "is_linked_worktree"
}));
/**
* Herdr workspace normalized from the private wire representation.
*
* @category schemas
* @since 0.8.2
*/
const Workspace = Schema.Struct({
	id: WorkspaceId,
	number: Schema.Natural,
	label: Schema.String,
	focused: Schema.Boolean,
	paneCount: Schema.Natural,
	tabCount: Schema.Natural,
	activeTabId: TabId,
	agentStatus: AgentStatus,
	tokens: Schema.optionalKey(HerdrMetadataTokens).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}), { encodingStrategy: "omit" })),
	worktree: Schema.OptionFromOptionalNullOr(WorkspaceWorktree)
}).pipe(Schema.encodeKeys({
	id: "workspace_id",
	paneCount: "pane_count",
	tabCount: "tab_count",
	activeTabId: "active_tab_id",
	agentStatus: "agent_status"
}));
/**
* Herdr tab normalized from the private wire representation.
*
* @category schemas
* @since 0.8.2
*/
const Tab = Schema.Struct({
	id: TabId,
	workspaceId: WorkspaceId,
	number: Schema.Natural,
	label: Schema.String,
	focused: Schema.Boolean,
	paneCount: Schema.Natural,
	agentStatus: AgentStatus
}).pipe(Schema.encodeKeys({
	id: "tab_id",
	workspaceId: "workspace_id",
	paneCount: "pane_count",
	agentStatus: "agent_status"
}));
/**
* Scroll position attached to a pane snapshot.
*
* @category schemas
* @since 0.8.2
*/
const PaneScroll = Schema.Struct({
	offsetFromBottom: Schema.Finite,
	maxOffsetFromBottom: Schema.Finite,
	viewportRows: Schema.Natural
}).pipe(Schema.encodeKeys({
	offsetFromBottom: "offset_from_bottom",
	maxOffsetFromBottom: "max_offset_from_bottom",
	viewportRows: "viewport_rows"
}));
/**
* Herdr pane normalized from the private wire representation.
*
* @category schemas
* @since 0.8.2
*/
const Pane = Schema.Struct({
	id: PaneId,
	terminalId: TerminalId,
	workspaceId: WorkspaceId,
	tabId: TabId,
	focused: Schema.Boolean,
	cwd: optionalAbsolutePath,
	foregroundCwd: optionalAbsolutePath,
	/** Why Herdr could not restore this pane's saved shell or directory, when restore failed. */
	restoreError: optionalString,
	label: optionalString,
	agent: optionalString,
	title: optionalString,
	terminalTitle: optionalString,
	terminalTitleStripped: optionalString,
	displayAgent: optionalString,
	agentStatus: AgentStatus,
	stateLabels: Schema.optionalKey(HerdrMetadataTokens).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}), { encodingStrategy: "omit" })),
	tokens: Schema.optionalKey(HerdrMetadataTokens).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}), { encodingStrategy: "omit" })),
	agentSession: Schema.OptionFromOptionalNullOr(AgentSessionReference),
	scroll: Schema.OptionFromOptionalNullOr(PaneScroll),
	revision: HerdrRevision
}).pipe(Schema.encodeKeys({
	id: "pane_id",
	terminalId: "terminal_id",
	workspaceId: "workspace_id",
	tabId: "tab_id",
	foregroundCwd: "foreground_cwd",
	restoreError: "restore_error",
	terminalTitle: "terminal_title",
	terminalTitleStripped: "terminal_title_stripped",
	displayAgent: "display_agent",
	agentStatus: "agent_status",
	stateLabels: "state_labels",
	agentSession: "agent_session"
}));
/**
* Herdr agent normalized from the private wire representation.
*
* @category schemas
* @since 0.8.2
*/
const Agent = Schema.Struct({
	terminalId: TerminalId,
	name: Schema.OptionFromOptionalNullOr(AgentName),
	agent: optionalString,
	title: optionalString,
	terminalTitle: optionalString,
	terminalTitleStripped: optionalString,
	displayAgent: optionalString,
	status: AgentStatus,
	screenDetectionSkipped: Schema.optionalKey(Schema.Boolean).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false), { encodingStrategy: "omit" })),
	stateLabels: Schema.optionalKey(HerdrMetadataTokens).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}), { encodingStrategy: "omit" })),
	tokens: Schema.optionalKey(HerdrMetadataTokens).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}), { encodingStrategy: "omit" })),
	agentSession: Schema.OptionFromOptionalNullOr(AgentSessionReference),
	workspaceId: WorkspaceId,
	tabId: TabId,
	paneId: PaneId,
	focused: Schema.Boolean,
	launchPending: Schema.optionalKey(Schema.Boolean).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false), { encodingStrategy: "omit" })),
	interactiveReady: Schema.optionalKey(Schema.Boolean).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false), { encodingStrategy: "omit" })),
	stateChangeSequence: Schema.optionalKey(HerdrStateChangeSequence).pipe(Schema.withDecodingDefaultKey(Effect.succeed(HerdrStateChangeSequence.make(0)), { encodingStrategy: "omit" })),
	/**
	* Set when the current idle transition completed work, independent of who has viewed it.
	* Equals that transition's `stateChangeSequence`; startup, restore, and session changes leave it unset.
	*/
	completionSequence: Schema.OptionFromOptionalNullOr(HerdrStateChangeSequence),
	cwd: optionalAbsolutePath,
	foregroundCwd: optionalAbsolutePath,
	revision: HerdrRevision
}).pipe(Schema.encodeKeys({
	terminalId: "terminal_id",
	terminalTitle: "terminal_title",
	terminalTitleStripped: "terminal_title_stripped",
	displayAgent: "display_agent",
	status: "agent_status",
	screenDetectionSkipped: "screen_detection_skipped",
	stateLabels: "state_labels",
	agentSession: "agent_session",
	workspaceId: "workspace_id",
	tabId: "tab_id",
	paneId: "pane_id",
	launchPending: "launch_pending",
	interactiveReady: "interactive_ready",
	stateChangeSequence: "state_change_seq",
	completionSequence: "completion_seq",
	foregroundCwd: "foreground_cwd"
}));
/**
* Input accepted when creating a workspace.
*
* @category schemas
* @since 0.8.2
*/
const WorkspaceCreateOptions = Schema.Struct({
	focus: Schema.OptionFromOptionalKey(Schema.Boolean),
	label: Schema.OptionFromOptionalKey(Schema.String),
	env: Schema.OptionFromOptionalKey(HerdrEnvironment)
});
/**
* Workspace, initial tab, and root pane created atomically by Herdr.
*
* @category schemas
* @since 0.8.2
*/
const WorkspaceCreateResult = Schema.Struct({
	workspace: Workspace,
	tab: Tab,
	rootPane: Pane
}).pipe(Schema.encodeKeys({ rootPane: "root_pane" }));
/**
* Metadata patch reported for a workspace.
*
* @category schemas
* @since 0.8.2
*/
const WorkspaceMetadataReportInput = Schema.Struct({
	source: Schema.String,
	tokens: HerdrMetadataTokenPatch,
	sequence: Schema.OptionFromOptionalKey(HerdrStateChangeSequence),
	ttlMs: Schema.OptionFromOptionalKey(HerdrMetadataTtl)
});
/**
* Ordered destination for moving one workspace.
*
* @category schemas
* @since 0.8.2
*/
const WorkspaceMoveInput = Schema.Struct({ insertIndex: HerdrInsertIndex });
/**
* Optional anchor used when moving a contiguous workspace block.
*
* @category schemas
* @since 0.8.2
*/
const WorkspaceMoveBlockInput = Schema.Struct({ beforeWorkspaceId: Schema.OptionFromOptionalKey(WorkspaceId) });
/**
* Optional compatibility expectations for a live server handoff.
*
* @category schemas
* @since 0.8.2
*/
const ServerLiveHandoffInput = Schema.Struct({
	importExe: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	expectedProtocol: Schema.OptionFromOptionalKey(Schema.Natural),
	expectedVersion: Schema.OptionFromOptionalKey(Schema.String)
});
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
const ServerSshAgentRegisterInput = Schema.Struct({ 
/** Absolute agent socket owned by the same user, on the host running the Herdr server. */
socketPath: HerdrAbsolutePath });
/**
* Foreground notification request.
*
* @category schemas
* @since 0.8.2
*/
const NotificationShowInput = Schema.Struct({
	title: Schema.String,
	body: Schema.OptionFromOptionalKey(Schema.String),
	position: Schema.OptionFromOptionalKey(Schema.Literals([
		"top-left",
		"top-right",
		"bottom-left",
		"bottom-right"
	])),
	sound: Schema.OptionFromOptionalKey(Schema.Literals([
		"none",
		"done",
		"request"
	]))
});
/**
* Built-in terminal-agent integration managed by Herdr.
*
* @category schemas
* @since 0.8.2
*/
const IntegrationTarget = Schema.Literals([
	"pi",
	"omp",
	"claude",
	"codex",
	"copilot",
	"devin",
	"droid",
	"kimi",
	"opencode",
	"kilo",
	"hermes",
	"qodercli",
	"cursor",
	"mastracode",
	"grok",
	"qwen",
	"antigravity_cli"
]);
/**
* Result of installing or uninstalling a built-in integration.
*
* @category schemas
* @since 0.8.2
*/
const IntegrationChangeResult = Schema.Struct({
	target: IntegrationTarget,
	messages: Schema.Array(Schema.String)
});
/**
* Source repository resolved for worktree operations.
*
* @category schemas
* @since 0.8.2
*/
const WorktreeSourceInfo = Schema.Struct({
	repoKey: Schema.String,
	repoName: Schema.String,
	repoRoot: HerdrAbsolutePath,
	sourceCheckoutPath: HerdrAbsolutePath,
	sourceWorkspaceId: Schema.OptionFromOptionalNullOr(WorkspaceId)
}).pipe(Schema.encodeKeys({
	repoKey: "repo_key",
	repoName: "repo_name",
	repoRoot: "repo_root",
	sourceCheckoutPath: "source_checkout_path",
	sourceWorkspaceId: "source_workspace_id"
}));
/**
* Git worktree discovered by Herdr.
*
* @category schemas
* @since 0.8.2
*/
const Worktree = Schema.Struct({
	path: HerdrAbsolutePath,
	branch: optionalString,
	isBare: Schema.Boolean,
	isDetached: Schema.Boolean,
	isPrunable: Schema.Boolean,
	isLinkedWorktree: Schema.Boolean,
	openWorkspaceId: Schema.OptionFromOptionalNullOr(WorkspaceId),
	label: Schema.String
}).pipe(Schema.encodeKeys({
	isBare: "is_bare",
	isDetached: "is_detached",
	isPrunable: "is_prunable",
	isLinkedWorktree: "is_linked_worktree",
	openWorkspaceId: "open_workspace_id"
}));
/**
* Resolved source and worktrees returned by listing.
*
* @category schemas
* @since 0.8.2
*/
const WorktreeListResult = Schema.Struct({
	source: WorktreeSourceInfo,
	worktrees: Schema.Array(Worktree)
});
/**
* Worktree created together with its initial workspace resources.
*
* @category schemas
* @since 0.8.2
*/
const WorktreeCreateResult = Schema.Struct({
	worktree: Worktree,
	workspace: Workspace,
	tab: Tab,
	rootPane: Pane
}).pipe(Schema.encodeKeys({ rootPane: "root_pane" }));
/**
* Worktree opened together with its initial workspace resources.
*
* @category schemas
* @since 0.8.2
*/
const WorktreeOpenResult = Schema.Struct({
	worktree: Worktree,
	workspace: Workspace,
	tab: Tab,
	rootPane: Pane,
	alreadyOpen: Schema.Boolean
}).pipe(Schema.encodeKeys({
	rootPane: "root_pane",
	alreadyOpen: "already_open"
}));
/**
* Worktree removal outcome.
*
* @category schemas
* @since 0.8.2
*/
const WorktreeRemoveResult = Schema.Struct({
	workspaceId: WorkspaceId,
	path: HerdrAbsolutePath,
	forced: Schema.Boolean
}).pipe(Schema.encodeKeys({ workspaceId: "workspace_id" }));
const WorktreeSourceInputFields = {
	workspaceId: Schema.OptionFromOptionalKey(WorkspaceId),
	cwd: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	trustRepository: Schema.OptionFromOptionalKey(Schema.Boolean)
};
/**
* Optional workspace or directory selecting a repository for worktree listing.
*
* @category schemas
* @since 0.8.2
*/
const WorktreeListInput = Schema.Struct(WorktreeSourceInputFields).pipe(Schema.refine((value) => Option.isNone(value.workspaceId) || Option.isNone(value.cwd), { expected: "workspaceId and cwd are mutually exclusive" }));
/**
* Parameters accepted when creating a worktree and workspace.
*
* @category schemas
* @since 0.8.2
*/
const WorktreeCreateInput = Schema.Struct({
	...WorktreeSourceInputFields,
	branch: Schema.OptionFromOptionalKey(Schema.String),
	base: Schema.OptionFromOptionalKey(Schema.String),
	path: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	label: Schema.OptionFromOptionalKey(Schema.String),
	focus: Schema.OptionFromOptionalKey(Schema.Boolean)
}).pipe(Schema.refine((value) => Option.isNone(value.workspaceId) || Option.isNone(value.cwd), { expected: "workspaceId and cwd are mutually exclusive" }));
/**
* Parameters accepted when opening an existing worktree.
*
* @category schemas
* @since 0.8.2
*/
const WorktreeOpenInput = Schema.Struct({
	...WorktreeSourceInputFields,
	path: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	branch: Schema.OptionFromOptionalKey(Schema.String),
	label: Schema.OptionFromOptionalKey(Schema.String),
	focus: Schema.OptionFromOptionalKey(Schema.Boolean)
}).pipe(Schema.refine((value) => Option.isNone(value.workspaceId) || Option.isNone(value.cwd), { expected: "workspaceId and cwd are mutually exclusive" }), Schema.refine((value) => Option.isSome(value.path) !== Option.isSome(value.branch), { expected: "exactly one of path or branch is required" }));
/**
* Optional force flag for worktree removal.
*
* @category schemas
* @since 0.8.2
*/
const WorktreeRemoveInput = Schema.Struct({
	force: Schema.OptionFromOptionalKey(Schema.Boolean),
	trustRepository: Schema.OptionFromOptionalKey(Schema.Boolean)
});
/**
* Input accepted when creating a tab and root pane.
*
* @category schemas
* @since 0.8.2
*/
const TabCreateInput = Schema.Struct({
	workspaceId: Schema.OptionFromOptionalKey(WorkspaceId),
	cwd: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	focus: Schema.OptionFromOptionalKey(Schema.Boolean),
	label: Schema.OptionFromOptionalKey(Schema.String),
	env: Schema.OptionFromOptionalKey(HerdrEnvironment)
});
/**
* Tab and root pane created together.
*
* @category schemas
* @since 0.8.2
*/
const TabCreateResult = Schema.Struct({
	tab: Tab,
	rootPane: Pane
}).pipe(Schema.encodeKeys({ rootPane: "root_pane" }));
/**
* Optional workspace filter for tab listing.
*
* @category schemas
* @since 0.8.2
*/
const TabListInput = Schema.Struct({ workspaceId: Schema.OptionFromOptionalKey(WorkspaceId) });
/**
* Ordered destination for moving one tab.
*
* @category schemas
* @since 0.8.2
*/
const TabMoveInput = Schema.Struct({ insertIndex: HerdrInsertIndex });
/**
* Cardinal pane direction.
*
* @category schemas
* @since 0.8.2
*/
const PaneDirection = Schema.Literals([
	"left",
	"right",
	"up",
	"down"
]);
/**
* Direction accepted when constructing a binary split.
*
* @category schemas
* @since 0.8.2
*/
const SplitDirection = Schema.Literals(["right", "down"]);
/**
* Pane-output source selected for reading or waiting.
*
* @category schemas
* @since 0.8.2
*/
const PaneReadSource = Schema.Literals([
	"visible",
	"recent",
	"recent_unwrapped",
	"detection"
]);
/**
* Pane-output representation returned by a read.
*
* @category schemas
* @since 0.8.2
*/
const PaneReadFormat = Schema.Literals(["text", "ansi"]);
/**
* Rectangle in terminal-cell layout coordinates.
*
* @category schemas
* @since 0.8.2
*/
const PaneLayoutRect = Schema.Struct({
	x: Schema.Finite,
	y: Schema.Finite,
	width: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
	height: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
});
/**
* Pane layout snapshot returned by geometry operations.
*
* @category schemas
* @since 0.8.2
*/
const PaneLayoutSnapshot = Schema.Struct({
	workspaceId: WorkspaceId,
	tabId: TabId,
	zoomed: Schema.Boolean,
	area: PaneLayoutRect,
	focusedPaneId: PaneId,
	panes: Schema.Array(Schema.Struct({
		paneId: PaneId,
		focused: Schema.Boolean,
		rect: PaneLayoutRect
	}).pipe(Schema.encodeKeys({ paneId: "pane_id" }))),
	splits: Schema.Array(Schema.Struct({
		id: Schema.String,
		direction: SplitDirection,
		ratio: Schema.Finite,
		rect: PaneLayoutRect
	}))
}).pipe(Schema.encodeKeys({
	workspaceId: "workspace_id",
	tabId: "tab_id",
	focusedPaneId: "focused_pane_id"
}));
/**
* Pane output read result.
*
* @category schemas
* @since 0.8.2
*/
const PaneReadResult = Schema.Struct({
	paneId: PaneId,
	workspaceId: WorkspaceId,
	tabId: TabId,
	source: PaneReadSource,
	format: PaneReadFormat,
	text: Schema.String,
	revision: HerdrRevision,
	truncated: Schema.Boolean
}).pipe(Schema.encodeKeys({
	paneId: "pane_id",
	workspaceId: "workspace_id",
	tabId: "tab_id"
}));
/**
* Pane output wait result and the read that contained the match.
*
* @category schemas
* @since 0.8.2
*/
const PaneOutputMatchResult = Schema.Struct({
	paneId: PaneId,
	revision: HerdrRevision,
	matchedLine: optionalString,
	read: PaneReadResult
}).pipe(Schema.encodeKeys({
	paneId: "pane_id",
	matchedLine: "matched_line"
}));
/**
* Result of swapping two panes.
*
* @category schemas
* @since 0.8.2
*/
const PaneSwapResult = Schema.Struct({
	changed: Schema.Boolean,
	reason: Schema.OptionFromOptionalNullOr(Schema.Literals([
		"no_neighbor",
		"same_pane",
		"not_found",
		"cross_tab"
	])),
	sourcePaneId: PaneId,
	targetPaneId: Schema.OptionFromOptionalNullOr(PaneId),
	focusedPaneId: PaneId,
	layout: PaneLayoutSnapshot
}).pipe(Schema.encodeKeys({
	sourcePaneId: "source_pane_id",
	targetPaneId: "target_pane_id",
	focusedPaneId: "focused_pane_id"
}));
/**
* Result of moving a pane between tabs or workspaces.
*
* @category schemas
* @since 0.8.2
*/
const PaneMoveResult = Schema.Struct({
	changed: Schema.Boolean,
	reason: Schema.OptionFromOptionalNullOr(Schema.Literals(["same_tab", "zoomed_tab"])),
	previousPaneId: PaneId,
	previousWorkspaceId: WorkspaceId,
	previousTabId: TabId,
	pane: Pane,
	sourceLayout: Schema.OptionFromOptionalNullOr(PaneLayoutSnapshot),
	targetLayout: PaneLayoutSnapshot,
	createdWorkspace: Schema.OptionFromOptionalNullOr(Workspace),
	createdTab: Schema.OptionFromOptionalNullOr(Tab),
	closedWorkspaceId: Schema.OptionFromOptionalNullOr(WorkspaceId),
	closedTabId: Schema.OptionFromOptionalNullOr(TabId),
	focusedPaneId: PaneId
}).pipe(Schema.encodeKeys({
	previousPaneId: "previous_pane_id",
	previousWorkspaceId: "previous_workspace_id",
	previousTabId: "previous_tab_id",
	sourceLayout: "source_layout",
	targetLayout: "target_layout",
	createdWorkspace: "created_workspace",
	createdTab: "created_tab",
	closedWorkspaceId: "closed_workspace_id",
	closedTabId: "closed_tab_id",
	focusedPaneId: "focused_pane_id"
}));
/**
* Result of changing pane zoom or focus state.
*
* @category schemas
* @since 0.8.2
*/
const PaneZoomResult = Schema.Struct({
	changed: Schema.Boolean,
	zoomChanged: Schema.Boolean,
	focusChanged: Schema.Boolean,
	reason: Schema.OptionFromOptionalNullOr(Schema.Literals([
		"single_pane",
		"already_zoomed",
		"already_unzoomed"
	])),
	paneId: PaneId,
	focusedPaneId: PaneId,
	zoomed: Schema.Boolean,
	layout: PaneLayoutSnapshot
}).pipe(Schema.encodeKeys({
	zoomChanged: "zoom_changed",
	focusChanged: "focus_changed",
	paneId: "pane_id",
	focusedPaneId: "focused_pane_id"
}));
/**
* Foreground process reported for a pane.
*
* @category schemas
* @since 0.8.2
*/
const PaneProcess = Schema.Struct({
	pid: Schema.Natural,
	name: Schema.String,
	argv0: optionalString,
	argv: Schema.OptionFromOptionalNullOr(Schema.Array(Schema.String)),
	cmdline: optionalString,
	cwd: optionalAbsolutePath
});
/**
* Operating-system process information for one pane.
*
* @category schemas
* @since 0.8.2
*/
const PaneProcessInfo = Schema.Struct({
	paneId: PaneId,
	shellPid: Schema.OptionFromOptionalNullOr(Schema.Natural),
	foregroundProcessGroupId: Schema.OptionFromOptionalNullOr(Schema.Natural),
	tty: optionalString,
	foregroundProcesses: Schema.optionalKey(Schema.Array(PaneProcess)).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]), { encodingStrategy: "omit" }))
}).pipe(Schema.encodeKeys({
	paneId: "pane_id",
	shellPid: "shell_pid",
	foregroundProcessGroupId: "foreground_process_group_id",
	foregroundProcesses: "foreground_processes"
}));
/**
* Neighbor lookup result for one pane and direction.
*
* @category schemas
* @since 0.8.2
*/
const PaneNeighborResult = Schema.Struct({
	paneId: PaneId,
	direction: PaneDirection,
	neighborPaneId: Schema.OptionFromOptionalNullOr(PaneId),
	layout: PaneLayoutSnapshot
}).pipe(Schema.encodeKeys({
	paneId: "pane_id",
	neighborPaneId: "neighbor_pane_id"
}));
/**
* Edge membership result for one pane.
*
* @category schemas
* @since 0.8.2
*/
const PaneEdgesResult = Schema.Struct({
	paneId: PaneId,
	left: Schema.Boolean,
	right: Schema.Boolean,
	up: Schema.Boolean,
	down: Schema.Boolean,
	layout: PaneLayoutSnapshot
}).pipe(Schema.encodeKeys({ paneId: "pane_id" }));
/**
* Directional focus outcome.
*
* @category schemas
* @since 0.8.2
*/
const PaneFocusDirectionResult = Schema.Struct({
	changed: Schema.Boolean,
	reason: Schema.OptionFromOptionalNullOr(Schema.Literal("no_neighbor")),
	sourcePaneId: PaneId,
	focusedPaneId: Schema.OptionFromOptionalNullOr(PaneId),
	layout: PaneLayoutSnapshot
}).pipe(Schema.encodeKeys({
	sourcePaneId: "source_pane_id",
	focusedPaneId: "focused_pane_id"
}));
/**
* Pane resize outcome.
*
* @category schemas
* @since 0.8.2
*/
const PaneResizeResult = Schema.Struct({
	changed: Schema.Boolean,
	reason: Schema.OptionFromOptionalNullOr(Schema.Literal("unchanged")),
	paneId: PaneId,
	focusedPaneId: PaneId,
	layout: PaneLayoutSnapshot
}).pipe(Schema.encodeKeys({
	paneId: "pane_id",
	focusedPaneId: "focused_pane_id"
}));
/**
* Destination for right-click input handled by a pane.
*
* @category schemas
* @since 0.8.2
*/
const PaneRightClickTarget = Schema.Literals(["herdr", "pane"]);
/**
* Pane input-routing update.
*
* @category schemas
* @since 0.8.2
*/
const PaneInputRoutingInput = Schema.Struct({ rightClick: PaneRightClickTarget });
/**
* Parameters for splitting a pane.
*
* @category schemas
* @since 0.8.2
*/
const PaneSplitInput = Schema.Struct({
	workspaceId: Schema.OptionFromOptionalKey(WorkspaceId),
	direction: SplitDirection,
	ratio: Schema.OptionFromOptionalKey(HerdrSplitRatio),
	cwd: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	focus: Schema.OptionFromOptionalKey(Schema.Boolean),
	env: Schema.OptionFromOptionalKey(HerdrEnvironment),
	rightClick: Schema.OptionFromOptionalKey(PaneRightClickTarget)
});
/**
* Parameters for swapping a pane with a neighbor or explicit pane.
*
* @category schemas
* @since 0.8.2
*/
const PaneSwapInput = Schema.Union([Schema.Struct({
	paneId: Schema.OptionFromOptionalKey(PaneId),
	direction: PaneDirection,
	sourcePaneId: Schema.optionalKey(Schema.Never),
	targetPaneId: Schema.optionalKey(Schema.Never)
}), Schema.Struct({
	sourcePaneId: PaneId,
	targetPaneId: PaneId,
	paneId: Schema.optionalKey(Schema.Never),
	direction: Schema.optionalKey(Schema.Never)
})]);
/**
* Destination used when moving a pane.
*
* @category schemas
* @since 0.8.2
*/
const PaneMoveDestination = Schema.Union([
	Schema.Struct({
		type: Schema.Literal("tab"),
		tabId: TabId,
		targetPaneId: Schema.OptionFromOptionalKey(PaneId),
		split: SplitDirection,
		ratio: Schema.OptionFromOptionalKey(HerdrSplitRatio)
	}),
	Schema.Struct({
		type: Schema.Literal("new_tab"),
		workspaceId: Schema.OptionFromOptionalKey(WorkspaceId),
		label: Schema.OptionFromOptionalKey(Schema.String)
	}),
	Schema.Struct({
		type: Schema.Literal("new_workspace"),
		label: Schema.OptionFromOptionalKey(Schema.String),
		tabLabel: Schema.OptionFromOptionalKey(Schema.String)
	})
]);
/**
* Pane move request.
*
* @category schemas
* @since 0.8.2
*/
const PaneMoveInput = Schema.Struct({
	destination: PaneMoveDestination,
	focus: Schema.OptionFromOptionalKey(Schema.Boolean)
});
/**
* Pane zoom mode.
*
* @category schemas
* @since 0.8.2
*/
const PaneZoomMode = Schema.Literals([
	"toggle",
	"on",
	"off"
]);
/**
* Optional mode for a pane zoom operation.
*
* @category schemas
* @since 0.8.2
*/
const PaneZoomInput = Schema.Struct({ mode: Schema.OptionFromOptionalKey(PaneZoomMode) });
/**
* Optional pane origin for directional focus.
*
* @category schemas
* @since 0.8.2
*/
const PaneFocusDirectionInput = Schema.Struct({ paneId: Schema.OptionFromOptionalKey(PaneId) });
/**
* Optional pane origin and cell amount for directional resize.
*
* @category schemas
* @since 0.8.2
*/
const PaneResizeInput = Schema.Struct({
	paneId: Schema.OptionFromOptionalKey(PaneId),
	amount: Schema.OptionFromOptionalKey(Schema.Finite.check(Schema.isInt(), Schema.isGreaterThan(0)))
});
/**
* Optional workspace selector for pane listing.
*
* @category schemas
* @since 0.8.2
*/
const PaneListInput = Schema.Struct({ workspaceId: Schema.OptionFromOptionalKey(WorkspaceId) });
/**
* Optional caller identity used to resolve the current pane.
*
* @category schemas
* @since 0.8.2
*/
const PaneCurrentInput = Schema.Struct({ callerPaneId: Schema.OptionFromOptionalKey(PaneId) });
/**
* Pane output read parameters.
*
* @category schemas
* @since 0.8.2
*/
const PaneReadInput = Schema.Struct({
	source: PaneReadSource,
	lines: Schema.OptionFromOptionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
	format: Schema.OptionFromOptionalKey(PaneReadFormat),
	stripAnsi: Schema.OptionFromOptionalKey(Schema.Boolean)
});
/**
* Combined text and key input sent to one pane.
*
* @category schemas
* @since 0.8.2
*/
const PaneInput = Schema.Union([Schema.Struct({
	text: Schema.String,
	keys: Schema.optionalKey(Schema.Array(Schema.String))
}), Schema.Struct({
	text: Schema.optionalKey(Schema.String),
	keys: Schema.Array(Schema.String).check(Schema.isMinLength(1))
})]);
/**
* Text or regular-expression output matcher.
*
* @category schemas
* @since 0.8.2
*/
const PaneOutputMatch = Schema.Union([Schema.Struct({
	type: Schema.Literal("substring"),
	value: Schema.String
}), Schema.Struct({
	type: Schema.Literal("regex"),
	value: Schema.String
})]);
/**
* Pane output wait parameters.
*
* @category schemas
* @since 0.8.2
*/
const PaneWaitForOutputInput = Schema.Struct({
	source: PaneReadSource,
	lines: Schema.OptionFromOptionalKey(Schema.Finite.check(Schema.isInt(), Schema.isGreaterThan(0))),
	match: PaneOutputMatch,
	timeoutMs: Schema.OptionFromOptionalKey(HerdrMilliseconds),
	stripAnsi: Schema.OptionFromOptionalKey(Schema.Boolean)
});
/**
* Agent-state report attached to one pane; select its native session by at most one ID or path.
*
* `resumeArgv` is kept only while the same `source` and `agent` hold the pane, and takes
* precedence over Herdr's built-in resume command for that agent.
*
* @category schemas
* @since 0.8.2
*/
const PaneAgentReportInput = Schema.Struct({
	source: Schema.String,
	agent: Schema.String,
	state: ReportedAgentState,
	message: Schema.OptionFromOptionalKey(Schema.String),
	sequence: Schema.OptionFromOptionalKey(HerdrStateChangeSequence),
	sessionId: Schema.OptionFromOptionalKey(Schema.String),
	sessionPath: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	/** Command Herdr runs to resume this session after a server restart; see `HerdrResumeArgv`. */
	resumeArgv: Schema.OptionFromOptionalKey(HerdrResumeArgv)
}).pipe(Schema.refine((value) => Option.isNone(value.sessionId) || Option.isNone(value.sessionPath), { expected: "sessionId and sessionPath are mutually exclusive" }));
/**
* Agent-session report attached to one pane.
*
* Attaching `resumeArgv` requires the reporter to hold the pane through an agent-state report
* first; otherwise Herdr rejects the report with `resume_not_accepted`.
*
* @category schemas
* @since 0.8.2
*/
const PaneAgentSessionReportInput = Schema.Struct({
	source: Schema.String,
	agent: Schema.String,
	sequence: Schema.OptionFromOptionalKey(HerdrStateChangeSequence),
	sessionStartSource: Schema.OptionFromOptionalKey(Schema.String),
	sessionId: Schema.OptionFromOptionalKey(Schema.String),
	sessionPath: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	/** Command Herdr runs to resume this session after a server restart; see `HerdrResumeArgv`. */
	resumeArgv: Schema.OptionFromOptionalKey(HerdrResumeArgv)
}).pipe(Schema.refine((value) => Option.isNone(value.sessionId) || Option.isNone(value.sessionPath), { expected: "sessionId and sessionPath are mutually exclusive" }));
/**
* Pane presentation report with sparse known-status labels and individually patched tokens.
* Ordinary reports replace this source's title, displayed agent name, and label table;
* use agent-state reports, not these display labels, to drive lifecycle waits.
*
* @category schemas
* @since 0.8.2
*/
const PaneMetadataReportInput = Schema.Struct({
	source: Schema.String,
	agent: Schema.OptionFromOptionalKey(Schema.String),
	appliesToSource: Schema.OptionFromOptionalKey(Schema.String),
	title: Schema.OptionFromOptionalKey(Schema.String),
	displayAgent: Schema.OptionFromOptionalKey(Schema.String),
	stateLabels: Schema.OptionFromOptionalKey(Schema.Record(AgentStatus, Schema.optionalKey(Schema.String)).annotate({ parseOptions: { onExcessProperty: "error" } })),
	tokens: Schema.OptionFromOptionalKey(HerdrMetadataTokenPatch),
	clearTitle: Schema.OptionFromOptionalKey(Schema.Boolean),
	clearDisplayAgent: Schema.OptionFromOptionalKey(Schema.Boolean),
	clearStateLabels: Schema.OptionFromOptionalKey(Schema.Boolean),
	sequence: Schema.OptionFromOptionalKey(HerdrStateChangeSequence),
	ttlMs: Schema.OptionFromOptionalKey(HerdrMetadataTtl)
});
/**
* Optional authority version used when clearing an agent report.
*
* @category schemas
* @since 0.8.2
*/
const PaneClearAgentAuthorityInput = Schema.Struct({
	source: Schema.OptionFromOptionalKey(Schema.String),
	sequence: Schema.OptionFromOptionalKey(HerdrStateChangeSequence)
});
/**
* Authority release request for one pane agent.
*
* @category schemas
* @since 0.8.2
*/
const PaneReleaseAgentInput = Schema.Struct({
	source: Schema.String,
	agent: Schema.String,
	sequence: Schema.OptionFromOptionalKey(HerdrStateChangeSequence)
});
/**
* Recursive declarative pane or split layout node.
*
* @category schemas
* @since 0.8.2
*/
const LayoutNode = Schema.Union([Schema.Struct({
	type: Schema.Literal("pane"),
	paneId: Schema.OptionFromOptionalKey(PaneId),
	label: Schema.OptionFromOptionalKey(Schema.String),
	cwd: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	command: Schema.OptionFromOptionalKey(Schema.Array(Schema.String)),
	env: Schema.OptionFromOptionalKey(HerdrEnvironment)
}), Schema.Struct({
	type: Schema.Literal("split"),
	direction: SplitDirection,
	ratio: HerdrSplitRatio,
	first: Schema.suspend(() => LayoutNode),
	second: Schema.suspend(() => LayoutNode)
})]);
const LayoutWireNode = Schema.Union([Schema.Struct({
	type: Schema.Literal("pane"),
	paneId: Schema.OptionFromOptionalNullOr(PaneId),
	label: Schema.OptionFromOptionalNullOr(Schema.String),
	cwd: Schema.OptionFromOptionalNullOr(HerdrAbsolutePath),
	command: Schema.OptionFromOptionalNullOr(Schema.Array(Schema.String)),
	env: Schema.OptionFromOptionalKey(HerdrEnvironment)
}).pipe(Schema.encodeKeys({ paneId: "pane_id" })), Schema.Struct({
	type: Schema.Literal("split"),
	direction: SplitDirection,
	ratio: HerdrSplitRatio,
	first: Schema.suspend(() => LayoutWireNode),
	second: Schema.suspend(() => LayoutWireNode)
})]);
/**
* Tab or pane selecting a layout.
*
* @category schemas
* @since 0.8.2
*/
const LayoutTarget = Schema.Union([Schema.Struct({
	tabId: TabId,
	paneId: Schema.optionalKey(Schema.Never)
}), Schema.Struct({
	paneId: PaneId,
	tabId: Schema.optionalKey(Schema.Never)
})]);
/**
* Declarative layout apply request.
*
* @category schemas
* @since 0.8.2
*/
const LayoutApplyInput = Schema.Struct({
	workspaceId: Schema.OptionFromOptionalKey(WorkspaceId),
	replaceTabId: Schema.OptionFromOptionalKey(TabId),
	tabLabel: Schema.OptionFromOptionalKey(Schema.String),
	focus: Schema.OptionFromOptionalKey(Schema.Boolean),
	root: LayoutNode
});
/**
* Split path and ratio used to resize a declarative layout node.
*
* @category schemas
* @since 0.8.2
*/
const LayoutSetSplitRatioInput = Schema.Struct({
	path: Schema.Array(Schema.Boolean),
	ratio: HerdrSplitRatio
});
/**
* Exported or applied declarative layout.
*
* @category schemas
* @since 0.8.2
*/
const LayoutDescription = Schema.Struct({
	workspaceId: WorkspaceId,
	tabId: TabId,
	zoomed: Schema.Boolean,
	focusedPaneId: PaneId,
	root: LayoutWireNode
}).pipe(Schema.encodeKeys({
	workspaceId: "workspace_id",
	tabId: "tab_id",
	focusedPaneId: "focused_pane_id"
}));
/**
* JSON value returned by currently schema-less Herdr protocol fields.
*
* @category schemas
* @since 0.8.2
*/
const HerdrJsonValue = Schema.Json;
/**
* Exactly one agent selector. Parsing supplies `kind` for existing single-selector inputs;
* an explicit kind must agree with its selector, and competing selectors are rejected.
*
* @category schemas
* @since 0.8.2
*/
const AgentTarget = Schema.Union([Schema.Struct({
	kind: Schema.tag("pane").pipe(Schema.withDecodingDefaultKey(Effect.succeed("pane"))),
	paneId: PaneId,
	name: Schema.optionalKey(Schema.Never)
}), Schema.Struct({
	kind: Schema.tag("agent").pipe(Schema.withDecodingDefaultKey(Effect.succeed("agent"))),
	name: AgentName,
	paneId: Schema.optionalKey(Schema.Never)
})]);
/**
* Parameters for launching a named agent in one pane.
*
* @category schemas
* @since 0.8.2
*/
const AgentStartInput = Schema.Struct({
	name: AgentName,
	kind: Schema.NonEmptyString,
	paneId: PaneId,
	args: Schema.OptionFromOptionalKey(Schema.Array(Schema.String)),
	timeoutMs: Schema.OptionFromOptionalKey(Schema.Finite.check(Schema.isInt(), Schema.isBetween({
		minimum: 3e3,
		maximum: 3e5,
		exclusiveMinimum: true
	})))
});
/**
* Agent and command line created by an agent launch.
*
* @category schemas
* @since 0.8.2
*/
const AgentStartResult = Schema.Struct({
	agent: Agent,
	argv: Schema.Array(Schema.String)
});
/**
* Agent status and server-owned timeout used by wait operations.
*
* @category schemas
* @since 0.8.2
*/
const AgentWaitInput = Schema.Struct({
	until: Schema.OptionFromOptionalKey(Schema.Array(AgentStatus)),
	timeoutMs: Schema.OptionFromOptionalKey(HerdrMilliseconds)
});
/**
* Prompt and optional wait policy sent to one agent.
*
* @category schemas
* @since 0.8.2
*/
const AgentPromptInput = Schema.Struct({
	text: Schema.String,
	wait: Schema.OptionFromOptionalKey(AgentWaitInput)
});
/**
* Active agent-view state.
*
* @category schemas
* @since 0.8.2
*/
const AgentViewState = Schema.Struct({
	active: Schema.Boolean,
	source: optionalString,
	label: optionalString
});
/**
* Agent-view field selected by name or metadata token.
*
* @category schemas
* @since 0.8.2
*/
const AgentViewField = Schema.Union([Schema.Literals([
	"status",
	"workspace_id",
	"tab_id",
	"pane_id",
	"agent",
	"seen",
	"state_change_seq"
]), Schema.Struct({ token: Schema.String })]);
/**
* Literal or contextual value used by an agent-view filter.
*
* @category schemas
* @since 0.8.2
*/
const AgentViewValue = Schema.Union([
	Schema.String,
	Schema.Boolean,
	Schema.Natural,
	Schema.Struct({ context: Schema.Literals(["current_workspace_id", "current_tab_id"]) })
]);
/**
* Recursive boolean filter used by the agent view.
*
* @category schemas
* @since 0.8.2
*/
const AgentViewFilter = Schema.Union([
	Schema.Struct({
		op: Schema.Literals(["all", "any"]),
		filters: Schema.Array(Schema.suspend(() => AgentViewFilter))
	}),
	Schema.Struct({
		op: Schema.Literal("not"),
		filter: Schema.suspend(() => AgentViewFilter)
	}),
	Schema.Struct({
		op: Schema.Literal("eq"),
		field: AgentViewField,
		value: AgentViewValue
	}),
	Schema.Struct({
		op: Schema.Literal("in"),
		field: AgentViewField,
		values: Schema.Array(AgentViewValue)
	}),
	Schema.Struct({
		op: Schema.Literal("exists"),
		field: AgentViewField
	})
]);
/**
* Agent-view sorting field.
*
* @category schemas
* @since 0.8.2
*/
const AgentViewSortField = Schema.Union([Schema.Literals([
	"workspace_order",
	"tab_order",
	"pane_order",
	"attention",
	"status",
	"agent",
	"seen",
	"state_change_seq"
]), Schema.Struct({ token: Schema.String })]);
/**
* One agent-view sort term.
*
* @category schemas
* @since 0.8.2
*/
const AgentViewSort = Schema.Struct({
	field: AgentViewSortField,
	order: Schema.OptionFromOptionalKey(Schema.Literals(["asc", "desc"]))
});
/**
* Agent-view activation parameters.
*
* @category schemas
* @since 0.8.2
*/
const AgentViewSetInput = Schema.Struct({
	source: Schema.String,
	label: Schema.OptionFromOptionalKey(Schema.String),
	filter: Schema.OptionFromOptionalKey(AgentViewFilter),
	sort: Schema.OptionFromOptionalKey(Schema.Array(AgentViewSort))
});
/**
* Optional source used to clear an agent view.
*
* @category schemas
* @since 0.8.2
*/
const AgentViewClearInput = Schema.Struct({ source: Schema.OptionFromOptionalKey(Schema.String) });
/**
* Complete immutable snapshot of the active Herdr session.
*
* @category schemas
* @since 0.8.2
*/
const SessionSnapshot = Schema.Struct({
	version: Schema.String,
	protocol: Schema.Natural,
	focusedWorkspaceId: Schema.OptionFromOptionalNullOr(WorkspaceId),
	focusedTabId: Schema.OptionFromOptionalNullOr(TabId),
	focusedPaneId: Schema.OptionFromOptionalNullOr(PaneId),
	workspaces: Schema.Array(Workspace),
	tabs: Schema.Array(Tab),
	panes: Schema.Array(Pane),
	layouts: Schema.Array(PaneLayoutSnapshot),
	agents: Schema.Array(Agent)
}).pipe(Schema.encodeKeys({
	focusedWorkspaceId: "focused_workspace_id",
	focusedTabId: "focused_tab_id",
	focusedPaneId: "focused_pane_id"
}));
const herdrEventType = (encoded, decoded) => Schema.Literal(encoded).transform(decoded);
const WorkspaceEvent = (type, decoded) => Schema.Struct({
	type: herdrEventType(type, decoded),
	workspace: Workspace
});
/**
* Schema-owned union of every normalized Herdr event.
*
* @category schemas
* @since 0.8.2
*/
const HerdrEvent = Schema.Union([
	WorkspaceEvent("workspace_created", "workspace.created"),
	WorkspaceEvent("workspace_updated", "workspace.updated"),
	WorkspaceEvent("workspace_metadata_updated", "workspace.metadata_updated"),
	Schema.Struct({
		type: herdrEventType("workspace_closed", "workspace.closed"),
		workspaceId: WorkspaceId,
		workspace: Schema.OptionFromOptionalNullOr(Workspace)
	}).pipe(Schema.encodeKeys({ workspaceId: "workspace_id" })),
	Schema.Struct({
		type: herdrEventType("workspace_renamed", "workspace.renamed"),
		workspaceId: WorkspaceId,
		label: Schema.String
	}).pipe(Schema.encodeKeys({ workspaceId: "workspace_id" })),
	Schema.Struct({
		type: herdrEventType("workspace_moved", "workspace.moved"),
		workspaceId: WorkspaceId,
		insertIndex: HerdrInsertIndex,
		workspaces: Schema.Array(Workspace)
	}).pipe(Schema.encodeKeys({
		workspaceId: "workspace_id",
		insertIndex: "insert_index"
	})),
	Schema.Struct({
		type: herdrEventType("workspace_reordered", "workspace.reordered"),
		workspaceIds: Schema.Array(WorkspaceId),
		beforeWorkspaceId: Schema.OptionFromOptionalNullOr(WorkspaceId),
		workspaces: Schema.Array(Workspace)
	}).pipe(Schema.encodeKeys({
		workspaceIds: "workspace_ids",
		beforeWorkspaceId: "before_workspace_id"
	})),
	Schema.Struct({
		type: herdrEventType("workspace_focused", "workspace.focused"),
		workspaceId: WorkspaceId
	}).pipe(Schema.encodeKeys({ workspaceId: "workspace_id" })),
	Schema.Struct({
		type: herdrEventType("worktree_created", "worktree.created"),
		workspace: Workspace,
		worktree: Worktree
	}),
	Schema.Struct({
		type: herdrEventType("worktree_opened", "worktree.opened"),
		workspace: Workspace,
		worktree: Worktree,
		alreadyOpen: Schema.Boolean
	}).pipe(Schema.encodeKeys({ alreadyOpen: "already_open" })),
	Schema.Struct({
		type: herdrEventType("worktree_removed", "worktree.removed"),
		workspaceId: WorkspaceId,
		workspace: Schema.OptionFromOptionalNullOr(Workspace),
		worktree: Worktree,
		forced: Schema.Boolean
	}).pipe(Schema.encodeKeys({ workspaceId: "workspace_id" })),
	Schema.Struct({
		type: herdrEventType("tab_created", "tab.created"),
		tab: Tab
	}),
	Schema.Struct({
		type: herdrEventType("tab_closed", "tab.closed"),
		tabId: TabId,
		workspaceId: WorkspaceId
	}).pipe(Schema.encodeKeys({
		tabId: "tab_id",
		workspaceId: "workspace_id"
	})),
	Schema.Struct({
		type: herdrEventType("tab_renamed", "tab.renamed"),
		tabId: TabId,
		workspaceId: WorkspaceId,
		label: Schema.String
	}).pipe(Schema.encodeKeys({
		tabId: "tab_id",
		workspaceId: "workspace_id"
	})),
	Schema.Struct({
		type: herdrEventType("tab_moved", "tab.moved"),
		tabId: TabId,
		workspaceId: WorkspaceId,
		insertIndex: HerdrInsertIndex,
		tabs: Schema.Array(Tab)
	}).pipe(Schema.encodeKeys({
		tabId: "tab_id",
		workspaceId: "workspace_id",
		insertIndex: "insert_index"
	})),
	Schema.Struct({
		type: herdrEventType("tab_focused", "tab.focused"),
		tabId: TabId,
		workspaceId: WorkspaceId
	}).pipe(Schema.encodeKeys({
		tabId: "tab_id",
		workspaceId: "workspace_id"
	})),
	Schema.Struct({
		type: herdrEventType("pane_created", "pane.created"),
		pane: Pane
	}),
	Schema.Struct({
		type: herdrEventType("pane_closed", "pane.closed"),
		paneId: PaneId,
		workspaceId: WorkspaceId
	}).pipe(Schema.encodeKeys({
		paneId: "pane_id",
		workspaceId: "workspace_id"
	})),
	Schema.Struct({
		type: herdrEventType("pane_updated", "pane.updated"),
		pane: Pane
	}),
	Schema.Struct({
		type: herdrEventType("pane_focused", "pane.focused"),
		paneId: PaneId,
		workspaceId: WorkspaceId
	}).pipe(Schema.encodeKeys({
		paneId: "pane_id",
		workspaceId: "workspace_id"
	})),
	Schema.Struct({
		type: herdrEventType("pane_moved", "pane.moved"),
		previousPaneId: PaneId,
		previousWorkspaceId: WorkspaceId,
		previousTabId: TabId,
		pane: Pane,
		createdWorkspace: Schema.OptionFromOptionalNullOr(Workspace),
		createdTab: Schema.OptionFromOptionalNullOr(Tab),
		closedWorkspaceId: Schema.OptionFromOptionalNullOr(WorkspaceId),
		closedTabId: Schema.OptionFromOptionalNullOr(TabId)
	}).pipe(Schema.encodeKeys({
		previousPaneId: "previous_pane_id",
		previousWorkspaceId: "previous_workspace_id",
		previousTabId: "previous_tab_id",
		createdWorkspace: "created_workspace",
		createdTab: "created_tab",
		closedWorkspaceId: "closed_workspace_id",
		closedTabId: "closed_tab_id"
	})),
	Schema.Struct({
		type: herdrEventType("pane_output_changed", "pane.output_changed"),
		paneId: PaneId,
		workspaceId: WorkspaceId,
		revision: HerdrRevision
	}).pipe(Schema.encodeKeys({
		paneId: "pane_id",
		workspaceId: "workspace_id"
	})),
	Schema.Struct({
		type: herdrEventType("pane_exited", "pane.exited"),
		paneId: PaneId,
		workspaceId: WorkspaceId
	}).pipe(Schema.encodeKeys({
		paneId: "pane_id",
		workspaceId: "workspace_id"
	})),
	Schema.Struct({
		type: herdrEventType("pane_agent_detected", "pane.agent_detected"),
		paneId: PaneId,
		workspaceId: WorkspaceId,
		agent: optionalString,
		released: Schema.optionalKey(Schema.Boolean).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false), { encodingStrategy: "omit" })),
		finalStatus: Schema.OptionFromOptionalNullOr(AgentStatus)
	}).pipe(Schema.encodeKeys({
		paneId: "pane_id",
		workspaceId: "workspace_id",
		finalStatus: "final_status"
	})),
	Schema.Struct({
		type: herdrEventType("pane_agent_status_changed", "pane.agent_status_changed"),
		paneId: PaneId,
		workspaceId: WorkspaceId,
		agentStatus: AgentStatus,
		agent: optionalString,
		title: optionalString,
		displayAgent: optionalString,
		stateLabels: Schema.optionalKey(HerdrMetadataTokens).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}), { encodingStrategy: "omit" }))
	}).pipe(Schema.encodeKeys({
		paneId: "pane_id",
		workspaceId: "workspace_id",
		agentStatus: "agent_status",
		displayAgent: "display_agent",
		stateLabels: "state_labels"
	})),
	Schema.Struct({
		type: herdrEventType("pane_scroll_changed", "pane.scroll_changed"),
		paneId: PaneId,
		workspaceId: WorkspaceId,
		scroll: PaneScroll
	}).pipe(Schema.encodeKeys({
		paneId: "pane_id",
		workspaceId: "workspace_id"
	})),
	Schema.Struct({
		type: herdrEventType("pane_output_matched", "pane.output_matched"),
		paneId: PaneId,
		matchedLine: Schema.String,
		read: PaneReadResult
	}).pipe(Schema.encodeKeys({
		paneId: "pane_id",
		matchedLine: "matched_line"
	})),
	Schema.Struct({
		type: herdrEventType("layout_updated", "layout.updated"),
		layout: PaneLayoutSnapshot
	})
]);
/**
* Lifecycle event kinds accepted by a simple subscription.
*
* @category schemas
* @since 0.8.2
*/
const LifecycleSubscriptionType = Schema.Literals([
	"workspace.created",
	"workspace.updated",
	"workspace.metadata_updated",
	"workspace.renamed",
	"workspace.moved",
	"workspace.reordered",
	"workspace.closed",
	"workspace.focused",
	"worktree.created",
	"worktree.opened",
	"worktree.removed",
	"tab.created",
	"tab.closed",
	"tab.focused",
	"tab.renamed",
	"tab.moved",
	"pane.created",
	"pane.closed",
	"pane.updated",
	"pane.focused",
	"pane.moved",
	"pane.exited",
	"pane.agent_detected",
	"layout.updated"
]);
/**
* Event subscription specification sent during stream acquisition.
*
* @category schemas
* @since 0.8.2
*/
const EventSubscriptionSpec = Schema.Union([
	Schema.Struct({ type: LifecycleSubscriptionType }),
	Schema.Struct({
		type: Schema.Literal("pane.output_matched"),
		paneId: PaneId,
		source: PaneReadSource,
		lines: Schema.OptionFromOptionalKey(Schema.Finite.check(Schema.isInt(), Schema.isGreaterThan(0))),
		match: PaneOutputMatch,
		stripAnsi: Schema.OptionFromOptionalKey(Schema.Boolean)
	}),
	Schema.Struct({
		type: Schema.Literal("pane.agent_status_changed"),
		paneId: PaneId,
		agentStatus: Schema.OptionFromOptionalKey(AgentStatus)
	}),
	Schema.Struct({
		type: Schema.Literal("pane.scroll_changed"),
		paneId: PaneId
	})
]);
/**
* Event matcher used by a one-shot wait.
*
* @category schemas
* @since 0.8.2
*/
const EventMatch = Schema.Union([
	Schema.Struct({
		type: Schema.Literal("workspace.created"),
		workspaceId: Schema.OptionFromOptionalKey(WorkspaceId)
	}),
	Schema.Struct({
		type: Schema.Literal("workspace.updated"),
		workspaceId: WorkspaceId
	}),
	Schema.Struct({
		type: Schema.Literal("workspace.closed"),
		workspaceId: WorkspaceId
	}),
	Schema.Struct({
		type: Schema.Literal("workspace.renamed"),
		workspaceId: WorkspaceId,
		label: Schema.OptionFromOptionalKey(Schema.String)
	}),
	Schema.Struct({
		type: Schema.Literal("workspace.moved"),
		workspaceId: WorkspaceId
	}),
	Schema.Struct({
		type: Schema.Literal("workspace.focused"),
		workspaceId: WorkspaceId
	}),
	Schema.Struct({
		type: Schema.Literal("tab.created"),
		tabId: Schema.OptionFromOptionalKey(TabId),
		workspaceId: Schema.OptionFromOptionalKey(WorkspaceId)
	}),
	Schema.Struct({
		type: Schema.Literal("tab.closed"),
		tabId: TabId
	}),
	Schema.Struct({
		type: Schema.Literal("tab.renamed"),
		tabId: TabId,
		label: Schema.OptionFromOptionalKey(Schema.String)
	}),
	Schema.Struct({
		type: Schema.Literal("tab.moved"),
		tabId: TabId
	}),
	Schema.Struct({
		type: Schema.Literal("tab.focused"),
		tabId: TabId
	}),
	Schema.Struct({
		type: Schema.Literal("pane.created"),
		paneId: Schema.OptionFromOptionalKey(PaneId),
		workspaceId: Schema.OptionFromOptionalKey(WorkspaceId)
	}),
	Schema.Struct({
		type: Schema.Literal("pane.closed"),
		paneId: PaneId
	}),
	Schema.Struct({
		type: Schema.Literal("pane.focused"),
		paneId: PaneId
	}),
	Schema.Struct({
		type: Schema.Literal("pane.moved"),
		paneId: PaneId
	}),
	Schema.Struct({
		type: Schema.Literal("pane.output_changed"),
		paneId: PaneId,
		minRevision: Schema.OptionFromOptionalKey(HerdrRevision)
	}),
	Schema.Struct({
		type: Schema.Literal("pane.exited"),
		paneId: PaneId
	}),
	Schema.Struct({
		type: Schema.Literal("pane.agent_detected"),
		paneId: PaneId,
		agent: Schema.OptionFromOptionalKey(Schema.String)
	}),
	Schema.Struct({
		type: Schema.Literal("pane.agent_status_changed"),
		paneId: PaneId,
		agentStatus: AgentStatus
	})
]);
/**
* Optional server-owned timeout for a one-shot event wait.
*
* @category schemas
* @since 0.8.2
*/
const EventWaitInput = Schema.Struct({ timeoutMs: Schema.OptionFromOptionalKey(HerdrMilliseconds) });
/**
* Operating system supported by a plugin command.
*
* @category schemas
* @since 0.8.2
*/
const PluginPlatform = Schema.Literals([
	"linux",
	"macos",
	"windows"
]);
/**
* Invocation context supported by a plugin action.
*
* @category schemas
* @since 0.8.2
*/
const PluginActionContext = Schema.Literals([
	"global",
	"workspace",
	"tab",
	"pane",
	"selection"
]);
/**
* Placement used by a plugin-owned pane.
*
* @category schemas
* @since 0.8.2
*/
const PluginPanePlacement = Schema.Literals([
	"overlay",
	"popup",
	"split",
	"tab",
	"zoomed"
]);
/**
* Managed or local source metadata for an installed plugin.
*
* @category schemas
* @since 0.8.2
*/
const PluginSource = Schema.Struct({
	kind: Schema.optionalKey(Schema.Literals(["local", "github"])).pipe(Schema.withDecodingDefaultKey(Effect.succeed("local"), { encodingStrategy: "omit" })),
	owner: optionalString,
	repo: optionalString,
	subdir: optionalString,
	requestedRef: optionalString,
	resolvedCommit: optionalString,
	managedPath: optionalAbsolutePath,
	installedUnixMs: Schema.OptionFromOptionalNullOr(HerdrUnixMilliseconds)
}).pipe(Schema.encodeKeys({
	requestedRef: "requested_ref",
	resolvedCommit: "resolved_commit",
	managedPath: "managed_path",
	installedUnixMs: "installed_unix_ms"
}));
/**
* Platform-scoped command declared by a plugin manifest.
*
* @category schemas
* @since 0.8.2
*/
const PluginManifestCommand = Schema.Struct({
	platforms: Schema.OptionFromOptionalNullOr(Schema.Array(PluginPlatform)),
	command: Schema.Array(Schema.String)
});
/**
* Action declared by a plugin manifest.
*
* @category schemas
* @since 0.8.2
*/
const PluginManifestAction = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	description: optionalString,
	contexts: Schema.Array(PluginActionContext),
	platforms: Schema.OptionFromOptionalNullOr(Schema.Array(PluginPlatform)),
	command: Schema.Array(Schema.String)
});
/**
* Event hook declared by a plugin manifest.
*
* @category schemas
* @since 0.8.2
*/
const PluginManifestEventHook = Schema.Struct({
	on: Schema.String,
	platforms: Schema.OptionFromOptionalNullOr(Schema.Array(PluginPlatform)),
	command: Schema.Array(Schema.String)
});
/**
* Pane entrypoint declared by a plugin manifest.
*
* @category schemas
* @since 0.8.2
*/
const PluginManifestPane = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	description: optionalString,
	platforms: Schema.OptionFromOptionalNullOr(Schema.Array(PluginPlatform)),
	placement: PluginPanePlacement,
	width: Schema.OptionFromOptionalNullOr(HerdrPopupSize),
	height: Schema.OptionFromOptionalNullOr(HerdrPopupSize),
	command: Schema.Array(Schema.String)
});
/**
* URL link handler declared by a plugin manifest.
*
* @category schemas
* @since 0.8.2
*/
const PluginManifestLinkHandler = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	pattern: Schema.String,
	action: Schema.String,
	platforms: Schema.OptionFromOptionalNullOr(Schema.Array(PluginPlatform))
});
/**
* Fully resolved installed plugin.
*
* @category schemas
* @since 0.8.2
*/
const InstalledPlugin = Schema.Struct({
	id: PluginId,
	name: Schema.String,
	version: Schema.String,
	minHerdrVersion: Schema.optionalKey(Schema.String).pipe(Schema.withDecodingDefaultKey(Effect.succeed(""), { encodingStrategy: "omit" })),
	description: optionalString,
	manifestPath: HerdrAbsolutePath,
	root: HerdrAbsolutePath,
	enabled: Schema.Boolean,
	platforms: Schema.OptionFromOptionalNullOr(Schema.Array(PluginPlatform)),
	build: Schema.optionalKey(Schema.Array(PluginManifestCommand)).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]), { encodingStrategy: "omit" })),
	startup: Schema.optionalKey(Schema.Array(PluginManifestCommand)).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]), { encodingStrategy: "omit" })),
	actions: Schema.optionalKey(Schema.Array(PluginManifestAction)).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]), { encodingStrategy: "omit" })),
	events: Schema.optionalKey(Schema.Array(PluginManifestEventHook)).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]), { encodingStrategy: "omit" })),
	panes: Schema.optionalKey(Schema.Array(PluginManifestPane)).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]), { encodingStrategy: "omit" })),
	linkHandlers: Schema.optionalKey(Schema.Array(PluginManifestLinkHandler)).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]), { encodingStrategy: "omit" })),
	source: Schema.optionalKey(PluginSource).pipe(Schema.withDecodingDefaultKey(Effect.succeed({ kind: "local" }), { encodingStrategy: "omit" })),
	warnings: Schema.optionalKey(Schema.Array(Schema.String)).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]), { encodingStrategy: "omit" }))
}).pipe(Schema.encodeKeys({
	id: "plugin_id",
	minHerdrVersion: "min_herdr_version",
	manifestPath: "manifest_path",
	root: "plugin_root",
	linkHandlers: "link_handlers"
}));
/**
* Resolved plugin action.
*
* @category schemas
* @since 0.8.2
*/
const PluginAction = Schema.Struct({
	pluginId: PluginId,
	id: PluginActionId,
	title: Schema.String,
	description: optionalString,
	contexts: Schema.optionalKey(Schema.Array(PluginActionContext)).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]), { encodingStrategy: "omit" })),
	command: Schema.Array(Schema.String),
	platforms: Schema.OptionFromOptionalNullOr(Schema.Array(PluginPlatform))
}).pipe(Schema.encodeKeys({
	pluginId: "plugin_id",
	id: "action_id"
}));
/**
* Runtime context passed to a plugin action.
*
* @category schemas
* @since 0.8.2
*/
const PluginInvocationContext = Schema.Struct({
	workspaceId: Schema.OptionFromOptionalNullOr(WorkspaceId),
	workspaceLabel: optionalString,
	workspaceCwd: optionalAbsolutePath,
	worktree: Schema.OptionFromOptionalNullOr(WorkspaceWorktree),
	tabId: Schema.OptionFromOptionalNullOr(TabId),
	tabLabel: optionalString,
	focusedPaneId: Schema.OptionFromOptionalNullOr(PaneId),
	focusedPaneCwd: optionalAbsolutePath,
	focusedPaneAgent: optionalString,
	focusedPaneStatus: Schema.OptionFromOptionalNullOr(AgentStatus),
	selectedText: optionalString,
	invocationSource: optionalString,
	correlationId: optionalString,
	clickedUrl: optionalString,
	linkHandlerId: optionalString
}).pipe(Schema.encodeKeys({
	workspaceId: "workspace_id",
	workspaceLabel: "workspace_label",
	workspaceCwd: "workspace_cwd",
	tabId: "tab_id",
	tabLabel: "tab_label",
	focusedPaneId: "focused_pane_id",
	focusedPaneCwd: "focused_pane_cwd",
	focusedPaneAgent: "focused_pane_agent",
	focusedPaneStatus: "focused_pane_status",
	selectedText: "selected_text",
	invocationSource: "invocation_source",
	correlationId: "correlation_id",
	clickedUrl: "clicked_url",
	linkHandlerId: "link_handler_id"
}));
/**
* Camel-case plugin invocation context accepted from SDK callers.
*
* @category schemas
* @since 0.8.2
*/
const PluginInvocationContextInput = Schema.Struct({
	workspaceId: Schema.OptionFromOptionalKey(WorkspaceId),
	workspaceLabel: Schema.OptionFromOptionalKey(Schema.String),
	workspaceCwd: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	worktree: Schema.OptionFromOptionalKey(WorkspaceWorktreeInput),
	tabId: Schema.OptionFromOptionalKey(TabId),
	tabLabel: Schema.OptionFromOptionalKey(Schema.String),
	focusedPaneId: Schema.OptionFromOptionalKey(PaneId),
	focusedPaneCwd: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	focusedPaneAgent: Schema.OptionFromOptionalKey(Schema.String),
	focusedPaneStatus: Schema.OptionFromOptionalKey(AgentStatus),
	selectedText: Schema.OptionFromOptionalKey(Schema.String),
	invocationSource: Schema.OptionFromOptionalKey(Schema.String),
	correlationId: Schema.OptionFromOptionalKey(Schema.String),
	clickedUrl: Schema.OptionFromOptionalKey(Schema.String),
	linkHandlerId: Schema.OptionFromOptionalKey(Schema.String)
});
/**
* One plugin command execution log.
*
* @category schemas
* @since 0.8.2
*/
const PluginCommandLog = Schema.Struct({
	id: PluginLogId,
	pluginId: PluginId,
	actionId: Schema.OptionFromOptionalNullOr(PluginActionId),
	event: optionalString,
	command: Schema.Array(Schema.String),
	status: Schema.Literals([
		"running",
		"succeeded",
		"failed"
	]),
	startedUnixMs: HerdrUnixMilliseconds,
	finishedUnixMs: Schema.OptionFromOptionalNullOr(HerdrUnixMilliseconds),
	exitCode: Schema.OptionFromOptionalNullOr(Schema.Finite.check(Schema.isInt())),
	stdout: optionalString,
	stderr: optionalString,
	error: optionalString
}).pipe(Schema.encodeKeys({
	id: "log_id",
	pluginId: "plugin_id",
	actionId: "action_id",
	startedUnixMs: "started_unix_ms",
	finishedUnixMs: "finished_unix_ms",
	exitCode: "exit_code"
}));
/**
* Completed plugin action invocation.
*
* @category schemas
* @since 0.8.2
*/
const PluginActionInvocation = Schema.Struct({
	action: PluginAction,
	context: PluginInvocationContext,
	log: PluginCommandLog
});
/**
* Open plugin pane and its owning entrypoint.
*
* @category schemas
* @since 0.8.2
*/
const PluginPane = Schema.Struct({
	pluginId: PluginId,
	entrypoint: Schema.String,
	pane: Pane
}).pipe(Schema.encodeKeys({ pluginId: "plugin_id" }));
/**
* Plugin link source supplied by the caller.
*
* @category schemas
* @since 0.8.2
*/
const PluginSourceInput = Schema.Struct({
	kind: Schema.OptionFromOptionalKey(Schema.Literals(["local", "github"])),
	owner: Schema.OptionFromOptionalKey(Schema.String),
	repo: Schema.OptionFromOptionalKey(Schema.String),
	subdir: Schema.OptionFromOptionalKey(Schema.String),
	requestedRef: Schema.OptionFromOptionalKey(Schema.String),
	resolvedCommit: Schema.OptionFromOptionalKey(Schema.String),
	managedPath: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	installedUnixMs: Schema.OptionFromOptionalKey(HerdrUnixMilliseconds)
});
/**
* Plugin link request.
*
* @category schemas
* @since 0.8.2
*/
const PluginLinkInput = Schema.Struct({
	path: HerdrAbsolutePath,
	enabled: Schema.OptionFromOptionalKey(Schema.Boolean),
	source: Schema.OptionFromOptionalKey(PluginSourceInput)
});
/**
* Optional plugin filter.
*
* @category schemas
* @since 0.8.2
*/
const PluginFilterInput = Schema.Struct({ pluginId: Schema.OptionFromOptionalKey(PluginId) });
/**
* Optional plugin and invocation context for an action.
*
* @category schemas
* @since 0.8.2
*/
const PluginActionInvokeInput = Schema.Struct({
	pluginId: Schema.OptionFromOptionalKey(PluginId),
	context: Schema.OptionFromOptionalKey(PluginInvocationContextInput)
});
/**
* Plugin command-log list filter.
*
* @category schemas
* @since 0.8.2
*/
const PluginLogListInput = Schema.Struct({
	pluginId: Schema.OptionFromOptionalKey(PluginId),
	limit: Schema.OptionFromOptionalKey(Schema.Finite.check(Schema.isInt(), Schema.isGreaterThan(0)))
});
/**
* Plugin pane open request.
*
* @category schemas
* @since 0.8.2
*/
const PluginPaneOpenInput = Schema.Struct({
	entrypoint: Schema.String,
	placement: Schema.OptionFromOptionalKey(PluginPanePlacement),
	width: Schema.OptionFromOptionalKey(HerdrPopupSize),
	height: Schema.OptionFromOptionalKey(HerdrPopupSize),
	workspaceId: Schema.OptionFromOptionalKey(WorkspaceId),
	targetPaneId: Schema.OptionFromOptionalKey(PaneId),
	direction: Schema.OptionFromOptionalKey(SplitDirection),
	cwd: Schema.OptionFromOptionalKey(HerdrAbsolutePath),
	focus: Schema.OptionFromOptionalKey(Schema.Boolean),
	env: Schema.OptionFromOptionalKey(HerdrEnvironment)
});
/**
* Plugin unlink outcome.
*
* @category schemas
* @since 0.8.2
*/
const PluginUnlinkResult = Schema.Struct({
	pluginId: PluginId,
	removed: Schema.Boolean
}).pipe(Schema.encodeKeys({ pluginId: "plugin_id" }));
/**
* Closed plugin pane identifier.
*
* @category schemas
* @since 0.8.2
*/
const PluginPaneCloseResult = Schema.Struct({ paneId: PaneId }).pipe(Schema.encodeKeys({ paneId: "pane_id" }));
//#endregion
//#region src/herdr-wire-encoder.ts
/**
* Encodes parsed domain options with private request codecs, then serializes typed requests.
* The final serializer does not validate parameters or rewrite dictionary data.
*
* @since 0.8.2
*/
const PaneReadRequestParameters = PaneReadInput.mapFields((fields) => ({
	...fields,
	lines: Schema.OptionFromNullOr(Schema.requiredKey(fields.lines.from))
}));
const AgentWaitRequestParameters = AgentWaitInput.mapFields((fields) => ({
	...fields,
	timeoutMs: Schema.OptionFromNullOr(Schema.requiredKey(fields.timeoutMs.from))
}));
const AgentPromptRequestParameters = AgentPromptInput.mapFields((fields) => ({
	...fields,
	wait: Schema.OptionFromOptionalKey(AgentWaitRequestParameters)
}));
const encodePaneReadRequest = Schema.encodeEffect(PaneReadRequestParameters);
const encodeAgentWaitRequest = Schema.encodeEffect(AgentWaitRequestParameters);
const encodeAgentPromptRequest = Schema.encodeEffect(AgentPromptRequestParameters);
/**
* Encodes parsed pane/agent read options, keeping absent lines null and format flags omitted.
*
* @category encoding
* @since 0.8.2
*/
function encodePaneReadParameters(input) {
	return encodePaneReadRequest(input);
}
/**
* Encodes parsed wait options without turning an omitted status list into null.
*
* @category encoding
* @since 0.8.2
*/
function encodeAgentWaitParameters(input) {
	return encodeAgentWaitRequest(input);
}
/**
* Encodes nested prompt wait options with the same null/omission policy as agent.wait.
*
* @category encoding
* @since 0.8.2
*/
function encodeAgentPromptParameters(input) {
	return encodeAgentPromptRequest(input);
}
/**
* Encodes already-parsed request parameters as one NDJSON line; never validates them again.
*
* @category encoding
* @since 0.8.2
*/
function encodeWireRequest(requestId, method, params) {
	return `{"id":${JSON.stringify(requestId)},"method":${JSON.stringify(method)},"params":${encodeWireParameterValue(params)}}\n`;
}
function isWireParameterArray(value) {
	return Array.isArray(value);
}
function encodeWireParameterValue(value) {
	if (value === void 0) return "null";
	if (isWireParameterArray(value)) return `[${Array.from(value, (child) => encodeWireParameterValue(child)).join(",")}]`;
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	const fields = [];
	for (const [key, child] of Object.entries(value)) {
		if (child === void 0) continue;
		const wireKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
		const encodedChild = key === "env" || key === "tokens" || key === "stateLabels" ? JSON.stringify(child) : encodeWireParameterValue(child);
		fields.push(`${JSON.stringify(wireKey)}:${encodedChild}`);
	}
	return `{${fields.join(",")}}`;
}
//#endregion
//#region src/herdr-socket-lines.ts
/**
* Frames newline-delimited JSON read from Herdr Unix sockets.
*
* The line buffer preserves partial frames across chunks and rejects oversized buffered data before unbounded memory can accumulate.
*
* @since 0.8.2
*/
/**
* Creates an empty incremental Herdr socket line buffer.
*
* @category constructors
* @since 0.8.2
*/
function makeHerdrSocketLineBuffer() {
	return {
		segments: [],
		byteLength: 0
	};
}
/**
* Splits socket chunks into bounded lines while preserving exact unconsumed remainder bytes.
*
* @category decoding
* @since 0.8.2
*/
function splitHerdrSocketLines(state, chunks, maximumLineBytes, requestId, maximumLines = Number.POSITIVE_INFINITY) {
	let segments = [...state.segments];
	let byteLength = state.byteLength;
	const lines = [];
	for (const [chunkIndex, chunk] of chunks.entries()) {
		let offset = 0;
		while (offset < chunk.length) {
			const newline = chunk.indexOf(10, offset);
			const end = newline < 0 ? chunk.length : newline;
			const segment = chunk.subarray(offset, end);
			if (segment.length > 0) {
				segments.push(segment);
				byteLength += segment.length;
			}
			if (byteLength > maximumLineBytes) return Result.fail(new HerdrInvalidResponse("oversized_frame", requestId, { maximumBytes: maximumLineBytes }));
			if (newline < 0) break;
			lines.push(joinHerdrSocketLineSegments(segments, byteLength));
			segments = [];
			byteLength = 0;
			offset = newline + 1;
			if (lines.length >= maximumLines) {
				const remainder = [chunk.subarray(offset), ...chunks.slice(chunkIndex + 1)].filter((bytes) => bytes.length > 0);
				return Result.succeed({
					buffer: makeHerdrSocketLineBuffer(),
					lines,
					remainder
				});
			}
		}
	}
	return Result.succeed({
		buffer: {
			segments,
			byteLength
		},
		lines,
		remainder: []
	});
}
function joinHerdrSocketLineSegments(segments, byteLength) {
	const firstSegment = segments[0];
	if (segments.length === 1 && firstSegment !== void 0) return firstSegment;
	const line = new Uint8Array(byteLength);
	let offset = 0;
	for (const segment of segments) {
		line.set(segment, offset);
		offset += segment.length;
	}
	return line;
}
//#endregion
//#region src/herdr-transport.ts
/**
* Owns Herdr Unix-socket requests, compatibility, and stream handshakes.
*
* The transport correlates NDJSON responses, shares protocol compatibility checks, enforces deadlines and frame limits, translates server failures, and scopes socket cleanup.
*
* @since 0.8.2
*/
const MAX_RESPONSE_LINE_BYTES = 1024 * 1024;
const responseUtf8Decoder = new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true
});
/**
* Local request options applied by the transport rather than the Herdr server.
*
* @category schemas
* @since 0.8.2
*/
const HerdrTransportRequestOptions = Schema.Struct({
	requestId: Schema.OptionFromOptionalKey(Schema.NonEmptyString),
	requestTimeout: Schema.OptionFromOptionalKey(HerdrRequestDeadline)
});
/**
* Yieldable Effect service owning Herdr Unix-socket and protocol operations.
*
* @category services
* @since 0.8.2
*/
var HerdrTransport = class extends Context.Service()("@herdr/sdk/HerdrTransport") {};
const parseHerdrTransportRequestOptions = Schema.decodeEffect(HerdrTransportRequestOptions);
const HerdrWaitEventProbe = Schema.Struct({ result: Schema.Struct({
	type: Schema.Literal("wait_matched"),
	event: Schema.Struct({ event: Schema.String })
}) });
const parseHerdrWaitEventProbe = Schema.decodeUnknownOption(HerdrWaitEventProbe);
const supportedWaitEventKinds = new Set(herdr_api_schema_default.schemas.event.$defs.EventKind.enum);
/** Socket identity is generated locally and never derived from a path or wire request ID. */
const herdrSocketConnectionIds = /* @__PURE__ */ new WeakMap();
/** Annotates diagnostics without recovering, replacing, or stringifying the original exit. */
function annotateHerdrTransportExit(exit) {
	if (Exit.isSuccess(exit)) return Effect.annotateCurrentSpan("herdr.outcome", "success");
	const error = Cause.findErrorOption(exit.cause);
	return Effect.gen(function* () {
		yield* Effect.annotateCurrentSpan("herdr.outcome", Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : "failure");
		if (Option.isNone(error)) return;
		yield* Effect.annotateCurrentSpan("herdr.error_tag", error.value._tag);
		if (error.value._tag === "HerdrTransportError" || error.value._tag === "HerdrInvalidResponse") yield* Effect.annotateCurrentSpan("herdr.reason", error.value.reason);
	});
}
/** Keeps finite transport phase spans and their exit classification in the same boundary. */
function traceHerdrTransportPhase(effect, name, options) {
	return effect.pipe(Effect.onExit(annotateHerdrTransportExit), Effect.withSpan(name, options));
}
/**
* Constructs the transport while preserving its Herdr configuration requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeHerdrTransport = Effect.gen(function* () {
	const config = yield* HerdrConfig;
	const requestWithoutCompatibility = (operation, method, params, requestId, deadline) => {
		return Effect.gen(function* () {
			const payload = encodeWireRequest(requestId, method, params);
			yield* Effect.annotateCurrentSpan({
				"herdr.method": method,
				"herdr.operation": operation,
				"herdr.deadline_ms": Duration.toMillis(deadline)
			});
			const value = yield* exchangeWireLine(config.socketPath, payload, operation, requestId, deadline);
			return yield* traceHerdrTransportPhase(Effect.gen(function* () {
				const response = yield* Effect.try({
					try: () => parseHerdrWireResponse(value, requestId),
					catch: (cause) => {
						const eventProbe = parseHerdrWaitEventProbe(value);
						return method === "events.wait" && Option.isSome(eventProbe) && !supportedWaitEventKinds.has(eventProbe.value.result.event.event) ? new HerdrUnsupportedEvent(eventProbe.value.result.event.event, requestId) : new HerdrInvalidResponse("schema_mismatch", requestId, cause);
					}
				});
				if (response.id !== requestId) return yield* new HerdrInvalidResponse("correlation_mismatch", requestId, /* @__PURE__ */ new Error(`Herdr returned response ID ${response.id}`));
				if (isWireErrorResponse(response)) return yield* new HerdrServerError(response.error.code, response.error.message, requestId);
				if (response.result.type === "wait_matched" && response.result.event.event !== response.result.event.data.type) return yield* new HerdrInvalidResponse("schema_mismatch", requestId, /* @__PURE__ */ new Error("Herdr wait event envelope disagrees with its data type"));
				if (!isExpectedWireResult(method, response.result)) return yield* new HerdrUnsupportedResult(method, response.result.type, wireResultTypesByMethod[method].join(" or "), requestId);
				yield* Effect.annotateCurrentSpan("herdr.result_type", response.result.type);
				return {
					requestId,
					result: response.result
				};
			}), "herdr.response.decode", { attributes: {
				"herdr.method": method,
				"herdr.operation": operation
			} }).pipe(Effect.tap((response) => Effect.annotateCurrentSpan("herdr.result_type", response.result.type)));
		});
	};
	const pingParameters = Option.match(config.application, {
		onNone: () => ({}),
		onSome: (application) => ({ application: {
			name: application.name,
			...Option.isSome(application.version) ? { version: application.version.value } : {}
		} })
	});
	const compatibilityCache = yield* Cache.makeWith((_key) => Effect.gen(function* () {
		const { requestId, result } = yield* requestWithoutCompatibility("compatibility_check", "ping", pingParameters, randomUUID(), config.requestTimeout).pipe(Effect.catchTag("HerdrUnsupportedEvent", Effect.die));
		if (result.protocol !== config.supportedProtocol) return yield* new HerdrUnsupportedProtocol(result.protocol, config.supportedProtocol, requestId);
		const checkSpan = yield* Effect.serviceOption(Tracer.ParentSpan);
		return Option.map(checkSpan, (span) => Tracer.externalSpan({
			traceId: span.traceId,
			spanId: span.spanId,
			sampled: span.sampled
		}));
	}).pipe(Effect.onExit(annotateHerdrTransportExit), Effect.withSpan("herdr.compatibility.check", { root: true })), {
		capacity: 1,
		timeToLive: (exit) => Exit.isSuccess(exit) ? Duration.infinity : Duration.zero
	});
	const compatibilityCheck = traceHerdrTransportPhase(Effect.gen(function* () {
		const checkSpan = yield* Cache.get(compatibilityCache, "compatibility");
		const waiterSpan = yield* Effect.serviceOption(Tracer.ParentSpan);
		if (Option.isSome(checkSpan) && Option.isSome(waiterSpan) && waiterSpan.value._tag === "Span") waiterSpan.value.addLinks([{
			span: checkSpan.value,
			attributes: {}
		}]);
	}), "herdr.compatibility.wait");
	const openStream = (method, params, options = {}) => {
		const operation = method === "events.subscribe" ? "event_subscription" : "ssh_agent_registration";
		return Effect.fn("HerdrTransport.openStream")(function* () {
			const parsedOptions = yield* parseHerdrTransportRequestOptions(options).pipe(Effect.mapError((cause) => new HerdrInvalidInput("transport.requestOptions", cause)));
			const requestId = Option.getOrElse(parsedOptions.requestId, randomUUID);
			const deadline = Option.getOrElse(parsedOptions.requestTimeout, () => config.requestTimeout);
			const payload = encodeWireRequest(requestId, method, params);
			yield* Effect.annotateCurrentSpan({
				"herdr.method": method,
				"herdr.operation": operation,
				"herdr.deadline_ms": Duration.toMillis(deadline)
			});
			return yield* Effect.gen(function* () {
				yield* compatibilityCheck;
				const socket = yield* Effect.acquireRelease(connectSocket(config.socketPath, operation, requestId), closeSocket, { interruptible: true });
				return yield* Effect.gen(function* () {
					yield* writeSocketPayload(socket, payload, operation, requestId);
					const handshake = yield* readSocketLine(socket, operation, requestId);
					const result = yield* traceHerdrTransportPhase(Effect.gen(function* () {
						const response = yield* Effect.try({
							try: () => parseHerdrWireResponse(handshake.value, requestId),
							catch: (cause) => new HerdrInvalidResponse("schema_mismatch", requestId, cause)
						});
						if (response.id !== requestId) return yield* new HerdrInvalidResponse("correlation_mismatch", requestId, /* @__PURE__ */ new Error(`Herdr returned response ID ${response.id}`));
						if (isWireErrorResponse(response)) return yield* new HerdrServerError(response.error.code, response.error.message, requestId);
						if (!isExpectedWireResult(method, response.result)) return yield* new HerdrUnsupportedResult(method, response.result.type, wireResultTypesByMethod[method].join(" or "), requestId);
						yield* Effect.annotateCurrentSpan("herdr.result_type", response.result.type);
						return response.result;
					}), "herdr.response.decode", { attributes: {
						"herdr.method": method,
						"herdr.operation": operation
					} });
					yield* Effect.annotateCurrentSpan("herdr.result_type", result.type);
					return {
						requestId,
						result,
						readBytes: makeHerdrSocketByteStream(socket, handshake.remainder, operation, requestId)
					};
				}).pipe(Effect.onError(() => closeSocket(socket)));
			}).pipe(Effect.timeoutOrElse({
				duration: deadline,
				orElse: () => Effect.fail(new HerdrRequestTimeout(operation, requestId, Duration.toMillis(deadline)))
			}));
		}, Effect.onExit(annotateHerdrTransportExit))();
	};
	function request(method, params, options = {}) {
		return Effect.fn("HerdrTransport.request")(function* () {
			const parsedOptions = yield* parseHerdrTransportRequestOptions(options).pipe(Effect.mapError((cause) => new HerdrInvalidInput("transport.requestOptions", cause)));
			const requestId = Option.getOrElse(parsedOptions.requestId, randomUUID);
			const deadline = Option.getOrElse(parsedOptions.requestTimeout, () => config.requestTimeout);
			yield* Effect.annotateCurrentSpan({
				"herdr.method": method,
				"herdr.operation": method === "ping" ? "compatibility_check" : "request",
				"herdr.deadline_ms": Duration.toMillis(deadline)
			});
			return yield* Effect.gen(function* () {
				if (method === "ping") return yield* traceHerdrTransportPhase(Effect.gen(function* () {
					const response = yield* requestWithoutCompatibility("compatibility_check", method, params, requestId, deadline);
					yield* verifyProtocolCompatibility(response.result, response.requestId, config.supportedProtocol);
					return response;
				}), "herdr.compatibility.check");
				yield* compatibilityCheck;
				return yield* requestWithoutCompatibility("request", method, params, requestId, deadline);
			}).pipe(Effect.timeoutOrElse({
				duration: deadline,
				orElse: () => Effect.fail(new HerdrRequestTimeout(method === "ping" ? "compatibility_check" : "request", requestId, Duration.toMillis(deadline)))
			}));
		}, Effect.onExit(annotateHerdrTransportExit))();
	}
	return HerdrTransport.of({
		openStream,
		request
	});
});
/**
* Provides the transport while retaining its Herdr configuration requirement.
*
* @category layers
* @since 0.8.2
*/
const herdrTransportLayerWithoutDependencies = Layer.effect(HerdrTransport, makeHerdrTransport);
/**
* Production transport Layer using the ambient Herdr configuration Layer.
*
* @category layers
* @since 0.8.2
*/
const herdrTransportLayer = herdrTransportLayerWithoutDependencies.pipe(Layer.provide(herdrConfigLayer));
function connectSocket(socketPath, operation, requestId) {
	return Effect.suspend(() => {
		const connectionId = randomUUID();
		return traceHerdrTransportPhase(Effect.callback((resume) => {
			const socket = createConnection(resolveHerdrSocketEndpoint(socketPath));
			herdrSocketConnectionIds.set(socket, connectionId);
			let completed = false;
			const cleanup = () => {
				socket.off("connect", onConnect);
			};
			const onConnect = () => {
				completed = true;
				cleanup();
				resume(Effect.succeed(socket));
			};
			const onError = (cause) => {
				if (completed) return;
				completed = true;
				cleanup();
				socket.destroy();
				resume(Effect.fail(new HerdrTransportError(operation, "connect", requestId, cause)));
			};
			socket.once("connect", onConnect);
			socket.on("error", onError);
			socket.once("close", () => socket.off("error", onError));
			return Effect.sync(() => {
				if (completed) return;
				completed = true;
				cleanup();
				socket.destroy();
			});
		}), "herdr.socket.connect", { attributes: {
			"herdr.operation": operation,
			"herdr.connection_id": connectionId
		} });
	});
}
/**
* Resolves Herdr's filesystem-shaped IPC name to Node's Windows named-pipe endpoint.
*
* @category configuration
* @since 0.8.2
*/
function resolveHerdrSocketEndpoint(socketPath, platform = process.platform) {
	if (platform !== "win32" || socketPath.startsWith("\\\\")) return socketPath;
	return `\\\\.\\pipe\\${socketPath}`;
}
/** Measures the existing synchronous destroy operation, not a later Node close notification. */
function closeSocket(socket) {
	return traceHerdrTransportPhase(Effect.sync(() => socket.destroy()), "herdr.socket.close", { attributes: { "herdr.connection_id": herdrSocketConnectionIds.get(socket) } });
}
function makeHerdrSocketByteStream(socket, initialBytes, operation, requestId) {
	const socketBytes = Stream.unwrap(Effect.suspend(() => socket.errored !== null ? Effect.fail(new HerdrTransportError(operation, "read", requestId, socket.errored)) : Effect.succeed(NodeStream.fromReadable({
		evaluate: () => socket,
		onError: (cause) => new HerdrTransportError(operation, "read", requestId, cause)
	}))));
	return initialBytes.length === 0 ? socketBytes : Stream.concat(Stream.fromIterable(initialBytes), socketBytes);
}
function writeSocketPayload(socket, payload, operation, requestId) {
	return traceHerdrTransportPhase(Effect.callback((resume) => {
		let completed = false;
		socket.write(payload, (cause) => {
			if (completed) return;
			completed = true;
			if (cause === void 0 || cause === null) resume(Effect.void);
			else resume(Effect.fail(new HerdrTransportError(operation, "write", requestId, cause)));
		});
		return Effect.sync(() => {
			if (completed) return;
			completed = true;
			socket.destroy();
		});
	}).pipe(Effect.tap(() => Effect.annotateCurrentSpan("herdr.bytes_written", Buffer.byteLength(payload)))), "herdr.socket.write", { attributes: {
		"herdr.operation": operation,
		"herdr.connection_id": herdrSocketConnectionIds.get(socket)
	} });
}
function readSocketLine(socket, operation, requestId) {
	return traceHerdrTransportPhase(Effect.gen(function* () {
		if (socket.errored !== null) return yield* new HerdrTransportError(operation, "read", requestId, socket.errored);
		const line = yield* NodeStream.fromReadable({
			evaluate: () => socket,
			closeOnDone: false,
			onError: (cause) => new HerdrTransportError(operation, "read", requestId, cause)
		}).pipe(Stream.mapAccumArrayEffect(makeHerdrSocketLineBuffer, (state, chunks) => parseFirstHerdrSocketLine(state, chunks, requestId)), Stream.runHead);
		if (Option.isSome(line)) {
			yield* Effect.annotateCurrentSpan("herdr.bytes_read", line.value.bytesRead);
			return line.value;
		}
		return yield* new HerdrTransportError(operation, "premature_close", requestId, /* @__PURE__ */ new Error("Herdr closed the socket before sending a complete response line"));
	}), "herdr.socket.response.wait", { attributes: {
		"herdr.operation": operation,
		"herdr.connection_id": herdrSocketConnectionIds.get(socket)
	} });
}
function parseFirstHerdrSocketLine(state, chunks, requestId) {
	return Effect.gen(function* () {
		const split = splitHerdrSocketLines(state, chunks, MAX_RESPONSE_LINE_BYTES, requestId, 1);
		if (Result.isFailure(split)) return yield* split.failure;
		const lineBytes = split.success.lines.at(0);
		if (lineBytes === void 0) return [split.success.buffer, []];
		const value = yield* Effect.try({
			try: () => JSON.parse(responseUtf8Decoder.decode(lineBytes)),
			catch: (cause) => new HerdrInvalidResponse("malformed_json", requestId, cause)
		});
		return [split.success.buffer, [{
			value,
			remainder: split.success.remainder,
			bytesRead: lineBytes.byteLength + 1
		}]];
	});
}
function isWireErrorResponse(response) {
	return "error" in response && !("result" in response);
}
function verifyProtocolCompatibility(result, requestId, supportedProtocol) {
	if (result.type !== "pong") return Effect.fail(new HerdrUnsupportedResult("ping", result.type, "pong", requestId));
	return result.protocol === supportedProtocol ? Effect.void : Effect.fail(new HerdrUnsupportedProtocol(result.protocol, supportedProtocol, requestId));
}
function exchangeWireLine(socketPath, payload, operation, requestId, deadline) {
	return Effect.acquireUseRelease(connectSocket(socketPath, operation, requestId).pipe(Effect.interruptible), (socket) => Effect.gen(function* () {
		yield* writeSocketPayload(socket, payload, operation, requestId);
		return (yield* readSocketLine(socket, operation, requestId)).value;
	}), closeSocket).pipe(Effect.timeoutOrElse({
		duration: deadline,
		orElse: () => Effect.fail(new HerdrRequestTimeout(operation, requestId, Duration.toMillis(deadline)))
	}));
}
//#endregion
//#region src/herdr-pane-interaction-models.ts
/**
* Models revision-guarded pane selection, copy navigation, scrolling, and link resolution/activation.
* Coordinates and content revisions refer to server terminal content, not a client's projection.
* @since 0.9.0
*/
const PaneRow = Schema.Natural.check(Schema.isLessThanOrEqualTo(4294967295));
const PaneColumn = Schema.Natural.check(Schema.isLessThanOrEqualTo(65535));
const SafeUnsignedInteger = Schema.Natural.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER));
/** Content revision guards selection against terminal mutation; distinct from surface revisions. @category schemas @since 0.9.0 */
const PaneContentRevision = SafeUnsignedInteger.pipe(Schema.brand("PaneContentRevision"));
/** Scroll offset measured in rows from the terminal's bottom. @category schemas @since 0.9.0 */
const PaneScrollOffset = SafeUnsignedInteger.pipe(Schema.brand("PaneScrollOffset"));
/** Absolute terminal text coordinates, not viewport coordinates. @category schemas @since 0.9.0 */
const PaneTextPoint = Schema.Struct({
	row: PaneRow,
	col: PaneColumn
});
/** Terminal text match range returned by copy search. @category schemas @since 0.9.0 */
const PaneTextRange = Schema.Struct({
	start: PaneTextPoint,
	end: PaneTextPoint
});
/** Sets a terminal scroll offset; the server clamps it to available history. @category schemas @since 0.9.0 */
const PaneScrollInput = Schema.Struct({ offsetFromBottom: PaneScrollOffset });
/** Reads absolute selection coordinates, optionally rejecting changed content. @category schemas @since 0.9.0 */
const PaneSelectionReadInput = Schema.Struct({
	anchor: PaneTextPoint,
	cursor: PaneTextPoint,
	contentRevision: Schema.optionalKey(PaneContentRevision)
});
/** Selected text returned without changing the system clipboard. @category schemas @since 0.9.0 */
const PaneSelectionResult = Schema.Struct({
	paneId: PaneId,
	text: Schema.String
}).pipe(Schema.encodeKeys({ paneId: "pane_id" }));
/** Navigation motion evaluated against server-owned terminal text. @category schemas @since 0.9.0 */
const PaneCopyMotion = Schema.Literals([
	"lineEnd",
	"firstNonBlank",
	"nextWordStart",
	"previousWordStart",
	"nextWordEnd",
	"nextBigWordStart",
	"previousBigWordStart",
	"nextBigWordEnd",
	"previousParagraph",
	"nextParagraph"
]);
/** Calculates a cursor target without typing terminal input. @category schemas @since 0.9.0 */
const PaneCopyMotionInput = Schema.Struct({
	cursor: PaneTextPoint,
	motion: PaneCopyMotion,
	contentRevision: Schema.optionalKey(PaneContentRevision)
});
/** Cursor and content revision observed by copy motion. @category schemas @since 0.9.0 */
const PaneCopyMotionResult = Schema.Struct({
	paneId: PaneId,
	cursor: PaneTextPoint,
	contentRevision: PaneContentRevision
}).pipe(Schema.encodeKeys({
	paneId: "pane_id",
	contentRevision: "content_revision"
}));
/** Search against an exact content revision; the query is at most 4096 UTF-8 bytes. @category schemas @since 0.9.0 */
const PaneCopySearchInput = Schema.Struct({
	query: Schema.String.check(Schema.makeFilter((query) => Buffer$1.byteLength(query, "utf8") <= 4096 || "Pane copy search query exceeds 4096 UTF-8 bytes")),
	direction: Schema.Literals(["forward", "backward"]),
	cursor: PaneTextPoint,
	contentRevision: PaneContentRevision,
	previous: Schema.optionalKey(PaneTextRange)
});
/** Bounded match window; total may exceed the returned range count. @category schemas @since 0.9.0 */
const PaneCopySearchResult = Schema.Struct({
	paneId: PaneId,
	contentRevision: PaneContentRevision,
	matches: Schema.Array(PaneTextRange).check(Schema.isMaxLength(1024)),
	total: SafeUnsignedInteger,
	current: Schema.OptionFromOptionalKey(PaneRow),
	currentGlobal: Schema.OptionFromOptionalKey(SafeUnsignedInteger)
}).pipe(Schema.encodeKeys({
	paneId: "pane_id",
	contentRevision: "content_revision",
	currentGlobal: "current_global"
}));
/** Activates a visible pane link with optional content and viewport guards. @category schemas @since 0.9.0 */
const PaneLinkActivateInput = Schema.Struct({
	viewportRow: PaneColumn,
	col: PaneColumn,
	contentRevision: Schema.optionalKey(PaneContentRevision),
	offsetFromBottom: Schema.optionalKey(PaneScrollOffset)
});
/** Resolves the visible link under a viewport cell with the same guards as activation; has no side effects. @category schemas @since 0.9.5 */
const PaneLinkResolveInput = PaneLinkActivateInput;
/** One viewport row's inclusive display-cell column span covered by a link. @category schemas @since 0.9.5 */
const PaneLinkRegion = Schema.Struct({
	row: PaneColumn,
	startCol: PaneColumn,
	endCol: PaneColumn
}).pipe(Schema.encodeKeys({
	startCol: "start_col",
	endCol: "end_col"
}));
/** Regions of the link under the requested cell; empty when no link is there. Wrapped links span several rows. @category schemas @since 0.9.5 */
const PaneLinkResolvedResult = Schema.Struct({ regions: Schema.Array(PaneLinkRegion) });
/** Plugin handling result; an unhandled URL does not mean a browser was opened. @category schemas @since 0.9.0 */
const PaneLinkActivatedResult = Schema.Struct({
	url: Schema.OptionFromOptionalKey(Schema.String),
	handled: Schema.Boolean
});
//#endregion
//#region src/herdr-effect-operation.ts
/**
* Names protocol-facing Effect operations without changing their error or requirement types.
*
* Service implementations use this helper to attach stable tracing spans that point diagnostics back to the owning SDK operation.
*
* @since 0.8.2
*/
/**
* Adds a searchable traced Effect boundary to one Herdr service operation.
*
* @category combinators
* @since 0.8.2
*/
function defineHerdrOperation(name, operation) {
	return Effect.fn(name)(function* (...args) {
		return yield* operation(...args);
	}, Effect.onExit((exit) => Effect.annotateCurrentSpan("herdr.outcome", Exit.isSuccess(exit) ? "success" : Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : "failure")));
}
//#endregion
//#region src/herdr-schema-boundary.ts
/**
* Translates Effect Schema failures at SDK input and wire boundaries.
*
* Input failures become `HerdrInvalidInput`; malformed server values become request-correlated `HerdrInvalidResponse` errors.
*
* @since 0.8.2
*/
/**
* Classifies a schema-owned public-input parser failure at its operation boundary.
*
* @category decoding
* @since 0.8.2
*/
function decodeHerdrInput(operation, parser, input) {
	return parser(input).pipe(Effect.mapError((cause) => new HerdrInvalidInput(operation, cause)));
}
/**
* Classifies a schema-owned wire parser failure at its correlated response boundary.
*
* @category decoding
* @since 0.8.2
*/
function decodeHerdrWire(parser, input, requestId) {
	return parser(input).pipe(Effect.mapError((cause) => new HerdrInvalidResponse("schema_mismatch", requestId, cause)));
}
//#endregion
//#region src/command-service.ts
/**
* Invokes endpoint-issued custom commands with explicit workspace, tab, or pane targets.
* Command execution can change focus and is never retried automatically.
* @since 0.9.0
*/
/** Optional parent assertion for a tab-scoped command. @category schemas @since 0.9.0 */
const CommandTabInput = Schema.Struct({ expectedWorkspaceId: Schema.optionalKey(WorkspaceId) });
/** Pane command selection always belongs to the positional pane target. @category schemas @since 0.9.0 */
const CommandPaneInput = Schema.Struct({
	expectedWorkspaceId: Schema.optionalKey(WorkspaceId),
	expectedTabId: Schema.optionalKey(TabId),
	selection: Schema.optionalKey(PaneSelectionReadInput)
});
const parseCommandTab = Schema.decodeEffect(CommandTabInput, { onExcessProperty: "error" });
const parseCommandPane = Schema.decodeEffect(CommandPaneInput, { onExcessProperty: "error" });
/** Yieldable custom-command capability. @category services @since 0.9.0 */
var CommandService = class extends Context.Service()("@herdr/sdk/CommandService") {};
/** Constructs commands using the shared socket transport. @category constructors @since 0.9.0 */
const makeCommandService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return CommandService.of({
		invoke: defineHerdrOperation("CommandService.invoke", (commandId, options = {}) => transport.request("command.invoke", { commandId }, options).pipe(Effect.asVoid)),
		invokeInWorkspace: defineHerdrOperation("CommandService.invokeInWorkspace", (commandId, workspaceId, options = {}) => transport.request("command.invoke", {
			commandId,
			workspaceId
		}, options).pipe(Effect.asVoid)),
		invokeInTab: defineHerdrOperation("CommandService.invokeInTab", (commandId, tabId, input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("CommandService.invokeInTab", parseCommandTab, input);
			yield* transport.request("command.invoke", {
				commandId,
				tabId,
				...parsed.expectedWorkspaceId === void 0 ? {} : { workspaceId: parsed.expectedWorkspaceId }
			}, options);
		})),
		invokeInPane: defineHerdrOperation("CommandService.invokeInPane", (commandId, paneId, input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("CommandService.invokeInPane", parseCommandPane, input);
			yield* transport.request("command.invoke", {
				commandId,
				paneId,
				...parsed.expectedWorkspaceId === void 0 ? {} : { workspaceId: parsed.expectedWorkspaceId },
				...parsed.expectedTabId === void 0 ? {} : { tabId: parsed.expectedTabId },
				...parsed.selection === void 0 ? {} : { selection: {
					paneId,
					...parsed.selection
				} }
			}, options);
		}))
	});
});
/** Provides commands while preserving the transport requirement. @category layers @since 0.9.0 */
const commandServiceLayerWithoutDependencies = Layer.effect(CommandService, makeCommandService);
/** Production custom-command service Layer. @category layers @since 0.9.0 */
const commandServiceLayer = commandServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/product-announcement-service.ts
/**
* Dismisses the current endpoint-owned product announcement by its exact identity.
* Stale identities are server failures, never silently replaced by a newer announcement.
* @since 0.9.0
*/
/** Opaque announcement identity within a version. @category schemas @since 0.9.0 */
const ProductAnnouncementId = Schema.NonEmptyString.pipe(Schema.brand("ProductAnnouncementId"));
/** Exact current announcement identity; version is not assumed to be semver. @category schemas @since 0.9.0 */
const ProductAnnouncementDismissInput = Schema.Struct({
	version: Schema.String,
	id: ProductAnnouncementId
});
const parseDismiss$1 = Schema.decodeEffect(ProductAnnouncementDismissInput, { onExcessProperty: "error" });
/** Yieldable product announcement capability. @category services @since 0.9.0 */
var ProductAnnouncementService = class extends Context.Service()("@herdr/sdk/ProductAnnouncementService") {};
/** Constructs announcement dismissal on the shared transport. @category constructors @since 0.9.0 */
const makeProductAnnouncementService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return ProductAnnouncementService.of({ dismiss: defineHerdrOperation("ProductAnnouncementService.dismiss", (input, options = {}) => Effect.gen(function* () {
		const parsed = yield* decodeHerdrInput("ProductAnnouncementService.dismiss", parseDismiss$1, input);
		yield* transport.request("product_announcement.dismiss", parsed, options);
	})) });
});
/** Provides announcement operations with visible transport requirements. @category layers @since 0.9.0 */
const productAnnouncementServiceLayerWithoutDependencies = Layer.effect(ProductAnnouncementService, makeProductAnnouncementService);
/** Production announcement-service Layer. @category layers @since 0.9.0 */
const productAnnouncementServiceLayer = productAnnouncementServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/release-notes-service.ts
/**
* Marks endpoint release notes seen by their exact current version identity.
* Version strings include upstream preview identities and are not parsed as semver.
* @since 0.9.0
*/
/** Identifies the currently displayed release notes. @category schemas @since 0.9.0 */
const ReleaseNotesDismissInput = Schema.Struct({ version: Schema.String });
const parseDismiss = Schema.decodeEffect(ReleaseNotesDismissInput, { onExcessProperty: "error" });
/** Yieldable release-note capability. @category services @since 0.9.0 */
var ReleaseNotesService = class extends Context.Service()("@herdr/sdk/ReleaseNotesService") {};
/** Constructs release-note dismissal using the shared transport. @category constructors @since 0.9.0 */
const makeReleaseNotesService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return ReleaseNotesService.of({ dismiss: defineHerdrOperation("ReleaseNotesService.dismiss", (input, options = {}) => Effect.gen(function* () {
		const parsed = yield* decodeHerdrInput("ReleaseNotesService.dismiss", parseDismiss, input);
		yield* transport.request("release_notes.dismiss", parsed, options);
	})) });
});
/** Provides release notes with a visible transport requirement. @category layers @since 0.9.0 */
const releaseNotesServiceLayerWithoutDependencies = Layer.effect(ReleaseNotesService, makeReleaseNotesService);
/** Production release-notes Layer. @category layers @since 0.9.0 */
const releaseNotesServiceLayer = releaseNotesServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/herdr-client-shell-models.ts
/**
* Models the generation-1 client-shell projection and presentation contract.
* Endpoint, projection, surface, and terminal-content identities are intentionally distinct.
* @since 0.9.0
*/
const U16$1 = Schema.Natural.check(Schema.isLessThanOrEqualTo(65535));
const U32$1 = Schema.Natural.check(Schema.isLessThanOrEqualTo(4294967295));
const SafeNatural = Schema.Natural.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER));
const optionalText = Schema.OptionFromOptionalNullOr(Schema.String);
const TextPairs = Schema.Array(Schema.Tuple([Schema.String, Schema.String]));
const unknownEndpointValue = Schema.String.pipe(Schema.decodeTo(Schema.Literal("unknown"), {
	decode: SchemaGetter.succeed("unknown"),
	encode: SchemaGetter.succeed("Unknown")
}));
const endpointAgentStatus = Schema.Union([AgentStatus, unknownEndpointValue]);
/** Identifies one endpoint process boot; changes on server restart. @category schemas @since 0.9.0 */
const EndpointBootId = Schema.NonEmptyString.pipe(Schema.brand("EndpointBootId"));
/** Replacement projection revision within one boot. @category schemas @since 0.9.0 */
const ProjectionRevision = SafeNatural.pipe(Schema.brand("ProjectionRevision"));
/** Complete or incremental surface revision within one connection. @category schemas @since 0.9.0 */
const SurfaceRevision = SafeNatural.pipe(Schema.brand("SurfaceRevision"));
/** Endpoint-owned linked-worktree display metadata. @category schemas @since 0.9.0 */
const ClientShellWorktree = Schema.Struct({
	key: Schema.String,
	label: Schema.String,
	isLinkedWorktree: Schema.Boolean
}).pipe(Schema.encodeKeys({ isLinkedWorktree: "is_linked_worktree" }));
/** Client-shell workspace projection, not an ordinary socket Workspace. @category schemas @since 0.9.0 */
const ClientShellWorkspace = Schema.Struct({
	workspaceId: WorkspaceId,
	activeTabId: TabId,
	newWorkspaceCwd: Schema.String,
	number: SafeNatural,
	label: Schema.String,
	customLabel: Schema.Boolean,
	branch: optionalText,
	gitAheadBehind: Schema.OptionFromNullOr(Schema.Tuple([SafeNatural, SafeNatural])),
	tokens: TextPairs,
	worktree: Schema.OptionFromNullOr(ClientShellWorktree),
	focused: Schema.Boolean,
	agentStatus: endpointAgentStatus
}).pipe(Schema.encodeKeys({
	workspaceId: "workspace_id",
	activeTabId: "active_tab_id",
	newWorkspaceCwd: "new_workspace_cwd",
	customLabel: "custom_label",
	gitAheadBehind: "git_ahead_behind",
	agentStatus: "agent_status"
}));
/** Tab metadata in a client-shell projection. @category schemas @since 0.9.0 */
const ClientShellTab = Schema.Struct({
	tabId: TabId,
	workspaceId: WorkspaceId,
	number: SafeNatural,
	label: Schema.String,
	customLabel: Schema.Boolean,
	zoomed: Schema.Boolean,
	focused: Schema.Boolean,
	agentStatus: endpointAgentStatus
}).pipe(Schema.encodeKeys({
	tabId: "tab_id",
	workspaceId: "workspace_id",
	customLabel: "custom_label",
	agentStatus: "agent_status"
}));
/** Pane metadata in a client-shell projection. @category schemas @since 0.9.0 */
const ClientShellPane = Schema.Struct({
	paneId: PaneId,
	workspaceId: WorkspaceId,
	tabId: TabId,
	label: optionalText,
	cwd: optionalText,
	foregroundCwd: optionalText,
	focused: Schema.Boolean,
	rightClickPassthrough: Schema.Boolean
}).pipe(Schema.encodeKeys({
	paneId: "pane_id",
	workspaceId: "workspace_id",
	tabId: "tab_id",
	foregroundCwd: "foreground_cwd",
	rightClickPassthrough: "right_click_passthrough"
}));
/** Agent display state; each client owns its viewed-completion presentation. @category schemas @since 0.9.0 */
const ClientShellAgent = Schema.Struct({
	paneId: PaneId,
	workspaceId: WorkspaceId,
	tabId: TabId,
	name: Schema.OptionFromOptionalNullOr(AgentName),
	displayAgent: optionalText,
	agent: optionalText,
	title: optionalText,
	terminalTitle: optionalText,
	terminalTitleStripped: optionalText,
	agentStatus: endpointAgentStatus,
	stateChangeSeq: SafeNatural,
	/**
	* Set when the current idle transition completed work (equal to that transition's
	* `stateChangeSeq`), from the endpoint's revision-bound completion companion.
	*/
	completionSeq: Schema.OptionFromOptionalKey(SafeNatural),
	stateLabels: TextPairs,
	tokens: TextPairs,
	focused: Schema.Boolean
}).pipe(Schema.encodeKeys({
	paneId: "pane_id",
	workspaceId: "workspace_id",
	tabId: "tab_id",
	displayAgent: "display_agent",
	terminalTitle: "terminal_title",
	terminalTitleStripped: "terminal_title_stripped",
	agentStatus: "agent_status",
	stateChangeSeq: "state_change_seq",
	completionSeq: "completion_seq",
	stateLabels: "state_labels"
}));
/** Extensible endpoint command action; unfamiliar actions remain unknown. @category schemas @since 0.9.0 */
const ClientShellCommandAction = Schema.Union([
	Schema.Literal("Shell").transform("shell"),
	Schema.Literal("Pane").transform("pane"),
	Schema.Literal("Popup").transform("popup"),
	Schema.Literal("PluginAction").transform("pluginAction"),
	unknownEndpointValue
]);
/** Opaque command identity and display labels; never executable command text. @category schemas @since 0.9.0 */
const ClientShellCommand = Schema.Struct({
	commandId: HerdrCommandId,
	bindingLabel: Schema.String,
	bindingLabels: Schema.Array(Schema.String),
	action: ClientShellCommandAction,
	description: optionalText
}).pipe(Schema.encodeKeys({
	commandId: "command_id",
	bindingLabel: "binding_label",
	bindingLabels: "binding_labels"
}));
/** Current endpoint-owned product announcement. @category schemas @since 0.9.0 */
const ClientShellProductAnnouncement = Schema.Struct({
	version: Schema.String,
	id: Schema.NonEmptyString,
	title: Schema.String,
	body: Schema.String,
	preview: Schema.Boolean
});
/** Current endpoint-owned release notes. @category schemas @since 0.9.0 */
const ClientShellReleaseNotes = Schema.Struct({
	version: Schema.String,
	body: Schema.String,
	preview: Schema.Boolean
});
/** Completed-work sequences by pane, bound to the projection with the same boot and revision. @category schemas @since 0.9.5 */
const ClientShellAgentCompletions = Schema.Struct({
	bootId: EndpointBootId,
	revision: ProjectionRevision,
	completions: Schema.Record(Schema.String, SafeNatural)
}).pipe(Schema.encodeKeys({ bootId: "boot_id" }));
/**
* Agent-view companion envelope (`endpoint.agent-view.v1`) bound to the projection with the same
* boot and revision. The view stays opaque JSON here; missing or null means the view was cleared.
* @category schemas @since 0.9.5
*/
const ClientShellAgentViewProjection = Schema.Struct({
	bootId: EndpointBootId,
	revision: ProjectionRevision,
	view: Schema.OptionFromOptionalNullOr(Schema.Json)
}).pipe(Schema.encodeKeys({ bootId: "boot_id" }));
/**
* Active agent view (filter and sort definition) for one projection: `none` when no view is set,
* `active` with the decoded definition, or `unrecognized` when the server sent a view this SDK
* cannot decode (for example a newer view-language addition).
* @category schemas @since 0.9.5
*/
const ClientShellAgentView = Schema.Union([
	Schema.Struct({ status: Schema.Literal("none") }),
	Schema.Struct({
		status: Schema.Literal("active"),
		view: AgentViewSetInput
	}),
	Schema.Struct({ status: Schema.Literal("unrecognized") })
]);
const noClientShellAgentView = () => ({ status: "none" });
const ClientShellSnapshotPayload = Schema.Struct({
	bootId: EndpointBootId,
	revision: ProjectionRevision,
	configDiagnostic: optionalText,
	productAnnouncement: Schema.OptionFromNullOr(ClientShellProductAnnouncement),
	updateAvailable: optionalText,
	updateInstallCommand: Schema.String,
	serverKeybindingsToml: optionalText,
	latestReleaseNotesAvailable: Schema.Boolean,
	integrationUpdatesAvailable: Schema.Boolean,
	worktreeDirectory: Schema.String,
	releaseNotes: Schema.OptionFromNullOr(ClientShellReleaseNotes),
	focusedWorkspaceId: Schema.OptionFromNullOr(WorkspaceId),
	focusedTabId: Schema.OptionFromNullOr(TabId),
	focusedPaneId: Schema.OptionFromNullOr(PaneId),
	tabBarRight: Schema.Array(Schema.Struct({
		text: Schema.String,
		accent: Schema.Boolean
	})),
	tabBarRightSeparator: Schema.String,
	agentViewLabel: optionalText,
	agentOrder: Schema.Array(Schema.String),
	workspaces: Schema.Array(ClientShellWorkspace),
	tabs: Schema.Array(ClientShellTab),
	panes: Schema.Array(ClientShellPane),
	agents: Schema.Array(ClientShellAgent),
	commands: Schema.Array(ClientShellCommand)
}).pipe(Schema.encodeKeys({
	bootId: "boot_id",
	configDiagnostic: "config_diagnostic",
	productAnnouncement: "product_announcement",
	updateAvailable: "update_available",
	updateInstallCommand: "update_install_command",
	serverKeybindingsToml: "server_keybindings_toml",
	latestReleaseNotesAvailable: "latest_release_notes_available",
	integrationUpdatesAvailable: "integration_updates_available",
	worktreeDirectory: "worktree_directory",
	releaseNotes: "release_notes",
	focusedWorkspaceId: "focused_workspace_id",
	focusedTabId: "focused_tab_id",
	focusedPaneId: "focused_pane_id",
	tabBarRight: "tab_bar_right",
	tabBarRightSeparator: "tab_bar_right_separator",
	agentViewLabel: "agent_view_label",
	agentOrder: "agent_order"
}));
/**
* Whole replacement projection for one endpoint boot. Decoding a `shell.snapshot.v1` payload yields
* `agentView: { status: "none" }`; the endpoint service attaches the snapshot's revision-bound
* `endpoint.agent-view.v1` companion. `agentView` is SDK-derived: it is never read from or written
* to the snapshot wire payload.
* @category schemas @since 0.9.0
*/
const ClientShellProjection = ClientShellSnapshotPayload.pipe(Schema.decodeTo(Schema.toType(ClientShellSnapshotPayload.to.mapFields(Struct.assign({ agentView: ClientShellAgentView }))), SchemaTransformation.transform({
	decode: (snapshot) => ({
		...snapshot,
		agentView: noClientShellAgentView()
	}),
	encode: ({ agentView: _agentView, ...snapshot }) => snapshot
})));
/** Surface-relative rectangle measured in terminal cells. @category schemas @since 0.9.0 */
const SurfaceRect = Schema.Struct({
	x: U16$1,
	y: U16$1,
	width: U16$1,
	height: U16$1
});
/** One terminal cell with packed colors and an optional hyperlink index. @category schemas @since 0.9.0 */
const ClientShellCell = Schema.Struct({
	symbol: Schema.String,
	fg: U32$1,
	bg: U32$1,
	modifier: U16$1,
	skip: Schema.Boolean,
	hyperlink: Schema.OptionFromNullOr(U32$1)
});
/** Surface-relative cursor; shape is a DECSCUSR parameter. @category schemas @since 0.9.0 */
const ClientShellCursor = Schema.Struct({
	x: U16$1,
	y: U16$1,
	visible: Schema.Boolean,
	shape: Schema.Natural.check(Schema.isLessThanOrEqualTo(255))
});
/** Full row-major terminal frame, never applied to the host terminal automatically. @category schemas @since 0.9.0 */
const ClientShellFrame = Schema.Struct({
	cells: Schema.Array(ClientShellCell),
	width: U16$1,
	height: U16$1,
	cursor: Schema.OptionFromNullOr(ClientShellCursor),
	hyperlinks: Schema.Array(Schema.String),
	graphics: Schema.Uint8Array
}).check(Schema.makeFilter((frame) => frame.cells.length === frame.width * frame.height || "Client-shell frame dimensions do not match cell count"));
/** Pane geometry and revision in one active surface. @category schemas @since 0.9.0 */
const ClientShellSurfacePane = Schema.Struct({
	paneId: PaneId,
	contentRevision: PaneContentRevision,
	rect: SurfaceRect,
	innerRect: SurfaceRect,
	scrollbarRect: Schema.OptionFromNullOr(SurfaceRect),
	scroll: Schema.OptionFromNullOr(Schema.Struct({
		offsetFromBottom: SafeNatural,
		maxOffsetFromBottom: SafeNatural,
		viewportRows: SafeNatural
	})),
	focused: Schema.Boolean,
	mouseReporting: Schema.Boolean,
	sgrPixelMouse: Schema.Boolean,
	alternateScreenActive: Schema.Boolean,
	pixelWidth: U32$1,
	pixelHeight: U32$1
});
/** Surface BSP split handle. @category schemas @since 0.9.0 */
const ClientShellSurfaceSplit = Schema.Struct({
	direction: Schema.Literals(["horizontal", "vertical"]),
	pos: U16$1,
	area: SurfaceRect,
	hitRect: SurfaceRect,
	path: Schema.Array(Schema.Boolean)
});
/** Graphics identity preserves the full 64-bit fingerprint as bigint. @category schemas @since 0.9.0 */
const ClientShellGraphicsAssetKey = Schema.Struct({
	source: Schema.Union([Schema.Struct({
		kind: Schema.Literal("terminal"),
		target: Schema.Union([Schema.Struct({
			kind: Schema.Literal("pane"),
			paneId: PaneId
		}), Schema.Struct({
			kind: Schema.Literal("popup"),
			terminalId: TerminalId
		})]),
		imageId: U32$1
	}), Schema.Struct({
		kind: Schema.Literal("paneLayer"),
		paneId: PaneId,
		layerId: Schema.String
	})]),
	imageWidth: U32$1,
	imageHeight: U32$1,
	format: Schema.Literals([
		"rgb",
		"rgba",
		"png"
	]),
	dataLength: SafeNatural,
	dataFingerprint: Schema.BigInt
});
/** Complete desired graphics scene with newly delivered bytes. @category schemas @since 0.9.0 */
const ClientShellGraphicsScene = Schema.Struct({
	assets: Schema.Array(Schema.Struct({
		key: ClientShellGraphicsAssetKey,
		data: Schema.Uint8Array
	})),
	placements: Schema.Array(Schema.Struct({
		asset: ClientShellGraphicsAssetKey,
		logicalPlacementId: U32$1,
		x: U16$1,
		y: U16$1,
		cols: U32$1,
		rows: U32$1,
		sourceX: U32$1,
		sourceY: U32$1,
		sourceWidth: U32$1,
		sourceHeight: U32$1,
		xOffset: U32$1,
		yOffset: U32$1,
		z: Schema.Int.check(Schema.isBetween({
			minimum: -2147483648,
			maximum: 2147483647
		})),
		scrollbackOffset: U32$1
	})),
	retainedAssets: Schema.Array(ClientShellGraphicsAssetKey)
});
const PopupSize = Schema.Union([Schema.Struct({
	kind: Schema.Literal("cells"),
	value: U16$1
}), Schema.Struct({
	kind: Schema.Literal("percent"),
	value: Schema.Natural.check(Schema.isLessThanOrEqualTo(255))
})]);
/** Popup terminal surface nested in an active client surface. @category schemas @since 0.9.0 */
const ClientShellPopupSurface = Schema.Struct({
	terminalId: TerminalId,
	title: Schema.String,
	width: Schema.OptionFromNullOr(PopupSize),
	height: Schema.OptionFromNullOr(PopupSize),
	frame: ClientShellFrame,
	mouseReporting: Schema.Boolean,
	sgrPixelMouse: Schema.Boolean,
	pixelWidth: U32$1,
	pixelHeight: U32$1
});
/** Complete active-tab surface tied to boot, projection, and surface revisions. @category schemas @since 0.9.0 */
const ClientShellSurface = Schema.Struct({
	bootId: EndpointBootId,
	projectionRevision: ProjectionRevision,
	surfaceRevision: SurfaceRevision,
	frame: ClientShellFrame,
	panes: Schema.Array(ClientShellSurfacePane),
	splits: Schema.Array(ClientShellSurfaceSplit),
	popup: Schema.OptionFromNullOr(ClientShellPopupSurface),
	graphics: ClientShellGraphicsScene
});
/** Incremental update requiring an exact previously accepted base surface. @category schemas @since 0.9.0 */
const ClientShellSurfacePatch = Schema.Struct({
	bootId: EndpointBootId,
	projectionRevision: ProjectionRevision,
	baseSurfaceRevision: SurfaceRevision,
	surfaceRevision: SurfaceRevision,
	rows: Schema.Array(Schema.Struct({
		x: U16$1,
		y: U16$1,
		cells: Schema.Array(ClientShellCell)
	})),
	panes: Schema.Array(ClientShellSurfacePane),
	cursor: Schema.OptionFromNullOr(ClientShellCursor)
});
/** Surface-interest acknowledgement is not a presentation-delivery acknowledgement. @category schemas @since 0.9.0 */
const ClientShellSurfaceAcknowledgement = Schema.Struct({
	active: Schema.Boolean,
	projectionRevision: ProjectionRevision
}).pipe(Schema.encodeKeys({ projectionRevision: "projection_revision" }));
/** Observable surface lifecycle; acknowledgement and presentation readiness are distinct. @category schemas @since 0.9.0 */
const ClientShellSurfaceState = Schema.Union([
	Schema.Struct({ status: Schema.Literals([
		"inactive",
		"activating",
		"deactivating",
		"closed"
	]) }),
	Schema.Struct({
		status: Schema.Literal("awaitingSurface"),
		bootId: EndpointBootId,
		projectionFloor: ProjectionRevision
	}),
	Schema.Struct({
		status: Schema.Literal("active"),
		bootId: EndpointBootId,
		projectionFloor: ProjectionRevision,
		surface: ClientShellSurface
	})
]);
/** Ephemeral host presentation instructions; the SDK never executes clipboard, sound, or terminal effects itself. @category schemas @since 0.9.0 */
const ClientShellPresentationEvent = Schema.Union([
	Schema.Struct({
		kind: Schema.Literal("graphics"),
		bytes: Schema.Uint8Array
	}),
	Schema.Struct({
		kind: Schema.Literal("notify"),
		delivery: Schema.Literals([
			"sound",
			"toast",
			"systemToast"
		]),
		message: Schema.String,
		body: Schema.NullOr(Schema.String)
	}),
	Schema.Struct({
		kind: Schema.Literal("clipboard"),
		data: Schema.String
	}),
	Schema.Struct({
		kind: Schema.Literal("windowTitle"),
		title: Schema.NullOr(Schema.String)
	}),
	Schema.Struct({ kind: Schema.Literal("reloadSoundConfig") }),
	Schema.Struct({
		kind: Schema.Literal("mouseCapture"),
		enabled: Schema.Boolean,
		sgrPixels: Schema.Boolean
	}),
	Schema.Struct({
		kind: Schema.Literal("terminalBell"),
		count: U16$1
	}),
	Schema.Struct({
		kind: Schema.Literal("keyboardProtocol"),
		flags: U16$1,
		modifyOtherKeysLevel: U16$1
	}),
	Schema.Struct({
		kind: Schema.Literal("keyboardReportAll"),
		enabled: Schema.Boolean
	}),
	Schema.Struct({
		kind: Schema.Literal("error"),
		message: Schema.String
	}),
	Schema.Struct({
		kind: Schema.Literal("notification"),
		notification: Schema.Struct({
			kind: Schema.Literals([
				"needsAttention",
				"finished",
				"updateInstalled",
				"custom"
			]),
			title: Schema.String,
			body: Schema.NullOr(Schema.String),
			sound: Schema.NullOr(Schema.Literals(["done", "request"])),
			agent: Schema.NullOr(Schema.String),
			workspaceId: Schema.NullOr(WorkspaceId),
			tabId: Schema.NullOr(TabId),
			paneId: Schema.NullOr(PaneId),
			position: Schema.NullOr(Schema.Literals([
				"topLeft",
				"topRight",
				"bottomLeft",
				"bottomRight"
			]))
		})
	})
]);
//#endregion
//#region src/herdr-endpoint-errors.ts
/**
* Classifies client-shell endpoint failures without including terminal text or payload bytes.
* Requests and input writes are never retried automatically after an uncertain outcome.
* @since 0.9.0
*/
/** Endpoint generation or required codec negotiation failed. @category errors @since 0.9.0 */
var HerdrEndpointNegotiationError = class extends Schema.TaggedError()("HerdrEndpointNegotiationError", {
	reason: Schema.Literals([
		"welcome",
		"generation",
		"codec",
		"rejected",
		"capability"
	]),
	message: Schema.String
}) {
	/** Creates a bounded negotiation failure without server payloads. */
	constructor(reason) {
		super({
			reason,
			message: `Herdr endpoint negotiation failed: ${reason}. Use a compatible Herdr 0.9.5 endpoint.`
		});
	}
};
/** Endpoint socket acquisition or I/O failed. @category errors @since 0.9.0 */
var HerdrEndpointTransportError = class extends Schema.TaggedError()("HerdrEndpointTransportError", {
	reason: Schema.Literals([
		"connect",
		"read",
		"write",
		"premature_close"
	]),
	message: Schema.String
}) {
	/** Creates a safe I/O failure; remote write outcomes can be uncertain. */
	constructor(reason) {
		super({
			reason,
			message: `Herdr endpoint transport failed: ${reason}. Inspect the affected resource before retrying.`
		});
	}
};
/** Endpoint framing, chunking, or presentation data violated its negotiated contract. @category errors @since 0.9.0 */
var HerdrEndpointInvalidMessage = class extends Schema.TaggedError()("HerdrEndpointInvalidMessage", {
	reason: Schema.Literals([
		"framing",
		"oversized_frame",
		"schema",
		"correlation",
		"revision",
		"unsupported_message",
		"resource_limit"
	]),
	message: Schema.String
}) {
	/** Creates a bounded binary/JSON protocol failure without embedding content. */
	constructor(reason) {
		super({
			reason,
			message: `Herdr endpoint message is invalid: ${reason}. Reconnect to a compatible endpoint; do not replay mutations automatically.`
		});
	}
};
/** A bounded endpoint acquisition, request, or health probe expired. @category errors @since 0.9.0 */
var HerdrEndpointRequestTimeout = class extends Schema.TaggedError()("HerdrEndpointRequestTimeout", {
	operation: Schema.Literals([
		"connect",
		"request",
		"write",
		"health",
		"surface"
	]),
	message: Schema.String
}) {
	/** Creates a deadline failure that does not imply an operation was never delivered. */
	constructor(operation) {
		super({
			operation,
			message: `Herdr endpoint deadline elapsed during ${operation}. The remote outcome may be uncertain; inspect before retrying.`
		});
	}
};
/** A connection handle was used after its owning session ended. @category errors @since 0.9.0 */
var HerdrEndpointClosed = class extends Schema.TaggedError()("HerdrEndpointClosed", { message: Schema.String }) {
	/** Creates a use-after-close failure. */
	constructor() {
		super({ message: "Herdr endpoint session is closed. Use the connection only within its owning callback or Scope." });
	}
};
/** Endpoint does not advertise a requested optional API method. @category errors @since 0.9.0 */
var HerdrEndpointUnsupportedMethod = class extends Schema.TaggedError()("HerdrEndpointUnsupportedMethod", {
	method: Schema.String,
	message: Schema.String
}) {
	/** Records the method name, never its parameters. */
	constructor(method) {
		super({
			method,
			message: `Herdr endpoint does not advertise ${method}. Choose a supported action or update the server.`
		});
	}
};
/** An endpoint-issued handle belongs to another connection or boot. @category errors @since 0.9.0 */
var HerdrEndpointStaleReference = class extends Schema.TaggedError()("HerdrEndpointStaleReference", { message: Schema.String }) {
	/** Creates a stale-handle failure without replaying the requested operation. */
	constructor() {
		super({ message: "Herdr endpoint reference is stale. Discover the command again on this live connection before invoking it." });
	}
};
//#endregion
//#region src/herdr-endpoint-codecs.ts
/**
* Implements Herdr endpoint generation-1 bincode-standard envelopes and surface decoding.
* Variant tags and field order follow v0.9.0 src/protocol/wire.rs; frames use a u32LE byte length.
* @since 0.9.0
*/
const utf8 = new TextDecoder("utf-8", { fatal: true });
const MAX_FRAME_BYTES = 32 * 1024 * 1024;
var EndpointReader = class {
	bytes;
	offset = 0;
	constructor(bytes) {
		this.bytes = bytes;
	}
	take(length) {
		if (!Number.isSafeInteger(length) || length < 0 || length > this.bytes.length - this.offset) throw new HerdrEndpointInvalidMessage("framing");
		const result = this.bytes.subarray(this.offset, this.offset + length);
		this.offset += length;
		return result;
	}
	byte() {
		return this.take(1).readUInt8();
	}
	bool() {
		const value = this.byte();
		if (value > 1) throw new HerdrEndpointInvalidMessage("framing");
		return value === 1;
	}
	uint64(maximumTag = 253) {
		const tag = this.byte();
		if (tag > maximumTag) throw new HerdrEndpointInvalidMessage("framing");
		if (tag <= 250) return BigInt(tag);
		if (tag === 251) return BigInt(this.take(2).readUInt16LE());
		if (tag === 252) return BigInt(this.take(4).readUInt32LE());
		if (tag === 253) return this.take(8).readBigUInt64LE();
		throw new HerdrEndpointInvalidMessage("framing");
	}
	uint(maximum = Number.MAX_SAFE_INTEGER) {
		const value = this.uint64();
		if (value > BigInt(maximum)) throw new HerdrEndpointInvalidMessage("framing");
		return Number(value);
	}
	u16() {
		const value = this.uint64(251);
		if (value > 65535n) throw new HerdrEndpointInvalidMessage("framing");
		return Number(value);
	}
	u32() {
		const value = this.uint64(252);
		if (value > 4294967295n) throw new HerdrEndpointInvalidMessage("framing");
		return Number(value);
	}
	i32() {
		const value = this.u32();
		return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
	}
	data() {
		return new Uint8Array(this.take(this.uint(MAX_FRAME_BYTES)));
	}
	text() {
		return utf8.decode(this.data());
	}
	optional(read) {
		return this.bool() ? read() : null;
	}
	array(read) {
		const count = this.uint(Math.min(1e6, this.bytes.length - this.offset));
		const values = [];
		for (let index = 0; index < count; index++) values.push(read());
		return values;
	}
	choice(values) {
		const value = values[this.u32()];
		if (value === void 0) throw new HerdrEndpointInvalidMessage("framing");
		return value;
	}
	finish() {
		if (this.offset !== this.bytes.length) throw new HerdrEndpointInvalidMessage("framing");
	}
};
function readRect(reader) {
	return {
		x: reader.u16(),
		y: reader.u16(),
		width: reader.u16(),
		height: reader.u16()
	};
}
function readCursor(reader) {
	return {
		x: reader.u16(),
		y: reader.u16(),
		visible: reader.bool(),
		shape: reader.byte()
	};
}
function readCell(reader) {
	return {
		symbol: reader.text(),
		fg: reader.u32(),
		bg: reader.u32(),
		modifier: reader.u16(),
		skip: reader.bool(),
		hyperlink: reader.optional(() => reader.u32())
	};
}
function readFrame(reader) {
	return {
		cells: reader.array(() => readCell(reader)),
		width: reader.u16(),
		height: reader.u16(),
		cursor: reader.optional(() => readCursor(reader)),
		hyperlinks: reader.array(() => reader.text()),
		graphics: reader.data()
	};
}
function readSurfacePane(reader) {
	return {
		paneId: reader.text(),
		contentRevision: reader.uint(),
		rect: readRect(reader),
		innerRect: readRect(reader),
		scrollbarRect: reader.optional(() => readRect(reader)),
		scroll: reader.optional(() => ({
			offsetFromBottom: reader.uint(),
			maxOffsetFromBottom: reader.uint(),
			viewportRows: reader.uint()
		})),
		focused: reader.bool(),
		mouseReporting: reader.bool(),
		sgrPixelMouse: reader.bool(),
		alternateScreenActive: reader.bool(),
		pixelWidth: reader.u32(),
		pixelHeight: reader.u32()
	};
}
function readGraphicsTarget(reader) {
	const kind = reader.choice(["pane", "popup"]);
	return kind === "pane" ? {
		kind,
		paneId: reader.text()
	} : {
		kind,
		terminalId: reader.text()
	};
}
function readGraphicsSource(reader) {
	const kind = reader.choice(["terminal", "paneLayer"]);
	return kind === "terminal" ? {
		kind,
		target: readGraphicsTarget(reader),
		imageId: reader.u32()
	} : {
		kind,
		paneId: reader.text(),
		layerId: reader.text()
	};
}
function readGraphicsKey(reader) {
	return {
		source: readGraphicsSource(reader),
		imageWidth: reader.u32(),
		imageHeight: reader.u32(),
		format: reader.choice([
			"rgb",
			"rgba",
			"png"
		]),
		dataLength: reader.uint(),
		dataFingerprint: reader.uint64()
	};
}
function readGraphicsScene(reader) {
	return {
		assets: reader.array(() => ({
			key: readGraphicsKey(reader),
			data: reader.data()
		})),
		placements: reader.array(() => ({
			asset: readGraphicsKey(reader),
			logicalPlacementId: reader.u32(),
			x: reader.u16(),
			y: reader.u16(),
			cols: reader.u32(),
			rows: reader.u32(),
			sourceX: reader.u32(),
			sourceY: reader.u32(),
			sourceWidth: reader.u32(),
			sourceHeight: reader.u32(),
			xOffset: reader.u32(),
			yOffset: reader.u32(),
			z: reader.i32(),
			scrollbackOffset: reader.u32()
		})),
		retainedAssets: reader.array(() => readGraphicsKey(reader))
	};
}
function readPopupSize(reader) {
	const kind = reader.choice(["cells", "percent"]);
	return {
		kind,
		value: kind === "cells" ? reader.u16() : reader.byte()
	};
}
function readPopup(reader) {
	return {
		terminalId: reader.text(),
		title: reader.text(),
		width: reader.optional(() => readPopupSize(reader)),
		height: reader.optional(() => readPopupSize(reader)),
		frame: readFrame(reader),
		mouseReporting: reader.bool(),
		sgrPixelMouse: reader.bool(),
		pixelWidth: reader.u32(),
		pixelHeight: reader.u32()
	};
}
function readSurface(reader) {
	return {
		bootId: reader.text(),
		projectionRevision: reader.uint(),
		surfaceRevision: reader.uint(),
		frame: readFrame(reader),
		panes: reader.array(() => readSurfacePane(reader)),
		splits: reader.array(() => ({
			direction: reader.choice(["horizontal", "vertical"]),
			pos: reader.u16(),
			area: readRect(reader),
			hitRect: readRect(reader),
			path: reader.array(() => reader.bool())
		})),
		popup: reader.optional(() => readPopup(reader)),
		graphics: readGraphicsScene(reader)
	};
}
function readPatch(reader) {
	return {
		bootId: reader.text(),
		projectionRevision: reader.uint(),
		baseSurfaceRevision: reader.uint(),
		surfaceRevision: reader.uint(),
		rows: reader.array(() => ({
			x: reader.u16(),
			y: reader.u16(),
			cells: reader.array(() => readCell(reader))
		})),
		panes: reader.array(() => readSurfacePane(reader)),
		cursor: reader.optional(() => readCursor(reader))
	};
}
function readServerMessage(reader) {
	switch (reader.u32()) {
		case 2: return {
			kind: "graphics",
			bytes: reader.data()
		};
		case 3: return {
			kind: "shutdown",
			reason: reader.optional(() => reader.text())
		};
		case 4: return {
			kind: "notify",
			delivery: reader.choice([
				"sound",
				"toast",
				"systemToast"
			]),
			message: reader.text(),
			body: reader.optional(() => reader.text())
		};
		case 5: return {
			kind: "clipboard",
			data: reader.text()
		};
		case 6: return {
			kind: "windowTitle",
			title: reader.optional(() => reader.text())
		};
		case 7: return { kind: "reloadSoundConfig" };
		case 8: return {
			kind: "mouseCapture",
			enabled: reader.bool(),
			sgrPixels: reader.bool()
		};
		case 9: return {
			kind: "terminalBell",
			count: reader.u16()
		};
		case 10: return {
			kind: "graphicsFile",
			path: reader.text(),
			expectedLength: reader.uint(),
			imageId: reader.u32(),
			transferId: reader.uint(),
			leading: reader.data(),
			control: reader.text(),
			surfaceAsset: reader.optional(() => readGraphicsKey(reader))
		};
		case 11: return {
			kind: "graphicsRetired",
			transferId: reader.uint(),
			imageId: reader.u32()
		};
		case 13: return {
			kind: "surface",
			surface: readSurface(reader)
		};
		case 14: return {
			kind: "notification",
			notification: {
				kind: reader.choice([
					"needsAttention",
					"finished",
					"updateInstalled",
					"custom"
				]),
				title: reader.text(),
				body: reader.optional(() => reader.text()),
				sound: reader.optional(() => reader.choice(["done", "request"])),
				agent: reader.optional(() => reader.text()),
				workspaceId: reader.optional(() => reader.text()),
				tabId: reader.optional(() => reader.text()),
				paneId: reader.optional(() => reader.text()),
				position: reader.optional(() => reader.choice([
					"topLeft",
					"topRight",
					"bottomLeft",
					"bottomRight"
				]))
			}
		};
		case 15: return {
			kind: "error",
			message: reader.text()
		};
		case 16: return {
			kind: "keyboardProtocol",
			flags: reader.u16(),
			modifyOtherKeysLevel: reader.byte()
		};
		case 17: return {
			kind: "keyboardReportAll",
			enabled: reader.bool()
		};
		case 18: return {
			kind: "response",
			bootId: reader.text(),
			requestId: reader.text(),
			finalChunk: reader.bool(),
			data: reader.data()
		};
		case 19: return {
			kind: "patch",
			patch: readPatch(reader)
		};
		case 20: return {
			kind: "control",
			name: reader.text(),
			data: reader.text()
		};
		default: throw new HerdrEndpointInvalidMessage("unsupported_message");
	}
}
/** Decodes one complete bincode payload, rejecting trailing bytes and unsafe integer conversions. @category decoding @since 0.9.0 */
function decodeEndpointMessage(payload) {
	return Result.try({
		try: () => {
			const reader = new EndpointReader(Buffer$1.from(payload));
			const message = readServerMessage(reader);
			reader.finish();
			return message;
		},
		catch: (cause) => cause instanceof HerdrEndpointInvalidMessage ? cause : new HerdrEndpointInvalidMessage("framing")
	});
}
function encodeUnsigned(value) {
	if (!Number.isSafeInteger(value) || value < 0) throw new HerdrEndpointInvalidMessage("framing");
	if (value <= 250) return Buffer$1.from([value]);
	if (value <= 65535) {
		const bytes = Buffer$1.alloc(3);
		bytes[0] = 251;
		bytes.writeUInt16LE(value, 1);
		return bytes;
	}
	if (value <= 4294967295) {
		const bytes = Buffer$1.alloc(5);
		bytes[0] = 252;
		bytes.writeUInt32LE(value, 1);
		return bytes;
	}
	const bytes = Buffer$1.alloc(9);
	bytes[0] = 253;
	bytes.writeBigUInt64LE(BigInt(value), 1);
	return bytes;
}
function encodeText(text) {
	const bytes = Buffer$1.from(text, "utf8");
	return Buffer$1.concat([encodeUnsigned(bytes.length), bytes]);
}
function frameEndpointPayload(parts) {
	const payload = Buffer$1.concat(parts);
	if (payload.length > MAX_FRAME_BYTES) throw new HerdrEndpointInvalidMessage("oversized_frame");
	const header = Buffer$1.alloc(4);
	header.writeUInt32LE(payload.length);
	return Buffer$1.concat([header, payload]);
}
/** Encodes a named generation-1 client control as a complete framed message. @category encoding @since 0.9.0 */
function encodeEndpointControl(kind, data) {
	return frameEndpointPayload([
		encodeUnsigned(20),
		encodeText(kind),
		encodeText(data)
	]);
}
/** Encodes one request bound to the endpoint process that issued its projection. @category encoding @since 0.9.0 */
function encodeEndpointRequest(bootId, request) {
	return frameEndpointPayload([
		encodeUnsigned(15),
		encodeText(bootId),
		encodeText(request)
	]);
}
/** Encodes one semantic paste/text commit for a stable pane or popup target. @category encoding @since 0.9.0 */
function encodeEndpointText(target, id, text, mode) {
	return frameEndpointPayload([
		encodeUnsigned(target === "pane" ? 13 : 14),
		encodeText(id),
		encodeUnsigned(1),
		encodeUnsigned(mode === "paste" ? 3 : 1),
		encodeText(text)
	]);
}
const endpointNamedKeys = {
	backspace: 0,
	enter: 1,
	left: 2,
	right: 3,
	up: 4,
	down: 5,
	home: 6,
	end: 7,
	pageUp: 8,
	pageDown: 9,
	tab: 10,
	backTab: 11,
	delete: 12,
	insert: 13,
	escape: 14,
	null: 17
};
function encodeOptional(value, encode) {
	return value === void 0 ? Buffer$1.from([0]) : Buffer$1.concat([Buffer$1.from([1]), encode(value)]);
}
/** Encodes a parsed semantic key lifecycle event, including optional Windows identity. @category encoding @since 0.9.0 */
function encodeEndpointKey(target, id, input) {
	const key = input.code.kind === "named" ? encodeUnsigned(endpointNamedKeys[input.code.name]) : input.code.kind === "function" ? Buffer$1.from([16, input.code.number]) : Buffer$1.concat([Buffer$1.from([15]), Buffer$1.from(input.code.character, "utf8")]);
	return frameEndpointPayload([
		encodeUnsigned(target === "pane" ? 13 : 14),
		encodeText(id),
		encodeUnsigned(1),
		encodeUnsigned(0),
		key,
		Buffer$1.from([input.modifiers ?? 0]),
		encodeUnsigned(input.phase === "repeat" ? 1 : input.phase === "release" ? 2 : 0),
		encodeUnsigned(input.repeatCount ?? 1),
		encodeOptional(input.shiftedCodepoint, encodeUnsigned),
		encodeOptional(input.generatedText, encodeText),
		Buffer$1.from([input.tracksRelease ? 1 : 0]),
		encodeOptional(input.physicalKeyId, encodeUnsigned),
		encodeOptional(input.windowsRecord, (record) => Buffer$1.concat([
			Buffer$1.from([record.keyDown ? 1 : 0]),
			encodeUnsigned(record.repeatCount),
			encodeUnsigned(record.virtualKeyCode),
			encodeUnsigned(record.virtualScanCode),
			encodeUnsigned(record.unicode),
			encodeUnsigned(record.controlKeyState)
		]))
	]);
}
/** Encodes a parsed cell/pixel mouse event for an explicit pane or popup target. @category encoding @since 0.9.0 */
function encodeEndpointMouse(target, id, input) {
	const actions = {
		down: 0,
		up: 1,
		drag: 2,
		move: 3,
		scrollUp: 4,
		scrollDown: 5,
		scrollLeft: 6,
		scrollRight: 7
	};
	const buttons = {
		left: 0,
		right: 1,
		middle: 2
	};
	const position = input.position;
	return frameEndpointPayload([
		encodeUnsigned(target === "pane" ? 13 : 14),
		encodeText(id),
		encodeUnsigned(1),
		encodeUnsigned(2),
		encodeUnsigned(actions[input.gesture.action]),
		..."button" in input.gesture ? [encodeUnsigned(buttons[input.gesture.button])] : [],
		encodeUnsigned(position.units === "cells" ? 0 : 1),
		...position.units === "pixels" ? [encodeUnsigned(position.x), encodeUnsigned(position.y)] : [],
		encodeUnsigned(position.column),
		encodeUnsigned(position.row),
		encodeOptional(input.geometry, (geometry) => Buffer$1.concat([
			encodeUnsigned(geometry.columns),
			encodeUnsigned(geometry.rows),
			encodeUnsigned(geometry.widthPixels),
			encodeUnsigned(geometry.heightPixels)
		])),
		Buffer$1.from([input.modifiers ?? 0]),
		encodeUnsigned(input.lines ?? 1)
	]);
}
/** Encodes the surface dimensions used by the client shell, not the entire host terminal. @category encoding @since 0.9.0 */
function encodeEndpointResize(columns, rows, cellWidth, cellHeight, pixelMouse) {
	return frameEndpointPayload([
		encodeUnsigned(12),
		encodeUnsigned(cellWidth),
		encodeUnsigned(cellHeight),
		encodeUnsigned(columns),
		encodeUnsigned(rows),
		Buffer$1.from([pixelMouse ? 1 : 0])
	]);
}
/** Encodes client-local focus or mouse-capture preference, never a global focus command. @category encoding @since 0.9.0 */
function encodeEndpointPreference(preference, enabled) {
	return frameEndpointPayload([encodeUnsigned(preference === "focus" ? 18 : 19), Buffer$1.from([enabled ? 1 : 0])]);
}
function encodeHostColor(color) {
	return Buffer$1.from([
		color.r,
		color.g,
		color.b
	]);
}
/**
* Encodes a parsed host terminal theme update (`ClientShellHostTheme`, client message tag 17).
* @category encoding @since 0.9.5
*/
function encodeEndpointHostTheme(input) {
	const update = input.kind === "defaultColor" ? [
		encodeUnsigned(0),
		encodeUnsigned(input.target === "foreground" ? 0 : 1),
		encodeHostColor(input.color)
	] : input.kind === "palette" ? [
		encodeUnsigned(1),
		encodeUnsigned(input.colors.length),
		...input.colors.flatMap((entry) => [Buffer$1.from([entry.index]), encodeHostColor(entry.color)])
	] : [encodeUnsigned(2), encodeUnsigned(input.appearance === "dark" ? 0 : 1)];
	return frameEndpointPayload([encodeUnsigned(17), ...update]);
}
//#endregion
//#region src/herdr-endpoint-transport.ts
/**
* Owns a bounded, scoped generation-1 client-shell connection and its correlated requests.
* Binary reads, health probes, and response routing are independent of presentation consumers.
* @since 0.9.0
*/
const EndpointWelcome = Schema.Struct({
	generation: Schema.Natural,
	server_version: Schema.String,
	snapshot_codec: Schema.String,
	surface_codec: Schema.String,
	input_codec: Schema.String,
	blob_codec: Schema.String,
	methods: Schema.Array(Schema.String),
	capabilities: Schema.Array(Schema.String),
	error: Schema.OptionFromOptionalNullOr(Schema.Struct({
		code: Schema.String,
		message: Schema.String
	}))
});
const parseWelcome = Schema.decodeEffect(Schema.fromJsonString(EndpointWelcome));
const parseEndpointErrorBody = Schema.decodeUnknownEffect(Schema.Struct({
	code: Schema.String,
	message: Schema.String
}));
function connectEndpointSocket(path) {
	return Effect.callback((resume) => {
		const socket = createConnection(resolveHerdrSocketEndpoint(path));
		let connected = false;
		const onError = () => {
			if (!connected) resume(Effect.fail(new HerdrEndpointTransportError("connect")));
		};
		socket.on("error", onError);
		socket.once("close", () => socket.off("error", onError));
		socket.once("connect", () => {
			connected = true;
			resume(Effect.succeed(socket));
		});
		return Effect.sync(() => {
			if (!connected) socket.destroy();
		});
	});
}
/** Acquires one endpoint socket with bounded framing and complete callback cancellation cleanup. @category constructors @since 0.9.0 */
const acquireEndpointConnection = (settings) => Effect.gen(function* () {
	const socket = yield* Effect.acquireRelease(connectEndpointSocket(settings.socketPath).pipe(Effect.timeoutOrElse({
		duration: settings.timeoutMs,
		orElse: () => Effect.fail(new HerdrEndpointRequestTimeout("connect"))
	}), Effect.interruptible), (connection) => Effect.sync(() => {
		connection.destroy();
	}));
	const stopped = yield* Deferred.make();
	const welcomeReady = yield* Deferred.make();
	const pending = /* @__PURE__ */ new Map();
	const writeLock = yield* Semaphore.make(1);
	const routeLock = yield* Semaphore.make(1);
	let closed = false;
	let bootId;
	let welcomed = false;
	let handler;
	const earlyMessages = [];
	let earlyBytes = 0;
	const ensureOpen = Effect.suspend(() => closed ? Effect.fail(new HerdrEndpointClosed()) : Effect.void);
	const fail = (error) => Effect.gen(function* () {
		if (closed) return;
		closed = true;
		socket.destroy();
		yield* Deferred.fail(stopped, error);
		yield* Deferred.fail(welcomeReady, error);
		for (const entry of pending.values()) yield* Deferred.fail(entry.result, error);
		pending.clear();
		earlyMessages.length = 0;
		earlyBytes = 0;
	});
	yield* Effect.addFinalizer(() => fail(new HerdrEndpointClosed()));
	const write = (encode) => writeLock.withPermit(Effect.gen(function* () {
		yield* ensureOpen;
		const bytes = yield* Effect.try({
			try: encode,
			catch: (error) => error instanceof HerdrEndpointInvalidMessage ? error : new HerdrEndpointInvalidMessage("framing")
		});
		if (bytes.length > settings.maximumBytes + 4) return yield* Effect.fail(new HerdrEndpointInvalidMessage("oversized_frame"));
		yield* Effect.callback((resume) => {
			socket.write(bytes, (error) => resume(error ? Effect.fail(new HerdrEndpointTransportError("write")) : Effect.void));
		}).pipe(Effect.timeoutOrElse({
			duration: settings.timeoutMs,
			orElse: () => Effect.fail(new HerdrEndpointRequestTimeout("write"))
		}), Effect.onExit((exit) => Exit.isFailure(exit) ? fail(Option.getOrElse(Cause.findErrorOption(exit.cause), () => new HerdrEndpointClosed())) : Effect.void));
	}));
	const receive = (message, byteLength) => Effect.gen(function* () {
		if (!welcomed) {
			if (message.kind !== "control" || message.name !== "endpoint.welcome.v1") return yield* Effect.fail(new HerdrEndpointNegotiationError("welcome"));
			const welcome = yield* parseWelcome(message.data).pipe(Effect.mapError(() => new HerdrEndpointNegotiationError("welcome")));
			if (Option.isSome(welcome.error)) return yield* Effect.fail(new HerdrEndpointNegotiationError("rejected"));
			if (welcome.generation !== 1) return yield* Effect.fail(new HerdrEndpointNegotiationError("generation"));
			if (welcome.snapshot_codec !== "shell.snapshot.v1" || welcome.surface_codec !== "shell.surface.v1" || welcome.input_codec !== "shell.input.semantic.v1" || welcome.blob_codec !== "shell.blob.v1") return yield* Effect.fail(new HerdrEndpointNegotiationError("codec"));
			if (!welcome.capabilities.includes("surface_interest") || !welcome.capabilities.includes("health_check")) return yield* Effect.fail(new HerdrEndpointNegotiationError("capability"));
			welcomed = true;
			yield* Deferred.succeed(welcomeReady, welcome);
			return;
		}
		if (message.kind === "shutdown") return yield* Effect.fail(new HerdrEndpointClosed());
		if (message.kind === "response") {
			const entry = pending.get(message.requestId);
			if (entry === void 0 || message.bootId !== bootId) return yield* Effect.fail(new HerdrEndpointInvalidMessage("correlation"));
			entry.byteLength += message.data.length;
			if ([...pending.values()].reduce((total, request) => total + request.byteLength, 0) > settings.maximumBytes || entry.chunks.length >= 4096 || message.data.length === 0 && !message.finalChunk) return yield* Effect.fail(new HerdrEndpointInvalidMessage("resource_limit"));
			entry.chunks.push(message.data);
			if (!message.finalChunk) return;
			const response = yield* Effect.try({
				try: () => parseHerdrWireResponse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer$1.concat(entry.chunks))), message.requestId),
				catch: () => new HerdrEndpointInvalidMessage("schema")
			});
			if (response.id !== message.requestId) return yield* Effect.fail(new HerdrEndpointInvalidMessage("correlation"));
			pending.delete(message.requestId);
			yield* Deferred.succeed(entry.result, response);
			return;
		}
		yield* routeLock.withPermit(Effect.gen(function* () {
			if (handler !== void 0) return yield* handler(message);
			earlyBytes += byteLength;
			if (earlyMessages.length >= 64 || earlyBytes > settings.maximumBytes) return yield* Effect.fail(new HerdrEndpointInvalidMessage("resource_limit"));
			earlyMessages.push(message);
		}));
	});
	let headerOffset = 0;
	const header = Buffer$1.alloc(4);
	let payload;
	let payloadOffset = 0;
	yield* NodeStream.fromReadable({
		evaluate: () => socket,
		onError: () => new HerdrEndpointTransportError("read")
	}).pipe(Stream.runForEach((chunk) => Effect.gen(function* () {
		let offset = 0;
		while (offset < chunk.length) {
			if (payload === void 0) {
				const count = Math.min(4 - headerOffset, chunk.length - offset);
				header.set(chunk.subarray(offset, offset + count), headerOffset);
				headerOffset += count;
				offset += count;
				if (headerOffset < 4) continue;
				const length = header.readUInt32LE();
				if (length === 0 || length > settings.maximumBytes) return yield* Effect.fail(new HerdrEndpointInvalidMessage("oversized_frame"));
				payload = Buffer$1.alloc(length);
				payloadOffset = 0;
				headerOffset = 0;
			}
			const count = Math.min(payload.length - payloadOffset, chunk.length - offset);
			payload.set(chunk.subarray(offset, offset + count), payloadOffset);
			payloadOffset += count;
			offset += count;
			if (payloadOffset === payload.length) {
				const message = yield* Result.match(decodeEndpointMessage(payload), {
					onFailure: Effect.fail,
					onSuccess: Effect.succeed
				});
				const length = payload.length;
				payload = void 0;
				payloadOffset = 0;
				yield* receive(message, length);
			}
		}
	})), Effect.andThen(Effect.fail(new HerdrEndpointTransportError("premature_close"))), Effect.catch(fail)).pipe(Effect.forkScoped);
	yield* write(() => encodeEndpointControl("endpoint.hello.v1", settings.hello));
	const welcome = yield* Deferred.await(welcomeReady).pipe(Effect.timeoutOrElse({
		duration: settings.timeoutMs,
		orElse: () => Effect.fail(new HerdrEndpointRequestTimeout("connect"))
	}), Effect.tapError(fail));
	const request = (method, params) => Effect.gen(function* () {
		yield* ensureOpen;
		if (!welcome.methods.includes(method)) return yield* Effect.fail(new HerdrEndpointUnsupportedMethod(method));
		if (bootId === void 0) return yield* Effect.fail(new HerdrEndpointInvalidMessage("revision"));
		if (pending.size >= 32) return yield* Effect.fail(new HerdrEndpointInvalidMessage("resource_limit"));
		const requestBootId = bootId;
		const requestId = randomUUID();
		const result = yield* Deferred.make();
		pending.set(requestId, {
			result,
			chunks: [],
			byteLength: 0
		});
		const response = yield* Effect.gen(function* () {
			yield* write(() => encodeEndpointRequest(requestBootId, encodeWireRequest(requestId, method, params).trimEnd()));
			return yield* Deferred.await(result);
		}).pipe(Effect.timeoutOrElse({
			duration: settings.timeoutMs,
			orElse: () => Effect.fail(new HerdrEndpointRequestTimeout("request"))
		}), Effect.onExit((exit) => Effect.gen(function* () {
			pending.delete(requestId);
			if (Exit.isFailure(exit)) yield* fail(Option.getOrElse(Cause.findErrorOption(exit.cause), () => new HerdrEndpointClosed()));
		})));
		if ("error" in response) {
			const error = yield* parseEndpointErrorBody(response.error).pipe(Effect.mapError(() => new HerdrEndpointInvalidMessage("schema")));
			return yield* Effect.fail(new HerdrServerError(error.code, error.message, requestId));
		}
		if (!isExpectedWireResult(method, response.result)) return yield* Effect.fail(new HerdrUnsupportedResult(method, response.result.type, method, requestId));
		return {
			requestId,
			result: response.result
		};
	});
	return {
		welcome,
		write,
		request,
		failure: Deferred.await(stopped),
		ensureOpen,
		fail,
		ensureHealthy: Effect.suspend(() => closed ? Deferred.await(stopped) : Effect.void),
		bindBoot: (id) => Effect.gen(function* () {
			yield* ensureOpen;
			if (bootId !== void 0 && bootId !== id) return yield* Effect.fail(new HerdrEndpointInvalidMessage("revision"));
			bootId = id;
		}),
		installHandler: (next) => routeLock.withPermit(Effect.gen(function* () {
			yield* ensureOpen;
			if (handler !== void 0) return yield* Effect.fail(new HerdrEndpointInvalidMessage("resource_limit"));
			handler = next;
			for (const message of earlyMessages) yield* next(message);
			earlyMessages.length = 0;
			earlyBytes = 0;
		}))
	};
});
//#endregion
//#region src/herdr-client-shell-state.ts
/**
* Applies complete-surface-dependent patches without mutating previously published frames.
* Boot, projection, base revision, and row bounds are independent runtime invariants.
* @since 0.9.0
*/
function graphicsIdentity(key) {
	const source = key.source;
	const identity = source.kind === "paneLayer" ? [
		"layer",
		source.paneId,
		source.layerId
	] : source.target.kind === "pane" ? [
		"pane",
		source.target.paneId,
		source.imageId
	] : [
		"popup",
		source.target.terminalId,
		source.imageId
	];
	return JSON.stringify([
		...identity,
		key.imageWidth,
		key.imageHeight,
		key.format,
		key.dataLength,
		key.dataFingerprint.toString()
	]);
}
/** Resolves a complete graphics scene before coalescing surfaces so skipped updates cannot lose image bytes. @category models @since 0.9.0 */
function retainClientShellGraphics(previous, surface, maximumBytes) {
	const available = new Map(previous?.graphics.assets.map((asset) => [graphicsIdentity(asset.key), asset]) ?? []);
	for (const asset of surface.graphics.assets) {
		if (asset.data.length !== asset.key.dataLength) return Result.fail(new HerdrEndpointInvalidMessage("schema"));
		available.set(graphicsIdentity(asset.key), asset);
	}
	const required = /* @__PURE__ */ new Set([...surface.graphics.placements.map((placement) => graphicsIdentity(placement.asset)), ...surface.graphics.retainedAssets.map(graphicsIdentity)]);
	const assets = [];
	let bytes = 0;
	for (const identity of required) {
		const asset = available.get(identity);
		if (asset === void 0) return Result.fail(new HerdrEndpointInvalidMessage("revision"));
		bytes += asset.data.length;
		if (bytes > maximumBytes) return Result.fail(new HerdrEndpointInvalidMessage("resource_limit"));
		assets.push(asset);
	}
	return Result.succeed({
		...surface,
		graphics: {
			...surface.graphics,
			assets
		}
	});
}
/** Applies an exact-base surface patch or fails; never guesses a missing base frame. @category models @since 0.9.0 */
function applyClientShellSurfacePatch(surface, patch) {
	if (surface.bootId !== patch.bootId || surface.projectionRevision !== patch.projectionRevision || surface.surfaceRevision !== patch.baseSurfaceRevision || patch.surfaceRevision <= surface.surfaceRevision) return Result.fail(new HerdrEndpointInvalidMessage("revision"));
	const cells = [...surface.frame.cells];
	for (const row of patch.rows) {
		if (row.y >= surface.frame.height || row.x + row.cells.length > surface.frame.width) return Result.fail(new HerdrEndpointInvalidMessage("revision"));
		for (const [index, cell] of row.cells.entries()) cells[row.y * surface.frame.width + row.x + index] = cell;
	}
	const panes = new Map(surface.panes.map((pane) => [pane.paneId, pane]));
	for (const pane of patch.panes) {
		if (!panes.has(pane.paneId)) return Result.fail(new HerdrEndpointInvalidMessage("revision"));
		panes.set(pane.paneId, pane);
	}
	return Result.succeed({
		...surface,
		surfaceRevision: patch.surfaceRevision,
		frame: {
			...surface.frame,
			cells,
			cursor: patch.cursor
		},
		panes: [...panes.values()]
	});
}
//#endregion
//#region src/herdr-client-shell-input.ts
/**
* Models semantic pane input independently from host-terminal escape sequences.
* Domain discriminators are used only for composable key/mouse values; no public input requires _tag.
* @since 0.9.0
*/
const U8 = Schema.Natural.check(Schema.isLessThanOrEqualTo(255));
const U16 = Schema.Natural.check(Schema.isLessThanOrEqualTo(65535));
const U32 = Schema.Natural.check(Schema.isLessThanOrEqualTo(4294967295));
/** A named key, Unicode scalar, or function key for semantic endpoint input. @category schemas @since 0.9.0 */
const ClientShellKeyCode = Schema.Union([
	Schema.Struct({
		kind: Schema.Literal("named"),
		name: Schema.Literals([
			"backspace",
			"enter",
			"left",
			"right",
			"up",
			"down",
			"home",
			"end",
			"pageUp",
			"pageDown",
			"tab",
			"backTab",
			"delete",
			"insert",
			"escape",
			"null"
		])
	}),
	Schema.Struct({
		kind: Schema.Literal("character"),
		character: Schema.String.check(Schema.makeFilter((text) => Array.from(text).length === 1 && !/^[\uD800-\uDFFF]$/.test(text) || "Endpoint key must be one Unicode scalar"))
	}),
	Schema.Struct({
		kind: Schema.Literal("function"),
		number: U8
	})
]);
/** Windows console key identity, when input originates from a native record. @category schemas @since 0.9.0 */
const ClientShellWindowsKeyRecord = Schema.Struct({
	keyDown: Schema.Boolean,
	repeatCount: U16,
	virtualKeyCode: U16,
	virtualScanCode: U16,
	unicode: U16,
	controlKeyState: U32
});
/** Semantic key lifecycle and optional native identity. @category schemas @since 0.9.0 */
const ClientShellKeyInput = Schema.Struct({
	code: ClientShellKeyCode,
	modifiers: Schema.optionalKey(U8),
	phase: Schema.optionalKey(Schema.Literals([
		"press",
		"repeat",
		"release"
	])),
	repeatCount: Schema.optionalKey(U16),
	shiftedCodepoint: Schema.optionalKey(U32),
	generatedText: Schema.optionalKey(Schema.String),
	tracksRelease: Schema.optionalKey(Schema.Boolean),
	physicalKeyId: Schema.optionalKey(U32),
	windowsRecord: Schema.optionalKey(ClientShellWindowsKeyRecord)
});
/** Mouse action, optionally identifying a button. @category schemas @since 0.9.0 */
const ClientShellMouseAction = Schema.Union([Schema.Struct({
	action: Schema.Literals([
		"down",
		"up",
		"drag"
	]),
	button: Schema.Literals([
		"left",
		"right",
		"middle"
	])
}), Schema.Struct({ action: Schema.Literals([
	"move",
	"scrollUp",
	"scrollDown",
	"scrollLeft",
	"scrollRight"
]) })]);
/** Mouse coordinates distinguish terminal cells from exact pixels. @category schemas @since 0.9.0 */
const ClientShellMousePosition = Schema.Union([Schema.Struct({
	units: Schema.Literal("cells"),
	column: U16,
	row: U16
}), Schema.Struct({
	units: Schema.Literal("pixels"),
	x: U32,
	y: U32,
	column: U16,
	row: U16
})]);
/** Semantic mouse input with optional coherent target geometry. @category schemas @since 0.9.0 */
const ClientShellMouseInput = Schema.Struct({
	gesture: ClientShellMouseAction,
	position: ClientShellMousePosition,
	geometry: Schema.optionalKey(Schema.Struct({
		columns: U16,
		rows: U16,
		widthPixels: U32,
		heightPixels: U32
	})),
	modifiers: Schema.optionalKey(U8),
	lines: Schema.optionalKey(U16)
});
/** One host terminal RGB color; each channel is an 8-bit integer from 0 to 255. @category schemas @since 0.9.5 */
const ClientShellHostColor = Schema.Struct({
	r: U8,
	g: U8,
	b: U8
});
/**
* Maximum palette entries in one host theme update, matching Herdr's client-side batching bound.
* @category constants @since 0.9.5
*/
const CLIENT_SHELL_HOST_PALETTE_MAX_ENTRIES = 256;
/**
* One outer (host) terminal theme update forwarded so pane applications pick matching colors:
* a default foreground/background color, 1–256 indexed palette colors, or the light/dark appearance.
* A background color also infers appearance on the server unless one was set explicitly.
* @category schemas @since 0.9.5
*/
const ClientShellHostThemeInput = Schema.Union([
	Schema.Struct({
		kind: Schema.Literal("defaultColor"),
		target: Schema.Literals(["foreground", "background"]),
		color: ClientShellHostColor
	}),
	Schema.Struct({
		kind: Schema.Literal("palette"),
		colors: Schema.Array(Schema.Struct({
			index: U8,
			color: ClientShellHostColor
		})).check(Schema.isLengthBetween(1, 256))
	}),
	Schema.Struct({
		kind: Schema.Literal("appearance"),
		appearance: Schema.Literals(["dark", "light"])
	})
]);
//#endregion
//#region src/client-shell-service.ts
/**
* Provides callback-owned client-shell sessions and stream-owned projection subscriptions.
* Acquiring the SDK does not connect an endpoint; every endpoint lifetime has an explicit owner.
* @since 0.9.0
*/
const PositiveU16 = Schema.Int.check(Schema.isBetween({
	minimum: 1,
	maximum: 65535
}));
const PixelSize = Schema.Natural.check(Schema.isLessThanOrEqualTo(4294967295));
const Deadline = Schema.Int.check(Schema.isBetween({
	minimum: 1,
	maximum: 2147483647
}));
/** Geometry and resource bounds for one explicit endpoint session. @category schemas @since 0.9.0 */
const ClientShellConnectInput = Schema.Struct({
	socketPath: Schema.optionalKey(HerdrAbsolutePath),
	surface: Schema.Struct({
		columns: PositiveU16,
		rows: PositiveU16
	}),
	cellPixels: Schema.Struct({
		width: PixelSize,
		height: PixelSize
	}),
	initialSurface: Schema.optionalKey(Schema.Literals(["inactive", "active"])),
	mouseCapture: Schema.optionalKey(Schema.Boolean),
	endpointKeybindings: Schema.optionalKey(Schema.Boolean),
	timeoutMs: Schema.optionalKey(Deadline),
	healthIntervalMs: Schema.optionalKey(Deadline),
	maximumMessageBytes: Schema.optionalKey(Schema.Int.check(Schema.isBetween({
		minimum: 1024,
		maximum: 32 * 1024 * 1024
	})))
});
const parseConnect = Schema.decodeEffect(ClientShellConnectInput, { onExcessProperty: "error" });
const parseProjection = Schema.decodeEffect(Schema.fromJsonString(ClientShellProjection));
const parseAgentCompletions = Schema.decodeOption(Schema.fromJsonString(ClientShellAgentCompletions));
const parseAgentViewProjection = Schema.decodeOption(Schema.fromJsonString(ClientShellAgentViewProjection));
const parseAgentViewDefinition = Schema.decodeUnknownOption(AgentViewSetInput);
/** Classifies a companion's opaque view; an undecodable view never fails the connection. */
function classifyClientShellAgentView(projection) {
	if (Option.isNone(projection.view)) return { status: "none" };
	const view = parseAgentViewDefinition(projection.view.value);
	return Option.isSome(view) ? {
		status: "active",
		view: view.value
	} : { status: "unrecognized" };
}
const parseSurface = Schema.decodeEffect(ClientShellSurface);
const parsePresentationEvent = Schema.decodeEffect(ClientShellPresentationEvent);
const parseKey = Schema.decodeEffect(ClientShellKeyInput, { onExcessProperty: "error" });
const parseMouse = Schema.decodeEffect(ClientShellMouseInput, { onExcessProperty: "error" });
const parseHostTheme = Schema.decodeEffect(ClientShellHostThemeInput, { onExcessProperty: "error" });
const parsePatch = Schema.decodeEffect(ClientShellSurfacePatch);
const parseAcknowledgement = Schema.decodeEffect(ClientShellSurfaceAcknowledgement);
const parsePaneCommand = Schema.decodeEffect(CommandPaneInput, { onExcessProperty: "error" });
const parseTabCommand = Schema.decodeEffect(CommandTabInput, { onExcessProperty: "error" });
const parseAnnouncement = Schema.decodeEffect(ProductAnnouncementDismissInput, { onExcessProperty: "error" });
const parseNotes = Schema.decodeEffect(ReleaseNotesDismissInput, { onExcessProperty: "error" });
const SurfaceSetInput = Schema.Struct({ active: Schema.Boolean });
const parseSurfaceSet = Schema.decodeEffect(SurfaceSetInput, { onExcessProperty: "error" });
const TextInput = Schema.Struct({ text: Schema.String.check(Schema.isMaxLength(1e6)) });
const parseText = Schema.decodeEffect(TextInput, { onExcessProperty: "error" });
const ResizeInput = Schema.Struct({
	surface: ClientShellConnectInput.fields.surface,
	cellPixels: ClientShellConnectInput.fields.cellPixels
});
const parseResize = Schema.decodeEffect(ResizeInput, { onExcessProperty: "error" });
/** Yieldable client-shell endpoint capability. @category services @since 0.9.0 */
var ClientShellService = class extends Context.Service()("@herdr/sdk/ClientShellService") {};
/** Constructs lazy endpoint acquisition using the shared API configuration and compatibility gate. @category constructors @since 0.9.0 */
const makeClientShellService = Effect.gen(function* () {
	const config = yield* HerdrConfig;
	const transport = yield* HerdrTransport;
	const acquire = (input) => Effect.gen(function* () {
		const parsed = yield* decodeHerdrInput("ClientShellService.connectScoped", parseConnect, input);
		yield* transport.request("ping", {});
		const timeoutMs = parsed.timeoutMs ?? 1e4;
		const maximumBytes = parsed.maximumMessageBytes ?? 32 * 1024 * 1024;
		const wire = yield* acquireEndpointConnection({
			socketPath: parsed.socketPath ?? join(dirname(config.socketPath), "herdr-client.sock"),
			timeoutMs,
			maximumBytes,
			hello: JSON.stringify({
				generation: 1,
				cell_width_px: parsed.cellPixels.width,
				cell_height_px: parsed.cellPixels.height,
				surface_size: {
					cols: parsed.surface.columns,
					rows: parsed.surface.rows
				},
				pixel_mouse: false,
				direct_graphics: false,
				endpoint_keybindings: parsed.endpointKeybindings ?? false,
				mouse_capture: parsed.mouseCapture ?? false,
				surface_active: false,
				snapshot_codecs: ["shell.snapshot.v1"],
				surface_codecs: ["shell.surface.v1"],
				input_codecs: ["shell.input.semantic.v1"],
				blob_codecs: ["shell.blob.v1"]
			})
		});
		const firstProjection = yield* Deferred.make();
		const projectionChanges = yield* PubSub.sliding(1);
		const surfaceChanges = yield* PubSub.sliding(1);
		const presentationEvents = yield* PubSub.dropping(8);
		yield* Effect.addFinalizer(() => Effect.gen(function* () {
			yield* PubSub.shutdown(projectionChanges);
			yield* PubSub.shutdown(surfaceChanges);
			yield* PubSub.shutdown(presentationEvents);
		}));
		const surfaceLock = yield* Semaphore.make(1);
		let currentProjection;
		let currentSurface;
		let surfaceState = { status: "inactive" };
		let commands = /* @__PURE__ */ new WeakSet();
		let healthPong;
		let pendingCompletions;
		let pendingAgentView;
		let attachedAgentView;
		let attachedCompletions;
		const publishSurface = (state) => Effect.gen(function* () {
			surfaceState = state;
			yield* PubSub.publish(surfaceChanges, state);
		});
		const acceptSurface = (surface) => Effect.gen(function* () {
			if (currentProjection === void 0 || surface.bootId !== currentProjection.bootId) return yield* Effect.fail(new HerdrEndpointInvalidMessage("revision"));
			if (surface.projectionRevision > currentProjection.revision) return yield* Effect.fail(new HerdrEndpointInvalidMessage("revision"));
			if (currentSurface !== void 0 && surface.surfaceRevision <= currentSurface.surfaceRevision) return;
			const complete = yield* Result.match(retainClientShellGraphics(currentSurface, surface, maximumBytes), {
				onFailure: Effect.fail,
				onSuccess: Effect.succeed
			});
			currentSurface = complete;
			if ((surfaceState.status === "active" || surfaceState.status === "awaitingSurface") && surface.projectionRevision >= surfaceState.projectionFloor) yield* publishSurface({
				status: "active",
				bootId: surface.bootId,
				projectionFloor: surfaceState.projectionFloor,
				surface: complete
			});
		});
		yield* wire.installHandler((message) => Effect.gen(function* () {
			if (message.kind === "control") {
				if (message.name === "endpoint.health.pong.v1") {
					if (healthPong !== void 0) yield* Deferred.succeed(healthPong, void 0);
					return;
				}
				if (message.name === "endpoint.agent-completions.v1") {
					const parsedCompletions = parseAgentCompletions(message.data);
					if (Option.isNone(parsedCompletions)) return;
					const completions = parsedCompletions.value;
					if (pendingCompletions?.bootId === completions.bootId && pendingCompletions.revision >= completions.revision) return;
					pendingCompletions = completions;
					return;
				}
				if (message.name === "endpoint.agent-view.v1") {
					const parsedAgentView = parseAgentViewProjection(message.data);
					if (Option.isNone(parsedAgentView)) return;
					const companion = parsedAgentView.value;
					const current = currentProjection;
					if (current?.bootId === companion.bootId && current.revision === companion.revision) {
						if (attachedAgentView !== void 0) return;
						attachedAgentView = companion;
						currentProjection = {
							...current,
							agentView: classifyClientShellAgentView(companion)
						};
						yield* PubSub.publish(projectionChanges, currentProjection);
						return;
					}
					if (pendingAgentView?.bootId === companion.bootId && pendingAgentView.revision >= companion.revision) return;
					pendingAgentView = companion;
					return;
				}
				if (message.name === "shell.snapshot.v1") {
					const decoded = yield* parseProjection(message.data).pipe(Effect.mapError(() => new HerdrEndpointInvalidMessage("schema")));
					yield* wire.bindBoot(decoded.bootId);
					if (currentProjection !== void 0 && decoded.revision < currentProjection.revision) return;
					const replacesCurrentRevision = currentProjection?.revision === decoded.revision;
					const matchesSnapshot = (companion) => companion?.bootId === decoded.bootId && companion.revision === decoded.revision;
					const completionsCompanion = pendingCompletions;
					pendingCompletions = void 0;
					attachedCompletions = matchesSnapshot(completionsCompanion) ? completionsCompanion : replacesCurrentRevision ? attachedCompletions : void 0;
					const completions = attachedCompletions;
					const agentViewCompanion = pendingAgentView;
					pendingAgentView = void 0;
					attachedAgentView = matchesSnapshot(agentViewCompanion) ? agentViewCompanion : replacesCurrentRevision ? attachedAgentView : void 0;
					const agentView = attachedAgentView === void 0 ? { status: "none" } : classifyClientShellAgentView(attachedAgentView);
					const projection = completions !== void 0 ? {
						...decoded,
						agentView,
						agents: decoded.agents.map((agent) => ({
							...agent,
							completionSeq: Object.hasOwn(completions.completions, agent.paneId) ? Option.fromNullishOr(completions.completions[agent.paneId]) : Option.none()
						}))
					} : {
						...decoded,
						agentView
					};
					currentProjection = projection;
					if (surfaceState.status === "active" && surfaceState.surface.projectionRevision < projection.revision) yield* publishSurface({
						status: "awaitingSurface",
						bootId: projection.bootId,
						projectionFloor: projection.revision
					});
					for (const command of projection.commands) commands.add(command);
					yield* Deferred.succeed(firstProjection, projection);
					yield* PubSub.publish(projectionChanges, projection);
					return;
				}
				if (message.name.startsWith("shell.snapshot.")) return yield* Effect.fail(new HerdrEndpointInvalidMessage("unsupported_message"));
				return;
			}
			if (message.kind === "surface") {
				const surface = yield* parseSurface(message.surface).pipe(Effect.mapError(() => new HerdrEndpointInvalidMessage("schema")));
				return yield* acceptSurface(surface);
			}
			if (message.kind === "patch") {
				const patch = yield* parsePatch(message.patch).pipe(Effect.mapError(() => new HerdrEndpointInvalidMessage("schema")));
				if (currentSurface === void 0) return yield* Effect.fail(new HerdrEndpointInvalidMessage("revision"));
				const surface = yield* Result.match(applyClientShellSurfacePatch(currentSurface, patch), {
					onFailure: Effect.fail,
					onSuccess: Effect.succeed
				});
				return yield* acceptSurface(surface);
			}
			if (message.kind === "graphicsFile") return yield* Effect.fail(new HerdrEndpointInvalidMessage("unsupported_message"));
			if (message.kind === "shutdown" || message.kind === "response" || message.kind === "graphicsRetired") return;
			const event = yield* parsePresentationEvent(message).pipe(Effect.mapError(() => new HerdrEndpointInvalidMessage("schema")));
			if (!(yield* PubSub.publish(presentationEvents, event))) return yield* Effect.fail(new HerdrEndpointInvalidMessage("resource_limit"));
		}));
		yield* Deferred.await(firstProjection).pipe(Effect.raceFirst(wire.failure), Effect.timeoutOrElse({
			duration: timeoutMs,
			orElse: () => Effect.fail(new HerdrEndpointRequestTimeout("connect"))
		}));
		const projections = Stream.unwrap(Effect.gen(function* () {
			yield* wire.ensureHealthy;
			const subscription = yield* PubSub.subscribe(projectionChanges);
			if (currentProjection === void 0) return yield* Effect.fail(new HerdrEndpointClosed());
			return Stream.concat(Stream.make(currentProjection), Stream.fromSubscription(subscription));
		})).pipe(Stream.interruptWhen(wire.failure));
		const surfaceStates = Stream.unwrap(Effect.gen(function* () {
			yield* wire.ensureHealthy;
			const subscription = yield* PubSub.subscribe(surfaceChanges);
			return Stream.concat(Stream.make(surfaceState), Stream.fromSubscription(subscription));
		})).pipe(Stream.interruptWhen(wire.failure));
		const assertCommand = (command) => Effect.gen(function* () {
			yield* wire.ensureOpen;
			if (!commands.has(command) || command.action === "unknown" || !currentProjection?.commands.some((current) => current.commandId === command.commandId)) return yield* Effect.fail(new HerdrEndpointStaleReference());
		});
		const sendText = (target, id, input, mode) => Effect.gen(function* () {
			const parsedText = yield* decodeHerdrInput("ClientShellConnection.input", parseText, input);
			yield* wire.write(() => encodeEndpointText(target, id, parsedText.text, mode));
		});
		const sendKey = (target, id, input) => Effect.gen(function* () {
			const key = yield* decodeHerdrInput("ClientShellConnection.input.key", parseKey, input);
			yield* wire.write(() => encodeEndpointKey(target, id, key));
		});
		const sendMouse = (target, id, input) => Effect.gen(function* () {
			const mouse = yield* decodeHerdrInput("ClientShellConnection.input.mouse", parseMouse, input);
			yield* wire.write(() => encodeEndpointMouse(target, id, mouse));
		});
		const parseBoolean = Schema.decodeEffect(Schema.Boolean);
		const preference = (name, input) => Effect.gen(function* () {
			const value = yield* decodeHerdrInput("ClientShellConnection.preference", parseBoolean, input);
			yield* wire.write(() => encodeEndpointPreference(name, value));
		});
		const connection = {
			snapshot: () => Effect.gen(function* () {
				yield* wire.ensureOpen;
				if (currentProjection === void 0) return yield* Effect.fail(new HerdrEndpointClosed());
				return currentProjection;
			}),
			projections,
			events: Stream.fromPubSub(presentationEvents).pipe(Stream.interruptWhen(wire.failure)),
			surface: {
				set: (input) => surfaceLock.withPermit(Effect.gen(function* () {
					const interest = yield* decodeHerdrInput("ClientShellConnection.surface.set", parseSurfaceSet, input);
					yield* wire.ensureOpen;
					if (currentProjection === void 0) return yield* Effect.fail(new HerdrEndpointClosed());
					const previousState = surfaceState;
					yield* publishSurface({ status: interest.active ? "activating" : "deactivating" });
					const response = yield* wire.request("client_shell.surface.set", interest).pipe(Effect.tapError((error) => {
						if (error._tag !== "HerdrServerError" && error._tag !== "HerdrEndpointUnsupportedMethod") return wire.fail(new HerdrEndpointInvalidMessage("schema"));
						return publishSurface(previousState.status === "active" && currentProjection !== void 0 && previousState.surface.projectionRevision < currentProjection.revision ? {
							status: "awaitingSurface",
							bootId: currentProjection.bootId,
							projectionFloor: currentProjection.revision
						} : previousState);
					}));
					const acknowledgement = yield* parseAcknowledgement(response.result).pipe(Effect.mapError(() => new HerdrEndpointInvalidMessage("schema")));
					if (acknowledgement.active !== interest.active) return yield* Effect.fail(new HerdrEndpointInvalidMessage("revision"));
					if (!interest.active) {
						yield* publishSurface({ status: "inactive" });
						return acknowledgement;
					}
					yield* publishSurface({
						status: "awaitingSurface",
						bootId: currentProjection.bootId,
						projectionFloor: acknowledgement.projectionRevision
					});
					if (currentSurface !== void 0 && currentSurface.projectionRevision >= acknowledgement.projectionRevision) yield* publishSurface({
						status: "active",
						bootId: currentProjection.bootId,
						projectionFloor: acknowledgement.projectionRevision,
						surface: currentSurface
					});
					return acknowledgement;
				}).pipe(Effect.tapError((error) => error instanceof HerdrEndpointInvalidMessage ? wire.fail(error) : Effect.void))),
				state: () => Effect.gen(function* () {
					yield* wire.ensureOpen;
					return surfaceState;
				}),
				states: surfaceStates,
				awaitReady: () => surfaceStates.pipe(Stream.filter((state) => state.status === "active"), Stream.map((state) => state.surface), Stream.runHead, Effect.flatMap((surface) => Option.isSome(surface) ? Effect.succeed(surface.value) : Effect.fail(new HerdrEndpointClosed())), Effect.timeoutOrElse({
					duration: timeoutMs,
					orElse: () => Effect.fail(new HerdrEndpointRequestTimeout("surface"))
				})),
				resize: (input) => Effect.gen(function* () {
					const size = yield* decodeHerdrInput("ClientShellConnection.surface.resize", parseResize, input);
					yield* wire.write(() => encodeEndpointResize(size.surface.columns, size.surface.rows, size.cellPixels.width, size.cellPixels.height, false));
				})
			},
			input: {
				key: (id, input) => sendKey("pane", id, input),
				mouse: (id, input) => sendMouse("pane", id, input),
				keyInPopup: (id, input) => sendKey("popup", id, input),
				mouseInPopup: (id, input) => sendMouse("popup", id, input),
				textInPopup: (id, input) => sendText("popup", id, input, "text"),
				paste: (id, input) => sendText("pane", id, input, "paste"),
				text: (id, input) => sendText("pane", id, input, "text"),
				pasteInPopup: (id, input) => sendText("popup", id, input, "paste")
			},
			commands: {
				invoke: (command) => Effect.gen(function* () {
					yield* assertCommand(command);
					yield* wire.request("command.invoke", { commandId: command.commandId });
				}),
				invokeInWorkspace: (command, workspaceId) => Effect.gen(function* () {
					yield* assertCommand(command);
					yield* wire.request("command.invoke", {
						commandId: command.commandId,
						workspaceId
					});
				}),
				invokeInTab: (command, tabId, input = {}) => Effect.gen(function* () {
					yield* assertCommand(command);
					const target = yield* decodeHerdrInput("ClientShellConnection.commands.invokeInTab", parseTabCommand, input);
					yield* wire.request("command.invoke", {
						commandId: command.commandId,
						tabId,
						...target.expectedWorkspaceId === void 0 ? {} : { workspaceId: target.expectedWorkspaceId }
					});
				}),
				invokeInPane: (command, paneId, input = {}) => Effect.gen(function* () {
					yield* assertCommand(command);
					const target = yield* decodeHerdrInput("ClientShellConnection.commands.invokeInPane", parsePaneCommand, input);
					yield* wire.request("command.invoke", {
						commandId: command.commandId,
						paneId,
						...target.expectedWorkspaceId === void 0 ? {} : { workspaceId: target.expectedWorkspaceId },
						...target.expectedTabId === void 0 ? {} : { tabId: target.expectedTabId },
						...target.selection === void 0 ? {} : { selection: {
							paneId,
							...target.selection
						} }
					});
				})
			},
			productAnnouncements: { dismiss: (input) => Effect.gen(function* () {
				const identity = yield* decodeHerdrInput("ClientShellConnection.productAnnouncements.dismiss", parseAnnouncement, input);
				yield* wire.request("product_announcement.dismiss", identity);
			}) },
			releaseNotes: { dismiss: (input) => Effect.gen(function* () {
				const identity = yield* decodeHerdrInput("ClientShellConnection.releaseNotes.dismiss", parseNotes, input);
				yield* wire.request("release_notes.dismiss", identity);
			}) },
			setFocused: (focused) => preference("focus", focused),
			setMouseCapture: (enabled) => preference("mouseCapture", enabled),
			setHostTheme: (input) => Effect.gen(function* () {
				const update = yield* decodeHerdrInput("ClientShellConnection.setHostTheme", parseHostTheme, input);
				yield* wire.write(() => encodeEndpointHostTheme(update));
			}),
			awaitClosed: () => wire.failure,
			connectionState: () => wire.ensureOpen.pipe(Effect.as("ready"), Effect.catch(() => Effect.succeed("closed")))
		};
		yield* Effect.gen(function* () {
			yield* Effect.sleep(parsed.healthIntervalMs ?? 1e4);
			const pong = yield* Deferred.make();
			healthPong = pong;
			yield* wire.write(() => encodeEndpointControl("endpoint.health.ping.v1", "{}"));
			yield* Deferred.await(pong).pipe(Effect.timeoutOrElse({
				duration: timeoutMs,
				orElse: () => Effect.fail(new HerdrEndpointRequestTimeout("health"))
			}));
			healthPong = void 0;
		}).pipe(Effect.forever, Effect.raceFirst(wire.failure), Effect.catch(wire.fail)).pipe(Effect.forkScoped);
		yield* Effect.addFinalizer(() => Effect.sync(() => {
			currentProjection = void 0;
			currentSurface = void 0;
			surfaceState = { status: "closed" };
			commands = /* @__PURE__ */ new WeakSet();
		}));
		if (parsed.initialSurface === "active") yield* connection.surface.set({ active: true });
		return connection;
	});
	const connectScoped = defineHerdrOperation("ClientShellService.connectScoped", (input) => Effect.gen(function* () {
		const scope = yield* Scope.fork(yield* Scope.Scope);
		return yield* acquire(input).pipe(Scope.provide(scope), Effect.onExit((exit) => Exit.isFailure(exit) ? Scope.close(scope, Exit.void) : Effect.void));
	}));
	return ClientShellService.of({
		connectScoped,
		withConnection: (input, use) => Effect.scoped(Effect.gen(function* () {
			const connection = yield* connectScoped(input);
			return yield* use(connection).pipe(Effect.raceFirst(connection.awaitClosed()));
		})),
		projections: (input) => Stream.unwrap(Effect.gen(function* () {
			return (yield* connectScoped({
				...input,
				initialSurface: "inactive"
			})).projections;
		}))
	});
});
/** Provides lazy endpoint sessions with visible configuration and API transport dependencies. @category layers @since 0.9.0 */
const clientShellServiceLayerWithoutDependencies = Layer.effect(ClientShellService, makeClientShellService);
/** Production client-shell Layer; connections remain lazy and callback/stream owned. @category layers @since 0.9.0 */
const clientShellServiceLayer = clientShellServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer), Layer.provide(herdrConfigLayer));
//#endregion
//#region src/agent-service.ts
/**
* Controls detected and launched terminal agents.
*
* The agent service discovers agents, reads their output, sends input, manages stable names, launches supported agent kinds, waits for lifecycle states, and owns the persistent foreground agent view.
*
* @since 0.8.2
*/
const encodeAgentViewSetInput = Schema.encodeEffect(AgentViewSetInput);
const parseAgent = Schema.decodeUnknownEffect(Agent);
const parseAgents = Schema.decodeUnknownEffect(Schema.Array(Agent));
const parseAgentPromptInput = Schema.decodeEffect(AgentPromptInput);
const parseAgentStartInput = Schema.decodeEffect(AgentStartInput);
const parseAgentStartResult = Schema.decodeUnknownEffect(AgentStartResult);
const parseAgentTarget = Schema.decodeEffect(AgentTarget);
const parseAgentViewClearInput = Schema.decodeEffect(AgentViewClearInput);
const parseAgentViewSetInput = Schema.decodeEffect(AgentViewSetInput);
const parseAgentViewState = Schema.decodeUnknownEffect(AgentViewState);
const parseAgentWaitInput = Schema.decodeEffect(AgentWaitInput);
const parseHerdrJsonValue = Schema.decodeUnknownEffect(HerdrJsonValue);
const parseHerdrKeySequence = Schema.decodeEffect(HerdrKeySequence);
const parsePaneReadInput$1 = Schema.decodeEffect(PaneReadInput);
const parsePaneReadResult$1 = Schema.decodeUnknownEffect(PaneReadResult);
/**
* Yieldable Effect service for Herdr agent operations.
*
* @category services
* @since 0.8.2
*/
var AgentService = class extends Context.Service()("@herdr/sdk/AgentService") {};
/**
* Constructs agent operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeAgentService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	const readAgent = defineHerdrOperation("AgentService.readAgent", (method, target, options) => Effect.gen(function* () {
		const response = yield* transport.request(method, encodeAgentTarget(target), options);
		return yield* decodeHerdrWire(parseAgent, response.result.agent, response.requestId);
	}));
	const view = {
		set: defineHerdrOperation("AgentService.view.set", (input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("AgentService.view.set", parseAgentViewSetInput, input);
			const parameters = yield* encodeAgentViewSetInput(parsed).pipe(Effect.orDie);
			const response = yield* transport.request("agent.view.set", parameters, options);
			return yield* decodeHerdrWire(parseAgentViewState, response.result, response.requestId);
		})),
		clear: defineHerdrOperation("AgentService.view.clear", (input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("AgentService.view.clear", parseAgentViewClearInput, input);
			const response = yield* transport.request("agent.view.clear", { source: Option.getOrNull(parsed.source) }, options);
			return yield* decodeHerdrWire(parseAgentViewState, response.result, response.requestId);
		}))
	};
	return AgentService.of({
		view,
		list: defineHerdrOperation("AgentService.list", (options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("agent.list", {}, options);
			return yield* decodeHerdrWire(parseAgents, response.result.agents, response.requestId);
		})),
		get: defineHerdrOperation("AgentService.get", (target, options = {}) => decodeAgentTarget(target).pipe(Effect.flatMap((parsed) => readAgent("agent.get", parsed, options)))),
		read: defineHerdrOperation("AgentService.read", (target, input, options = {}) => Effect.gen(function* () {
			const parsedTarget = yield* decodeAgentTarget(target);
			const parameters = yield* encodePaneReadParameters(yield* decodeHerdrInput("AgentService.read", parsePaneReadInput$1, input)).pipe(Effect.orDie);
			const response = yield* transport.request("agent.read", {
				...encodeAgentTarget(parsedTarget),
				...parameters
			}, options);
			return yield* decodeHerdrWire(parsePaneReadResult$1, response.result.read, response.requestId);
		})),
		explain: defineHerdrOperation("AgentService.explain", (target, options = {}) => Effect.gen(function* () {
			const parsedTarget = yield* decodeAgentTarget(target);
			const response = yield* transport.request("agent.explain", encodeAgentTarget(parsedTarget), options);
			return yield* decodeHerdrWire(parseHerdrJsonValue, response.result.explain, response.requestId);
		})),
		sendKeys: defineHerdrOperation("AgentService.sendKeys", (target, keys, options = {}) => Effect.gen(function* () {
			const parsedTarget = yield* decodeAgentTarget(target);
			const parsedKeys = yield* decodeHerdrInput("AgentService.sendKeys", parseHerdrKeySequence, keys);
			yield* transport.request("agent.send_keys", {
				...encodeAgentTarget(parsedTarget),
				keys: parsedKeys
			}, options);
		})),
		rename: defineHerdrOperation("AgentService.rename", (target, name, options = {}) => Effect.gen(function* () {
			const parsedTarget = yield* decodeAgentTarget(target);
			const response = yield* transport.request("agent.rename", {
				...encodeAgentTarget(parsedTarget),
				name
			}, options);
			return yield* decodeHerdrWire(parseAgent, response.result.agent, response.requestId);
		})),
		focus: defineHerdrOperation("AgentService.focus", (target, options = {}) => decodeAgentTarget(target).pipe(Effect.flatMap((parsed) => readAgent("agent.focus", parsed, options)))),
		start: defineHerdrOperation("AgentService.start", (input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("AgentService.start", parseAgentStartInput, input);
			const base = {
				name: parsed.name,
				kind: parsed.kind,
				paneId: parsed.paneId,
				timeoutMs: Option.getOrNull(parsed.timeoutMs)
			};
			const parameters = Option.match(parsed.args, {
				onNone: () => base,
				onSome: (args) => ({
					...base,
					args
				})
			});
			const response = yield* transport.request("agent.start", parameters, options);
			return yield* decodeHerdrWire(parseAgentStartResult, response.result, response.requestId);
		})),
		prompt: defineHerdrOperation("AgentService.prompt", (target, input, options = {}) => Effect.gen(function* () {
			const parsedTarget = yield* decodeAgentTarget(target);
			const parameters = yield* encodeAgentPromptParameters(yield* decodeHerdrInput("AgentService.prompt", parseAgentPromptInput, input)).pipe(Effect.orDie);
			const response = yield* transport.request("agent.prompt", {
				...encodeAgentTarget(parsedTarget),
				...parameters
			}, options);
			return yield* decodeHerdrWire(parseAgent, response.result.agent, response.requestId);
		})),
		wait: defineHerdrOperation("AgentService.wait", (target, input = {}, options = {}) => Effect.gen(function* () {
			const parsedTarget = yield* decodeAgentTarget(target);
			const parameters = yield* encodeAgentWaitParameters(yield* decodeHerdrInput("AgentService.wait", parseAgentWaitInput, input)).pipe(Effect.orDie);
			const response = yield* transport.request("agent.wait", {
				...encodeAgentTarget(parsedTarget),
				...parameters
			}, options);
			return yield* decodeHerdrWire(parseAgent, response.result.agent, response.requestId);
		}))
	});
});
/**
* Provides agent operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const agentServiceLayerWithoutDependencies = Layer.effect(AgentService, makeAgentService);
/**
* Production agent-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const agentServiceLayer = agentServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
function decodeAgentTarget(target) {
	return decodeHerdrInput("AgentService.target", parseAgentTarget, target);
}
function encodeAgentTarget(target) {
	return { target: target.kind === "pane" ? target.paneId : target.name };
}
//#endregion
//#region src/client-service.ts
/**
* Controls state owned by the foreground Herdr client.
*
* The client service currently owns persistent window-title overrides and keeps that client-specific capability separate from terminal resources.
*
* @since 0.8.2
*/
const parseClientWindowTitle = Schema.decodeEffect(Schema.String);
const parseClientWindowTitleResult = Schema.decodeUnknownEffect(ClientWindowTitleResult);
/**
* Yieldable Effect service for foreground Herdr client operations.
*
* @category services
* @since 0.8.2
*/
var ClientService = class extends Context.Service()("@herdr/sdk/ClientService") {};
/**
* Constructs client operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeClientService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return ClientService.of({ windowTitle: {
		set: defineHerdrOperation("ClientService.windowTitle.set", (title, options = {}) => Effect.gen(function* () {
			const parsedTitle = yield* decodeHerdrInput("ClientService.windowTitle.set", parseClientWindowTitle, title);
			const response = yield* transport.request("client.window_title.set", { title: parsedTitle }, options);
			return yield* decodeHerdrWire(parseClientWindowTitleResult, response.result, response.requestId);
		})),
		clear: defineHerdrOperation("ClientService.windowTitle.clear", (options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("client.window_title.clear", {}, options);
			return yield* decodeHerdrWire(parseClientWindowTitleResult, response.result, response.requestId);
		}))
	} });
});
/**
* Provides client operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const clientServiceLayerWithoutDependencies = Layer.effect(ClientService, makeClientService);
/**
* Production client-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const clientServiceLayer = clientServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/event-service.ts
/**
* Consumes Herdr lifecycle and pane events as typed Effect values.
*
* Subscriptions are cold, live-only streams with literal-specification narrowing; one-shot waits preserve the event type selected by their matcher.
* A subscriber that falls behind Herdr's retained history fails with `HerdrEventsLost` instead of silently skipping events.
*
* @since 0.8.2
*/
const MAX_EVENT_LINE_BYTES = 1024 * 1024;
const eventUtf8Decoder = new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true
});
const HerdrEventEnvelopeProbe = Schema.Struct({ event: Schema.String });
const parseHerdrEventEnvelopeProbe = Schema.decodeUnknownOption(HerdrEventEnvelopeProbe);
const HerdrSubscriptionErrorResponse = Schema.Struct({
	id: Schema.String,
	error: Schema.Struct({
		code: Schema.String,
		message: Schema.String
	})
});
const parseHerdrSubscriptionErrorResponse = Schema.decodeUnknownOption(HerdrSubscriptionErrorResponse);
const parseHerdrEventResult = Schema.decodeUnknownResult(HerdrEvent);
const lifecycleEventKinds = new Set(herdr_api_schema_default.schemas.event.$defs.EventKind.enum);
const supportedEventKinds = /* @__PURE__ */ new Set([...lifecycleEventKinds, ...herdr_api_schema_default.schemas.subscription_event.$defs.SubscriptionEventKind.enum]);
const encodeEventSubscriptionSpec = Schema.encodeEffect(EventSubscriptionSpec);
const parseEventMatch = Schema.decodeEffect(EventMatch);
const parseEventSubscriptionSpec = Schema.decodeEffect(EventSubscriptionSpec);
const parseEventWaitInput = Schema.decodeEffect(EventWaitInput);
const parseHerdrEvent = Schema.decodeUnknownEffect(HerdrEvent);
/**
* Yieldable Effect service for Herdr event operations.
*
* @category services
* @since 0.8.2
*/
var EventService = class extends Context.Service()("@herdr/sdk/EventService") {};
/**
* Constructs event operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeEventService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return EventService.of({
		subscribe: (subscriptions, options = {}) => Stream.unwrap(Effect.gen(function* () {
			const lifetimeSpan = yield* Effect.makeSpanScoped("EventService.subscribe");
			return Stream.unwrap(Effect.gen(function* () {
				const snapshots = subscriptions.map((subscription) => ({ ...subscription }));
				const selectedTypes = snapshots.map((subscription) => subscription.type);
				const parsedSubscriptions = yield* Effect.forEach(snapshots, (subscription) => decodeHerdrInput("EventService.subscribe", parseEventSubscriptionSpec, subscription));
				const encodedSubscriptions = yield* Effect.forEach(parsedSubscriptions, (subscription) => encodeEventSubscriptionSpec(subscription).pipe(Effect.orDie));
				const bytesCount = yield* Ref.make(0);
				const eventsCount = yield* Ref.make(0);
				yield* Effect.addFinalizer((exit) => Effect.gen(function* () {
					const attributes = {
						"herdr.outcome": Exit.isSuccess(exit) ? "success" : Exit.hasInterrupts(exit) ? "interrupted" : "failure",
						"herdr.bytes.count": yield* Ref.get(bytesCount),
						"herdr.events.count": yield* Ref.get(eventsCount)
					};
					for (const [key, value] of Object.entries(attributes)) lifetimeSpan.attribute(key, value);
					lifetimeSpan.event("herdr.subscription.closed", yield* Clock.currentTimeNanos, attributes);
				}));
				const opened = yield* transport.openStream("events.subscribe", { subscriptions: encodedSubscriptions }, options);
				lifetimeSpan.event("herdr.subscription.accepted", yield* Clock.currentTimeNanos);
				return decodeHerdrEventStream(opened.readBytes.pipe(Stream.tap((bytes) => Ref.update(bytesCount, (count) => Math.min(1e9, count + bytes.byteLength)))), opened.requestId, selectedTypes).pipe(Stream.tap(() => Ref.update(eventsCount, (count) => Math.min(1e9, count + 1))));
			})).pipe(Stream.provideService(Tracer.ParentSpan, lifetimeSpan));
		})),
		wait: defineHerdrOperation("EventService.wait", (match, input = {}, options = {}) => Effect.gen(function* () {
			const snapshot = { ...match };
			const selectedType = snapshot.type;
			const parsedMatch = yield* decodeHerdrInput("EventService.wait.match", parseEventMatch, snapshot);
			const parsedInput = yield* decodeHerdrInput("EventService.wait", parseEventWaitInput, input);
			const response = yield* transport.request("events.wait", {
				matchEvent: encodeEventMatch(parsedMatch),
				timeoutMs: Option.getOrNull(parsedInput.timeoutMs)
			}, options);
			const event = yield* decodeHerdrWire(parseHerdrEvent, response.result.event.data, response.requestId);
			if (isEventForMatch(event, selectedType)) return event;
			return yield* new HerdrInvalidResponse("schema_mismatch", response.requestId, /* @__PURE__ */ new Error("Herdr wait returned a different event type than the requested match"));
		}))
	});
});
/**
* Provides event operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const eventServiceLayerWithoutDependencies = Layer.effect(EventService, makeEventService);
/**
* Production event-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const eventServiceLayer = eventServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
function decodeEventLine(bytes, requestId) {
	const parsedJson = Result.try({
		try: () => JSON.parse(eventUtf8Decoder.decode(bytes)),
		catch: (cause) => new HerdrInvalidResponse("malformed_json", requestId, cause)
	});
	if (Result.isFailure(parsedJson)) return parsedJson;
	const errorResponse = parseHerdrSubscriptionErrorResponse(parsedJson.success);
	if (Option.isSome(errorResponse)) {
		const { id, error } = errorResponse.value;
		if (id !== requestId) return Result.fail(new HerdrInvalidResponse("correlation_mismatch", requestId, /* @__PURE__ */ new Error(`Herdr returned subscription error for response ID ${id}`)));
		return Result.fail(error.code === "events_lost" ? new HerdrEventsLost(error.message, requestId) : new HerdrServerError(error.code, error.message, requestId));
	}
	const parsedEnvelope = Result.try({
		try: () => parseHerdrWireEvent(parsedJson.success, requestId),
		catch: (cause) => {
			const probe = parseHerdrEventEnvelopeProbe(parsedJson.success);
			return Option.isSome(probe) && !supportedEventKinds.has(probe.value.event) ? new HerdrUnsupportedEvent(probe.value.event, requestId) : new HerdrInvalidResponse("schema_mismatch", requestId, cause);
		}
	});
	if (Result.isFailure(parsedEnvelope)) return Result.fail(parsedEnvelope.failure);
	const envelope = parsedEnvelope.success;
	if (lifecycleEventKinds.has(envelope.event) && envelope.event !== envelope.data.type) return Result.fail(new HerdrInvalidResponse("schema_mismatch", requestId, /* @__PURE__ */ new Error("Herdr event envelope kind differs from its payload type")));
	return parseHerdrEventResult(eventDataWithType(envelope)).pipe(Result.mapError((cause) => new HerdrInvalidResponse("schema_mismatch", requestId, cause)));
}
function decodeHerdrEventStream(bytes, requestId, selectedTypes) {
	return bytes.pipe(Stream.map((value) => ({
		_tag: "Bytes",
		value
	})), Stream.concat(Stream.succeed({ _tag: "End" }))).pipe(Stream.mapAccumArray(makeHerdrSocketLineBuffer, (state, input) => parseHerdrEventChunks(state, input, requestId, selectedTypes)), Stream.mapEffect((decoded) => Result.match(decoded, {
		onFailure: Effect.fail,
		onSuccess: Effect.succeed
	})));
}
function parseHerdrEventChunks(state, inputs, requestId, selectedTypes) {
	const decodedEvents = [];
	for (const input of inputs) {
		if (input._tag === "End") {
			if (state.byteLength > 0) decodedEvents.push(Result.fail(new HerdrTransportError("event_subscription", "premature_close", requestId, /* @__PURE__ */ new Error("Herdr closed the event socket during an incomplete response line"))));
			return [makeHerdrSocketLineBuffer(), decodedEvents];
		}
		let remaining = [input.value];
		while (remaining.length > 0) {
			const split = splitHerdrSocketLines(state, remaining, MAX_EVENT_LINE_BYTES, requestId, 1);
			if (Result.isFailure(split)) {
				decodedEvents.push(Result.fail(split.failure));
				return [makeHerdrSocketLineBuffer(), decodedEvents];
			}
			state = split.success.buffer;
			remaining = split.success.remainder;
			for (const line of split.success.lines) {
				if (line.length === 0) continue;
				const decoded = decodeEventLine(line, requestId);
				if (Result.isFailure(decoded)) {
					decodedEvents.push(Result.fail(decoded.failure));
					return [makeHerdrSocketLineBuffer(), decodedEvents];
				}
				if (isEventForSubscriptions(decoded.success, selectedTypes)) decodedEvents.push(Result.succeed(decoded.success));
			}
		}
	}
	return [state, decodedEvents];
}
function eventDataWithType(envelope) {
	switch (envelope.event) {
		case "pane.output_matched": return {
			...envelope.data,
			type: "pane_output_matched"
		};
		case "pane.agent_status_changed": return {
			...envelope.data,
			type: "pane_agent_status_changed"
		};
		case "pane.scroll_changed": return {
			...envelope.data,
			type: "pane_scroll_changed"
		};
		default: return envelope.data;
	}
}
function isEventForSubscriptions(event, selectedTypes) {
	return selectedTypes.some((type) => type === event.type);
}
function isEventForMatch(event, selectedType) {
	return event.type === selectedType;
}
function encodeEventMatch(match) {
	switch (match.type) {
		case "workspace.created": return {
			event: "workspace_created",
			workspaceId: Option.getOrNull(match.workspaceId)
		};
		case "workspace.updated": return {
			event: "workspace_updated",
			workspaceId: match.workspaceId
		};
		case "workspace.closed": return {
			event: "workspace_closed",
			workspaceId: match.workspaceId
		};
		case "workspace.renamed": return {
			event: "workspace_renamed",
			workspaceId: match.workspaceId,
			label: Option.getOrNull(match.label)
		};
		case "workspace.moved": return {
			event: "workspace_moved",
			workspaceId: match.workspaceId
		};
		case "workspace.focused": return {
			event: "workspace_focused",
			workspaceId: match.workspaceId
		};
		case "tab.created": return {
			event: "tab_created",
			tabId: Option.getOrNull(match.tabId),
			workspaceId: Option.getOrNull(match.workspaceId)
		};
		case "tab.closed": return {
			event: "tab_closed",
			tabId: match.tabId
		};
		case "tab.renamed": return {
			event: "tab_renamed",
			tabId: match.tabId,
			label: Option.getOrNull(match.label)
		};
		case "tab.moved": return {
			event: "tab_moved",
			tabId: match.tabId
		};
		case "tab.focused": return {
			event: "tab_focused",
			tabId: match.tabId
		};
		case "pane.created": return {
			event: "pane_created",
			paneId: Option.getOrNull(match.paneId),
			workspaceId: Option.getOrNull(match.workspaceId)
		};
		case "pane.closed": return {
			event: "pane_closed",
			paneId: match.paneId
		};
		case "pane.focused": return {
			event: "pane_focused",
			paneId: match.paneId
		};
		case "pane.moved": return {
			event: "pane_moved",
			paneId: match.paneId
		};
		case "pane.output_changed": return {
			event: "pane_output_changed",
			paneId: match.paneId,
			minRevision: Option.getOrNull(match.minRevision)
		};
		case "pane.exited": return {
			event: "pane_exited",
			paneId: match.paneId
		};
		case "pane.agent_detected": return {
			event: "pane_agent_detected",
			paneId: match.paneId,
			agent: Option.getOrNull(match.agent)
		};
		case "pane.agent_status_changed": return {
			event: "pane_agent_status_changed",
			paneId: match.paneId,
			agentStatus: match.agentStatus
		};
	}
}
//#endregion
//#region src/integration-service.ts
/**
* Installs and removes Herdr terminal-agent integrations.
*
* The integration service accepts the schema-owned built-in integration targets and returns the server-reported change result.
*
* @since 0.8.2
*/
/** Installation freshness reported by Herdr, independent of executable availability. @category schemas @since 0.9.0 */
const IntegrationState = Schema.Union([
	Schema.Literal("not_installed").transform("notInstalled"),
	Schema.Literal("current"),
	Schema.Literal("outdated")
]);
/** Discovered integration executable and installation state. @category schemas @since 0.9.0 */
const IntegrationInfo = Schema.Struct({
	target: IntegrationTarget,
	label: Schema.String,
	command: Schema.String,
	available: Schema.Boolean,
	state: IntegrationState
});
const parseIntegrations = Schema.decodeUnknownEffect(Schema.Array(IntegrationInfo));
const parseIntegrationChangeResult = Schema.decodeUnknownEffect(IntegrationChangeResult);
/**
* Yieldable Effect service for Herdr integrations.
*
* @category services
* @since 0.8.2
*/
var IntegrationService = class extends Context.Service()("@herdr/sdk/IntegrationService") {};
/**
* Constructs integration operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeIntegrationService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	const change = defineHerdrOperation("IntegrationService.change", (method, target, options) => Effect.gen(function* () {
		const response = yield* transport.request(method, { target }, options);
		return yield* decodeHerdrWire(parseIntegrationChangeResult, {
			target: response.result.target,
			messages: response.result.details.messages
		}, response.requestId);
	}));
	return IntegrationService.of({
		list: defineHerdrOperation("IntegrationService.list", (options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("integration.list", {}, options);
			return yield* decodeHerdrWire(parseIntegrations, response.result.integrations, response.requestId);
		})),
		install: defineHerdrOperation("IntegrationService.install", (target, options = {}) => change("integration.install", target, options)),
		uninstall: defineHerdrOperation("IntegrationService.uninstall", (target, options = {}) => change("integration.uninstall", target, options))
	});
});
/**
* Provides integrations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const integrationServiceLayerWithoutDependencies = Layer.effect(IntegrationService, makeIntegrationService);
/**
* Production integration-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const integrationServiceLayer = integrationServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/layout-service.ts
/**
* Exports, applies, and resizes declarative Herdr pane layouts.
*
* Recursive layout values let callers reproduce terminal arrangements without scripting a sequence of focus and split gestures.
*
* @since 0.8.2
*/
const parseLayoutApplyInput = Schema.decodeEffect(LayoutApplyInput);
const parseLayoutDescription = Schema.decodeUnknownEffect(LayoutDescription);
const parseLayoutSetSplitRatioInput = Schema.decodeEffect(LayoutSetSplitRatioInput);
const parseLayoutTarget = Schema.decodeEffect(LayoutTarget);
/**
* Yieldable Effect service for Herdr declarative layout operations.
*
* @category services
* @since 0.8.2
*/
var LayoutService = class extends Context.Service()("@herdr/sdk/LayoutService") {};
/**
* Constructs layout operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeLayoutService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return LayoutService.of({
		export: defineHerdrOperation("LayoutService.export", (target, options = {}) => Effect.gen(function* () {
			const parameters = encodeLayoutTarget(target === void 0 ? void 0 : yield* decodeHerdrInput("LayoutService.export", parseLayoutTarget, target));
			const response = yield* transport.request("layout.export", parameters, options);
			return yield* decodeHerdrWire(parseLayoutDescription, response.result.layout, response.requestId);
		})),
		apply: defineHerdrOperation("LayoutService.apply", (input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("LayoutService.apply", parseLayoutApplyInput, input);
			const root = encodeLayoutNode(parsed.root);
			const base = {
				workspaceId: Option.getOrNull(parsed.workspaceId),
				tabId: Option.getOrNull(parsed.replaceTabId),
				tabLabel: Option.getOrNull(parsed.tabLabel),
				root
			};
			const parameters = Option.match(parsed.focus, {
				onNone: () => base,
				onSome: (focus) => ({
					...base,
					focus
				})
			});
			const response = yield* transport.request("layout.apply", parameters, options);
			return yield* decodeHerdrWire(parseLayoutDescription, response.result.layout, response.requestId);
		})),
		setSplitRatio: defineHerdrOperation("LayoutService.setSplitRatio", (target, input, options = {}) => Effect.gen(function* () {
			const parsedTarget = target === void 0 ? void 0 : yield* decodeHerdrInput("LayoutService.setSplitRatio.target", parseLayoutTarget, target);
			const parsed = yield* decodeHerdrInput("LayoutService.setSplitRatio", parseLayoutSetSplitRatioInput, input);
			const selected = encodeLayoutTarget(parsedTarget);
			const response = yield* transport.request("layout.set_split_ratio", {
				...selected,
				path: parsed.path,
				ratio: parsed.ratio
			}, options);
			return yield* decodeHerdrWire(parseLayoutDescription, response.result.layout, response.requestId);
		}))
	});
});
/**
* Provides layout operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const layoutServiceLayerWithoutDependencies = Layer.effect(LayoutService, makeLayoutService);
/**
* Production layout-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const layoutServiceLayer = layoutServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
function encodeLayoutNode(node) {
	if (node.type === "split") return {
		type: node.type,
		direction: node.direction,
		ratio: node.ratio,
		first: encodeLayoutNode(node.first),
		second: encodeLayoutNode(node.second)
	};
	const base = {
		type: node.type,
		paneId: Option.getOrNull(node.paneId),
		label: Option.getOrNull(node.label),
		cwd: Option.getOrNull(node.cwd),
		command: Option.getOrNull(node.command)
	};
	return Option.match(node.env, {
		onNone: () => base,
		onSome: (env) => ({
			...base,
			env
		})
	});
}
function encodeLayoutTarget(target) {
	return target === void 0 ? {
		paneId: null,
		tabId: null
	} : target.tabId !== void 0 ? {
		paneId: null,
		tabId: target.tabId
	} : {
		paneId: target.paneId,
		tabId: null
	};
}
//#endregion
//#region src/notification-service.ts
/**
* Shows notifications through the foreground Herdr client.
*
* Notification inputs are decoded before transport and return the server-assigned notification result.
*
* @since 0.8.2
*/
const parseNotificationShowInput = Schema.decodeEffect(NotificationShowInput);
const parseNotificationShowResult = Schema.decodeUnknownEffect(NotificationShowResult);
/**
* Yieldable Effect service for foreground notifications.
*
* @category services
* @since 0.8.2
*/
var NotificationService = class extends Context.Service()("@herdr/sdk/NotificationService") {};
/**
* Constructs notification operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeNotificationService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return NotificationService.of({ show: defineHerdrOperation("NotificationService.show", (input, options = {}) => Effect.gen(function* () {
		const parsed = yield* decodeHerdrInput("NotificationService.show", parseNotificationShowInput, input);
		const parametersWithoutSound = {
			title: parsed.title,
			body: Option.getOrNull(parsed.body),
			position: Option.getOrNull(parsed.position)
		};
		const parameters = Option.match(parsed.sound, {
			onNone: () => parametersWithoutSound,
			onSome: (sound) => ({
				...parametersWithoutSound,
				sound
			})
		});
		const response = yield* transport.request("notification.show", parameters, options);
		return yield* decodeHerdrWire(parseNotificationShowResult, response.result, response.requestId);
	})) });
});
/**
* Provides notifications while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const notificationServiceLayerWithoutDependencies = Layer.effect(NotificationService, makeNotificationService);
/**
* Production notification-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const notificationServiceLayer = notificationServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/pane-interaction.ts
/**
* Implements pane text navigation and viewport interactions owned by PaneService.
* Revision failures are returned without retrying coordinates against different text.
* @since 0.9.0
*/
const parseScroll = Schema.decodeEffect(PaneScrollInput);
const parseSelection = Schema.decodeEffect(PaneSelectionReadInput);
const parseMotion = Schema.decodeEffect(PaneCopyMotionInput);
const parseSearch = Schema.decodeEffect(PaneCopySearchInput);
const parseLink = Schema.decodeEffect(PaneLinkActivateInput);
const parsePane$1 = Schema.decodeUnknownEffect(Pane);
const parseSelectionResult = Schema.decodeUnknownEffect(PaneSelectionResult);
const parseMotionResult = Schema.decodeUnknownEffect(PaneCopyMotionResult);
const parseSearchResult = Schema.decodeUnknownEffect(PaneCopySearchResult);
const parseLinkResult = Schema.decodeUnknownEffect(PaneLinkActivatedResult);
const parseLinkResolve = Schema.decodeEffect(PaneLinkResolveInput);
const parseLinkResolvedResult = Schema.decodeUnknownEffect(PaneLinkResolvedResult);
const wireCopyMotions = {
	lineEnd: "line_end",
	firstNonBlank: "first_non_blank",
	nextWordStart: "next_word_start",
	previousWordStart: "previous_word_start",
	nextWordEnd: "next_word_end",
	nextBigWordStart: "next_big_word_start",
	previousBigWordStart: "previous_big_word_start",
	nextBigWordEnd: "next_big_word_end",
	previousParagraph: "previous_paragraph",
	nextParagraph: "next_paragraph"
};
/** Constructs parent-owned pane interaction operations using the shared transport. @category constructors @since 0.9.0 */
function makePaneInteraction(transport) {
	return {
		clear: defineHerdrOperation("PaneService.clear", (id, options = {}) => transport.request("pane.clear", { paneId: id }, options).pipe(Effect.asVoid)),
		scroll: defineHerdrOperation("PaneService.scroll", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.scroll", parseScroll, input);
			const response = yield* transport.request("pane.scroll", {
				paneId: id,
				...parsed
			}, options);
			return yield* decodeHerdrWire(parsePane$1, response.result.pane, response.requestId);
		})),
		editScrollback: defineHerdrOperation("PaneService.editScrollback", (id, options = {}) => transport.request("pane.edit_scrollback", { paneId: id }, options).pipe(Effect.asVoid)),
		selection: { read: defineHerdrOperation("PaneService.selection.read", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.selection.read", parseSelection, input);
			const response = yield* transport.request("pane.selection.read", {
				paneId: id,
				...parsed
			}, options);
			return yield* decodeHerdrWire(parseSelectionResult, response.result, response.requestId);
		})) },
		copyMotion: defineHerdrOperation("PaneService.copyMotion", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.copyMotion", parseMotion, input);
			const response = yield* transport.request("pane.copy_motion", {
				paneId: id,
				...parsed,
				motion: wireCopyMotions[parsed.motion]
			}, options);
			return yield* decodeHerdrWire(parseMotionResult, response.result, response.requestId);
		})),
		copySearch: defineHerdrOperation("PaneService.copySearch", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.copySearch", parseSearch, input);
			const response = yield* transport.request("pane.copy_search", {
				paneId: id,
				...parsed
			}, options);
			return yield* decodeHerdrWire(parseSearchResult, response.result, response.requestId);
		})),
		link: {
			resolve: defineHerdrOperation("PaneService.link.resolve", (id, input, options = {}) => Effect.gen(function* () {
				const parsed = yield* decodeHerdrInput("PaneService.link.resolve", parseLinkResolve, input);
				const response = yield* transport.request("pane.link.resolve", {
					paneId: id,
					...parsed
				}, options);
				return yield* decodeHerdrWire(parseLinkResolvedResult, response.result, response.requestId);
			})),
			activate: defineHerdrOperation("PaneService.link.activate", (id, input, options = {}) => Effect.gen(function* () {
				const parsed = yield* decodeHerdrInput("PaneService.link.activate", parseLink, input);
				const response = yield* transport.request("pane.link.activate", {
					paneId: id,
					...parsed
				}, options);
				return yield* decodeHerdrWire(parseLinkResult, response.result, response.requestId);
			}))
		}
	};
}
//#endregion
//#region src/pane-service.ts
/**
* Controls Herdr panes, terminal input and output, geometry, and metadata.
*
* Images are not a socket API: applications draw them by writing standard Kitty graphics to their own pane's terminal output.
*
* @since 0.8.2
*/
const parsePane = Schema.decodeUnknownEffect(Pane);
const parsePanes = Schema.decodeUnknownEffect(Schema.Array(Pane));
const parsePaneAgentReportInput = Schema.decodeEffect(PaneAgentReportInput);
const parsePaneAgentSessionReportInput = Schema.decodeEffect(PaneAgentSessionReportInput);
const parsePaneClearAgentAuthorityInput = Schema.decodeEffect(PaneClearAgentAuthorityInput);
const parsePaneCurrentInput = Schema.decodeEffect(PaneCurrentInput);
const parsePaneEdgesResult = Schema.decodeUnknownEffect(PaneEdgesResult);
const parsePaneFocusDirectionInput = Schema.decodeEffect(PaneFocusDirectionInput);
const parsePaneFocusDirectionResult = Schema.decodeUnknownEffect(PaneFocusDirectionResult);
const parsePaneInput = Schema.decodeEffect(PaneInput);
const parsePaneInputRoutingInput = Schema.decodeEffect(PaneInputRoutingInput);
const parsePaneKeySequence = Schema.decodeEffect(HerdrKeySequence);
const parsePaneLabel = Schema.decodeEffect(Schema.String);
const parsePaneLayoutSnapshot = Schema.decodeUnknownEffect(PaneLayoutSnapshot);
const parsePaneListInput = Schema.decodeEffect(PaneListInput);
const parsePaneMetadataReportInput = Schema.decodeEffect(PaneMetadataReportInput);
const parsePaneMoveInput = Schema.decodeEffect(PaneMoveInput);
const parsePaneMoveResult = Schema.decodeUnknownEffect(PaneMoveResult);
const parsePaneNeighborResult = Schema.decodeUnknownEffect(PaneNeighborResult);
const parsePaneOutputMatchResult = Schema.decodeUnknownEffect(PaneOutputMatchResult);
const parsePaneProcessInfo = Schema.decodeUnknownEffect(PaneProcessInfo);
const parsePaneReadInput = Schema.decodeEffect(PaneReadInput);
const parsePaneReadResult = Schema.decodeUnknownEffect(PaneReadResult);
const parsePaneReleaseAgentInput = Schema.decodeEffect(PaneReleaseAgentInput);
const parsePaneResizeInput = Schema.decodeEffect(PaneResizeInput);
const parsePaneResizeResult = Schema.decodeUnknownEffect(PaneResizeResult);
const parsePaneSplitInput = Schema.decodeEffect(PaneSplitInput);
const parsePaneSwapInput = Schema.decodeEffect(PaneSwapInput);
const parsePaneSwapResult = Schema.decodeUnknownEffect(PaneSwapResult);
const parsePaneText = Schema.decodeEffect(Schema.String);
const parsePaneWaitForOutputInput = Schema.decodeEffect(PaneWaitForOutputInput);
const parsePaneZoomInput = Schema.decodeEffect(PaneZoomInput);
const parsePaneZoomResult = Schema.decodeUnknownEffect(PaneZoomResult);
/**
* Yieldable Effect service for Herdr pane operations.
*
* @category services
* @since 0.8.2
*/
var PaneService = class extends Context.Service()("@herdr/sdk/PaneService") {};
/**
* Constructs pane operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makePaneService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	const decodePane = defineHerdrOperation("PaneService.decodePane", (method, id, label, options) => Effect.gen(function* () {
		const response = method === "pane.rename" ? yield* transport.request(method, {
			paneId: id,
			label
		}, options) : yield* transport.request(method, { paneId: id }, options);
		return yield* decodeHerdrWire(parsePane, response.result.pane, response.requestId);
	}));
	return PaneService.of({
		...makePaneInteraction(transport),
		split: defineHerdrOperation("PaneService.split", (targetPaneId, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.split", parsePaneSplitInput, input);
			const base = {
				targetPaneId: targetPaneId ?? null,
				workspaceId: Option.getOrNull(parsed.workspaceId),
				direction: parsed.direction,
				ratio: Option.getOrNull(parsed.ratio),
				cwd: Option.getOrNull(parsed.cwd)
			};
			const withEnv = Option.match(parsed.env, {
				onNone: () => base,
				onSome: (env) => ({
					...base,
					env
				})
			});
			const parameters = Option.match(parsed.focus, {
				onNone: () => withEnv,
				onSome: (focus) => ({
					...withEnv,
					focus
				})
			});
			const withRightClick = Option.match(parsed.rightClick, {
				onNone: () => parameters,
				onSome: (rightClick) => ({
					...parameters,
					rightClick
				})
			});
			const response = yield* transport.request("pane.split", withRightClick, options);
			return yield* decodeHerdrWire(parsePane, response.result.pane, response.requestId);
		})),
		swap: defineHerdrOperation("PaneService.swap", (input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.swap", parsePaneSwapInput, input);
			const parameters = parsed.direction !== void 0 ? {
				paneId: Option.getOrNull(parsed.paneId),
				direction: parsed.direction,
				sourcePaneId: null,
				targetPaneId: null
			} : {
				paneId: null,
				direction: null,
				sourcePaneId: parsed.sourcePaneId,
				targetPaneId: parsed.targetPaneId
			};
			const response = yield* transport.request("pane.swap", parameters, options);
			return yield* decodeHerdrWire(parsePaneSwapResult, response.result.swap, response.requestId);
		})),
		move: defineHerdrOperation("PaneService.move", (paneId, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.move", parsePaneMoveInput, input);
			const destination = encodePaneMoveDestination(parsed.destination);
			const parameters = Option.match(parsed.focus, {
				onNone: () => ({
					paneId,
					destination
				}),
				onSome: (focus) => ({
					paneId,
					destination,
					focus
				})
			});
			const response = yield* transport.request("pane.move", parameters, options);
			return yield* decodeHerdrWire(parsePaneMoveResult, response.result.move_result, response.requestId);
		})),
		zoom: defineHerdrOperation("PaneService.zoom", (paneId, input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.zoom", parsePaneZoomInput, input);
			const parameters = Option.match(parsed.mode, {
				onNone: () => ({ paneId: paneId ?? null }),
				onSome: (mode) => ({
					paneId: paneId ?? null,
					mode
				})
			});
			const response = yield* transport.request("pane.zoom", parameters, options);
			return yield* decodeHerdrWire(parsePaneZoomResult, response.result.zoom, response.requestId);
		})),
		layout: defineHerdrOperation("PaneService.layout", (paneId, options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("pane.layout", { paneId: paneId ?? null }, options);
			return yield* decodeHerdrWire(parsePaneLayoutSnapshot, response.result.layout, response.requestId);
		})),
		processInfo: defineHerdrOperation("PaneService.processInfo", (paneId, options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("pane.process_info", { paneId: paneId ?? null }, options);
			return yield* decodeHerdrWire(parsePaneProcessInfo, response.result.process_info, response.requestId);
		})),
		neighbor: defineHerdrOperation("PaneService.neighbor", (paneId, direction, options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("pane.neighbor", {
				paneId: paneId ?? null,
				direction
			}, options);
			return yield* decodeHerdrWire(parsePaneNeighborResult, response.result.neighbor, response.requestId);
		})),
		edges: defineHerdrOperation("PaneService.edges", (paneId, options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("pane.edges", { paneId: paneId ?? null }, options);
			return yield* decodeHerdrWire(parsePaneEdgesResult, response.result.edges, response.requestId);
		})),
		focusDirection: defineHerdrOperation("PaneService.focusDirection", (direction, input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.focusDirection", parsePaneFocusDirectionInput, input);
			const response = yield* transport.request("pane.focus_direction", {
				direction,
				paneId: Option.getOrNull(parsed.paneId)
			}, options);
			return yield* decodeHerdrWire(parsePaneFocusDirectionResult, response.result.focus, response.requestId);
		})),
		resize: defineHerdrOperation("PaneService.resize", (direction, input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.resize", parsePaneResizeInput, input);
			const response = yield* transport.request("pane.resize", {
				direction,
				paneId: Option.getOrNull(parsed.paneId),
				amount: Option.getOrNull(parsed.amount)
			}, options);
			return yield* decodeHerdrWire(parsePaneResizeResult, response.result.resize, response.requestId);
		})),
		list: defineHerdrOperation("PaneService.list", (input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.list", parsePaneListInput, input);
			const response = yield* transport.request("pane.list", { workspaceId: Option.getOrNull(parsed.workspaceId) }, options);
			return yield* decodeHerdrWire(parsePanes, response.result.panes, response.requestId);
		})),
		current: defineHerdrOperation("PaneService.current", (input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.current", parsePaneCurrentInput, input);
			const response = yield* transport.request("pane.current", { callerPaneId: Option.getOrNull(parsed.callerPaneId) }, options);
			return yield* decodeHerdrWire(parsePane, response.result.pane, response.requestId);
		})),
		get: defineHerdrOperation("PaneService.get", (id, options = {}) => decodePane("pane.get", id, null, options)),
		focus: defineHerdrOperation("PaneService.focus", (id, options = {}) => decodePane("pane.focus", id, null, options)),
		rename: defineHerdrOperation("PaneService.rename", (id, label, options = {}) => Effect.gen(function* () {
			const parsedLabel = label === null ? null : yield* decodeHerdrInput("PaneService.rename", parsePaneLabel, label);
			return yield* decodePane("pane.rename", id, parsedLabel, options);
		})),
		setInputRouting: defineHerdrOperation("PaneService.setInputRouting", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.setInputRouting", parsePaneInputRoutingInput, input);
			yield* transport.request("pane.input.set", {
				paneId: id,
				rightClick: parsed.rightClick
			}, options);
		})),
		sendText: defineHerdrOperation("PaneService.sendText", (id, text, options = {}) => Effect.gen(function* () {
			const parsedText = yield* decodeHerdrInput("PaneService.sendText", parsePaneText, text);
			yield* transport.request("pane.send_text", {
				paneId: id,
				text: parsedText
			}, options);
		})),
		sendKeys: defineHerdrOperation("PaneService.sendKeys", (id, keys, options = {}) => Effect.gen(function* () {
			const parsedKeys = yield* decodeHerdrInput("PaneService.sendKeys", parsePaneKeySequence, keys);
			yield* transport.request("pane.send_keys", {
				paneId: id,
				keys: parsedKeys
			}, options);
		})),
		sendInput: defineHerdrOperation("PaneService.sendInput", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.sendInput", parsePaneInput, input);
			if (parsed.text === void 0) {
				if (parsed.keys === void 0) return yield* Effect.die(/* @__PURE__ */ new Error("PaneInput schema produced neither text nor keys"));
				yield* transport.request("pane.send_input", {
					paneId: id,
					keys: parsed.keys
				}, options);
				return;
			}
			if (parsed.keys === void 0) {
				yield* transport.request("pane.send_input", {
					paneId: id,
					text: parsed.text
				}, options);
				return;
			}
			yield* transport.request("pane.send_input", {
				paneId: id,
				text: parsed.text,
				keys: parsed.keys
			}, options);
		})),
		read: defineHerdrOperation("PaneService.read", (id, input, options = {}) => Effect.gen(function* () {
			const parameters = yield* encodePaneReadParameters(yield* decodeHerdrInput("PaneService.read", parsePaneReadInput, input)).pipe(Effect.orDie);
			const response = yield* transport.request("pane.read", {
				paneId: id,
				...parameters
			}, options);
			return yield* decodeHerdrWire(parsePaneReadResult, response.result.read, response.requestId);
		})),
		waitForOutput: defineHerdrOperation("PaneService.waitForOutput", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.waitForOutput", parsePaneWaitForOutputInput, input);
			const base = {
				paneId: id,
				source: parsed.source,
				lines: Option.getOrNull(parsed.lines),
				match: parsed.match,
				timeoutMs: Option.getOrNull(parsed.timeoutMs)
			};
			const parameters = Option.match(parsed.stripAnsi, {
				onNone: () => base,
				onSome: (stripAnsi) => ({
					...base,
					stripAnsi
				})
			});
			const response = yield* transport.request("pane.wait_for_output", parameters, options);
			return yield* decodeHerdrWire(parsePaneOutputMatchResult, response.result, response.requestId);
		})),
		reportAgent: defineHerdrOperation("PaneService.reportAgent", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.reportAgent", parsePaneAgentReportInput, input);
			yield* transport.request("pane.report_agent", {
				paneId: id,
				source: parsed.source,
				agent: parsed.agent,
				state: parsed.state,
				message: Option.getOrNull(parsed.message),
				seq: Option.getOrNull(parsed.sequence),
				agentSessionId: Option.getOrNull(parsed.sessionId),
				agentSessionPath: Option.getOrNull(parsed.sessionPath),
				resumeArgv: Option.getOrNull(parsed.resumeArgv)
			}, options);
		})),
		reportAgentSession: defineHerdrOperation("PaneService.reportAgentSession", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.reportAgentSession", parsePaneAgentSessionReportInput, input);
			yield* transport.request("pane.report_agent_session", {
				paneId: id,
				source: parsed.source,
				agent: parsed.agent,
				seq: Option.getOrNull(parsed.sequence),
				sessionStartSource: Option.getOrNull(parsed.sessionStartSource),
				agentSessionId: Option.getOrNull(parsed.sessionId),
				agentSessionPath: Option.getOrNull(parsed.sessionPath),
				resumeArgv: Option.getOrNull(parsed.resumeArgv)
			}, options);
		})),
		reportMetadata: defineHerdrOperation("PaneService.reportMetadata", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.reportMetadata", parsePaneMetadataReportInput, input);
			const base = {
				paneId: id,
				source: parsed.source,
				agent: Option.getOrNull(parsed.agent),
				appliesToSource: Option.getOrNull(parsed.appliesToSource),
				title: Option.getOrNull(parsed.title),
				displayAgent: Option.getOrNull(parsed.displayAgent),
				seq: Option.getOrNull(parsed.sequence),
				ttlMs: Option.getOrNull(parsed.ttlMs)
			};
			const withStateLabels = Option.match(parsed.stateLabels, {
				onNone: () => base,
				onSome: (stateLabels) => ({
					...base,
					stateLabels
				})
			});
			const withTokens = Option.match(parsed.tokens, {
				onNone: () => withStateLabels,
				onSome: (tokens) => ({
					...withStateLabels,
					tokens
				})
			});
			const withClearTitle = Option.match(parsed.clearTitle, {
				onNone: () => withTokens,
				onSome: (clearTitle) => ({
					...withTokens,
					clearTitle
				})
			});
			const withClearDisplayAgent = Option.match(parsed.clearDisplayAgent, {
				onNone: () => withClearTitle,
				onSome: (clearDisplayAgent) => ({
					...withClearTitle,
					clearDisplayAgent
				})
			});
			const parameters = Option.match(parsed.clearStateLabels, {
				onNone: () => withClearDisplayAgent,
				onSome: (clearStateLabels) => ({
					...withClearDisplayAgent,
					clearStateLabels
				})
			});
			yield* transport.request("pane.report_metadata", parameters, options);
		})),
		clearAgentAuthority: defineHerdrOperation("PaneService.clearAgentAuthority", (id, input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.clearAgentAuthority", parsePaneClearAgentAuthorityInput, input);
			yield* transport.request("pane.clear_agent_authority", {
				paneId: id,
				source: Option.getOrNull(parsed.source),
				seq: Option.getOrNull(parsed.sequence)
			}, options);
		})),
		releaseAgent: defineHerdrOperation("PaneService.releaseAgent", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PaneService.releaseAgent", parsePaneReleaseAgentInput, input);
			yield* transport.request("pane.release_agent", {
				paneId: id,
				source: parsed.source,
				agent: parsed.agent,
				seq: Option.getOrNull(parsed.sequence)
			}, options);
		})),
		close: defineHerdrOperation("PaneService.close", (id, options = {}) => transport.request("pane.close", { paneId: id }, options).pipe(Effect.asVoid))
	});
});
/**
* Provides pane operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const paneServiceLayerWithoutDependencies = Layer.effect(PaneService, makePaneService);
/**
* Production pane-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const paneServiceLayer = paneServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
function encodePaneMoveDestination(destination) {
	switch (destination.type) {
		case "tab": return {
			type: destination.type,
			tabId: destination.tabId,
			targetPaneId: Option.getOrNull(destination.targetPaneId),
			split: destination.split,
			ratio: Option.getOrNull(destination.ratio)
		};
		case "new_tab": return {
			type: destination.type,
			workspaceId: Option.getOrNull(destination.workspaceId),
			label: Option.getOrNull(destination.label)
		};
		case "new_workspace": return {
			type: destination.type,
			label: Option.getOrNull(destination.label),
			tabLabel: Option.getOrNull(destination.tabLabel)
		};
	}
}
//#endregion
//#region src/plugin-service.ts
/**
* Manages installed plugins and their actions, logs, links, and panes.
*
* Nested plugin capabilities remain parent-owned while preserving placement-specific pane results and schema-normalized invocation context.
*
* @since 0.8.2
*/
const parseInstalledPlugin = Schema.decodeUnknownEffect(InstalledPlugin);
const parseInstalledPlugins = Schema.decodeUnknownEffect(Schema.Array(InstalledPlugin));
const parsePluginActionInvocation = Schema.decodeUnknownEffect(PluginActionInvocation);
const parsePluginActions = Schema.decodeUnknownEffect(Schema.Array(PluginAction));
const parsePluginCommandLogs = Schema.decodeUnknownEffect(Schema.Array(PluginCommandLog));
const parsePluginFilterInput = Schema.decodeEffect(PluginFilterInput);
const parsePluginActionInvokeInput = Schema.decodeEffect(PluginActionInvokeInput);
const parsePluginLinkInput = Schema.decodeEffect(PluginLinkInput);
const parsePluginLogListInput = Schema.decodeEffect(PluginLogListInput);
const parsePluginPane = Schema.decodeUnknownEffect(PluginPane);
const parsePluginPaneCloseResult = Schema.decodeUnknownEffect(PluginPaneCloseResult);
const parsePluginPaneOpenInput = Schema.decodeEffect(PluginPaneOpenInput);
const parsePluginUnlinkResult = Schema.decodeUnknownEffect(PluginUnlinkResult);
/**
* Yieldable Effect service for Herdr plugin operations.
*
* @category services
* @since 0.8.2
*/
var PluginService = class extends Context.Service()("@herdr/sdk/PluginService") {};
/**
* Constructs plugin operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makePluginService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	function openPluginPane(pluginId, input, options = {}) {
		return Effect.fn("PluginService.panes.open")(function* () {
			const parsed = yield* decodeHerdrInput("PluginService.panes.open", parsePluginPaneOpenInput, input);
			const base = {
				pluginId,
				entrypoint: parsed.entrypoint,
				placement: Option.getOrNull(parsed.placement),
				width: Option.getOrNull(parsed.width),
				height: Option.getOrNull(parsed.height),
				workspaceId: Option.getOrNull(parsed.workspaceId),
				targetPaneId: Option.getOrNull(parsed.targetPaneId),
				direction: Option.getOrNull(parsed.direction),
				cwd: Option.getOrNull(parsed.cwd)
			};
			const withEnv = Option.match(parsed.env, {
				onNone: () => base,
				onSome: (env) => ({
					...base,
					env
				})
			});
			const parameters = Option.match(parsed.focus, {
				onNone: () => withEnv,
				onSome: (focus) => ({
					...withEnv,
					focus
				})
			});
			const response = yield* transport.request("plugin.pane.open", parameters, options);
			const placement = Option.getOrUndefined(parsed.placement);
			if (placement === "popup") {
				if (response.result.type === "ok") return;
				return yield* new HerdrUnsupportedResult("plugin.pane.open", response.result.type, "ok", response.requestId);
			}
			if (placement !== void 0 && response.result.type === "ok") return yield* new HerdrUnsupportedResult("plugin.pane.open", response.result.type, "plugin_pane_opened", response.requestId);
			if (response.result.type === "ok") return;
			return yield* decodeHerdrWire(parsePluginPane, response.result.plugin_pane, response.requestId);
		})();
	}
	const actions = {
		list: defineHerdrOperation("PluginService.actions.list", (input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PluginService.actions.list", parsePluginFilterInput, input);
			const response = yield* transport.request("plugin.action.list", { pluginId: Option.getOrNull(parsed.pluginId) }, options);
			return yield* decodeHerdrWire(parsePluginActions, response.result.actions, response.requestId);
		})),
		invoke: defineHerdrOperation("PluginService.actions.invoke", (id, input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PluginService.actions.invoke", parsePluginActionInvokeInput, input);
			const context = Option.match(parsed.context, {
				onNone: () => null,
				onSome: encodePluginInvocationContext
			});
			const response = yield* transport.request("plugin.action.invoke", {
				actionId: id,
				pluginId: Option.getOrNull(parsed.pluginId),
				context
			}, options);
			return yield* decodeHerdrWire(parsePluginActionInvocation, response.result, response.requestId);
		}))
	};
	const logs = { list: defineHerdrOperation("PluginService.logs.list", (input = {}, options = {}) => Effect.gen(function* () {
		const parsed = yield* decodeHerdrInput("PluginService.logs.list", parsePluginLogListInput, input);
		const response = yield* transport.request("plugin.log.list", {
			pluginId: Option.getOrNull(parsed.pluginId),
			limit: Option.getOrNull(parsed.limit)
		}, options);
		return yield* decodeHerdrWire(parsePluginCommandLogs, response.result.logs, response.requestId);
	})) };
	const panes = {
		open: openPluginPane,
		focus: defineHerdrOperation("PluginService.panes.focus", (paneId, options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("plugin.pane.focus", { paneId }, options);
			return yield* decodeHerdrWire(parsePluginPane, response.result.plugin_pane, response.requestId);
		})),
		close: defineHerdrOperation("PluginService.panes.close", (paneId, options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("plugin.pane.close", { paneId }, options);
			return yield* decodeHerdrWire(parsePluginPaneCloseResult, response.result, response.requestId);
		}))
	};
	const setEnabled = defineHerdrOperation("PluginService.setEnabled", (method, id, options) => Effect.gen(function* () {
		const response = yield* transport.request(method, { pluginId: id }, options);
		return yield* decodeHerdrWire(parseInstalledPlugin, response.result.plugin, response.requestId);
	}));
	return PluginService.of({
		actions,
		logs,
		panes,
		link: defineHerdrOperation("PluginService.link", (input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PluginService.link", parsePluginLinkInput, input);
			const source = Option.match(parsed.source, {
				onNone: () => null,
				onSome: encodePluginSourceInput
			});
			const base = {
				path: parsed.path,
				source
			};
			const parameters = Option.match(parsed.enabled, {
				onNone: () => base,
				onSome: (enabled) => ({
					...base,
					enabled
				})
			});
			const response = yield* transport.request("plugin.link", parameters, options);
			return yield* decodeHerdrWire(parseInstalledPlugin, response.result.plugin, response.requestId);
		})),
		list: defineHerdrOperation("PluginService.list", (input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("PluginService.list", parsePluginFilterInput, input);
			const response = yield* transport.request("plugin.list", { pluginId: Option.getOrNull(parsed.pluginId) }, options);
			return yield* decodeHerdrWire(parseInstalledPlugins, response.result.plugins, response.requestId);
		})),
		unlink: defineHerdrOperation("PluginService.unlink", (id, options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("plugin.unlink", { pluginId: id }, options);
			return yield* decodeHerdrWire(parsePluginUnlinkResult, response.result, response.requestId);
		})),
		enable: defineHerdrOperation("PluginService.enable", (id, options = {}) => setEnabled("plugin.enable", id, options)),
		disable: defineHerdrOperation("PluginService.disable", (id, options = {}) => setEnabled("plugin.disable", id, options))
	});
});
/**
* Provides plugin operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const pluginServiceLayerWithoutDependencies = Layer.effect(PluginService, makePluginService);
/**
* Production plugin-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const pluginServiceLayer = pluginServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
function encodePluginInvocationContext(context) {
	return {
		workspaceId: Option.getOrNull(context.workspaceId),
		workspaceLabel: Option.getOrNull(context.workspaceLabel),
		workspaceCwd: Option.getOrNull(context.workspaceCwd),
		worktree: Option.getOrNull(context.worktree),
		tabId: Option.getOrNull(context.tabId),
		tabLabel: Option.getOrNull(context.tabLabel),
		focusedPaneId: Option.getOrNull(context.focusedPaneId),
		focusedPaneCwd: Option.getOrNull(context.focusedPaneCwd),
		focusedPaneAgent: Option.getOrNull(context.focusedPaneAgent),
		focusedPaneStatus: Option.getOrNull(context.focusedPaneStatus),
		selectedText: Option.getOrNull(context.selectedText),
		invocationSource: Option.getOrNull(context.invocationSource),
		correlationId: Option.getOrNull(context.correlationId),
		clickedUrl: Option.getOrNull(context.clickedUrl),
		linkHandlerId: Option.getOrNull(context.linkHandlerId)
	};
}
function encodePluginSourceInput(source) {
	const base = {
		owner: Option.getOrNull(source.owner),
		repo: Option.getOrNull(source.repo),
		subdir: Option.getOrNull(source.subdir),
		requestedRef: Option.getOrNull(source.requestedRef),
		resolvedCommit: Option.getOrNull(source.resolvedCommit),
		managedPath: Option.getOrNull(source.managedPath),
		installedUnixMs: Option.getOrNull(source.installedUnixMs)
	};
	return Option.match(source.kind, {
		onNone: () => base,
		onSome: (kind) => ({
			...base,
			kind
		})
	});
}
//#endregion
//#region src/popup-service.ts
/**
* Controls the active foreground popup.
*
* Popup closure remains separate from plugin-pane lifecycle because it targets client UI state rather than a persistent pane resource.
*
* @since 0.8.2
*/
/**
* Yieldable Effect service for foreground popup operations.
*
* @category services
* @since 0.8.2
*/
var PopupService = class extends Context.Service()("@herdr/sdk/PopupService") {};
/**
* Constructs popup operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makePopupService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return PopupService.of({ close: defineHerdrOperation("PopupService.close", (options = {}) => transport.request("popup.close", {}, options).pipe(Effect.asVoid)) });
});
/**
* Provides popup operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const popupServiceLayerWithoutDependencies = Layer.effect(PopupService, makePopupService);
/**
* Production popup-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const popupServiceLayer = popupServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/server-service.ts
/**
* Controls Herdr server lifecycle and compatibility operations.
*
* The server service exposes ping, stop, live handoff, configuration reload, agent-manifest cache inspection, and connection-scoped SSH agent registration through the shared transport.
*
* @since 0.8.2
*/
const parseAgentManifests = Schema.decodeUnknownEffect(Schema.Array(AgentManifest));
const parseAgentManifestStatus = Schema.decodeUnknownEffect(AgentManifestStatus);
const parseConfigReloadResult = Schema.decodeUnknownEffect(ConfigReloadResult);
const parsePingResult = Schema.decodeUnknownEffect(PingResult);
const parseServerLiveHandoffInput = Schema.decodeEffect(ServerLiveHandoffInput);
const parseServerSshAgentRegisterInput = Schema.decodeEffect(ServerSshAgentRegisterInput);
/**
* Yieldable Effect service for Herdr server operations.
*
* @category services
* @since 0.8.2
*/
var ServerService = class extends Context.Service()("@herdr/sdk/ServerService") {};
/**
* Constructs server operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeServerService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	const registerScoped = (input, options = {}) => Effect.gen(function* () {
		const parsed = yield* decodeHerdrInput("ServerService.sshAgent.registerScoped", parseServerSshAgentRegisterInput, input);
		const opened = yield* transport.openStream("server.ssh_agent.register", { socketPath: parsed.socketPath }, options);
		const closed = yield* Deferred.make();
		yield* opened.readBytes.pipe(Stream.runDrain, Effect.flatMap(() => Effect.fail(new HerdrSshAgentRegistrationClosed(opened.requestId))), Effect.onExit((exit) => Exit.isFailure(exit) ? Deferred.failCause(closed, exit.cause) : Effect.void), Effect.forkScoped);
		return {
			requestId: opened.requestId,
			socketPath: parsed.socketPath,
			registrationState: () => Deferred.isDone(closed).pipe(Effect.map((done) => done ? "closed" : "registered")),
			awaitClosed: () => Deferred.await(closed)
		};
	}).pipe(Effect.withSpan("ServerService.sshAgent.registerScoped"));
	return ServerService.of({
		sshAgent: {
			registerScoped,
			withRegistration: (input, use, options = {}) => Effect.scoped(Effect.gen(function* () {
				const registration = yield* registerScoped(input, options);
				return yield* use(registration).pipe(Effect.raceFirst(registration.awaitClosed()));
			}))
		},
		ping: defineHerdrOperation("ServerService.ping", (options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("ping", {}, options);
			return yield* decodeHerdrWire(parsePingResult, response.result, response.requestId);
		})),
		stop: defineHerdrOperation("ServerService.stop", (options = {}) => transport.request("server.stop", {}, options).pipe(Effect.asVoid)),
		liveHandoff: defineHerdrOperation("ServerService.liveHandoff", (input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("ServerService.liveHandoff", parseServerLiveHandoffInput, input);
			yield* transport.request("server.live_handoff", {
				importExe: Option.getOrNull(parsed.importExe),
				expectedProtocol: Option.getOrNull(parsed.expectedProtocol),
				expectedVersion: Option.getOrNull(parsed.expectedVersion)
			}, options);
		})),
		reloadConfig: defineHerdrOperation("ServerService.reloadConfig", (options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("server.reload_config", {}, options);
			return yield* decodeHerdrWire(parseConfigReloadResult, response.result, response.requestId);
		})),
		getAgentManifests: defineHerdrOperation("ServerService.getAgentManifests", (options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("server.agent_manifests", {}, options);
			return yield* decodeHerdrWire(parseAgentManifestStatus, response.result, response.requestId);
		})),
		reloadAgentManifests: defineHerdrOperation("ServerService.reloadAgentManifests", (options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("server.reload_agent_manifests", {}, options);
			return yield* decodeHerdrWire(parseAgentManifests, response.result.manifests, response.requestId);
		}))
	});
});
/**
* Provides server operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const serverServiceLayerWithoutDependencies = Layer.effect(ServerService, makeServerService);
/**
* Production server-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const serverServiceLayer = serverServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/session-service.ts
/**
* Reads an immutable snapshot of the active Herdr session.
*
* A session snapshot returns workspaces, tabs, panes, agents, focus, and protocol state from one consistent server response.
*
* @since 0.8.2
*/
const parseSessionSnapshot = Schema.decodeUnknownEffect(SessionSnapshot);
/**
* Yieldable Effect service for Herdr session operations.
*
* @category services
* @since 0.8.2
*/
var SessionService = class extends Context.Service()("@herdr/sdk/SessionService") {};
/**
* Constructs session operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeSessionService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return SessionService.of({ snapshot: defineHerdrOperation("SessionService.snapshot", (options = {}) => Effect.gen(function* () {
		const response = yield* transport.request("session.snapshot", {}, options);
		return yield* decodeHerdrWire(parseSessionSnapshot, response.result.snapshot, response.requestId);
	})) });
});
/**
* Provides session operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const sessionServiceLayerWithoutDependencies = Layer.effect(SessionService, makeSessionService);
/**
* Production session-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const sessionServiceLayer = sessionServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/tab-service.ts
/**
* Controls Herdr tab lifecycle, focus, labels, and ordering.
*
* Tab creation returns its root pane atomically, while list and move operations preserve server display order.
*
* @since 0.8.2
*/
const parseTab = Schema.decodeUnknownEffect(Tab);
const parseTabs = Schema.decodeUnknownEffect(Schema.Array(Tab));
const parseTabCreateInput = Schema.decodeEffect(TabCreateInput);
const parseTabCreateResult = Schema.decodeUnknownEffect(TabCreateResult);
const parseTabLabel = Schema.decodeEffect(Schema.String);
const parseTabListInput = Schema.decodeEffect(TabListInput);
const parseTabMoveInput = Schema.decodeEffect(TabMoveInput);
/**
* Yieldable Effect service for Herdr tab operations.
*
* @category services
* @since 0.8.2
*/
var TabService = class extends Context.Service()("@herdr/sdk/TabService") {};
/**
* Constructs tab operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeTabService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return TabService.of({
		create: defineHerdrOperation("TabService.create", (input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("TabService.create", parseTabCreateInput, input);
			const parametersWithoutEnvAndFocus = {
				workspaceId: Option.getOrNull(parsed.workspaceId),
				cwd: Option.getOrNull(parsed.cwd),
				label: Option.getOrNull(parsed.label)
			};
			const parametersWithoutFocus = Option.match(parsed.env, {
				onNone: () => parametersWithoutEnvAndFocus,
				onSome: (env) => ({
					...parametersWithoutEnvAndFocus,
					env
				})
			});
			const parameters = Option.match(parsed.focus, {
				onNone: () => parametersWithoutFocus,
				onSome: (focus) => ({
					...parametersWithoutFocus,
					focus
				})
			});
			const response = yield* transport.request("tab.create", parameters, options);
			return yield* decodeHerdrWire(parseTabCreateResult, response.result, response.requestId);
		})),
		list: defineHerdrOperation("TabService.list", (input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("TabService.list", parseTabListInput, input);
			const response = yield* transport.request("tab.list", { workspaceId: Option.getOrNull(parsed.workspaceId) }, options);
			return yield* decodeHerdrWire(parseTabs, response.result.tabs, response.requestId);
		})),
		get: defineHerdrOperation("TabService.get", (id, options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("tab.get", { tabId: id }, options);
			return yield* decodeHerdrWire(parseTab, response.result.tab, response.requestId);
		})),
		focus: defineHerdrOperation("TabService.focus", (id, options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("tab.focus", { tabId: id }, options);
			return yield* decodeHerdrWire(parseTab, response.result.tab, response.requestId);
		})),
		rename: defineHerdrOperation("TabService.rename", (id, label, options = {}) => Effect.gen(function* () {
			const parsedLabel = yield* decodeHerdrInput("TabService.rename", parseTabLabel, label);
			const response = yield* transport.request("tab.rename", {
				tabId: id,
				label: parsedLabel
			}, options);
			return yield* decodeHerdrWire(parseTab, response.result.tab, response.requestId);
		})),
		move: defineHerdrOperation("TabService.move", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("TabService.move", parseTabMoveInput, input);
			const response = yield* transport.request("tab.move", {
				tabId: id,
				insertIndex: parsed.insertIndex
			}, options);
			return yield* decodeHerdrWire(parseTabs, response.result.tabs, response.requestId);
		})),
		close: defineHerdrOperation("TabService.close", (id, options = {}) => transport.request("tab.close", { tabId: id }, options).pipe(Effect.asVoid))
	});
});
/**
* Provides tab operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const tabServiceLayerWithoutDependencies = Layer.effect(TabService, makeTabService);
/**
* Production tab-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const tabServiceLayer = tabServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/workspace-service.ts
/**
* Controls Herdr workspace lifecycle, focus, ordering, and metadata.
*
* Workspace creation returns the initial tab and pane atomically, and block movement preserves contiguous workspace groups.
*
* @since 0.8.2
*/
const parseWorkspace = Schema.decodeUnknownEffect(Workspace);
const parseWorkspaces = Schema.decodeUnknownEffect(Schema.Array(Workspace));
const parseWorkspaceCreateOptions = Schema.decodeEffect(WorkspaceCreateOptions, { onExcessProperty: "error" });
const parseWorkspaceDirectory = Schema.decodeEffect(HerdrAbsolutePath);
const parseWorkspaceCreateResult = Schema.decodeUnknownEffect(WorkspaceCreateResult);
const parseWorkspaceLabel = Schema.decodeEffect(Schema.String);
const parseWorkspaceMetadataReportInput = Schema.decodeEffect(WorkspaceMetadataReportInput);
const parseWorkspaceMoveBlockInput = Schema.decodeEffect(WorkspaceMoveBlockInput);
const parseWorkspaceMoveInput = Schema.decodeEffect(WorkspaceMoveInput);
/**
* Yieldable Effect service for Herdr workspace operations.
*
* @category services
* @since 0.8.2
*/
var WorkspaceService = class extends Context.Service()("@herdr/sdk/WorkspaceService") {};
/**
* Constructs workspace operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeWorkspaceService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	const readWorkspace = defineHerdrOperation("WorkspaceService.readWorkspace", (operation, id, options) => Effect.gen(function* () {
		const response = yield* transport.request(operation, { workspaceId: id }, options);
		return yield* decodeHerdrWire(parseWorkspace, response.result.workspace, response.requestId);
	}));
	const createWorkspace = (operation, source, input, options) => Effect.gen(function* () {
		const parsed = yield* decodeHerdrInput(operation, parseWorkspaceCreateOptions, input);
		const directory = source.kind === "directory" ? { cwd: source.cwd } : source.kind === "workspace" ? { sourceWorkspaceId: source.sourceWorkspaceId } : {};
		const response = yield* transport.request("workspace.create", {
			...directory,
			label: Option.getOrNull(parsed.label),
			...Option.isSome(parsed.env) ? { env: parsed.env.value } : {},
			...Option.isSome(parsed.focus) ? { focus: parsed.focus.value } : {}
		}, options);
		return yield* decodeHerdrWire(parseWorkspaceCreateResult, response.result, response.requestId);
	});
	return WorkspaceService.of({
		create: defineHerdrOperation("WorkspaceService.create", (input = {}, options = {}) => createWorkspace("WorkspaceService.create", { kind: "default" }, input, options)),
		createInDirectory: defineHerdrOperation("WorkspaceService.createInDirectory", (cwd, input = {}, options = {}) => Effect.gen(function* () {
			const directory = yield* decodeHerdrInput("WorkspaceService.createInDirectory", parseWorkspaceDirectory, cwd);
			return yield* createWorkspace("WorkspaceService.createInDirectory", {
				kind: "directory",
				cwd: directory
			}, input, options);
		})),
		createFromWorkspace: defineHerdrOperation("WorkspaceService.createFromWorkspace", (sourceWorkspaceId, input = {}, options = {}) => createWorkspace("WorkspaceService.createFromWorkspace", {
			kind: "workspace",
			sourceWorkspaceId
		}, input, options)),
		list: defineHerdrOperation("WorkspaceService.list", (options = {}) => Effect.gen(function* () {
			const response = yield* transport.request("workspace.list", {}, options);
			return yield* decodeHerdrWire(parseWorkspaces, response.result.workspaces, response.requestId);
		})),
		get: defineHerdrOperation("WorkspaceService.get", (id, options = {}) => readWorkspace("workspace.get", id, options)),
		focus: defineHerdrOperation("WorkspaceService.focus", (id, options = {}) => readWorkspace("workspace.focus", id, options)),
		rename: defineHerdrOperation("WorkspaceService.rename", (id, label, options = {}) => Effect.gen(function* () {
			const parsedLabel = yield* decodeHerdrInput("WorkspaceService.rename", parseWorkspaceLabel, label);
			const response = yield* transport.request("workspace.rename", {
				workspaceId: id,
				label: parsedLabel
			}, options);
			return yield* decodeHerdrWire(parseWorkspace, response.result.workspace, response.requestId);
		})),
		move: defineHerdrOperation("WorkspaceService.move", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("WorkspaceService.move", parseWorkspaceMoveInput, input);
			const response = yield* transport.request("workspace.move", {
				workspaceId: id,
				insertIndex: parsed.insertIndex
			}, options);
			return yield* decodeHerdrWire(parseWorkspaces, response.result.workspaces, response.requestId);
		})),
		moveBlock: defineHerdrOperation("WorkspaceService.moveBlock", (ids, input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("WorkspaceService.moveBlock", parseWorkspaceMoveBlockInput, input);
			const response = yield* transport.request("workspace.move_block", {
				workspaceIds: ids,
				beforeWorkspaceId: Option.getOrNull(parsed.beforeWorkspaceId)
			}, options);
			return yield* decodeHerdrWire(parseWorkspaces, response.result.workspaces, response.requestId);
		})),
		reportMetadata: defineHerdrOperation("WorkspaceService.reportMetadata", (id, input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("WorkspaceService.reportMetadata", parseWorkspaceMetadataReportInput, input);
			yield* transport.request("workspace.report_metadata", {
				workspaceId: id,
				source: parsed.source,
				tokens: parsed.tokens,
				seq: Option.getOrNull(parsed.sequence),
				ttlMs: Option.getOrNull(parsed.ttlMs)
			}, options);
		})),
		close: defineHerdrOperation("WorkspaceService.close", (id, options = {}) => transport.request("workspace.close", { workspaceId: id }, options).pipe(Effect.asVoid)),
		closeGroup: defineHerdrOperation("WorkspaceService.closeGroup", (id, options = {}) => transport.request("workspace.close", {
			workspaceId: id,
			closeGroup: true
		}, options).pipe(Effect.asVoid))
	});
});
/**
* Provides workspace operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const workspaceServiceLayerWithoutDependencies = Layer.effect(WorkspaceService, makeWorkspaceService);
/**
* Production workspace-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const workspaceServiceLayer = workspaceServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/worktree-service.ts
/**
* Discovers and manages Git worktrees through Herdr workspaces.
*
* Repository access requires an explicit trusted source, and create or open operations return the associated workspace, tab, and root pane together.
*
* @since 0.8.2
*/
const parseWorktreeCreateInput = Schema.decodeEffect(WorktreeCreateInput);
const parseWorktreeCreateResult = Schema.decodeUnknownEffect(WorktreeCreateResult);
const parseWorktreeListInput = Schema.decodeEffect(WorktreeListInput);
const parseWorktreeListResult = Schema.decodeUnknownEffect(WorktreeListResult);
const parseWorktreeOpenInput = Schema.decodeEffect(WorktreeOpenInput);
const parseWorktreeOpenResult = Schema.decodeUnknownEffect(WorktreeOpenResult);
const parseWorktreeRemoveInput = Schema.decodeEffect(WorktreeRemoveInput);
const parseWorktreeRemoveResult = Schema.decodeUnknownEffect(WorktreeRemoveResult);
/**
* Yieldable Effect service for Git worktree operations.
*
* @category services
* @since 0.8.2
*/
var WorktreeService = class extends Context.Service()("@herdr/sdk/WorktreeService") {};
/**
* Constructs worktree operations while preserving the shared transport requirement.
*
* @category constructors
* @since 0.8.2
*/
const makeWorktreeService = Effect.gen(function* () {
	const transport = yield* HerdrTransport;
	return WorktreeService.of({
		list: defineHerdrOperation("WorktreeService.list", (input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("WorktreeService.list", parseWorktreeListInput, input);
			const base = {
				workspaceId: Option.getOrNull(parsed.workspaceId),
				cwd: Option.getOrNull(parsed.cwd)
			};
			const parameters = Option.match(parsed.trustRepository, {
				onNone: () => base,
				onSome: (trustRepository) => ({
					...base,
					trustRepository
				})
			});
			const response = yield* transport.request("worktree.list", parameters, options);
			return yield* decodeHerdrWire(parseWorktreeListResult, response.result, response.requestId);
		})),
		create: defineHerdrOperation("WorktreeService.create", (input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("WorktreeService.create", parseWorktreeCreateInput, input);
			const parametersWithoutFocus = {
				workspaceId: Option.getOrNull(parsed.workspaceId),
				cwd: Option.getOrNull(parsed.cwd),
				branch: Option.getOrNull(parsed.branch),
				base: Option.getOrNull(parsed.base),
				path: Option.getOrNull(parsed.path),
				label: Option.getOrNull(parsed.label)
			};
			const withFocus = Option.match(parsed.focus, {
				onNone: () => parametersWithoutFocus,
				onSome: (focus) => ({
					...parametersWithoutFocus,
					focus
				})
			});
			const parameters = Option.match(parsed.trustRepository, {
				onNone: () => withFocus,
				onSome: (trustRepository) => ({
					...withFocus,
					trustRepository
				})
			});
			const response = yield* transport.request("worktree.create", parameters, options);
			return yield* decodeHerdrWire(parseWorktreeCreateResult, response.result, response.requestId);
		})),
		open: defineHerdrOperation("WorktreeService.open", (input, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("WorktreeService.open", parseWorktreeOpenInput, input);
			const parametersWithoutFocus = {
				workspaceId: Option.getOrNull(parsed.workspaceId),
				cwd: Option.getOrNull(parsed.cwd),
				path: Option.getOrNull(parsed.path),
				branch: Option.getOrNull(parsed.branch),
				label: Option.getOrNull(parsed.label)
			};
			const withFocus = Option.match(parsed.focus, {
				onNone: () => parametersWithoutFocus,
				onSome: (focus) => ({
					...parametersWithoutFocus,
					focus
				})
			});
			const parameters = Option.match(parsed.trustRepository, {
				onNone: () => withFocus,
				onSome: (trustRepository) => ({
					...withFocus,
					trustRepository
				})
			});
			const response = yield* transport.request("worktree.open", parameters, options);
			return yield* decodeHerdrWire(parseWorktreeOpenResult, response.result, response.requestId);
		})),
		remove: defineHerdrOperation("WorktreeService.remove", (workspaceId, input = {}, options = {}) => Effect.gen(function* () {
			const parsed = yield* decodeHerdrInput("WorktreeService.remove", parseWorktreeRemoveInput, input);
			const withForce = Option.match(parsed.force, {
				onNone: () => ({ workspaceId }),
				onSome: (force) => ({
					workspaceId,
					force
				})
			});
			const parameters = Option.match(parsed.trustRepository, {
				onNone: () => withForce,
				onSome: (trustRepository) => ({
					...withForce,
					trustRepository
				})
			});
			const response = yield* transport.request("worktree.remove", parameters, options);
			return yield* decodeHerdrWire(parseWorktreeRemoveResult, response.result, response.requestId);
		}))
	});
});
/**
* Provides worktree operations while retaining the shared transport requirement.
*
* @category layers
* @since 0.8.2
*/
const worktreeServiceLayerWithoutDependencies = Layer.effect(WorktreeService, makeWorktreeService);
/**
* Production worktree-service Layer using the ambient Herdr transport graph.
*
* @category layers
* @since 0.8.2
*/
const worktreeServiceLayer = worktreeServiceLayerWithoutDependencies.pipe(Layer.provide(herdrTransportLayer));
//#endregion
//#region src/herdr-sdk.ts
/**
* Composes the complete Effect-native Herdr SDK.
*
* `HerdrSdk` is a yieldable namespace aggregate; its production Layer shares one configuration and transport while direct service Layers preserve visible requirements.
*
* @since 0.8.2
*/
/**
* Yieldable Effect service aggregating the independently constructed Herdr namespaces.
*
* @category services
* @since 0.8.2
*/
var HerdrSdk = class extends Context.Service()("@herdr/sdk/HerdrSdk") {};
/**
* Aggregates exact contextual service values without constructing or proxying them.
*
* @category constructors
* @since 0.8.2
*/
const makeHerdrSdk = Effect.gen(function* () {
	const config = yield* HerdrConfig;
	const clientShell = yield* ClientShellService;
	const commands = yield* CommandService;
	const productAnnouncements = yield* ProductAnnouncementService;
	const releaseNotes = yield* ReleaseNotesService;
	const server = yield* ServerService;
	const session = yield* SessionService;
	const notifications = yield* NotificationService;
	const client = yield* ClientService;
	const workspaces = yield* WorkspaceService;
	const worktrees = yield* WorktreeService;
	const tabs = yield* TabService;
	const panes = yield* PaneService;
	const layouts = yield* LayoutService;
	const agents = yield* AgentService;
	const events = yield* EventService;
	const integrations = yield* IntegrationService;
	const plugins = yield* PluginService;
	const popups = yield* PopupService;
	return HerdrSdk.of({
		config,
		clientShell,
		commands,
		productAnnouncements,
		releaseNotes,
		ids: herdrIds,
		server,
		session,
		notifications,
		client,
		workspaces,
		worktrees,
		tabs,
		panes,
		layouts,
		agents,
		events,
		integrations,
		plugins,
		popups
	});
});
/**
* Bundles Herdr namespace services while preserving their requirements.
*
* @category layers
* @since 0.8.2
*/
const herdrSdkLayerWithoutDependencies = Layer.effect(HerdrSdk, makeHerdrSdk);
const herdrNamespaceServicesLayerWithoutDependencies = Layer.mergeAll(clientShellServiceLayerWithoutDependencies, commandServiceLayerWithoutDependencies, productAnnouncementServiceLayerWithoutDependencies, releaseNotesServiceLayerWithoutDependencies, serverServiceLayerWithoutDependencies, sessionServiceLayerWithoutDependencies, notificationServiceLayerWithoutDependencies, clientServiceLayerWithoutDependencies, workspaceServiceLayerWithoutDependencies, worktreeServiceLayerWithoutDependencies, tabServiceLayerWithoutDependencies, paneServiceLayerWithoutDependencies, layoutServiceLayerWithoutDependencies, agentServiceLayerWithoutDependencies, eventServiceLayerWithoutDependencies, integrationServiceLayerWithoutDependencies, pluginServiceLayerWithoutDependencies, popupServiceLayerWithoutDependencies);
function makeHerdrSdkLayer(configLayer) {
	const sharedDependencies = herdrTransportLayerWithoutDependencies.pipe(Layer.provideMerge(configLayer));
	const configuredNamespaces = herdrNamespaceServicesLayerWithoutDependencies.pipe(Layer.provideMerge(sharedDependencies));
	return herdrSdkLayerWithoutDependencies.pipe(Layer.provide(configuredNamespaces));
}
/**
* Production SDK Layer sharing one ambient configuration and transport instance.
*
* @category layers
* @since 0.8.2
*/
const herdrSdkLayer = makeHerdrSdkLayer(herdrConfigLayer);
/**
* Creates a production SDK Layer with explicit options ahead of ambient configuration.
*
* @category layers
* @since 0.8.2
*/
function herdrSdkLayerFromOptions(options) {
	return makeHerdrSdkLayer(herdrConfigLayerFromOptions(options));
}
//#endregion
export { Agent, AgentManifest, AgentManifestStatus, AgentName, AgentPromptInput, AgentService, AgentSessionReference, AgentSessionReferenceKind, AgentStartInput, AgentStartResult, AgentStatus, AgentTarget, AgentViewClearInput, AgentViewField, AgentViewFilter, AgentViewSetInput, AgentViewSort, AgentViewSortField, AgentViewState, AgentViewValue, AgentWaitInput, CLIENT_SHELL_HOST_PALETTE_MAX_ENTRIES, ClientService, ClientShellAgent, ClientShellAgentCompletions, ClientShellAgentView, ClientShellAgentViewProjection, ClientShellCell, ClientShellCommand, ClientShellCommandAction, ClientShellConnectInput, ClientShellCursor, ClientShellFrame, ClientShellGraphicsAssetKey, ClientShellGraphicsScene, ClientShellHostColor, ClientShellHostThemeInput, ClientShellKeyCode, ClientShellKeyInput, ClientShellMouseAction, ClientShellMouseInput, ClientShellMousePosition, ClientShellPane, ClientShellPopupSurface, ClientShellPresentationEvent, ClientShellProductAnnouncement, ClientShellProjection, ClientShellReleaseNotes, ClientShellService, ClientShellSurface, ClientShellSurfaceAcknowledgement, ClientShellSurfacePane, ClientShellSurfacePatch, ClientShellSurfaceSplit, ClientShellSurfaceState, ClientShellTab, ClientShellWindowsKeyRecord, ClientShellWorkspace, ClientShellWorktree, ClientWindowTitleResult, CommandPaneInput, CommandService, CommandTabInput, ConfigReloadResult, EndpointBootId, EventMatch, EventService, EventSubscriptionSpec, EventWaitInput, HerdrAbsolutePath, HerdrApplication, HerdrCommandId, HerdrConfig, HerdrConfigOptions, HerdrConfigurationError, HerdrEndpointClosed, HerdrEndpointInvalidMessage, HerdrEndpointNegotiationError, HerdrEndpointRequestTimeout, HerdrEndpointStaleReference, HerdrEndpointTransportError, HerdrEndpointUnsupportedMethod, HerdrEnvironment, HerdrEvent, HerdrEventsLost, HerdrInsertIndex, HerdrInvalidInput, HerdrInvalidResponse, HerdrJsonValue, HerdrKeySequence, HerdrMetadataTokenPatch, HerdrMetadataTokens, HerdrMetadataTtl, HerdrMilliseconds, HerdrPopupSize, HerdrProtocolVersion, HerdrRequestDeadline, HerdrRequestTimeout, HerdrResumeArgv, HerdrRevision, HerdrSdk, HerdrServerError, HerdrSessionName, HerdrSplitRatio, HerdrSshAgentRegistrationClosed, HerdrStateChangeSequence, HerdrTransport, HerdrTransportError, HerdrTransportRequestOptions, HerdrUnixMilliseconds, HerdrUnixSeconds, HerdrUnsupportedEvent, HerdrUnsupportedProtocol, HerdrUnsupportedResult, InstalledPlugin, IntegrationChangeResult, IntegrationInfo, IntegrationService, IntegrationState, IntegrationTarget, LayoutApplyInput, LayoutDescription, LayoutNode, LayoutService, LayoutSetSplitRatioInput, LayoutTarget, LifecycleSubscriptionType, NotificationService, NotificationShowInput, NotificationShowResult, Pane, PaneAgentReportInput, PaneAgentSessionReportInput, PaneClearAgentAuthorityInput, PaneContentRevision, PaneCopyMotion, PaneCopyMotionInput, PaneCopyMotionResult, PaneCopySearchInput, PaneCopySearchResult, PaneCurrentInput, PaneDirection, PaneEdgesResult, PaneFocusDirectionInput, PaneFocusDirectionResult, PaneId, PaneInput, PaneInputRoutingInput, PaneLayoutRect, PaneLayoutSnapshot, PaneLinkActivateInput, PaneLinkActivatedResult, PaneLinkRegion, PaneLinkResolveInput, PaneLinkResolvedResult, PaneListInput, PaneMetadataReportInput, PaneMoveDestination, PaneMoveInput, PaneMoveResult, PaneNeighborResult, PaneOutputMatch, PaneOutputMatchResult, PaneProcess, PaneProcessInfo, PaneReadFormat, PaneReadInput, PaneReadResult, PaneReadSource, PaneReleaseAgentInput, PaneResizeInput, PaneResizeResult, PaneRightClickTarget, PaneScroll, PaneScrollInput, PaneScrollOffset, PaneSelectionReadInput, PaneSelectionResult, PaneService, PaneSplitInput, PaneSwapInput, PaneSwapResult, PaneTextPoint, PaneTextRange, PaneWaitForOutputInput, PaneZoomInput, PaneZoomMode, PaneZoomResult, PingResult, PluginAction, PluginActionContext, PluginActionId, PluginActionInvocation, PluginActionInvokeInput, PluginCommandLog, PluginFilterInput, PluginId, PluginInvocationContext, PluginInvocationContextInput, PluginLinkInput, PluginLogId, PluginLogListInput, PluginManifestAction, PluginManifestCommand, PluginManifestEventHook, PluginManifestLinkHandler, PluginManifestPane, PluginPane, PluginPaneCloseResult, PluginPaneOpenInput, PluginPanePlacement, PluginPlatform, PluginService, PluginSource, PluginSourceInput, PluginUnlinkResult, PopupService, ProductAnnouncementDismissInput, ProductAnnouncementId, ProductAnnouncementService, ProjectionRevision, ReleaseNotesDismissInput, ReleaseNotesService, ReportedAgentState, ServerCapabilities, ServerLiveHandoffInput, ServerService, ServerSshAgentRegisterInput, SessionService, SessionSnapshot, SplitDirection, SurfaceRect, SurfaceRevision, Tab, TabCreateInput, TabCreateResult, TabId, TabListInput, TabMoveInput, TabService, TerminalId, Workspace, WorkspaceCreateOptions, WorkspaceCreateResult, WorkspaceId, WorkspaceMetadataReportInput, WorkspaceMoveBlockInput, WorkspaceMoveInput, WorkspaceService, WorkspaceWorktree, Worktree, WorktreeCreateInput, WorktreeCreateResult, WorktreeListInput, WorktreeListResult, WorktreeOpenInput, WorktreeOpenResult, WorktreeRemoveInput, WorktreeRemoveResult, WorktreeService, WorktreeSourceInfo, agentServiceLayer, agentServiceLayerWithoutDependencies, clientServiceLayer, clientServiceLayerWithoutDependencies, clientShellServiceLayer, clientShellServiceLayerWithoutDependencies, commandServiceLayer, commandServiceLayerWithoutDependencies, eventServiceLayer, eventServiceLayerWithoutDependencies, herdrConfigLayer, herdrConfigLayerFromOptions, herdrConfigLayerFromValue, herdrConfigLayerWithoutDependencies, herdrConfigRecipe, herdrIds, herdrSdkLayer, herdrSdkLayerFromOptions, herdrSdkLayerWithoutDependencies, herdrTransportLayer, herdrTransportLayerWithoutDependencies, integrationServiceLayer, integrationServiceLayerWithoutDependencies, layoutServiceLayer, layoutServiceLayerWithoutDependencies, makeAgentService, makeClientService, makeClientShellService, makeCommandService, makeEventService, makeHerdrConfig, makeHerdrSdk, makeIntegrationService, makeLayoutService, makeNotificationService, makePaneService, makePluginService, makePopupService, makeProductAnnouncementService, makeReleaseNotesService, makeServerService, makeSessionService, makeTabService, makeWorkspaceService, makeWorktreeService, notificationServiceLayer, notificationServiceLayerWithoutDependencies, paneServiceLayer, paneServiceLayerWithoutDependencies, parseAgentName, parseHerdrAbsolutePath, parseHerdrInsertIndex, parseHerdrMetadataTtl, parseHerdrMilliseconds, parseHerdrPopupSize, parseHerdrResumeArgv, parseHerdrRevision, parseHerdrSessionName, parseHerdrSplitRatio, parseHerdrStateChangeSequence, parseHerdrUnixMilliseconds, parseHerdrUnixSeconds, parsePaneId, parsePluginActionId, parsePluginId, parsePluginLogId, parseTabId, parseTerminalId, parseWorkspaceId, pluginServiceLayer, pluginServiceLayerWithoutDependencies, popupServiceLayer, popupServiceLayerWithoutDependencies, productAnnouncementServiceLayer, productAnnouncementServiceLayerWithoutDependencies, releaseNotesServiceLayer, releaseNotesServiceLayerWithoutDependencies, serverServiceLayer, serverServiceLayerWithoutDependencies, sessionServiceLayer, sessionServiceLayerWithoutDependencies, tabServiceLayer, tabServiceLayerWithoutDependencies, workspaceServiceLayer, workspaceServiceLayerWithoutDependencies, worktreeServiceLayer, worktreeServiceLayerWithoutDependencies };
