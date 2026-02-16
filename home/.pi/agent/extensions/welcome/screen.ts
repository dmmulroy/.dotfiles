import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
import { getHomeDir } from "../../prelude/environment.js";
import { ansiBold } from "../../prelude/ui/ansi.js";
import { centerAnsiText, fitAnsiToWidth } from "../../prelude/ui/layout.js";
import { ansi, fgOnly, getFgAnsiCode } from "./colors.js";

export interface RecentSession {
  name: string;
  timeAgo: string;
}

export interface LoadedCounts {
  contextFiles: number;
  extensions: number;
  skills: number;
  promptTemplates: number;
}

export interface McpServerStatus {
  name: string;
  status: "connected" | "disconnected";
  directTools: number;
  totalTools: number;
  tokens: number;
}

export interface McpServerSummary {
  servers: McpServerStatus[];
  totalDirectTools: number;
  totalTokens: number;
}

const MIN_LAYOUT_WIDTH = 44;
const MIN_BOX_WIDTH = 76;
const MAX_BOX_WIDTH = 96;
const LEFT_COLUMN_WIDTH = 26;
const BOX_GAP_WIDTH = 3;

const LOADED_COUNTS_CACHE_TTL_MS = 30_000;
const RECENT_SESSIONS_CACHE_TTL_MS = 10_000;
const MCP_SERVER_SUMMARY_CACHE_TTL_MS = 10_000;

type CacheEntry<T> = {
  timestamp: number;
  value: T;
};

let loadedCountsCache: CacheEntry<LoadedCounts> | null = null;
let recentSessionsCache: (CacheEntry<RecentSession[]> & { maxCount: number }) | null = null;
let mcpServerSummaryCache: CacheEntry<McpServerSummary> | null = null;

