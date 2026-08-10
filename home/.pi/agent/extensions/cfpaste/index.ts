import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionFactory, SessionEntry } from "@earendil-works/pi-coding-agent";

import {
	createCloudflareAccessTokenProvider,
	type CloudflaredExecutor,
} from "./cloudflared-access-token.ts";
import {
	createMarkdownPasteClient,
	type MarkdownPasteClient,
} from "./markdown-paste-client.ts";

const CFPASTE_ORIGIN = new URL("https://paste.cfdata.org");

/** Construction options for the `/cf-paste` Pi extension. */
export interface CfPasteExtensionOptions {
	/** Paste client override for another composition root or a faithful test implementation. */
	readonly markdownPasteClient?: MarkdownPasteClient;
}

function assistantMarkdown(message: AssistantMessage): string {
	return message.content
		.filter((block): block is { type: "text"; text: string } => block.type === "text")
		.map((block) => block.text)
		.join("\n\n");
}

function findLatestAssistantMessage(
	branch: readonly SessionEntry[],
): AssistantMessage | undefined {
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		const entry = branch[index];
		if (entry?.type === "message" && entry.message.role === "assistant") {
			return entry.message;
		}
	}
	return undefined;
}

function isMarkdownPath(path: string): boolean {
	const extension = extname(path).toLowerCase();
	return extension === ".md" || extension === ".markdown";
}

async function createPasteAndNotify(
	client: MarkdownPasteClient,
	input: { readonly title?: string; readonly markdown: string },
	notify: (message: string, type?: "info" | "warning" | "error") => void,
): Promise<void> {
	if (!input.markdown.trim()) {
		notify("Cloudflare Paste requires non-empty Markdown", "warning");
		return;
	}

	const result = await client.createMarkdownPaste(input);
	if (!result.ok) {
		notify(result.error.message, "error");
		return;
	}
	notify(`Created Markdown paste: ${result.value}`, "info");
}

/** Create the `/cf-paste <path>` and `/cf-paste-last` command extension. */
export function createCfPasteExtension(
	options: CfPasteExtensionOptions = {},
): ExtensionFactory {
	return (pi) => {
		const executor: CloudflaredExecutor = {
			execute: async (args, execOptions) =>
				pi.exec("cloudflared", [...args], { timeout: execOptions.timeout }),
		};
		const tokenProvider = createCloudflareAccessTokenProvider(
			executor,
			CFPASTE_ORIGIN.origin,
		);
		const client =
			options.markdownPasteClient ??
			createMarkdownPasteClient(CFPASTE_ORIGIN, tokenProvider);

		pi.registerCommand("cf-paste", {
			description: "Paste a Markdown file (usage: /cf-paste <path>)",
			handler: async (args, ctx) => {
				await ctx.waitForIdle();
				const target = args.trim();
				if (!target) {
					ctx.ui.notify("Usage: /cf-paste <markdown-file>", "warning");
					return;
				}

				const pathArgument = target.startsWith("@") ? target.slice(1) : target;
				const path = resolve(ctx.cwd, pathArgument);
				if (!isMarkdownPath(path)) {
					ctx.ui.notify("Cloudflare Paste currently supports only .md and .markdown files", "warning");
					return;
				}

				let markdown: string;
				try {
					markdown = await readFile(path, "utf8");
				} catch (cause) {
					const detail = cause instanceof Error ? cause.message : "unknown file error";
					ctx.ui.notify(`Could not read Markdown file ${path}: ${detail}`, "error");
					return;
				}

				await createPasteAndNotify(
					client,
					{ title: basename(path), markdown },
					(text, type) => ctx.ui.notify(text, type),
				);
			},
		});

		pi.registerCommand("cf-paste-last", {
			description: "Paste the latest agent message",
			handler: async (_args, ctx) => {
				await ctx.waitForIdle();
				const message = findLatestAssistantMessage(ctx.sessionManager.getBranch());
				if (!message) {
					ctx.ui.notify("No agent message is available to paste", "warning");
					return;
				}
				await createPasteAndNotify(
					client,
					{ title: "Pi agent response", markdown: assistantMarkdown(message) },
					(text, type) => ctx.ui.notify(text, type),
				);
			},
		});
	};
}

export default createCfPasteExtension();
