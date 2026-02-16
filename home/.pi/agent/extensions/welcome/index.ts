import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isKeyRelease } from "@mariozechner/pi-tui";

import { getModelDisplayName, getModelProviderName } from "../../prelude/model.js";
import {
  WelcomeComponent,
  WelcomeHeader,
  discoverLoadedCounts,
  discoverMcpServerSummary,
  getRecentSessions,
} from "./screen.js";

type QuietStartupContext = ExtensionContext & {
  settingsManager?: {
    getQuietStartup?: () => boolean;
  };
};

const KITTY_CSI_U_REGEX = /^\x1b\[(\d+)(?::(\d*))?(?::(\d+))?(?:;(\d+))?(?::(\d+))?u$/;
const KITTY_MOD_SHIFT = 1;
const KITTY_MOD_ALT = 2;
const KITTY_MOD_CTRL = 4;

function isPrintableKeypress(data: string): boolean {
  if (!data || isKeyRelease(data)) return false;

  // Keep bracketed paste payloads (e.g. paste-to-start typing immediately).
  if (data.includes("\x1b[200~")) return true;

  const kittyMatch = data.match(KITTY_CSI_U_REGEX);
  if (kittyMatch) {
    const codepoint = Number.parseInt(kittyMatch[1] ?? "", 10);
    const shiftedKey = kittyMatch[2] && kittyMatch[2].length > 0 ? Number.parseInt(kittyMatch[2], 10) : undefined;
    const modifierValue = kittyMatch[4] ? Number.parseInt(kittyMatch[4], 10) : 1;
    const eventTypeValue = kittyMatch[5] ? Number.parseInt(kittyMatch[5], 10) : 1;

    // Ignore releases, as well as Alt/Ctrl modified keys.
    if (eventTypeValue === 3) return false;

    const modifier = Number.isFinite(modifierValue) ? modifierValue - 1 : 0;
    if (modifier & (KITTY_MOD_ALT | KITTY_MOD_CTRL)) return false;

    const effectiveCodepoint =
      (modifier & KITTY_MOD_SHIFT) && typeof shiftedKey === "number" ? shiftedKey : codepoint;

    return Number.isFinite(effectiveCodepoint) && effectiveCodepoint >= 32;
  }

  const codepoint = data.codePointAt(0) ?? 0;
  if (data.length === 1) {
    return codepoint >= 32 && codepoint !== 127;
  }

  // Multi-code-unit Unicode graphemes (e.g. emoji) can be length > 1.
  return !data.startsWith("\x1b") && codepoint >= 32;
}

function isQuietStartup(ctx: QuietStartupContext): boolean {
  return ctx.settingsManager?.getQuietStartup?.() ?? false;
}

function getWelcomeData(ctx: ExtensionContext) {
  return {
    modelName: getModelDisplayName(ctx.model, "No model"),
    providerName: getModelProviderName(ctx.model, "Unknown"),
    loadedCounts: discoverLoadedCounts(),
    mcpSummary: discoverMcpServerSummary(),
    recentSessions: getRecentSessions(3),
  };
}

export default function welcomeMenu(pi: ExtensionAPI) {
  let isStreaming = false;
  let dismissWelcomeOverlay: (() => void) | null = null;
  let removeOverlayInputListener: (() => void) | null = null;
  let welcomeHeaderActive = false;
  let welcomeOverlayShouldDismiss = false;
  let pendingOverlayTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearPendingOverlayTimeout = () => {
    if (pendingOverlayTimeout) {
      clearTimeout(pendingOverlayTimeout);
      pendingOverlayTimeout = null;
    }
  };

  const clearOverlayInputListener = () => {
    if (removeOverlayInputListener) {
      removeOverlayInputListener();
      removeOverlayInputListener = null;
    }
  };

  function dismissWelcome(ctx: ExtensionContext) {
    clearPendingOverlayTimeout();
    clearOverlayInputListener();

    if (dismissWelcomeOverlay) {
      dismissWelcomeOverlay();
      dismissWelcomeOverlay = null;
    } else {
      welcomeOverlayShouldDismiss = true;
    }

    if (welcomeHeaderActive) {
      welcomeHeaderActive = false;
      ctx.ui.setHeader(undefined);
    }
  }

  function setupWelcomeHeader(ctx: ExtensionContext) {
    const { modelName, providerName, loadedCounts, mcpSummary, recentSessions } = getWelcomeData(ctx);

    const header = new WelcomeHeader(modelName, providerName, recentSessions, loadedCounts, mcpSummary);
    welcomeHeaderActive = true;

    ctx.ui.setHeader((_tui, _theme) => {
      return {
        render(width: number): string[] {
          return header.render(width);
        },
        invalidate() {
          header.invalidate();
        },
      };
    });
  }

  function setupWelcomeOverlay(ctx: ExtensionContext) {
    clearPendingOverlayTimeout();

    pendingOverlayTimeout = setTimeout(() => {
      pendingOverlayTimeout = null;

      if (welcomeOverlayShouldDismiss || isStreaming) {
        welcomeOverlayShouldDismiss = false;
        return;
      }

      const sessionEvents = ctx.sessionManager.getBranch();
      const hasActivity = sessionEvents.some(
        (entry) =>
          entry.type === "message" &&
          (entry.message.role === "assistant" || entry.message.role === "toolResult"),
      );
      if (hasActivity) return;

      const { modelName, providerName, loadedCounts, mcpSummary, recentSessions } = getWelcomeData(ctx);

      ctx.ui.custom(
        (tui, _theme, _keybindings, done) => {
          const welcome = new WelcomeComponent(
            modelName,
            providerName,
            recentSessions,
            loadedCounts,
            mcpSummary,
          );

          let countdown = 30;
          let dismissed = false;
          let interval: ReturnType<typeof setInterval>;

          const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            clearInterval(interval);
            clearOverlayInputListener();
            dismissWelcomeOverlay = null;
            done(undefined);
          };

          dismissWelcomeOverlay = dismiss;

          clearOverlayInputListener();
          removeOverlayInputListener = ctx.ui.onTerminalInput((data: string) => {
            if (dismissed) return;
            if (!isPrintableKeypress(data)) return;

            dismiss();
            return { data };
          });

          if (welcomeOverlayShouldDismiss) {
            welcomeOverlayShouldDismiss = false;
            dismiss();
          }

          interval = setInterval(() => {
            if (dismissed) return;
            countdown--;
            welcome.setCountdown(countdown);
            tui.requestRender();
            if (countdown <= 0) dismiss();
          }, 1000);

          return {
            focused: false,
            invalidate: () => welcome.invalidate(),
            render: (width: number) => welcome.render(width),
            handleInput: (_data: string) => dismiss(),
            dispose: () => {
              dismissed = true;
              clearInterval(interval);
              clearOverlayInputListener();
            },
          };
        },
        {
          overlay: true,
        },
      ).catch(() => {
        // Ignore overlay setup failures.
      });
    }, 100);
  }

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    if (isQuietStartup(ctx)) {
      setupWelcomeHeader(ctx);
    } else {
      setupWelcomeOverlay(ctx);
    }
  });

  pi.on("agent_start", async (_event, ctx) => {
    isStreaming = true;
    dismissWelcome(ctx);
  });

  pi.on("tool_call", async (_event, ctx) => {
    dismissWelcome(ctx);
  });

  pi.on("agent_end", async () => {
    isStreaming = false;
  });

  pi.on("input", async (_event, ctx) => {
    dismissWelcome(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    dismissWelcome(ctx);
  });
}
