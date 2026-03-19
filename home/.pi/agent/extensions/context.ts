/**
 * /context
 *
 * Small TUI view showing what's loaded/available:
 * - extensions (best-effort from registered extension slash commands)
 * - skills
 * - project context files (AGENTS.md / CLAUDE.md)
 * - current context window usage + session totals (tokens/cost)
 *
 * Also supports opening:
 * - raw captured provider payload (actual request payload sent to the model)
 * - annotated debug export with section breakdowns
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, Key, Text, matchesKey, type Component, type TUI } from "@mariozechner/pi-tui";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

type ProjectContextFile = {
    path: string;
    shortPath: string;
    content: string;
    tokens: number;
    bytes: number;
};

type SkillIndexEntry = {
    name: string;
    skillFilePath: string;
    skillDir: string;
};

type CapturedProviderPayload = {
    sessionId: string;
    timestamp: number;
    cwd: string;
    provider?: string;
    model?: string;
    payload: unknown;
    serializedPayload: string;
};

const PROVIDER_PAYLOAD_CACHE_DIR = path.join(getAgentDir(), ".cache", "context-payloads");

type ToolSummary = {
    name: string;
    description: string;
    tokens: number;
};

type ExtensionSummary = {
    path: string;
    fileName: string;
    commands: string[];
};

type LoadedSkillSummary = {
    name: string;
    shortPath: string;
    content: string;
};

type SnapshotUsage = {
    messageTokens: number;
    contextWindow: number;
    effectiveTokens: number;
    percent: number;
    remainingTokens: number;
    systemPromptTokens: number;
    agentTokens: number;
    toolsTokens: number;
    activeTools: number;
};

type ContextSnapshot = {
    cwd: string;
    sessionId: string;
    capturedPayload: CapturedProviderPayload | null;
    usage: SnapshotUsage | null;
    systemPrompt: string;
    systemPromptTokens: number;
    agentFiles: ProjectContextFile[];
    extensions: ExtensionSummary[];
    skills: string[];
    loadedSkills: string[];
    loadedSkillFiles: LoadedSkillSummary[];
    tools: ToolSummary[];
    activeToolNames: string[];
    session: { totalTokens: number; totalCost: number };
};

function formatUsd(cost: number): string {
    if (!Number.isFinite(cost) || cost <= 0) return "$0.00";
    if (cost >= 1) return `$${cost.toFixed(2)}`;
    if (cost >= 0.1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(4)}`;
}

function formatTimestamp(timestamp: number): string {
    try {
        return new Date(timestamp).toISOString();
    } catch {
        return String(timestamp);
    }
}

function estimateTokens(text: string): number {
    // Deliberately fuzzy (good enough for “how big-ish is this”).
    return Math.max(0, Math.ceil(text.length / 4));
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeReadPath(inputPath: string, cwd: string): string {
    // Similar to pi's resolveToCwd/resolveReadPath, but simplified.
    let p = inputPath;
    if (p.startsWith("@")) p = p.slice(1);
    if (p === "~") p = os.homedir();
    else if (p.startsWith("~/")) p = path.join(os.homedir(), p.slice(2));
    if (!path.isAbsolute(p)) p = path.resolve(cwd, p);
    return path.resolve(p);
}

function getAgentDir(): string {
    // Mirrors pi's behavior reasonably well.
    const envCandidates = ["PI_CODING_AGENT_DIR", "TAU_CODING_AGENT_DIR"];
    let envDir: string | undefined;
    for (const k of envCandidates) {
        if (process.env[k]) {
            envDir = process.env[k];
            break;
        }
    }
    if (!envDir) {
        for (const [k, v] of Object.entries(process.env)) {
            if (k.endsWith("_CODING_AGENT_DIR") && v) {
                envDir = v;
                break;
            }
        }
    }

    if (envDir) {
        if (envDir === "~") return os.homedir();
        if (envDir.startsWith("~/")) return path.join(os.homedir(), envDir.slice(2));
        return envDir;
    }
    return path.join(os.homedir(), ".pi", "agent");
}

async function readFileIfExists(filePath: string): Promise<{ path: string; content: string; bytes: number } | null> {
    if (!existsSync(filePath)) return null;
    try {
        const buf = await fs.readFile(filePath);
        return { path: filePath, content: buf.toString("utf8"), bytes: buf.byteLength };
    } catch {
        return null;
    }
}

async function loadProjectContextFiles(cwd: string): Promise<ProjectContextFile[]> {
    const out: ProjectContextFile[] = [];
    const seen = new Set<string>();

    const loadFromDir = async (dir: string) => {
        for (const name of ["AGENTS.md", "CLAUDE.md"]) {
            const p = path.join(dir, name);
            const f = await readFileIfExists(p);
            if (f && !seen.has(f.path)) {
                seen.add(f.path);
                out.push({
                    path: f.path,
                    shortPath: shortenPath(f.path, cwd),
                    content: f.content,
                    tokens: estimateTokens(f.content),
                    bytes: f.bytes,
                });
                // pi loads at most one of those per dir
                return;
            }
        }
    };

    await loadFromDir(getAgentDir());

    // Ancestors: root → cwd (same order as pi)
    const stack: string[] = [];
    let current = path.resolve(cwd);
    while (true) {
        stack.push(current);
        const parent = path.resolve(current, "..");
        if (parent === current) break;
        current = parent;
    }
    stack.reverse();
    for (const dir of stack) await loadFromDir(dir);

    return out;
}

function normalizeSkillName(name: string): string {
    return name.startsWith("skill:") ? name.slice("skill:".length) : name;
}

function buildSkillIndex(pi: ExtensionAPI, cwd: string): SkillIndexEntry[] {
    return pi
        .getCommands()
        .filter((c) => c.source === "skill")
        .map((c) => {
            const p = c.path ? normalizeReadPath(c.path, cwd) : "";
            return {
                name: normalizeSkillName(c.name),
                skillFilePath: p,
                skillDir: p ? path.dirname(p) : "",
            };
        })
        .filter((x) => x.name && x.skillDir);
}

const SKILL_LOADED_ENTRY = "context:skill_loaded";

type SkillLoadedEntryData = {
    name: string;
    path: string;
};

function getLoadedSkillsFromSession(ctx: ExtensionContext): Set<string> {
    const out = new Set<string>();
    for (const e of ctx.sessionManager.getEntries()) {
        if ((e as any)?.type !== "custom") continue;
        if ((e as any)?.customType !== SKILL_LOADED_ENTRY) continue;
        const data = (e as any)?.data as SkillLoadedEntryData | undefined;
        if (data?.name) out.add(data.name);
    }
    return out;
}

function extractCostTotal(usage: any): number {
    if (!usage) return 0;
    const c = usage?.cost;
    if (typeof c === "number") return Number.isFinite(c) ? c : 0;
    if (typeof c === "string") {
        const n = Number(c);
        return Number.isFinite(n) ? n : 0;
    }
    const t = c?.total;
    if (typeof t === "number") return Number.isFinite(t) ? t : 0;
    if (typeof t === "string") {
        const n = Number(t);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function sumSessionUsage(ctx: ExtensionContext): {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
} {
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    let totalCost = 0;

    for (const entry of ctx.sessionManager.getEntries()) {
        if ((entry as any)?.type !== "message") continue;
        const msg = (entry as any)?.message;
        if (!msg || msg.role !== "assistant") continue;
        const usage = msg.usage;
        if (!usage) continue;
        input += Number(usage.inputTokens ?? 0) || 0;
        output += Number(usage.outputTokens ?? 0) || 0;
        cacheRead += Number(usage.cacheRead ?? 0) || 0;
        cacheWrite += Number(usage.cacheWrite ?? 0) || 0;
        totalCost += extractCostTotal(usage);
    }

    return {
        input,
        output,
        cacheRead,
        cacheWrite,
        totalTokens: input + output + cacheRead + cacheWrite,
        totalCost,
    };
}

function shortenPath(p: string, cwd: string): string {
    const rp = path.resolve(p);
    const rc = path.resolve(cwd);
    if (rp === rc) return ".";
    if (rp.startsWith(rc + path.sep)) return "./" + rp.slice(rc.length + 1);
    return rp;
}

function renderUsageBar(
    theme: any,
    parts: { system: number; tools: number; convo: number; remaining: number },
    total: number,
    width: number,
): string {
    const w = Math.max(10, width);
    if (total <= 0) return "";

    const toCols = (n: number) => Math.round((n / total) * w);
    let sys = toCols(parts.system);
    let tools = toCols(parts.tools);
    let con = toCols(parts.convo);
    let rem = w - sys - tools - con;
    if (rem < 0) rem = 0;
    // adjust rounding drift
    while (sys + tools + con + rem < w) rem++;
    while (sys + tools + con + rem > w && rem > 0) rem--;

    const block = "█";
    const sysStr = theme.fg("accent", block.repeat(sys));
    const toolsStr = theme.fg("warning", block.repeat(tools));
    const conStr = theme.fg("success", block.repeat(con));
    const remStr = theme.fg("dim", block.repeat(rem));
    return `${sysStr}${toolsStr}${conStr}${remStr}`;
}

function joinComma(items: string[]): string {
    return items.join(", ");
}

function joinCommaStyled(items: string[], renderItem: (item: string) => string, sep: string): string {
    return items.map(renderItem).join(sep);
}

function cloneUnknown<T>(value: T): T {
    try {
        return structuredClone(value);
    } catch {
        return value;
    }
}

function safeJsonStringify(value: unknown): string {
    if (typeof value === "string") return value;
    if (value === undefined) return "undefined";
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(
        value,
        (_key, current) => {
            if (typeof current === "bigint") return `${current.toString()}n`;
            if (typeof current === "function") return `[Function ${current.name || "anonymous"}]`;
            if (typeof current === "symbol") return current.toString();
            if (current instanceof Error) {
                return {
                    name: current.name,
                    message: current.message,
                    stack: current.stack,
                };
            }
            if (typeof Buffer !== "undefined" && Buffer.isBuffer(current)) {
                return {
                    type: "Buffer",
                    length: current.length,
                    data: current.toString("base64"),
                };
            }
            if (current instanceof Map) {
                return {
                    type: "Map",
                    entries: Array.from(current.entries()),
                };
            }
            if (current instanceof Set) {
                return {
                    type: "Set",
                    values: Array.from(current.values()),
                };
            }
            if (current && typeof current === "object") {
                if (seen.has(current)) return "[Circular]";
                seen.add(current);
            }
            return current;
        },
        2,
    );
    return serialized ?? String(value);
}

function formatUsageSummary(usage: SnapshotUsage | null): string {
    if (!usage) return "(unknown)";
    return `~${usage.effectiveTokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} (${usage.percent.toFixed(1)}% used, ~${usage.remainingTokens.toLocaleString()} left)`;
}

function getProviderPayloadCachePath(sessionId: string): string {
    return path.join(PROVIDER_PAYLOAD_CACHE_DIR, `${sessionId}.json`);
}

function persistCapturedProviderPayload(captured: CapturedProviderPayload): void {
    try {
        mkdirSync(PROVIDER_PAYLOAD_CACHE_DIR, { recursive: true });
        writeFileSync(getProviderPayloadCachePath(captured.sessionId), JSON.stringify(captured), "utf8");
    } catch {
        // Best-effort cache only.
    }
}

async function loadCachedProviderPayload(sessionId: string): Promise<CapturedProviderPayload | null> {
    const cachePath = getProviderPayloadCachePath(sessionId);
    if (!existsSync(cachePath)) return null;

    try {
        const raw = await fs.readFile(cachePath, "utf8");
        const parsed = JSON.parse(raw) as Partial<CapturedProviderPayload>;
        if (!parsed || typeof parsed !== "object") return null;
        if (parsed.sessionId !== sessionId) return null;
        if (typeof parsed.timestamp !== "number") return null;
        if (typeof parsed.cwd !== "string") return null;
        if (typeof parsed.serializedPayload !== "string") return null;

        return {
            sessionId,
            timestamp: parsed.timestamp,
            cwd: parsed.cwd,
            provider: typeof parsed.provider === "string" ? parsed.provider : undefined,
            model: typeof parsed.model === "string" ? parsed.model : undefined,
            payload: parsed.payload,
            serializedPayload: parsed.serializedPayload,
        };
    } catch {
        return null;
    }
}

function payloadCodeFenceLanguage(serializedPayload: string): string {
    const trimmed = serializedPayload.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
    return "text";
}

function formatUnknownBlock(value: unknown): string {
    if (typeof value === "string") return value;
    return safeJsonStringify(value);
}

function formatMessageContent(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return formatUnknownBlock(content);

    const parts: string[] = [];
    for (const item of content) {
        if (!item || typeof item !== "object") {
            parts.push(String(item));
            continue;
        }

        const part = item as any;
        if (part.type === "text" && typeof part.text === "string") {
            parts.push(part.text);
            continue;
        }
        if (part.type === "thinking" && typeof part.thinking === "string") {
            parts.push(`[thinking]\n${part.thinking}`);
            continue;
        }
        if (part.type === "image") {
            parts.push(`[image${part?.source?.mediaType ? `: ${part.source.mediaType}` : ""}]`);
            continue;
        }
        parts.push(formatUnknownBlock(part));
    }
    return parts.join("\n\n");
}

function formatSessionConversationDump(ctx: ExtensionContext): string {
    const lines: string[] = [];

    for (const entry of ctx.sessionManager.getBranch()) {
        if ((entry as any)?.type !== "message") continue;
        const msg = (entry as any)?.message;
        if (!msg) continue;

        const role = typeof msg.role === "string" ? msg.role : "unknown";
        const toolName = typeof msg.toolName === "string" ? ` (${msg.toolName})` : "";
        const customType = typeof msg.customType === "string" ? ` [${msg.customType}]` : "";
        lines.push(`### ${role}${toolName}${customType}`);
        lines.push("");
        lines.push("```text");
        lines.push(formatMessageContent(msg.content ?? ""));
        lines.push("```");
        lines.push("");
    }

    return lines.length ? lines.join("\n").trimEnd() : "(no session messages found)";
}

function extractPayloadConversationBlocks(payload: unknown): Array<{ title: string; body: string }> {
    if (!payload || typeof payload !== "object") return [];

    const record = payload as Record<string, unknown>;
    const blocks: Array<{ title: string; body: string }> = [];

    const system = record.system;
    if (system !== undefined) {
        blocks.push({ title: "payload.system", body: formatUnknownBlock(system) });
    }

    const messages = record.messages;
    if (Array.isArray(messages)) {
        messages.forEach((message, index) => {
            blocks.push({ title: `payload.messages[${index}]`, body: formatUnknownBlock(message) });
        });
    }

    const input = record.input;
    if (Array.isArray(input)) {
        input.forEach((item, index) => {
            blocks.push({ title: `payload.input[${index}]`, body: formatUnknownBlock(item) });
        });
    }

    const contents = record.contents;
    if (Array.isArray(contents)) {
        contents.forEach((item, index) => {
            blocks.push({ title: `payload.contents[${index}]`, body: formatUnknownBlock(item) });
        });
    }

    return blocks;
}

function openFileInExternalEditor(tui: TUI, filePath: string): { ok: boolean; reason?: string } {
    const editorCmd = process.env.VISUAL || process.env.EDITOR;
    if (!editorCmd) return { ok: false, reason: "No VISUAL or EDITOR configured" };

    try {
        tui.stop();
        const [editor, ...editorArgs] = editorCmd.split(" ");
        const result = spawnSync(editor, [...editorArgs, filePath], {
            stdio: "inherit",
            shell: process.platform === "win32",
        });

        if (result.error) {
            return { ok: false, reason: result.error.message };
        }
        if (result.status !== 0) {
            return { ok: false, reason: `Editor exited with status ${result.status ?? "unknown"}` };
        }
        return { ok: true };
    } finally {
        tui.start();
        const requestRender = (tui as any)?.requestRender;
        if (typeof requestRender === "function") requestRender.call(tui, true);
    }
}

async function writeExportFile(kind: "raw" | "annotated", content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = "md";
    const filePath = path.join(os.tmpdir(), `pi-context-${kind}-${timestamp}.${ext}`);
    await fs.writeFile(filePath, content, "utf8");
    return filePath;
}

function buildRawExport(snapshot: ContextSnapshot): string {
    if (!snapshot.capturedPayload) {
        return [
            "# Raw provider payload",
            "",
            "No captured payload yet.",
            "Run at least one model request in this session, then reopen `/context`.",
        ].join("\n");
    }

    const captured = snapshot.capturedPayload;
    const language = payloadCodeFenceLanguage(captured.serializedPayload);

    return [
        "# Raw provider payload",
        "",
        `- captured: ${formatTimestamp(captured.timestamp)}`,
        `- cwd: ${captured.cwd}`,
        `- session: ${captured.sessionId}`,
        `- model: ${captured.provider && captured.model ? `${captured.provider}/${captured.model}` : "(unknown)"}`,
        `- context usage estimate: ${formatUsageSummary(snapshot.usage)}`,
        "",
        `\`\`\`${language}`,
        captured.serializedPayload,
        "```",
        "",
    ].join("\n");
}

function buildAnnotatedExport(snapshot: ContextSnapshot, ctx: ExtensionContext): string {
    const payloadBlocks = snapshot.capturedPayload
        ? extractPayloadConversationBlocks(snapshot.capturedPayload.payload)
        : [];
    const payloadLanguage = snapshot.capturedPayload
        ? payloadCodeFenceLanguage(snapshot.capturedPayload.serializedPayload)
        : "text";

    const lines: string[] = [];

    lines.push("# Annotated context export");
    lines.push("");

    lines.push("## 1. Summary");
    lines.push("");
    lines.push(`- cwd: ${snapshot.cwd}`);
    lines.push(`- session: ${snapshot.sessionId}`);
    lines.push(
        `- captured payload: ${snapshot.capturedPayload ? `yes (${formatTimestamp(snapshot.capturedPayload.timestamp)})` : "no captured payload yet"}`,
    );
    lines.push(`- model: ${snapshot.capturedPayload?.provider && snapshot.capturedPayload?.model ? `${snapshot.capturedPayload.provider}/${snapshot.capturedPayload.model}` : "(unknown)"}`);
    lines.push("");

    lines.push("## 2. Context window / token estimates");
    lines.push("");
    if (!snapshot.usage) {
        lines.push("- context usage: unknown");
    } else {
        lines.push(`- effective usage: ${formatUsageSummary(snapshot.usage)}`);
        lines.push(`- message tokens: ~${snapshot.usage.messageTokens.toLocaleString()}`);
        lines.push(`- system prompt tokens: ~${snapshot.usage.systemPromptTokens.toLocaleString()}`);
        lines.push(`- AGENTS / CLAUDE tokens: ~${snapshot.usage.agentTokens.toLocaleString()}`);
        lines.push(`- tool definition tokens: ~${snapshot.usage.toolsTokens.toLocaleString()}`);
        lines.push(`- active tools: ${snapshot.usage.activeTools}`);
    }
    lines.push("");

    lines.push("## 3. System prompt");
    lines.push("");
    lines.push(`- estimated tokens: ~${snapshot.systemPromptTokens.toLocaleString()}`);
    lines.push("");
    lines.push("```text");
    lines.push(snapshot.systemPrompt || "(empty)");
    lines.push("```");
    lines.push("");

    lines.push("## 4. Context files discovered and estimated sizes");
    lines.push("");
    if (!snapshot.agentFiles.length) {
        lines.push("(none)");
        lines.push("");
    } else {
        for (const file of snapshot.agentFiles) {
            lines.push(`### ${file.shortPath}`);
            lines.push("");
            lines.push(`- size: ${formatBytes(file.bytes)} (${file.bytes} bytes)`);
            lines.push(`- estimated tokens: ~${file.tokens.toLocaleString()}`);
            lines.push("");
            lines.push("```markdown");
            lines.push(file.content);
            lines.push("```");
            lines.push("");
        }
    }

    lines.push("## 5. Extensions / skills overview");
    lines.push("");
    lines.push(`- extensions: ${snapshot.extensions.length ? snapshot.extensions.map((ext) => `${ext.fileName} (${ext.commands.join(", ")})`).join(", ") : "(none)"}`);
    lines.push(`- available skills: ${snapshot.skills.length ? snapshot.skills.join(", ") : "(none)"}`);
    lines.push(`- loaded skills: ${snapshot.loadedSkills.length ? snapshot.loadedSkills.join(", ") : "(none)"}`);
    lines.push("");
    if (snapshot.loadedSkillFiles.length) {
        lines.push("### Loaded skill files");
        lines.push("");
        for (const skill of snapshot.loadedSkillFiles) {
            lines.push(`#### ${skill.name}`);
            lines.push("");
            lines.push(`- path: ${skill.shortPath}`);
            lines.push("");
            lines.push("```markdown");
            lines.push(skill.content);
            lines.push("```");
            lines.push("");
        }
    }

    lines.push("## 6. Active tools and estimated tool token cost");
    lines.push("");
    if (!snapshot.tools.length) {
        lines.push("(none)");
        lines.push("");
    } else {
        for (const tool of snapshot.tools) {
            lines.push(`- ${tool.name}: ~${tool.tokens.toLocaleString()} tok` + (tool.description ? ` — ${tool.description}` : ""));
        }
        lines.push("");
    }

    lines.push("## 7. Session totals");
    lines.push("");
    lines.push(`- total tokens: ${snapshot.session.totalTokens.toLocaleString()}`);
    lines.push(`- total cost: ${formatUsd(snapshot.session.totalCost)}`);
    lines.push("");

    lines.push("## 8. Captured provider payload");
    lines.push("");
    if (!snapshot.capturedPayload) {
        lines.push("No captured payload yet.");
    } else {
        lines.push(`- captured: ${formatTimestamp(snapshot.capturedPayload.timestamp)}`);
        lines.push(`- provider/model: ${snapshot.capturedPayload.provider && snapshot.capturedPayload.model ? `${snapshot.capturedPayload.provider}/${snapshot.capturedPayload.model}` : "(unknown)"}`);
        lines.push("");
        lines.push(`\`\`\`${payloadLanguage}`);
        lines.push(snapshot.capturedPayload.serializedPayload);
        lines.push("```");
    }
    lines.push("");

    lines.push("## 9. Model-facing messages / conversation dump");
    lines.push("");
    if (payloadBlocks.length) {
        for (const block of payloadBlocks) {
            lines.push(`### ${block.title}`);
            lines.push("");
            lines.push("```text");
            lines.push(block.body);
            lines.push("```");
            lines.push("");
        }
    } else {
        lines.push("No obvious provider message array found in the captured payload. Falling back to the current session branch dump.");
        lines.push("");
        lines.push(formatSessionConversationDump(ctx));
        lines.push("");
    }

    lines.push("## 10. Notes on approximations / limitations");
    lines.push("");
    lines.push("- The raw payload section comes from the most recent `before_provider_request` capture for this session.");
    lines.push("- Token counts shown in the summary panel remain approximate, especially for tool schema overhead.");
    lines.push("- If `/context` is opened before any model request in the session, raw payload export is unavailable until a request has been captured.");
    lines.push("");

    return lines.join("\n");
}

type ContextViewData = {
    usage: SnapshotUsage | null;
    agentFiles: string[];
    extensions: string[];
    skills: string[];
    loadedSkills: string[];
    session: { totalTokens: number; totalCost: number };
    capturedPayload: { available: boolean; label: string };
};

type ContextViewResult = "close" | "raw" | "annotated";

type ContextViewActions = {
    onDone: (result: ContextViewResult) => void;
};

class ContextView implements Component {
    private theme: any;
    private data: ContextViewData;
    private actions: ContextViewActions;
    private container: Container;
    private body: Text;
    private cachedWidth?: number;

    constructor(_tui: TUI, theme: any, data: ContextViewData, actions: ContextViewActions) {
        this.theme = theme;
        this.data = data;
        this.actions = actions;

        this.container = new Container();
        this.container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        this.container.addChild(
            new Text(
                theme.fg("accent", theme.bold("Context")) + theme.fg("dim", "  (r raw, a annotated, Esc/q/Enter close)"),
                1,
                0,
            ),
        );
        this.container.addChild(new Text("", 1, 0));

        this.body = new Text("", 1, 0);
        this.container.addChild(this.body);

        this.container.addChild(new Text("", 1, 0));
        this.container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    }

    private rebuild(width: number): void {
        const muted = (s: string) => this.theme.fg("muted", s);
        const dim = (s: string) => this.theme.fg("dim", s);
        const text = (s: string) => this.theme.fg("text", s);

        const lines: string[] = [];

        // Window + bar
        if (!this.data.usage) {
            lines.push(muted("Window: ") + dim("(unknown)"));
        } else {
            const u = this.data.usage;
            lines.push(
                muted("Window: ") +
                    text(`~${u.effectiveTokens.toLocaleString()} / ${u.contextWindow.toLocaleString()}`) +
                    muted(`  (${u.percent.toFixed(1)}% used, ~${u.remainingTokens.toLocaleString()} left)`),
            );

            // bar width tries to fit within the viewport
            const barWidth = Math.max(10, Math.min(36, width - 10));

            // Prorate system prompt into current message context estimate, then add tools estimate.
            const sysInMessages = Math.min(u.systemPromptTokens, u.messageTokens);
            const convoInMessages = Math.max(0, u.messageTokens - sysInMessages);
            const bar =
                renderUsageBar(
                    this.theme,
                    {
                        system: sysInMessages,
                        tools: u.toolsTokens,
                        convo: convoInMessages,
                        remaining: u.remainingTokens,
                    },
                    u.contextWindow,
                    barWidth,
                ) +
                " " +
                dim("sys") +
                this.theme.fg("accent", "█") +
                " " +
                dim("tools") +
                this.theme.fg("warning", "█") +
                " " +
                dim("convo") +
                this.theme.fg("success", "█") +
                " " +
                dim("free") +
                this.theme.fg("dim", "█");
            lines.push(bar);
        }

        lines.push("");

        // System prompt + tools totals (approx)
        if (this.data.usage) {
            const u = this.data.usage;
            lines.push(
                muted("System: ") +
                    text(`~${u.systemPromptTokens.toLocaleString()} tok`) +
                    muted(` (AGENTS ~${u.agentTokens.toLocaleString()})`),
            );
            lines.push(
                muted("Tools: ") +
                    text(`~${u.toolsTokens.toLocaleString()} tok`) +
                    muted(` (${u.activeTools} active)`),
            );
        }

        lines.push(muted(`AGENTS (${this.data.agentFiles.length}): `) + text(this.data.agentFiles.length ? joinComma(this.data.agentFiles) : "(none)"));
        lines.push("");
        lines.push(muted(`Extensions (${this.data.extensions.length}): `) + text(this.data.extensions.length ? joinComma(this.data.extensions) : "(none)"));

        const loaded = new Set(this.data.loadedSkills);
        const skillsRendered = this.data.skills.length
            ? joinCommaStyled(
                    this.data.skills,
                    (name) => (loaded.has(name) ? this.theme.fg("success", name) : this.theme.fg("muted", name)),
                    this.theme.fg("muted", ", "),
                )
            : "(none)";
        lines.push(muted(`Skills (${this.data.skills.length}): `) + skillsRendered);
        lines.push("");
        lines.push(
            muted("Session: ") +
                text(`${this.data.session.totalTokens.toLocaleString()} tokens`) +
                muted(" · ") +
                text(formatUsd(this.data.session.totalCost)),
        );
        lines.push(
            muted("Payload: ") +
                (this.data.capturedPayload.available
                    ? this.theme.fg("success", this.data.capturedPayload.label)
                    : this.theme.fg("warning", this.data.capturedPayload.label)),
        );

        this.body.setText(lines.join("\n"));
        this.cachedWidth = width;
    }

    handleInput(data: string): void {
        if (
            matchesKey(data, Key.escape) ||
            matchesKey(data, Key.ctrl("c")) ||
            data.toLowerCase() === "q" ||
            data === "\r"
        ) {
            this.actions.onDone("close");
            return;
        }

        if (data.toLowerCase() === "r") {
            this.actions.onDone("raw");
            return;
        }

        if (data.toLowerCase() === "a") {
            this.actions.onDone("annotated");
            return;
        }
    }

    invalidate(): void {
        this.container.invalidate();
        this.cachedWidth = undefined;
    }

    render(width: number): string[] {
        if (this.cachedWidth !== width) this.rebuild(width);
        return this.container.render(width);
    }
}

export default function contextExtension(pi: ExtensionAPI) {
    // Track which skills were actually pulled in via read tool calls.
    let lastSessionId: string | null = null;
    let cachedLoadedSkills = new Set<string>();
    let cachedSkillIndex: SkillIndexEntry[] = [];
    const capturedProviderPayloads = new Map<string, CapturedProviderPayload>();

    const ensureCaches = (ctx: ExtensionContext) => {
        const sid = ctx.sessionManager.getSessionId();
        if (sid !== lastSessionId) {
            lastSessionId = sid;
            cachedLoadedSkills = getLoadedSkillsFromSession(ctx);
            cachedSkillIndex = buildSkillIndex(pi, ctx.cwd);
        }
        if (cachedSkillIndex.length === 0) {
            cachedSkillIndex = buildSkillIndex(pi, ctx.cwd);
        }
    };

    const matchSkillForPath = (absPath: string): string | null => {
        let best: SkillIndexEntry | null = null;
        for (const s of cachedSkillIndex) {
            if (!s.skillDir) continue;
            if (absPath === s.skillFilePath || absPath.startsWith(s.skillDir + path.sep)) {
                if (!best || s.skillDir.length > best.skillDir.length) best = s;
            }
        }
        return best?.name ?? null;
    };

    pi.on("before_provider_request", (event, ctx) => {
        const sessionId = ctx.sessionManager.getSessionId();
        const captured: CapturedProviderPayload = {
            sessionId,
            timestamp: Date.now(),
            cwd: ctx.cwd,
            provider: ctx.model?.provider,
            model: ctx.model?.id,
            payload: cloneUnknown(event.payload),
            serializedPayload: safeJsonStringify(event.payload),
        };
        capturedProviderPayloads.set(sessionId, captured);
        persistCapturedProviderPayload(captured);
    });

    pi.on("tool_result", (event: ToolResultEvent, ctx: ExtensionContext) => {
        // Only count successful reads.
        if ((event as any).toolName !== "read") return;
        if ((event as any).isError) return;

        const input = (event as any).input as { path?: unknown } | undefined;
        const p = typeof input?.path === "string" ? input.path : "";
        if (!p) return;

        ensureCaches(ctx);
        const abs = normalizeReadPath(p, ctx.cwd);
        const skillName = matchSkillForPath(abs);
        if (!skillName) return;

        if (!cachedLoadedSkills.has(skillName)) {
            cachedLoadedSkills.add(skillName);
            pi.appendEntry<SkillLoadedEntryData>(SKILL_LOADED_ENTRY, { name: skillName, path: abs });
        }
    });

    pi.registerCommand("context", {
        description: "Show loaded context overview",
        handler: async (_args, ctx: ExtensionCommandContext) => {
            ensureCaches(ctx);

            const commands = pi.getCommands();
            const extensionCmds = commands.filter((c) => c.source === "extension");
            const skillCmds = commands.filter((c) => c.source === "skill");

            const extensionsByPath = new Map<string, string[]>();
            for (const c of extensionCmds) {
                const p = c.path ?? "<unknown>";
                const arr = extensionsByPath.get(p) ?? [];
                arr.push(c.name);
                extensionsByPath.set(p, arr);
            }
            const extensionSummaries: ExtensionSummary[] = [...extensionsByPath.entries()]
                .map(([p, commandNames]) => ({
                    path: p,
                    fileName: p === "<unknown>" ? p : path.basename(p),
                    commands: [...commandNames].sort((a, b) => a.localeCompare(b)),
                }))
                .sort((a, b) => a.fileName.localeCompare(b.fileName));
            const extensionFiles = extensionSummaries.map((entry) => entry.fileName);

            const skills = skillCmds
                .map((c) => normalizeSkillName(c.name))
                .sort((a, b) => a.localeCompare(b));

            const agentFiles = await loadProjectContextFiles(ctx.cwd);
            const agentFilePaths = agentFiles.map((f) => f.shortPath);
            const agentTokens = agentFiles.reduce((a, f) => a + f.tokens, 0);

            const systemPrompt = ctx.getSystemPrompt();
            const systemPromptTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;

            const usage = ctx.getContextUsage();
            const messageTokens = usage?.tokens ?? 0;
            const ctxWindow = usage?.contextWindow ?? 0;

            // Tool definitions are not part of ctx.getContextUsage() (it estimates message tokens).
            // We approximate their token impact from tool name + description, and apply a fudge
            // factor to account for parameters/schema/formatting.
            const TOOL_FUDGE = 1.5;
            const activeToolNames = pi.getActiveTools();
            const toolInfoByName = new Map(pi.getAllTools().map((t) => [t.name, t] as const));
            const toolSummaries: ToolSummary[] = [];
            for (const name of activeToolNames) {
                const info = toolInfoByName.get(name);
                const description = info?.description ?? "";
                const blob = `${name}\n${description}`;
                toolSummaries.push({
                    name,
                    description,
                    tokens: estimateTokens(blob),
                });
            }
            let toolsTokens = toolSummaries.reduce((sum, tool) => sum + tool.tokens, 0);
            toolsTokens = Math.round(toolsTokens * TOOL_FUDGE);

            const effectiveTokens = messageTokens + toolsTokens;
            const percent = ctxWindow > 0 ? (effectiveTokens / ctxWindow) * 100 : 0;
            const remainingTokens = ctxWindow > 0 ? Math.max(0, ctxWindow - effectiveTokens) : 0;

            const sessionUsage = sumSessionUsage(ctx);
            const loadedSkills = Array.from(getLoadedSkillsFromSession(ctx)).sort((a, b) => a.localeCompare(b));

            const loadedSkillFiles: LoadedSkillSummary[] = [];
            for (const skillName of loadedSkills) {
                const skillEntry = cachedSkillIndex.find((entry) => entry.name === skillName);
                if (!skillEntry?.skillFilePath) continue;
                const file = await readFileIfExists(skillEntry.skillFilePath);
                if (!file) continue;
                loadedSkillFiles.push({
                    name: skillName,
                    shortPath: shortenPath(file.path, ctx.cwd),
                    content: file.content,
                });
            }

            const sessionId = ctx.sessionManager.getSessionId();
            let capturedPayload = capturedProviderPayloads.get(sessionId) ?? null;
            if (!capturedPayload) {
                capturedPayload = await loadCachedProviderPayload(sessionId);
                if (capturedPayload) capturedProviderPayloads.set(sessionId, capturedPayload);
            }

            const snapshot: ContextSnapshot = {
                cwd: ctx.cwd,
                sessionId,
                capturedPayload,
                usage: usage
                    ? {
                        messageTokens,
                        contextWindow: ctxWindow,
                        effectiveTokens,
                        percent,
                        remainingTokens,
                        systemPromptTokens,
                        agentTokens,
                        toolsTokens,
                        activeTools: activeToolNames.length,
                    }
                    : null,
                systemPrompt,
                systemPromptTokens,
                agentFiles,
                extensions: extensionSummaries,
                skills,
                loadedSkills,
                loadedSkillFiles,
                tools: toolSummaries.map((tool) => ({
                    ...tool,
                    tokens: Math.round(tool.tokens * TOOL_FUDGE),
                })),
                activeToolNames,
                session: { totalTokens: sessionUsage.totalTokens, totalCost: sessionUsage.totalCost },
            };

            const makePlainText = () => {
                const lines: string[] = [];
                lines.push("Context");
                if (usage) {
                    lines.push(
                        `Window: ~${effectiveTokens.toLocaleString()} / ${ctxWindow.toLocaleString()} (${percent.toFixed(1)}% used, ~${remainingTokens.toLocaleString()} left)`,
                    );
                } else {
                    lines.push("Window: (unknown)");
                }
                lines.push(`System: ~${systemPromptTokens.toLocaleString()} tok (AGENTS ~${agentTokens.toLocaleString()})`);
                lines.push(`Tools: ~${toolsTokens.toLocaleString()} tok (${activeToolNames.length} active)`);
                lines.push(`AGENTS: ${agentFilePaths.length ? joinComma(agentFilePaths) : "(none)"}`);
                lines.push(`Extensions (${extensionFiles.length}): ${extensionFiles.length ? joinComma(extensionFiles) : "(none)"}`);
                lines.push(`Skills (${skills.length}): ${skills.length ? joinComma(skills) : "(none)"}`);
                lines.push(`Session: ${sessionUsage.totalTokens.toLocaleString()} tokens · ${formatUsd(sessionUsage.totalCost)}`);
                lines.push(`Payload: ${capturedPayload ? `captured (${formatTimestamp(capturedPayload.timestamp)})` : "no captured payload yet"}`);
                return lines.join("\n");
            };

            if (!ctx.hasUI) {
                pi.sendMessage({ customType: "context", content: makePlainText(), display: true }, { triggerTurn: false });
                return;
            }

            const openExport = async (kind: "raw" | "annotated", tui: TUI | undefined) => {
                if (!snapshot.capturedPayload) {
                    ctx.ui.notify("No captured payload yet. Run at least one model request in this session first.", "warning");
                    return;
                }

                const content = kind === "raw" ? buildRawExport(snapshot) : buildAnnotatedExport(snapshot, ctx);
                const exportPath = await writeExportFile(kind, content);

                if (tui) {
                    const result = openFileInExternalEditor(tui, exportPath);
                    if (result.ok) {
                        ctx.ui.notify(`${kind === "raw" ? "Raw" : "Annotated"} context export opened: ${exportPath}`, "info");
                        return;
                    }

                    ctx.ui.notify(
                        `Saved ${kind} context export to ${exportPath}. ${result.reason ?? "External editor unavailable"}; opening pi's editor instead.`,
                        "warning",
                    );
                }

                const edited = await ctx.ui.editor(
                    kind === "raw" ? "Raw provider payload" : "Annotated context export",
                    content,
                );
                if (edited !== undefined) {
                    ctx.ui.setEditorText(edited);
                    ctx.ui.notify(`${kind === "raw" ? "Raw" : "Annotated"} context loaded into pi's editor.`, "info");
                }
            };

            const viewData: ContextViewData = {
                usage: snapshot.usage,
                agentFiles: agentFilePaths,
                extensions: extensionFiles,
                skills,
                loadedSkills,
                session: { totalTokens: sessionUsage.totalTokens, totalCost: sessionUsage.totalCost },
                capturedPayload: capturedPayload
                    ? { available: true, label: `captured ${formatTimestamp(capturedPayload.timestamp)}` }
                    : { available: false, label: "no captured payload yet" },
            };

            let viewTui: TUI | undefined;
            const viewResult = await ctx.ui.custom<ContextViewResult>((tui, theme, _kb, done) => {
                viewTui = tui;
                return new ContextView(tui, theme, viewData, {
                    onDone: done,
                });
            });

            if (viewResult === "raw") {
                await openExport("raw", viewTui);
            }
            if (viewResult === "annotated") {
                await openExport("annotated", viewTui);
            }
        },
    });
}
