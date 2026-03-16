import test from "node:test";
import assert from "node:assert/strict";
import { classifyMimeType, isPrivateOrLocalIp, parseContentType } from "../network.ts";

test("parseContentType normalizes html and xhtml content types", () => {
	assert.equal(parseContentType("TEXT/HTML; charset=UTF-8").kind, "html");
	assert.equal(parseContentType("TEXT/HTML; charset=UTF-8").mime, "text/html");
	assert.equal(parseContentType("application/xhtml+xml; charset=utf-8").kind, "html");
	assert.equal(parseContentType("image/svg+xml").kind, "svg");
});

test("classifyMimeType recognizes supported raster images and binary fallback", () => {
	assert.equal(classifyMimeType("image/png"), "raster-image");
	assert.equal(classifyMimeType("application/octet-stream"), "binary");
	assert.equal(classifyMimeType("application/json"), "text");
});

test("isPrivateOrLocalIp detects local and private IP ranges", () => {
	assert.equal(isPrivateOrLocalIp("127.0.0.1"), true);
	assert.equal(isPrivateOrLocalIp("10.0.0.5"), true);
	assert.equal(isPrivateOrLocalIp("192.168.1.20"), true);
	assert.equal(isPrivateOrLocalIp("172.20.0.1"), true);
	assert.equal(isPrivateOrLocalIp("::1"), true);
	assert.equal(isPrivateOrLocalIp("fc00::1"), true);
	assert.equal(isPrivateOrLocalIp("8.8.8.8"), false);
});
