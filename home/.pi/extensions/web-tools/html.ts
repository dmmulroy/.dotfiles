import { convert as convertHtmlToText, compile as compileHtmlToText } from "html-to-text";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
// turndown-plugin-gfm does not ship ESM-friendly typings.
import { gfm } from "turndown-plugin-gfm";

const REMOVAL_SELECTOR = [
	"head",
	"title",
	"script",
	"style",
	"noscript",
	"template",
	"meta",
	"link",
	"iframe",
	"object",
	"embed",
].join(", ");

const turndown = createTurndownService();
const compiledHtmlToText = compileHtmlToText({

	baseElements: {
		selectors: ["body", "main", "article", "div"],
		returnDomByDefault: true,
	},
	wordwrap: false,
	selectors: [
		{ selector: "img", format: "skip" },
		{ selector: "table", format: "dataTable" },
	],
});

export function sanitizeHtml(rawHtml: string, baseUrl: string): string {
	const { document } = parseHTML(rawHtml);
	const root = document.querySelector("body") ?? document.documentElement;
	for (const element of root.querySelectorAll(REMOVAL_SELECTOR)) {
		element.remove();
	}

	for (const element of root.querySelectorAll("[href], [src], [poster], [srcset]")) {
		for (const attribute of ["href", "src", "poster"] as const) {
			const value = element.getAttribute(attribute);
			if (!value) continue;
			const resolved = resolveAttributeUrl(value, baseUrl, attribute === "src" || attribute === "poster");
			if (resolved) {
				element.setAttribute(attribute, resolved);
			} else {
				element.removeAttribute(attribute);
			}
		}

		const srcset = element.getAttribute("srcset");
		if (srcset) {
			const resolved = resolveSrcSet(srcset, baseUrl);
			if (resolved) {
				element.setAttribute("srcset", resolved);
			} else {
				element.removeAttribute("srcset");
			}
		}
	}

	return `<div>${root.innerHTML}</div>`;
}

export function htmlToMarkdown(rawHtml: string, baseUrl: string): string {
	const sanitizedHtml = sanitizeHtml(rawHtml, baseUrl);
	const markdown = turndown.turndown(sanitizedHtml);
	return cleanupMarkdown(markdown);
}

export function htmlToText(rawHtml: string, baseUrl: string): string {
	const sanitizedHtml = sanitizeHtml(rawHtml, baseUrl);
	const text = htmlToTextConverter(sanitizedHtml);
	return cleanupText(text);
}

export function htmlToTextFallback(rawHtml: string): string {
	return cleanupText(convertHtmlToText(rawHtml, { wordwrap: false }));
}

function htmlToTextConverter(html: string): string {
	return compiledHtmlToText(html);
}

function createTurndownService(): TurndownService {
	const service = new TurndownService({
		headingStyle: "atx",
		hr: "---",
		bulletListMarker: "-",
		codeBlockStyle: "fenced",
		emDelimiter: "*",
	});
	service.use(gfm as never);
	return service;
}

function resolveAttributeUrl(value: string, baseUrl: string, allowDataUrl: boolean): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	try {
		const resolved = new URL(trimmed, baseUrl);
		if (resolved.protocol === "javascript:" || resolved.protocol === "vbscript:") {
			return undefined;
		}
		if (resolved.protocol === "data:" && !allowDataUrl) {
			return undefined;
		}
		return resolved.toString();
	} catch {
		return undefined;
	}
}

function resolveSrcSet(srcset: string, baseUrl: string): string | undefined {
	const candidates = srcset
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [urlPart, descriptor] = entry.split(/\s+/, 2);
			const resolved = resolveAttributeUrl(urlPart, baseUrl, true);
			if (!resolved) return undefined;
			return descriptor ? `${resolved} ${descriptor}` : resolved;
		})
		.filter((entry): entry is string => Boolean(entry));
	return candidates.length > 0 ? candidates.join(", ") : undefined;
}

function cleanupMarkdown(markdown: string): string {
	return markdown
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function cleanupText(text: string): string {
	return text
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
