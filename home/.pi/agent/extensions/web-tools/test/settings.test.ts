import test from "node:test";
import assert from "node:assert/strict";
import {
	parseEnumSetting,
	parseIntegerSetting,
	parseOnOff,
} from "../settings.ts";

test("parseOnOff accepts on/off and falls back safely", () => {
	assert.equal(parseOnOff("on", false), true);
	assert.equal(parseOnOff("off", true), false);
	assert.equal(parseOnOff("bogus", true), true);
	assert.equal(parseOnOff(undefined, false), false);
});

test("parseIntegerSetting validates integer ranges", () => {
	assert.equal(parseIntegerSetting("30", 10, { min: 1, max: 120 }), 30);
	assert.equal(parseIntegerSetting("0", 10, { min: 1, max: 120 }), 10);
	assert.equal(parseIntegerSetting("121", 10, { min: 1, max: 120 }), 10);
	assert.equal(parseIntegerSetting("not-a-number", 10, { min: 1, max: 120 }), 10);
});

test("parseEnumSetting validates allowed values", () => {
	assert.equal(parseEnumSetting("markdown", ["markdown", "text", "html"], "text"), "markdown");
	assert.equal(parseEnumSetting("pdf", ["markdown", "text", "html"], "text"), "text");
	assert.equal(parseEnumSetting(undefined, ["markdown", "text", "html"], "text"), "text");
});
