import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ImageContent } from "@mariozechner/pi-ai";
import { getEditorKeybindings, matchesKey } from "@mariozechner/pi-tui";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";

const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp)$/i;
const QUOTED_IMAGE_PATH_RE = /(["'])(~?\/(?:\\.|[^"'\\])+?\.(?:png|jpe?g|gif|webp))\1/gi;
const BARE_IMAGE_PATH_RE =
  /(?:^|[\s`(])((?:~\/|\/)(?:\\.|[^\s"'`(),])+?\.(?:png|jpe?g|gif|webp))(?=$|[\s"'`),.;:!?])/gi;
const IMAGE_TOKEN_RE = /\[Image\s+(\d+)]/gi;
const STATUS_KEY = "image-paste";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_MB_LABEL = `${Math.ceil(MAX_IMAGE_BYTES / (1024 * 1024))}MB`;
const INVALID_IMAGE_PLACEHOLDER = "[Omitted invalid image attachment]";
const IMAGE_TOKEN_HIGHLIGHT_RE = /\[Image\s+\d+]/g;
const CHIP_BG = "\x1b[48;2;91;96;120m";
const CHIP_FG = "\x1b[38;2;202;211;245m";
const CHIP_BOLD = "\x1b[1m";
const CHIP_RESET = "\x1b[22m\x1b[39m\x1b[49m";

interface PendingImage {
  id: number;
  token: string;
  path: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

interface StatusCtx {
  hasUI: boolean;
  ui: {
    setStatus: (key: string, value: string | undefined) => void;
  };
}

function highlightImageTokenChips(line: string): string {
  return line.replace(IMAGE_TOKEN_HIGHLIGHT_RE, (token) => `${CHIP_BG}${CHIP_FG}${CHIP_BOLD}${token}${CHIP_RESET}`);
}

function findTokenRangeAtIndex(text: string, index: number): { start: number; end: number; } | undefined {
  if (index < 0 || index >= text.length) return undefined;
  IMAGE_TOKEN_HIGHLIGHT_RE.lastIndex = 0;
  for (const match of text.matchAll(IMAGE_TOKEN_HIGHLIGHT_RE)) {
    if (typeof match.index !== "number") continue;
    const token = match[0] ?? "";
    const start = match.index;
    const end = start + token.length;
    if (index >= start && index < end) return { start, end };
    if (start > index) break;
  }
  return undefined;
}

class ImageTokenEditor extends CustomEditor {
  private getCursorOffset(): number {
    const cursor = this.getCursor();
    const lines = this.getLines();
    let offset = 0;
    for (let i = 0; i < cursor.line; i++) {
      offset += (lines[i]?.length ?? 0) + 1;
    }
    return offset + cursor.col;
  }

  private setCursorOffset(offset: number): void {
    const lines = this.getLines();
    const state = this as unknown as {
      state: { cursorLine: number; cursorCol: number; };
      preferredVisualCol: number | null;
    };

    let remaining = Math.max(0, offset);
    let lineIndex = 0;
    for (; lineIndex < lines.length; lineIndex++) {
      const len = lines[lineIndex]?.length ?? 0;
      if (remaining <= len) break;
      remaining -= len + 1;
    }

    if (lineIndex >= lines.length) {
      lineIndex = Math.max(0, lines.length - 1);
      remaining = lines[lineIndex]?.length ?? 0;
    }

    state.state.cursorLine = lineIndex;
    state.state.cursorCol = remaining;
    state.preferredVisualCol = null;
  }

  private deleteWholeTokenIfEditingOne(direction: "backward" | "forward"): boolean {
    const text = this.getText();
    const cursorOffset = this.getCursorOffset();
    const targetIndex = direction === "backward" ? cursorOffset - 1 : cursorOffset;
    if (targetIndex < 0 || targetIndex >= text.length) return false;

    const tokenRange = findTokenRangeAtIndex(text, targetIndex);
    if (!tokenRange) return false;

    let removeStart = tokenRange.start;
    let removeEnd = tokenRange.end;
    if (text[removeEnd] === " ") {
      removeEnd += 1;
    } else if (removeStart > 0 && text[removeStart - 1] === " ") {
      removeStart -= 1;
    }

    const nextText = text.slice(0, removeStart) + text.slice(removeEnd);
    this.setText(nextText);
    this.setCursorOffset(removeStart);
    return true;
  }

  override handleInput(data: string): void {
    const kb = getEditorKeybindings();
    if (kb.matches(data, "deleteCharBackward") || matchesKey(data, "shift+backspace")) {
      if (this.deleteWholeTokenIfEditingOne("backward")) return;
    }
    if (kb.matches(data, "deleteCharForward") || matchesKey(data, "shift+delete")) {
      if (this.deleteWholeTokenIfEditingOne("forward")) return;
    }
    super.handleInput(data);
  }

  override render(width: number): string[] {
    return super.render(width).map((line) => highlightImageTokenChips(line));
  }
}

function mediaTypeFromPath(filePath: string): PendingImage["mediaType"] | undefined {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return undefined;
  }
}

function resolveExistingPath(path: string): string | undefined {
  if (existsSync(path)) return path;
  if (path.startsWith("/private/")) {
    const withoutPrivate = path.slice("/private".length);
    if (existsSync(withoutPrivate)) return withoutPrivate;
    return undefined;
  }
  const withPrivate = `/private${path}`;
  if (existsSync(withPrivate)) return withPrivate;
  return undefined;
}

function normalizeRawPath(rawPath: string): string {
  let value = rawPath.trim();
  if (value.startsWith("~/")) {
    value = join(homedir(), value.slice(2));
  }
  value = value.replace(/\\(.)/g, "$1");
  return value;
}

function extractImagePaths(text: string): Array<{ rawPath: string; resolvedPath: string; }> {
  const lowered = text.toLowerCase();
  if (
    !lowered.includes(".png") &&
    !lowered.includes(".jpg") &&
    !lowered.includes(".jpeg") &&
    !lowered.includes(".gif") &&
    !lowered.includes(".webp")
  ) {
    return [];
  }

  const found: Array<{ rawPath: string; resolvedPath: string; }> = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: string | undefined) => {
    const rawPath = candidate?.trim();
    if (!rawPath) return;
    if (seen.has(rawPath)) return;

    const normalizedPath = normalizeRawPath(rawPath);
    if (!IMAGE_FILE_RE.test(basename(normalizedPath))) return;

    const resolvedPath = resolveExistingPath(normalizedPath);
    if (!resolvedPath) return;

    seen.add(rawPath);
    found.push({ rawPath, resolvedPath });
  };

  QUOTED_IMAGE_PATH_RE.lastIndex = 0;
  for (const match of text.matchAll(QUOTED_IMAGE_PATH_RE)) {
    addCandidate(match[2]);
  }

  BARE_IMAGE_PATH_RE.lastIndex = 0;
  for (const match of text.matchAll(BARE_IMAGE_PATH_RE)) {
    addCandidate(match[1]);
  }

  return found;
}

function getReferencedImageIds(text: string): number[] {
  if (!text.includes("[Image")) return [];
  const referencedIds = new Set<number>();
  IMAGE_TOKEN_RE.lastIndex = 0;
  for (const match of text.matchAll(IMAGE_TOKEN_RE)) {
    const idText = match[1];
    if (!idText) continue;
    const id = Number.parseInt(idText, 10);
    if (Number.isNaN(id)) continue;
    referencedIds.add(id);
  }
  return [...referencedIds];
}

function getBase64SizeBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function isValidImageContent(image: Partial<ImageContent> | undefined): image is ImageContent {
  if (!image) return false;
  if (typeof image.data !== "string" || image.data.length === 0) return false;
  if (typeof image.mimeType !== "string" || !image.mimeType.startsWith("image/")) return false;
  return getBase64SizeBytes(image.data) <= MAX_IMAGE_BYTES;
}

export default function (pi: ExtensionAPI) {
  let pendingImages: PendingImage[] = [];
  let pendingByPath = new Map<string, PendingImage>();
  let pendingById = new Map<number, PendingImage>();
  let nextImageId = 1;
  let lastScannedText: string | undefined;
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  let delayedScanTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeTerminalInput: (() => void) | undefined;

  const reindexPending = () => {
    pendingByPath = new Map<string, PendingImage>();
    pendingById = new Map<number, PendingImage>();
    for (const image of pendingImages) {
      pendingByPath.set(image.path, image);
      pendingById.set(image.id, image);
    }
  };

  const resetPendingState = () => {
    pendingImages = [];
    pendingByPath.clear();
    pendingById.clear();
    nextImageId = 1;
  };

  const clearPending = (ctx?: StatusCtx) => {
    resetPendingState();
    lastScannedText = undefined;
    ctx?.ui.setStatus(STATUS_KEY, undefined);
  };

  const updateStatus = (ctx: StatusCtx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(STATUS_KEY, undefined);
  };

  const syncPendingImagesFromText = (text: string) => {
    if (pendingImages.length === 0) return;
    if (!text.includes("[Image")) {
      resetPendingState();
      return;
    }

    const idsInEditor = new Set(getReferencedImageIds(text));
    pendingImages = pendingImages.filter((image) => idsInEditor.has(image.id));
    if (pendingImages.length === 0) {
      resetPendingState();
      return;
    }
    reindexPending();
  };

  const getOrCreatePendingImage = (resolvedPath: string): PendingImage | undefined => {
    const existing = pendingByPath.get(resolvedPath);
    if (existing) return existing;

    const mediaType = mediaTypeFromPath(resolvedPath);
    if (!mediaType) return undefined;

    const id = nextImageId++;
    const image: PendingImage = {
      id,
      token: `[Image ${id}]`,
      path: resolvedPath,
      mediaType,
    };
    pendingImages.push(image);
    pendingByPath.set(image.path, image);
    pendingById.set(image.id, image);
    return image;
  };

  const replaceImagePathsWithTokens = (text: string): { text: string; changed: boolean; } => {
    const imagePaths = extractImagePaths(text);
    if (imagePaths.length === 0) return { text, changed: false };

    let transformed = text;
    let changed = false;

    for (const { rawPath, resolvedPath } of imagePaths) {
      const image = getOrCreatePendingImage(resolvedPath);
      if (!image) continue;
      if (!transformed.includes(rawPath)) continue;
      transformed = transformed.replaceAll(rawPath, image.token);
      changed = true;
    }

    return { text: transformed, changed };
  };

  const runEditorScan = (ctx: {
    hasUI: boolean;
    ui: {
      getEditorText: () => string;
      setEditorText: (text: string) => void;
      setStatus: (k: string, v: string | undefined) => void;
    };
  }) => {
    if (!ctx.hasUI) return;

    const currentText = ctx.ui.getEditorText();
    if (currentText === lastScannedText) return;

    if (!currentText.trim()) {
      clearPending(ctx);
      lastScannedText = currentText;
      return;
    }

    const replaced = replaceImagePathsWithTokens(currentText);
    const editorText = replaced.text;
    if (replaced.changed) {
      ctx.ui.setEditorText(editorText);
    }

    syncPendingImagesFromText(editorText);
    lastScannedText = editorText;
    updateStatus(ctx);
  };

  const scheduleEditorScan = (ctx: {
    hasUI: boolean;
    ui: {
      getEditorText: () => string;
      setEditorText: (text: string) => void;
      setStatus: (k: string, v: string | undefined) => void;
    };
  }) => {
    if (!ctx.hasUI) return;
    if (scanTimer) clearTimeout(scanTimer);
    if (delayedScanTimer) clearTimeout(delayedScanTimer);
    scanTimer = setTimeout(() => runEditorScan(ctx), 45);
    delayedScanTimer = setTimeout(() => runEditorScan(ctx), 220);
  };

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    lastScannedText = undefined;
    ctx.ui.setEditorComponent((tui, theme, kb) => new ImageTokenEditor(tui, theme, kb));

    unsubscribeTerminalInput?.();
    unsubscribeTerminalInput = ctx.ui.onTerminalInput(() => {
      scheduleEditorScan(ctx);
      return undefined;
    });

    scheduleEditorScan(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setEditorComponent(undefined);
    }
    unsubscribeTerminalInput?.();
    unsubscribeTerminalInput = undefined;
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = undefined;
    }
    if (delayedScanTimer) {
      clearTimeout(delayedScanTimer);
      delayedScanTimer = undefined;
    }
    resetPendingState();
    lastScannedText = undefined;
  });

  pi.on("context", async (event) => {
    let changed = false;
    const messages = event.messages.map((message) => {
      const content = (message as { content?: unknown; }).content;
      if (!Array.isArray(content)) return message;

      let localChange = false;
      const sanitized = content.flatMap((part) => {
        if (!part || typeof part !== "object") return [part];
        if ((part as { type?: string; }).type !== "image") return [part];
        if (isValidImageContent(part as Partial<ImageContent>)) return [part];
        localChange = true;
        return [{ type: "text", text: INVALID_IMAGE_PLACEHOLDER }];
      });

      if (!localChange) return message;
      changed = true;
      return {
        ...message,
        content: sanitized.length > 0 ? sanitized : [{ type: "text", text: INVALID_IMAGE_PLACEHOLDER }],
      };
    });

    if (!changed) return;
    return { messages };
  });

  pi.on("input", async (event, ctx) => {
    let transformedText = event.text;

    const pathReplacement = replaceImagePathsWithTokens(transformedText);
    transformedText = pathReplacement.text;
    syncPendingImagesFromText(transformedText);

    const referencedIds = getReferencedImageIds(transformedText);
    const referencedImages = referencedIds
      .map((id) => pendingById.get(id))
      .filter((image): image is PendingImage => Boolean(image));

    const attachedImages: ImageContent[] = [];
    const oversizedImages: string[] = [];
    const missingImages: string[] = [];

    for (const image of referencedImages) {
      const resolvedPath = resolveExistingPath(image.path);
      if (!resolvedPath) {
        missingImages.push(image.token);
        transformedText = transformedText.replaceAll(image.token, `[Missing image: ${basename(image.path)}]`);
        continue;
      }

      const bytes = readFileSync(resolvedPath);
      if (bytes.length === 0) {
        missingImages.push(image.token);
        transformedText = transformedText.replaceAll(image.token, `[Empty image: ${basename(image.path)}]`);
        continue;
      }

      if (bytes.length > MAX_IMAGE_BYTES) {
        oversizedImages.push(image.token);
        transformedText = transformedText.replaceAll(image.token, `[Skipped image: ${basename(image.path)} (> ${MAX_IMAGE_MB_LABEL})]`);
        continue;
      }

      attachedImages.push({
        type: "image",
        mimeType: image.mediaType,
        data: bytes.toString("base64"),
      });
    }

    const incomingImages = event.images ?? [];
    const validIncomingImages = incomingImages.filter((image) => isValidImageContent(image));
    const droppedIncomingImages = incomingImages.length - validIncomingImages.length;
    const mergedImages = [...validIncomingImages, ...attachedImages];

    if (referencedImages.length > 0) {
      const usedIds = new Set(referencedImages.map((img) => img.id));
      pendingImages = pendingImages.filter((img) => !usedIds.has(img.id));
      if (pendingImages.length === 0) {
        resetPendingState();
      } else {
        reindexPending();
      }
    }

    if (ctx.hasUI && oversizedImages.length > 0) {
      ctx.ui.notify(`Skipped ${oversizedImages.length} image(s) larger than ${MAX_IMAGE_MB_LABEL}`, "warning");
    }
    if (ctx.hasUI && missingImages.length > 0) {
      ctx.ui.notify(`Skipped ${missingImages.length} missing or empty image(s)`, "warning");
    }
    if (ctx.hasUI && droppedIncomingImages > 0) {
      ctx.ui.notify(`Dropped ${droppedIncomingImages} invalid image attachment(s)`, "warning");
    }

    const textChanged = transformedText !== event.text;
    const imagesChanged = mergedImages.length !== incomingImages.length || attachedImages.length > 0;

    updateStatus(ctx);
    if (textChanged || imagesChanged) {
      return {
        action: "transform" as const,
        text: transformedText,
        images: mergedImages,
      };
    }

    return { action: "continue" as const };
  });

  pi.registerCommand("clear-images", {
    description: "Clear pending pasted image attachments",
    handler: async (_args, ctx) => {
      clearPending(ctx);
      ctx.ui.notify("Cleared pasted images", "info");
    },
  });
}
