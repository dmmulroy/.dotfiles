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
	"canvas",
	"svg",
	"video",
	"audio",
	"source",
	"picture",
	"button",
	"input",
	"select",
	"textarea",
].join(", ");

const LANDMARK_REMOVAL_SELECTOR = [
	"header",
	"footer",
	"nav",
	"aside",
	"dialog",
	"menu",
	"[role='banner']",
	"[role='navigation']",
	"[role='complementary']",
	"[role='contentinfo']",
	"[aria-modal='true']",
	"[hidden]",
	"[aria-hidden='true']",
].join(", ");

const PREFERRED_CONTENT_SELECTORS = [
	"#readme",
	"[data-testid='repository-readme-content']",
	"article.markdown-body",
	".markdown-body",
	"#bigbox",
	"article",
	"main",
	"[role='main']",
	"#content",
	"#main-content",
	".main-content",
	".content",
	".post-content",
	".entry-content",
	".article-content",
	".story-list",
	".story",
];

const BOILERPLATE_TOKEN_RE =
	/(^|[-_\s])(nav(?:igation)?|header|footer|sidebar|aside|menu|dialog|modal|cookie|consent|promo|advert|social|share|breadcrumb|pagination|pager|toolbar|search|newsletter|subscribe|signup|login|banner|related|recommendation)s?($|[-_\s])/i;

const RAW_HTML_BLOCK_TAG_RE = /<(table|tbody|thead|tfoot|tr|td|th|div|section|article|main|header|footer|nav|aside)\b/gi;

const turndown = createTurndownService();
const compiledHtmlToText = compileHtmlToText({
	baseElements: {
		selectors: ["body", "main", "article", "div"],
		returnDomByDefault: true,
	},
	wordwrap: false,
	selectors: [
		{ selector: "img", format: "skip" },
		{ selector: "table", format: "dataTable", options: { uppercaseHeaderCells: false } },
		{ selector: "h1", options: { uppercase: false } },
		{ selector: "h2", options: { uppercase: false } },
		{ selector: "h3", options: { uppercase: false } },
		{ selector: "h4", options: { uppercase: false } },
		{ selector: "h5", options: { uppercase: false } },
		{ selector: "h6", options: { uppercase: false } },
	],
});

