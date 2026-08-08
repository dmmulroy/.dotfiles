import { Buffer } from "node:buffer";

/** Create an inert JWT-shaped access token carrying a test Codex account ID. */
export function createCodexTestAccessToken(accountId: string): string {
	const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
	const payload = Buffer.from(
		JSON.stringify({
			"https://api.openai.com/auth": { chatgpt_account_id: accountId },
		}),
	).toString("base64url");
	return `${header}.${payload}.signature`;
}
