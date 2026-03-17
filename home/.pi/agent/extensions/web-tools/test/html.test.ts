import test from "node:test";
import assert from "node:assert/strict";
import { htmlToMarkdown, htmlToText, sanitizeHtml } from "../html.ts";

test("html pipeline removes head and skipped elements without leaking title", () => {
	const input = `
		<html>
			<head><title>TITLE</title><script>bad()</script></head>
			<body>start<script>bad()</script><noscript>fallback</noscript><p>end</p></body>
		</html>
	`;
	assert.equal(htmlToText(input, "https://example.com/page"), "start\n\nend");
	assert.equal(htmlToMarkdown(input, "https://example.com/page"), "start\n\nend");
});

test("html text conversion preserves direct tail text after skipped elements", () => {
	const input = `<html><body>start<script>bad()</script>tail</body></html>`;
	assert.equal(htmlToText(input, "https://example.com/page"), "starttail");
});

test("html text conversion preserves block boundaries", () => {
	const input = `<html><body><div>one</div><div>two</div><p>three <span>four</span></p><p>five</p></body></html>`;
	assert.equal(htmlToText(input, "https://example.com/page"), "one\ntwo\n\nthree four\n\nfive");
});

test("sanitizeHtml absolutizes relative links and images", () => {
	const input = `<html><body><a href="/docs">Docs</a><img src="./image.png"></body></html>`;
	const sanitized = sanitizeHtml(input, "https://example.com/base/index.html");
	assert.match(sanitized, /https:\/\/example\.com\/docs/);
	assert.match(sanitized, /https:\/\/example\.com\/base\/image\.png/);
});