function safeReadDir(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function safeReadJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

interface McpConfigSettings {
  directTools?: boolean;
}

interface McpServerDefinition {
  directTools?: boolean | string[];
  exposeResources?: boolean;
}

interface McpConfigFile {
  settings?: McpConfigSettings;
  mcpServers?: Record<string, McpServerDefinition>;
}

interface McpCachedTool {
  name?: string;
  description?: string;
  inputSchema?: unknown;
}

interface McpCachedResource {
  name?: string;
  description?: string;
  uri?: string;
}

interface McpServerCacheEntry {
  tools?: McpCachedTool[];
  resources?: McpCachedResource[];
}

interface McpCacheFile {
  servers?: Record<string, McpServerCacheEntry>;
}

interface McpToolMetadata {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

function normalizeDirectTools(
  value: boolean | string[] | undefined,
): true | string[] | false {
  if (value === true) return true;
  if (!Array.isArray(value)) return false;

  const normalized = value.filter((item): item is string => typeof item === "string");
  return normalized.length > 0 ? normalized : false;
}

function resolveDirectToolsFilter(
  globalSetting: boolean | undefined,
  localSetting: boolean | string[] | undefined,
): true | string[] | false {
  if (localSetting !== undefined) {
    return normalizeDirectTools(localSetting);
  }
  return globalSetting ? true : false;
}

function resourceNameToToolName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function estimateMcpToolTokens(tool: McpToolMetadata): number {
  const schemaLength = JSON.stringify(tool.inputSchema ?? {}).length;
  const descriptionLength = tool.description?.length ?? 0;
  return Math.ceil((tool.name.length + descriptionLength + schemaLength) / 4) + 10;
}

function computeBoxWidth(termWidth: number): number | null {
  if (termWidth < MIN_LAYOUT_WIDTH) return null;
  return Math.min(termWidth, Math.max(MIN_BOX_WIDTH, Math.min(termWidth - 2, MAX_BOX_WIDTH)));
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared rendering utilities
// ═══════════════════════════════════════════════════════════════════════════

const PI_LOGO = [
  "▀████████████▀",
  " ████    ███  ",
  "  ███    ███  ",
  "  ███    ███  ",
  " ▄███▄  ▄███▄ ",
];

const GRADIENT_COLORS = [
  "\x1b[38;5;199m",
  "\x1b[38;5;171m",
  "\x1b[38;5;135m",
  "\x1b[38;5;99m",
  "\x1b[38;5;75m",
  "\x1b[38;5;51m",
];

function dim(text: string): string {
  return getFgAnsiCode("sep") + text + ansi.reset;
}

function outline(text: string): string {
  return getFgAnsiCode("border") + text + ansi.reset;
}

function checkmark(): string {
  return fgOnly("gitClean", "✓");
}

function mcpStatusDot(status: McpServerStatus["status"]): string {
  return status === "connected" ? fgOnly("gitClean", "●") : fgOnly("warning", "○");
}

function gradientLine(line: string): string {
  const reset = ansi.reset;
  let result = "";
  let colorIdx = 0;
  const step = Math.max(1, Math.floor(line.length / GRADIENT_COLORS.length));

  for (let i = 0; i < line.length; i++) {
    if (i > 0 && i % step === 0 && colorIdx < GRADIENT_COLORS.length - 1) colorIdx++;
    const color = GRADIENT_COLORS[colorIdx] ?? "";
    const char = line[i] ?? "";
    if (char !== " ") {
      result += color + char + reset;
    } else {
      result += char;
    }
  }
  return result;
}

interface WelcomeData {
  modelName: string;
  providerName: string;
  recentSessions: RecentSession[];
  loadedCounts: LoadedCounts;
  mcpSummary: McpServerSummary;
}

function buildLeftColumn(data: WelcomeData, colWidth: number): string[] {
  const logoColored = PI_LOGO.map((line) => gradientLine(line));
  
  return [
    "",
    centerAnsiText(ansiBold("Welcome back!"), colWidth),
    "",
    ...logoColored.map((l) => centerAnsiText(l, colWidth)),
    "",
    centerAnsiText(fgOnly("model", data.modelName), colWidth),
    centerAnsiText(dim(data.providerName), colWidth),
  ];
}

function buildRightColumn(data: WelcomeData, colWidth: number): string[] {
  const hChar = "─";
  const separator = ` ${dim(hChar.repeat(colWidth - 2))}`;

  // Session lines
  const sessionLines: string[] = [];
  if (data.recentSessions.length === 0) {
    sessionLines.push(` ${dim("No recent sessions")}`);
  } else {
    for (const session of data.recentSessions.slice(0, 3)) {
      sessionLines.push(
        ` ${dim("• ")}${fgOnly("path", session.name)}${dim(` (${session.timeAgo})`)}`,
      );
    }
  }

  // Loaded counts lines
  const countLines: string[] = [];
  const { contextFiles, extensions, skills, promptTemplates } = data.loadedCounts;

  if (contextFiles > 0 || extensions > 0 || skills > 0 || promptTemplates > 0) {
    if (contextFiles > 0) {
      countLines.push(
        ` ${checkmark()} ${fgOnly("gitClean", `${contextFiles}`)} context file${contextFiles !== 1 ? "s" : ""}`,
      );
    }
    if (extensions > 0) {
      countLines.push(
        ` ${checkmark()} ${fgOnly("gitClean", `${extensions}`)} extension${extensions !== 1 ? "s" : ""}`,
      );
    }
    if (skills > 0) {
      countLines.push(
        ` ${checkmark()} ${fgOnly("gitClean", `${skills}`)} skill${skills !== 1 ? "s" : ""}`,
      );
    }
    if (promptTemplates > 0) {
      countLines.push(
        ` ${checkmark()} ${fgOnly("gitClean", `${promptTemplates}`)} prompt template${promptTemplates !== 1 ? "s" : ""}`,
      );
    }
  } else {
    countLines.push(` ${dim("No extensions loaded")}`);
  }

  // MCP summary lines
  const mcpLines: string[] = [];
  const visibleMcpServers = data.mcpSummary.servers.slice(0, 3);

  if (visibleMcpServers.length === 0) {
    mcpLines.push(` ${dim("No MCP servers configured")}`);
  } else {
    for (const server of visibleMcpServers) {
      const countText = `${server.directTools}/${server.totalTools}`;
      const tokenText = server.directTools > 0 ? ` ~${server.tokens.toLocaleString()}` : "";

      mcpLines.push(
        ` ${mcpStatusDot(server.status)} ${fgOnly("path", server.name)} ${dim(`${countText}${tokenText}`)}`,
      );
    }

    if (data.mcpSummary.servers.length > visibleMcpServers.length) {
      const remaining = data.mcpSummary.servers.length - visibleMcpServers.length;
      mcpLines.push(` ${dim(`+${remaining} more server${remaining === 1 ? "" : "s"}`)}`);
    }

    mcpLines.push(
      ` ${dim(`${data.mcpSummary.totalDirectTools} direct ~${data.mcpSummary.totalTokens.toLocaleString()} tokens`)}`,
    );
  }

  return [
    ` ${ansiBold(fgOnly("accent", "Tips"))}`,
    ` ${dim("/")} for commands`,
    ` ${dim("!")} to run bash`,
    ` ${dim("Shift+Tab")} cycle thinking`,
    separator,
    ` ${ansiBold(fgOnly("accent", "Loaded"))}`,
    ...countLines,
    separator,
    ` ${ansiBold(fgOnly("accent", "MCP"))}`,
    ...mcpLines,
    separator,
    ` ${ansiBold(fgOnly("accent", "Recent sessions"))}`,
    ...sessionLines,
    "",
  ];
}

function renderWelcomeBox(
  data: WelcomeData,
  termWidth: number,
  bottomLine: string,
): string[] {
  const boxWidth = computeBoxWidth(termWidth);
  if (boxWidth === null) {
    return [];
  }

  const leftCol = LEFT_COLUMN_WIDTH;
  const rightCol = Math.max(1, boxWidth - leftCol - BOX_GAP_WIDTH); // Ensure rightCol is at least 1
  
  const hChar = "─";
  const v = outline("│");
  const tl = outline("╭");
  const tr = outline("╮");
  const bl = outline("╰");
  const br = outline("╯");
  
  const leftLines = buildLeftColumn(data, leftCol);
  const rightLines = buildRightColumn(data, rightCol);
  
  const lines: string[] = [];
  
  // Top border with title
  const title = " pi agent ";
  const titlePrefix = outline(hChar.repeat(3));
  const titleStyled = titlePrefix + fgOnly("model", title);
  const titleVisLen = 3 + visibleWidth(title);
  const afterTitle = boxWidth - 2 - titleVisLen;
  const afterTitleText = afterTitle > 0 ? outline(hChar.repeat(afterTitle)) : "";
  lines.push(tl + titleStyled + afterTitleText + tr);
  
  // Content rows
  const maxRows = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < maxRows; i++) {
    const left = fitAnsiToWidth(leftLines[i] ?? "", leftCol);
    const right = fitAnsiToWidth(rightLines[i] ?? "", rightCol);
    lines.push(v + left + v + right + v);
  }
  
  // Bottom border
  lines.push(bl + bottomLine + br);

  return lines;
}

// ═══════════════════════════════════════════════════════════════════════════
// Welcome Components
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Welcome overlay component for pi agent.
 * Displays a branded splash screen with logo, tips, and loaded counts.
 */
const EMPTY_MCP_SUMMARY: McpServerSummary = {
  servers: [],
  totalDirectTools: 0,
  totalTokens: 0,
};

export class WelcomeComponent implements Component {
  private data: WelcomeData;
  private countdown: number = 30;

  constructor(
    modelName: string,
    providerName: string,
    recentSessions: RecentSession[] = [],
    loadedCounts: LoadedCounts = { contextFiles: 0, extensions: 0, skills: 0, promptTemplates: 0 },
    mcpSummary: McpServerSummary = EMPTY_MCP_SUMMARY,
  ) {
    this.data = { modelName, providerName, recentSessions, loadedCounts, mcpSummary };
  }

  setCountdown(seconds: number): void {
    this.countdown = seconds;
  }

  invalidate(): void {}

  render(termWidth: number): string[] {
    const boxWidth = computeBoxWidth(termWidth);
    if (boxWidth === null) {
      return [];
    }

    // Bottom line with countdown
    const countdownText = ` Press any key to continue (${this.countdown}s) `;
    const countdownStyled = dim(countdownText);
    const bottomContentWidth = boxWidth - 2;
    const countdownVisLen = visibleWidth(countdownText);
    const leftPad = Math.floor((bottomContentWidth - countdownVisLen) / 2);
    const rightPad = bottomContentWidth - countdownVisLen - leftPad;
    const hChar = "─";
    const bottomLine = outline(hChar.repeat(Math.max(0, leftPad))) + 
      countdownStyled + 
      outline(hChar.repeat(Math.max(0, rightPad)));
    
    return renderWelcomeBox(this.data, termWidth, bottomLine);
  }
}

/**
 * Welcome header - same layout as overlay but persistent (no countdown).
 * Used when quietStartup: true.
 */
export class WelcomeHeader implements Component {
  private data: WelcomeData;

  constructor(
    modelName: string,
    providerName: string,
    recentSessions: RecentSession[] = [],
    loadedCounts: LoadedCounts = { contextFiles: 0, extensions: 0, skills: 0, promptTemplates: 0 },
    mcpSummary: McpServerSummary = EMPTY_MCP_SUMMARY,
  ) {
    this.data = { modelName, providerName, recentSessions, loadedCounts, mcpSummary };
  }

  invalidate(): void {}

  render(termWidth: number): string[] {
    const boxWidth = computeBoxWidth(termWidth);
    if (boxWidth === null) {
      return [];
    }

    const hChar = "─";

    // Bottom line with column separator
    const leftCol = LEFT_COLUMN_WIDTH;
    const rightCol = Math.max(1, boxWidth - leftCol - BOX_GAP_WIDTH);
    const bottomLine = outline(hChar.repeat(leftCol)) + outline("┴") + outline(hChar.repeat(rightCol));
    
    const lines = renderWelcomeBox(this.data, termWidth, bottomLine);
    if (lines.length > 0) {
      lines.push(""); // Add empty line for spacing only if we rendered content
    }
    return lines;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Discovery functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Discover loaded counts by scanning filesystem.
 */
export function discoverLoadedCounts(): LoadedCounts {
  const now = Date.now();
  if (loadedCountsCache && now - loadedCountsCache.timestamp < LOADED_COUNTS_CACHE_TTL_MS) {
    return loadedCountsCache.value;
  }

  const homeDir = getHomeDir();
  const cwd = process.cwd();

  let contextFiles = 0;
  let extensions = 0;
  let skills = 0;
  let promptTemplates = 0;

  const agentsMdPaths = [
    join(homeDir, ".pi", "agent", "AGENTS.md"),
    join(homeDir, ".claude", "AGENTS.md"),
    join(cwd, "AGENTS.md"),
    join(cwd, ".pi", "AGENTS.md"),
    join(cwd, ".claude", "AGENTS.md"),
  ];

  for (const path of agentsMdPaths) {
    if (existsSync(path)) contextFiles++;
  }

  const extensionDirs = [
    join(homeDir, ".pi", "agent", "extensions"),
    join(cwd, "extensions"),
    join(cwd, ".pi", "extensions"),
  ];

  const countedExtensions = new Set<string>();

  for (const dir of extensionDirs) {
    for (const entry of safeReadDir(dir)) {
      if (entry.name.startsWith(".")) continue;

      if (entry.isDirectory()) {
        const entryPath = join(dir, entry.name);
        if (existsSync(join(entryPath, "index.ts")) || existsSync(join(entryPath, "package.json"))) {
          if (!countedExtensions.has(entry.name)) {
            countedExtensions.add(entry.name);
            extensions++;
          }
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".ts")) {
        const name = basename(entry.name, ".ts");
        if (!countedExtensions.has(name)) {
          countedExtensions.add(name);
          extensions++;
        }
      }
    }
  }

  const skillDirs = [
    join(homeDir, ".pi", "agent", "skills"),
    join(cwd, ".pi", "skills"),
    join(cwd, "skills"),
  ];

  const countedSkills = new Set<string>();

  for (const dir of skillDirs) {
    for (const entry of safeReadDir(dir)) {
      if (!entry.isDirectory()) continue;

      const skillPath = join(dir, entry.name, "SKILL.md");
      if (!existsSync(skillPath)) continue;

      if (!countedSkills.has(entry.name)) {
        countedSkills.add(entry.name);
        skills++;
      }
    }
  }

  const templateDirs = [
    join(homeDir, ".pi", "agent", "commands"),
    join(homeDir, ".claude", "commands"),
    join(cwd, ".pi", "commands"),
    join(cwd, ".claude", "commands"),
  ];

  const countedTemplates = new Set<string>();

  function countTemplatesInDir(dir: string): void {
    for (const entry of safeReadDir(dir)) {
      const entryPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        countTemplatesInDir(entryPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const name = basename(entry.name, ".md");
      if (!countedTemplates.has(name)) {
        countedTemplates.add(name);
        promptTemplates++;
      }
    }
  }

  for (const dir of templateDirs) {
    countTemplatesInDir(dir);
  }

  const result = { contextFiles, extensions, skills, promptTemplates };
  loadedCountsCache = { timestamp: now, value: result };
  return result;
}

/**
 * Discover MCP servers from mcp.json + mcp-cache.json.
 * Mirrors /mcp panel counts for direct tools and token estimates.
 */
export function discoverMcpServerSummary(): McpServerSummary {
  const now = Date.now();
  if (mcpServerSummaryCache && now - mcpServerSummaryCache.timestamp < MCP_SERVER_SUMMARY_CACHE_TTL_MS) {
    return mcpServerSummaryCache.value;
  }

  const homeDir = getHomeDir();
  const mcpConfigPath = join(homeDir, ".pi", "agent", "mcp.json");
  const mcpCachePath = join(homeDir, ".pi", "agent", "mcp-cache.json");

  const config = safeReadJson<McpConfigFile>(mcpConfigPath);
  const cache = safeReadJson<McpCacheFile>(mcpCachePath);

  const serverEntries = Object.entries(config?.mcpServers ?? {});
  if (serverEntries.length === 0) {
    mcpServerSummaryCache = { timestamp: now, value: EMPTY_MCP_SUMMARY };
    return EMPTY_MCP_SUMMARY;
  }

  const globalDirect = config?.settings?.directTools;
  const servers: McpServerStatus[] = [];

  for (const [serverName, definition] of serverEntries) {
    const cacheEntry = cache?.servers?.[serverName];
    const tools: McpToolMetadata[] = [];

    for (const tool of cacheEntry?.tools ?? []) {
      if (!tool || typeof tool.name !== "string" || tool.name.length === 0) continue;
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }

    if (definition.exposeResources !== false) {
      for (const resource of cacheEntry?.resources ?? []) {
        if (!resource || typeof resource.name !== "string" || resource.name.length === 0) continue;
        const baseName = `get_${resourceNameToToolName(resource.name)}`;
        tools.push({
          name: baseName,
          description: resource.description ?? (resource.uri ? `Read resource: ${resource.uri}` : undefined),
        });
      }
    }

    const directFilter = resolveDirectToolsFilter(globalDirect, definition.directTools);
    const directNameSet = Array.isArray(directFilter) ? new Set(directFilter) : null;

    let directTools = 0;
    let tokens = 0;

    for (const tool of tools) {
      const isDirect = directFilter === true || (directNameSet?.has(tool.name) ?? false);
      if (!isDirect) continue;
      directTools++;
      tokens += estimateMcpToolTokens(tool);
    }

    servers.push({
      name: serverName,
      status: cacheEntry ? "connected" : "disconnected",
      directTools,
      totalTools: tools.length,
      tokens,
    });
  }

  const totalDirectTools = servers.reduce((sum, server) => sum + server.directTools, 0);
  const totalTokens = servers.reduce((sum, server) => sum + server.tokens, 0);

  const result: McpServerSummary = {
    servers,
    totalDirectTools,
    totalTokens,
  };

  mcpServerSummaryCache = { timestamp: now, value: result };
  return result;
}

/**
 * Get recent sessions from the sessions directory.
 */
export function getRecentSessions(maxCount: number = 3): RecentSession[] {
  const now = Date.now();

  if (
    recentSessionsCache &&
    recentSessionsCache.maxCount === maxCount &&
    now - recentSessionsCache.timestamp < RECENT_SESSIONS_CACHE_TTL_MS
  ) {
    return recentSessionsCache.value;
  }

  const homeDir = getHomeDir();

  const sessionsDirs = [
    join(homeDir, ".pi", "agent", "sessions"),
    join(homeDir, ".pi", "sessions"),
  ];

  const sessions: { name: string; mtime: number }[] = [];
  const seenSessionFiles = new Set<string>();

  function scanDir(dir: string): void {
    for (const entry of safeReadDir(dir)) {
      const entryPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(entryPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      if (seenSessionFiles.has(entryPath)) continue;
      seenSessionFiles.add(entryPath);

      let mtimeMs = 0;
      try {
        mtimeMs = statSync(entryPath).mtimeMs;
      } catch {
        continue;
      }

      const parentName = basename(dir);
      let projectName = parentName;
      if (parentName.startsWith("--")) {
        const parts = parentName.split("-").filter(Boolean);
        projectName = parts[parts.length - 1] || parentName;
      }

      sessions.push({ name: projectName, mtime: mtimeMs });
    }
  }

  for (const sessionsDir of sessionsDirs) {
    scanDir(sessionsDir);
  }

  if (sessions.length === 0) {
    recentSessionsCache = { timestamp: now, maxCount, value: [] };
    return [];
  }

  sessions.sort((a, b) => b.mtime - a.mtime);

  const seen = new Set<string>();
  const uniqueSessions: typeof sessions = [];
  for (const s of sessions) {
    if (!seen.has(s.name)) {
      seen.add(s.name);
      uniqueSessions.push(s);
    }
  }

  const result = uniqueSessions.slice(0, maxCount).map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 17) + "…" : s.name,
    timeAgo: formatTimeAgo(now - s.mtime),
  }));

  recentSessionsCache = { timestamp: now, maxCount, value: result };
  return result;
}

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}
