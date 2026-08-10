import type { MarkdownPasteClient } from "../markdown-paste-client.ts";
import { createCfPasteExtension } from "../index.ts";

declare global {
	var cfpasteTestClient: MarkdownPasteClient | undefined;
}

const delegatingClient: MarkdownPasteClient = {
	createMarkdownPaste(input) {
		if (!globalThis.cfpasteTestClient) {
			throw new Error("cfpaste test client was not configured");
		}
		return globalThis.cfpasteTestClient.createMarkdownPaste(input);
	},
};

export default createCfPasteExtension({ markdownPasteClient: delegatingClient });
