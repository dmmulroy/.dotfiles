import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationResult,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { writeTempTextFile } from "./temp.ts";

export interface TruncatedTextOutput {
	text: string;
	truncated: boolean;
	fullOutputPath?: string;
	truncation: TruncationResult;
}

export async function truncateTextOutput(
	output: string,
	options: {
		maxBytes?: number;
		maxLines?: number;
		tempPrefix: string;
		fileName?: string;
	},
): Promise<TruncatedTextOutput> {
	const truncation = truncateHead(output, {
		maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
		maxLines: options.maxLines ?? DEFAULT_MAX_LINES,
	});

	if (!truncation.truncated) {
		return {
			text: truncation.content,
			truncated: false,
			truncation,
		};
	}

	const fullOutputPath = await writeTempTextFile(options.tempPrefix, options.fileName ?? "output.txt", output);
	const omittedLines = truncation.totalLines - truncation.outputLines;
	const omittedBytes = truncation.totalBytes - truncation.outputBytes;
	let text = truncation.content;
	text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
	text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
	text += ` ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.`;
	text += ` Full output saved to: ${fullOutputPath}]`;

	return {
		text,
		truncated: true,
		fullOutputPath,
		truncation,
	};
}