export function sanitizeHtml(rawHtml: string, baseUrl: string): string {
	const { document } = parseHTML(rawHtml);
	const root = extractReadableRoot(document);

	for (const element of root.querySelectorAll(REMOVAL_SELECTOR)) {
		element.remove();
	}
	for (const element of root.querySelectorAll(LANDMARK_REMOVAL_SELECTOR)) {
		element.remove();
	}
	for (const element of Array.from(root.querySelectorAll("*"))) {
		if (isBoilerplateElement(element)) {
			element.remove();
		}
	}

	flattenLayoutTables(root);
	normalizeBlockLinks(root);
	removeEmptyContainers(root);

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

export function isPoorMarkdownConversion(markdown: string): boolean {
	const rawBlockTags = markdown.match(RAW_HTML_BLOCK_TAG_RE)?.length ?? 0;
	if (rawBlockTags >= 6) return true;
	if (/^\s*<(table|tbody|thead|tfoot|tr|td|th|div|section|article|main)\b/i.test(markdown)) return true;
	return false;
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

function extractReadableRoot(document: Document): Element {
	for (const selector of PREFERRED_CONTENT_SELECTORS) {
		const match = pickBestCandidate(Array.from(document.querySelectorAll(selector)));
		if (match) {
			return cloneElement(match);
		}
	}

	const body = document.querySelector("body") ?? document.documentElement;
	const fallbackCandidates = [
		...Array.from(body.querySelectorAll("article, main, section, div")),
		body,
	];
	return cloneElement(pickBestCandidate(fallbackCandidates) ?? body);
}

function pickBestCandidate(elements: Element[]): Element | undefined {
	let best: Element | undefined;
	let bestScore = Number.NEGATIVE_INFINITY;

	for (const element of elements) {
		const score = scoreContentCandidate(element);
		if (score > bestScore) {
			best = element;
			bestScore = score;
		}
	}

	return best;
}

function scoreContentCandidate(element: Element): number {
	const textLength = getNormalizedText(element).length;
	if (textLength === 0) return Number.NEGATIVE_INFINITY;

	const linkTextLength = Array.from(element.querySelectorAll("a"))
		.map((link) => getNormalizedText(link).length)
		.reduce((total, value) => total + value, 0);
	const paragraphCount = element.querySelectorAll("p").length;
	const listItemCount = element.querySelectorAll("li").length;
	const headingCount = element.querySelectorAll("h1, h2, h3, h4, h5, h6").length;
	const tableCount = element.querySelectorAll("table").length;
	const ownPenalty = isBoilerplateElement(element) ? 800 : 0;
	const linkDensity = textLength > 0 ? linkTextLength / textLength : 1;

	let score = textLength;
	score -= linkDensity * 500;
	score += paragraphCount * 120;
	score += listItemCount * 45;
	score += headingCount * 80;
	score -= tableCount * 15;
	score -= ownPenalty;

	if (matchesAnySelector(element, "#readme, [data-testid='repository-readme-content'], article.markdown-body, .markdown-body")) {
		score += 1_500;
	}
	if (matchesAnySelector(element, "article, main, [role='main'], #content, #main-content, .main-content")) {
		score += 500;
	}
	if (element.id === "bigbox") {
		score += 1_000;
	}

	return score;
}

function flattenLayoutTables(root: Element): void {
	const tables = Array.from(root.querySelectorAll("table"));
	for (const table of tables.reverse()) {
		if (!isLikelyLayoutTable(table)) continue;
		for (const child of Array.from(table.querySelectorAll("thead, tbody, tfoot, tr, td, th")).reverse()) {
			replaceTag(child, "div");
		}
		replaceTag(table, "div");
	}
}

function isLikelyLayoutTable(table: Element): boolean {
	if (table.querySelector("caption, thead, th")) return false;
	if (table.getAttribute("role") === "table" || table.getAttribute("role") === "grid") return false;
	if (matchesAnySelector(table, "#hnmain table, #bigbox table") || table.closest("#hnmain, #bigbox")) return true;
	if (table.querySelector("table")) return true;
	if (["align", "bgcolor", "border", "cellpadding", "cellspacing", "width"].some((attribute) => table.hasAttribute(attribute))) {
		return true;
	}

	const rows = Array.from(table.querySelectorAll("tr")).filter((row) => row.closest("table") === table);
	if (rows.length === 0) return true;

	const cellCounts = rows.map((row) => Array.from(row.children).filter((child) => child.matches("td, th")).length).filter((count) => count > 0);
	if (cellCounts.length === 0) return true;
	const uniqueCellCounts = new Set(cellCounts);
	if (Math.max(...cellCounts) <= 1) return true;
	if (uniqueCellCounts.size > 1) return true;

	const cells = rows.flatMap((row) => Array.from(row.children).filter((child) => child.matches("td, th")));
	const averageCellTextLength =
		cells.reduce((total, cell) => total + getNormalizedText(cell).length, 0) / Math.max(1, cells.length);
	const linkCount = Array.from(table.querySelectorAll("a")).filter((link) => link.closest("table") === table).length;
	if (linkCount > cells.length * 0.6 && averageCellTextLength < 120) return true;

	return false;
}

function normalizeBlockLinks(root: Element): void {
	for (const link of Array.from(root.querySelectorAll("a[href]"))) {
		const elementChildren = Array.from(link.children);
		if (elementChildren.length !== 1) continue;
		const [onlyChild] = elementChildren;
		if (!onlyChild.matches("h1, h2, h3, h4, h5, h6")) continue;

		const replacementLink = link.ownerDocument.createElement("a");
		for (const attribute of ["href", "title"] as const) {
			const value = link.getAttribute(attribute);
			if (value) replacementLink.setAttribute(attribute, value);
		}
		while (onlyChild.firstChild) {
			replacementLink.appendChild(onlyChild.firstChild);
		}
		onlyChild.appendChild(replacementLink);
		link.replaceWith(onlyChild);
	}
}

function removeEmptyContainers(root: Element): void {
	for (const element of Array.from(root.querySelectorAll("div, section, article, main, span")).reverse()) {
		if (element.children.length > 0) continue;
		if (getNormalizedText(element).length > 0) continue;
		element.remove();
	}
}

function isBoilerplateElement(element: Element): boolean {
	const tokens = [element.id, element.getAttribute("class"), element.getAttribute("role"), element.getAttribute("aria-label")]
		.filter(Boolean)
		.join(" ");
	return BOILERPLATE_TOKEN_RE.test(tokens);
}

function matchesAnySelector(element: Element, selector: string): boolean {
	try {
		return element.matches(selector);
	} catch {
		return false;
	}
}

function getNormalizedText(element: Element): string {
	return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function cloneElement(element: Element): Element {
	return element.cloneNode(true) as Element;
}

function replaceTag(element: Element, tagName: string): Element {
	const replacement = element.ownerDocument.createElement(tagName);
	while (element.firstChild) {
		replacement.appendChild(element.firstChild);
	}
	element.replaceWith(replacement);
	return replacement;
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
		.replace(/\[\s*\n+(#{1,6})\s+([^\n]+?)\s*\n+\s*\]\(([^)]+)\)/g, (_match, hashes: string, text: string, url: string) => {
			return `${hashes} [${text.trim()}](${url})`;
		})
		.replace(/^\[\]\([^)]+\)\n?/gm, "")
		.replace(/(\]\([^)]+\))(?=\[)/g, "$1 ")
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
