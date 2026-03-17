declare module "html-to-text" {
	export function convert(html: string, options?: unknown): string;
	export function compile(options?: unknown): (html: string) => string;
}

declare module "turndown-plugin-gfm" {
	export const gfm: (service: unknown) => void;
}
