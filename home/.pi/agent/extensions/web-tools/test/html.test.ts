import test from "node:test";
import assert from "node:assert/strict";
import { htmlToMarkdown, htmlToText, isPoorMarkdownConversion, sanitizeHtml } from "../html.ts";

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

test("sanitizeHtml prefers likely main content over surrounding site chrome", () => {
	const input = `
		<html>
			<body>
				<header><nav><a href="/home">Home</a><a href="/login">Login</a></nav></header>
				<main>
					<article>
						<h1>Article title</h1>
						<p>Useful content.</p>
					</article>
				</main>
				<footer>Footer links</footer>
			</body>
		</html>
	`;
	const sanitized = sanitizeHtml(input, "https://example.com/post");
	assert.match(sanitized, /Article title/);
	assert.match(sanitized, /Useful content\./);
	assert.doesNotMatch(sanitized, /Login/);
	assert.doesNotMatch(sanitized, /Footer links/);
});

test("html markdown conversion normalizes heading links that wrap block content", () => {
	const input = `<html><body><a href="/story"><h2>Story title</h2></a></body></html>`;
	assert.equal(htmlToMarkdown(input, "https://example.com/"), "## [Story title](https://example.com/story)");
});

test("html markdown conversion flattens layout tables instead of returning raw table markup", () => {
	const input = `
		<html>
			<body>
				<div id="bigbox">
					<table><tbody>
						<tr><td>1.</td><td><a href="/item">Item title</a></td></tr>
						<tr><td></td><td>123 points by alice</td></tr>
					</tbody></table>
				</div>
			</body>
		</html>
	`;
	const markdown = htmlToMarkdown(input, "https://news.ycombinator.com/");
	assert.match(markdown, /Item title/);
	assert.match(markdown, /123 points by alice/);
	assert.doesNotMatch(markdown, /<table|<tr|<td/i);
	assert.equal(isPoorMarkdownConversion(markdown), false);
});

test("poor markdown conversion detection flags raw layout html", () => {
	assert.equal(isPoorMarkdownConversion("<table><tr><td>raw</td></tr></table>"), true);
	assert.equal(isPoorMarkdownConversion("# Heading\n\nA clean paragraph."), false);
});
