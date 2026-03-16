import { complete, type Api, type Model, type UserMessage } from "@mariozechner/pi-ai";
import {
	BorderedLoader,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type Theme,
} from "@mariozechner/pi-coding-agent";
import { getSetting, setSetting, type OrderedListOption, type SettingDefinition } from "@juanibiapina/pi-extension-settings";
import {
	type Component,
	type Focusable,
	Editor,
	type EditorTheme,
	fuzzyFilter,
	Input,
	Key,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

interface ExtractedQuestion {
	question: string;
	context?: string;
}

interface ExtractionResult {
	questions: ExtractedQuestion[];
}

type ExtractionOutcome =
	| { type: "success"; result: ExtractionResult }
	| { type: "cancelled" }
	| { type: "error"; message: string };

const SYSTEM_PROMPT = `You extract questions from assistant text that still need answers from the user.

Return exactly one JSON object with this shape:
{
  "questions": [
    {
      "question": "Question text",
      "context": "Optional short context"
    }
  ]
}

Rules:
- Extract only questions that require user input.
- Keep questions in the original order.
- Keep question text concise but faithful to the source.
- Include context only when it materially helps answer the question.
- Do not add commentary outside the JSON object.
- If there are no user-answerable questions, return {"questions": []}.`;

const ANSWER_EXTENSION_NAME = "answer";
const LEGACY_EXTRACTION_MODELS_SETTING_ID = "extractionModels";
const PRIMARY_EXTRACTION_MODEL_SETTING_ID = "primaryExtractionModel";
const FALLBACK_EXTRACTION_MODEL_SETTING_ID = "fallbackExtractionModel";

interface ExtractionModelPreference {
	provider: string;
	modelId: string;
}

interface ExtractionModelOption extends OrderedListOption {
	provider: string;
	modelId: string;
}

const DEFAULT_EXTRACTION_MODEL_PREFERENCES: readonly ExtractionModelPreference[] = [
	{ provider: "openai-codex", modelId: "gpt-5.3-codex-spark" },
	{ provider: "openai", modelId: "gpt-5.3-codex-spark" },
];

const STATIC_FALLBACK_EXTRACTION_MODEL_OPTIONS = DEFAULT_EXTRACTION_MODEL_PREFERENCES.map((candidate) => ({
	id: `${candidate.provider}/${candidate.modelId}`,
	label: `${candidate.provider} / ${candidate.modelId}`,
	provider: candidate.provider,
	modelId: candidate.modelId,
})) satisfies ExtractionModelOption[];

function toExtractionModelKey(candidate: ExtractionModelPreference): string {
	return `${candidate.provider}/${candidate.modelId}`;
}

function parseExtractionModelKey(value: string): ExtractionModelPreference | undefined {
	const normalized = value.trim();
	const slashIndex = normalized.indexOf("/");
	if (slashIndex <= 0 || slashIndex === normalized.length - 1) return undefined;
	return {
		provider: normalized.slice(0, slashIndex),
		modelId: normalized.slice(slashIndex + 1),
	};
}

function getAvailableExtractionModelOptions(
	modelRegistry?: Pick<ExtensionContext["modelRegistry"], "getAvailable">,
): ExtractionModelOption[] {
	if (!modelRegistry) return [...STATIC_FALLBACK_EXTRACTION_MODEL_OPTIONS];

	const unique = new Map<string, ExtractionModelOption>();
	for (const model of modelRegistry.getAvailable()) {
		if (!model.input.includes("text")) continue;
		const id = `${model.provider}/${model.id}`;
		if (unique.has(id)) continue;
		unique.set(id, {
			id,
			label: model.name && model.name !== model.id ? `${model.provider} / ${model.id} — ${model.name}` : `${model.provider} / ${model.id}`,
			provider: model.provider,
			modelId: model.id,
		});
	}

	const options = Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
	return options.length > 0 ? options : [...STATIC_FALLBACK_EXTRACTION_MODEL_OPTIONS];
}

function getDefaultExtractionModelPreferences(
	modelRegistry?: Pick<ExtensionContext["modelRegistry"], "getAvailable">,
): ExtractionModelPreference[] {
	const options = getAvailableExtractionModelOptions(modelRegistry);
	const available = new Set(options.map((option) => option.id));
	const preferred = DEFAULT_EXTRACTION_MODEL_PREFERENCES.filter((candidate) => available.has(toExtractionModelKey(candidate)));
	if (preferred.length > 0) return preferred;
	return options.slice(0, 2).map((option) => ({ provider: option.provider, modelId: option.modelId }));
}

function getSlotSettingIds(): string[] {
	return [PRIMARY_EXTRACTION_MODEL_SETTING_ID, FALLBACK_EXTRACTION_MODEL_SETTING_ID];
}

function getStoredSlotSettingValues(): Array<string | undefined> {
	return getSlotSettingIds().map((settingId) => {
		const raw = getSetting(ANSWER_EXTENSION_NAME, settingId, undefined);
		return raw === undefined ? undefined : raw.trim();
	});
}

function hasStoredSlotSettings(values: readonly (string | undefined)[]): boolean {
	return values.some((value) => value !== undefined);
}

function getStoredSlotModelPreferences(values = getStoredSlotSettingValues()): ExtractionModelPreference[] {
	const parsed: ExtractionModelPreference[] = [];
	const seen = new Set<string>();

	for (const raw of values) {
		if (!raw) continue;
		const candidate = parseExtractionModelKey(raw);
		if (!candidate) continue;
		const key = toExtractionModelKey(candidate);
		if (seen.has(key)) continue;
		seen.add(key);
		parsed.push(candidate);
	}

	return parsed;
}

function getLegacyExtractionModelPreferences(): ExtractionModelPreference[] {
	const raw = getSetting(ANSWER_EXTENSION_NAME, LEGACY_EXTRACTION_MODELS_SETTING_ID, undefined)?.trim();
	if (!raw) return [];

	return raw
		.split(",")
		.map((entry) => parseExtractionModelKey(entry))
		.filter((candidate): candidate is ExtractionModelPreference => Boolean(candidate));
}

function mergeExtractionModelPreferences(...groups: readonly ExtractionModelPreference[][]): ExtractionModelPreference[] {
	const merged: ExtractionModelPreference[] = [];
	const seen = new Set<string>();

	for (const group of groups) {
		for (const candidate of group) {
			const key = toExtractionModelKey(candidate);
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(candidate);
		}
	}

	return merged;
}

function registerAnswerSettings(
	pi: ExtensionAPI,
	modelRegistry?: Pick<ExtensionContext["modelRegistry"], "getAvailable">,
): void {
	const defaults = getDefaultExtractionModelPreferences(modelRegistry);
	const storedSlotValues = getStoredSlotSettingValues();
	const storedSlots = getStoredSlotModelPreferences(storedSlotValues);
	const legacy = hasStoredSlotSettings(storedSlotValues) ? [] : getLegacyExtractionModelPreferences();
	const effective = mergeExtractionModelPreferences(storedSlots, legacy, defaults);
	const descriptionsSuffix = "use /answer-config to pick from currently available models.";
	const definitions = [
		{
			id: PRIMARY_EXTRACTION_MODEL_SETTING_ID,
			label: "Primary Model",
			description: `First model tried for question extraction. Enter provider/modelId manually, or ${descriptionsSuffix}`,
			defaultValue: storedSlotValues[0] ?? toExtractionModelKey(effective[0] ?? defaults[0] ?? DEFAULT_EXTRACTION_MODEL_PREFERENCES[0]!),
		},
		{
			id: FALLBACK_EXTRACTION_MODEL_SETTING_ID,
			label: "Fallback Model",
			description: `Second model tried if the primary model is unavailable. Leave blank to disable, or ${descriptionsSuffix}`,
			defaultValue: storedSlotValues[1] ?? (effective[1] ? toExtractionModelKey(effective[1]) : ""),
		},
	] satisfies SettingDefinition[];

	pi.events.emit("pi-extension-settings:register", {
		name: ANSWER_EXTENSION_NAME,
		settings: definitions,
	});
}

function getExtractionModelPreferences(
	modelRegistry?: Pick<ExtensionContext["modelRegistry"], "getAvailable">,
): ExtractionModelPreference[] {
	const storedSlotValues = getStoredSlotSettingValues();
	const storedSlots = getStoredSlotModelPreferences(storedSlotValues);
	if (hasStoredSlotSettings(storedSlotValues)) {
		return storedSlots;
	}

	const legacy = getLegacyExtractionModelPreferences();
	const defaults = getDefaultExtractionModelPreferences(modelRegistry);
	return mergeExtractionModelPreferences(legacy, defaults);
}

function formatExtractionModelPreferences(preferences: ExtractionModelPreference[]): string {
	return preferences.map((candidate) => `${candidate.provider}/${candidate.modelId}`).join(", ");
}

class SearchableModelPicker implements Component, Focusable {
	private readonly title: string;
	private readonly options: ExtractionModelOption[];
	private readonly theme: Theme;
	private readonly searchInput: Input;
	private filteredOptions: ExtractionModelOption[];
	private selectedIndex = 0;
	private _focused = false;

	constructor(
		private readonly tui: TUI,
		title: string,
		options: ExtractionModelOption[],
		theme: Theme,
		private readonly done: (selected?: ExtractionModelPreference) => void,
		currentSelection?: ExtractionModelPreference,
	) {
		this.title = title;
		this.options = options;
		this.theme = theme;
		this.searchInput = new Input();
		this.filteredOptions = options;
		this.searchInput.onSubmit = () => {
			const selected = this.filteredOptions[this.selectedIndex];
			if (selected) {
				this.done({ provider: selected.provider, modelId: selected.modelId });
			}
		};

		if (currentSelection) {
			const currentKey = toExtractionModelKey(currentSelection);
			const currentIndex = this.options.findIndex((option) => option.id === currentKey);
			if (currentIndex >= 0) {
				this.selectedIndex = currentIndex;
			}
		}
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines: string[] = [];
		const maxVisible = 10;
		const contentWidth = Math.max(1, width - 4);
		const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filteredOptions.length - maxVisible));
		const endIndex = Math.min(startIndex + maxVisible, this.filteredOptions.length);

		lines.push(this.theme.fg("accent", truncateToWidth(this.title, contentWidth, "…")));
		lines.push(this.theme.fg("dim", truncateToWidth("Type to filter available models", contentWidth, "…")));
		lines.push("");
		for (const line of this.searchInput.render(contentWidth)) {
			lines.push(line);
		}
		lines.push("");

		if (this.filteredOptions.length === 0) {
			lines.push(this.theme.fg("warning", "  No matching models"));
		} else {
			for (let i = startIndex; i < endIndex; i++) {
				const option = this.filteredOptions[i]!;
				const isSelected = i === this.selectedIndex;
				const prefix = isSelected ? this.theme.fg("accent", "→ ") : "  ";
				const label = isSelected ? this.theme.fg("accent", option.id) : option.id;
				lines.push(truncateToWidth(`${prefix}${label}`, contentWidth, "…"));
			}

			if (startIndex > 0 || endIndex < this.filteredOptions.length) {
				lines.push(this.theme.fg("dim", `  (${this.selectedIndex + 1}/${this.filteredOptions.length})`));
			}

			const selected = this.filteredOptions[this.selectedIndex];
			if (selected) {
				lines.push("");
				lines.push(this.theme.fg("dim", truncateToWidth(`  ${selected.label}`, contentWidth, "…")));
			}
		}

		lines.push("");
		lines.push(this.theme.fg("dim", "  ↑/↓ navigate · Enter select · Esc cancel"));
		return lines;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done(undefined);
			return;
		}

		if (matchesKey(data, Key.up)) {
			if (this.filteredOptions.length === 0) return;
			this.selectedIndex = this.selectedIndex === 0 ? this.filteredOptions.length - 1 : this.selectedIndex - 1;
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, Key.down)) {
			if (this.filteredOptions.length === 0) return;
			this.selectedIndex = this.selectedIndex === this.filteredOptions.length - 1 ? 0 : this.selectedIndex + 1;
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, Key.enter)) {
			const selected = this.filteredOptions[this.selectedIndex];
			if (selected) {
				this.done({ provider: selected.provider, modelId: selected.modelId });
			}
			return;
		}

		this.searchInput.handleInput(data);
		const query = this.searchInput.getValue().trim();
		this.filteredOptions = query
			? fuzzyFilter(this.options, query, (option) => `${option.id} ${option.label} ${option.provider} ${option.modelId}`)
			: this.options;
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredOptions.length - 1));
		this.tui.requestRender();
	}
}

async function configureAnswerExtractionModels(
	ctx: ExtensionCommandContext,
	modelRegistry: Pick<ExtensionContext["modelRegistry"], "getAvailable">,
): Promise<void> {
	const options = getAvailableExtractionModelOptions(modelRegistry);
	const slotIds = getSlotSettingIds();
	const slotLabels = ["Primary Model", "Fallback Model"] as const;
	const slots = slotIds.map((settingId, index) => ({
		settingId,
		label: slotLabels[index]!,
		value: getSetting(ANSWER_EXTENSION_NAME, settingId, undefined)?.trim() || "",
	}));

	const formatSlotValue = (value: string): string => (value ? value : "(unset)");

	while (true) {
		const choice = await ctx.ui.select(
			"Configure answer extraction models",
			[
				...slots.map((slot) => `${slot.label}: ${formatSlotValue(slot.value)}`),
				"Reset slots to recommended defaults",
				"Done",
			],
		);

		if (!choice || choice === "Done") return;

		if (choice === "Reset slots to recommended defaults") {
			const defaults = getDefaultExtractionModelPreferences(modelRegistry);
			for (let i = 0; i < slots.length; i++) {
				const nextValue = defaults[i] ? toExtractionModelKey(defaults[i]!) : "";
				slots[i]!.value = nextValue;
				setSetting(ANSWER_EXTENSION_NAME, slots[i]!.settingId, nextValue);
			}
			continue;
		}

		const slotIndex = slots.findIndex((slot) => `${slot.label}: ${formatSlotValue(slot.value)}` === choice);
		if (slotIndex < 0) continue;
		const slot = slots[slotIndex]!;

		const action = await ctx.ui.select(slot.label, ["Choose model", "Clear", "Back"]);
		if (!action || action === "Back") continue;
		if (action === "Clear") {
			slot.value = "";
			setSetting(ANSWER_EXTENSION_NAME, slot.settingId, "");
			continue;
		}

		const selected = await ctx.ui.custom<ExtractionModelPreference | undefined>((tui, theme, _kb, done) => {
			return new SearchableModelPicker(tui, slot.label, options, theme, done, parseExtractionModelKey(slot.value));
		});
		if (!selected) continue;

		slot.value = toExtractionModelKey(selected);
		setSetting(ANSWER_EXTENSION_NAME, slot.settingId, slot.value);
	}
}

function getTextParts(content: Array<{ type: string; text?: string }>): string[] {
	return content
		.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text);
}

function getJsonCandidates(text: string): string[] {
	const candidates = new Set<string>();
	const trimmed = text.trim();

	if (trimmed) {
		candidates.add(trimmed);
	}

	for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
		const candidate = match[1]?.trim();
		if (candidate) {
			candidates.add(candidate);
		}
	}

	const firstBrace = text.indexOf("{");
	const lastBrace = text.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		const candidate = text.slice(firstBrace, lastBrace + 1).trim();
		if (candidate) {
			candidates.add(candidate);
		}
	}

	return [...candidates];
}

function normalizeExtractedQuestions(result: ExtractionResult): ExtractionResult {
	const seen = new Set<string>();
	const questions: ExtractedQuestion[] = [];

	for (const item of result.questions) {
		const question = item.question.trim();
		const context = item.context?.trim() || undefined;
		if (!question) continue;

		const key = question.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);

		questions.push({ question, context });
	}

	return { questions };
}

function parseExtractionResult(text: string): ExtractionOutcome {
	for (const candidate of getJsonCandidates(text)) {
		try {
			const parsed = JSON.parse(candidate) as ExtractionResult;
			if (parsed && Array.isArray(parsed.questions)) {
				return {
					type: "success",
					result: normalizeExtractedQuestions(parsed),
				};
			}
		} catch {
			// Try the next candidate.
		}
	}

	return {
		type: "error",
		message: "Question extraction returned invalid JSON.",
	};
}

function findLastCompletedAssistantMessage(ctx: ExtensionContext): {
	text?: string;
	skippedIncomplete: boolean;
} {
	const branch = ctx.sessionManager.getBranch();
	let skippedIncomplete = false;

	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i]!;
		if (entry.type !== "message") continue;

		const message = entry.message;
		if (!("role" in message) || message.role !== "assistant") continue;

		const text = getTextParts(message.content).join("\n").trim();
		if (message.stopReason !== "stop") {
			skippedIncomplete = true;
			continue;
		}

		if (!text) continue;
		return { text, skippedIncomplete };
	}

	return { skippedIncomplete };
}

async function selectExtractionModel(
	modelRegistry: {
		find: (provider: string, modelId: string) => Model<Api> | undefined;
		getApiKey: (model: Model<Api>) => Promise<string | undefined>;
	},
	preferences: ExtractionModelPreference[],
): Promise<Model<Api> | undefined> {
	for (const candidate of preferences) {
		const model = modelRegistry.find(candidate.provider, candidate.modelId);
		if (!model) continue;

		const apiKey = await modelRegistry.getApiKey(model);
		if (apiKey) {
			return model;
		}
	}

	return undefined;
}

function buildAnswerMessage(questions: ExtractedQuestion[], answers: string[]): string {
	const lines = ["Here are my answers to your questions:", ""];

	for (let i = 0; i < questions.length; i++) {
		const question = questions[i]!;
		const answer = answers[i]?.trim() || "(no answer)";

		lines.push(`Q: ${question.question}`);
		if (question.context) {
			lines.push(`Context: ${question.context}`);
		}
		lines.push(`A: ${answer}`);

		if (i < questions.length - 1) {
			lines.push("");
		}
	}

	return lines.join("\n");
}

class AnswerComponent implements Component, Focusable {
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.editor.focused = value;
	}

	private readonly answers: string[];
	private readonly editor: Editor;
	private currentIndex = 0;
	private showingConfirmation = false;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		private readonly questions: ExtractedQuestion[],
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly done: (result: string | null) => void,
	) {
		this.answers = questions.map(() => "");

		const editorTheme: EditorTheme = {
			borderColor: (text: string) => this.theme.fg("borderAccent", text),
			selectList: {
				selectedPrefix: (text: string) => this.theme.fg("accent", text),
				selectedText: (text: string) => this.theme.fg("accent", text),
				description: (text: string) => this.theme.fg("muted", text),
				scrollInfo: (text: string) => this.theme.fg("dim", text),
				noMatch: (text: string) => this.theme.fg("warning", text),
			},
		};

		this.editor = new Editor(this.tui, editorTheme);
		this.editor.disableSubmit = true;
		this.editor.onChange = () => {
			this.invalidate();
			this.tui.requestRender();
		};
	}

	private border(text: string): string {
		return this.theme.fg("border", text);
	}

	private saveCurrentAnswer(): void {
		this.answers[this.currentIndex] = this.editor.getText();
	}

	private answeredCount(): number {
		this.saveCurrentAnswer();
		return this.answers.filter((answer) => answer.trim().length > 0).length;
	}

	private navigateTo(index: number): void {
		if (index < 0 || index >= this.questions.length) return;
		this.saveCurrentAnswer();
		this.currentIndex = index;
		this.editor.setText(this.answers[index] || "");
		this.showingConfirmation = false;
		this.invalidate();
	}

	private submit(): void {
		this.saveCurrentAnswer();
		this.done(buildAnswerMessage(this.questions, this.answers));
	}

	private cancel(): void {
		this.done(null);
	}

	handleInput(data: string): void {
		if (this.showingConfirmation) {
			if (matchesKey(data, Key.enter) || data.toLowerCase() === "y") {
				this.submit();
				return;
			}
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data.toLowerCase() === "n") {
				this.showingConfirmation = false;
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			return;
		}

		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.cancel();
			return;
		}

		if (matchesKey(data, Key.tab)) {
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
				this.tui.requestRender();
			} else {
				this.saveCurrentAnswer();
				this.showingConfirmation = true;
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, Key.shift("tab"))) {
			if (this.currentIndex > 0) {
				this.navigateTo(this.currentIndex - 1);
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, Key.up) && this.editor.getText() === "") {
			if (this.currentIndex > 0) {
				this.navigateTo(this.currentIndex - 1);
				this.tui.requestRender();
				return;
			}
		}

		if (matchesKey(data, Key.down) && this.editor.getText() === "") {
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
				this.tui.requestRender();
				return;
			}
		}

		if (matchesKey(data, Key.enter) && !matchesKey(data, Key.shift("enter"))) {
			this.saveCurrentAnswer();
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
			} else {
				this.showingConfirmation = true;
				this.invalidate();
			}
			this.tui.requestRender();
			return;
		}

		this.editor.handleInput(data);
		this.invalidate();
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const boxWidth = Math.min(Math.max(width, 1), 120);
		const innerWidth = Math.max(1, boxWidth - 2);
		const contentWidth = Math.max(1, innerWidth - 2);
		const question = this.questions[this.currentIndex]!;
		const answered = this.answeredCount();
		const unanswered = this.questions.length - answered;

		const pushBoxLine = (content = "") => {
			const line = truncateToWidth(content, innerWidth, "…");
			const padding = Math.max(0, innerWidth - visibleWidth(line));
			lines.push(this.border("│") + line + " ".repeat(padding) + this.border("│"));
		};

		lines.push(this.border(`╭${"─".repeat(innerWidth)}╮`));
		pushBoxLine(` ${this.theme.fg("accent", this.theme.bold("Questions"))}${this.theme.fg("dim", ` (${this.currentIndex + 1}/${this.questions.length})`)}`);
		pushBoxLine(` ${this.theme.fg("muted", `Answered ${answered}/${this.questions.length}`)}`);
		pushBoxLine(` ${this.questions
			.map((_, index) => {
				const label = String(index + 1);
				if (index === this.currentIndex) {
					return this.theme.bg("selectedBg", this.theme.fg("text", ` ${label} `));
				}
				if (this.answers[index]?.trim()) {
					return this.theme.fg("success", label);
				}
				return this.theme.fg("dim", label);
			})
			.join(" ")}`);
		lines.push(this.border(`├${"─".repeat(innerWidth)}┤`));

		for (const line of wrapTextWithAnsi(`${this.theme.bold("Q: ")}${question.question}`, contentWidth)) {
			pushBoxLine(` ${line}`);
		}

		if (question.context) {
			pushBoxLine();
			for (const line of wrapTextWithAnsi(this.theme.fg("muted", `Context: ${question.context}`), contentWidth)) {
				pushBoxLine(` ${line}`);
			}
		}

		pushBoxLine();

		const answerPrefix = this.theme.bold("A: ");
		const answerPrefixWidth = visibleWidth(answerPrefix);
		const editorWidth = Math.max(1, contentWidth - answerPrefixWidth);
		const editorLines = this.editor.render(editorWidth);
		for (let i = 1; i < editorLines.length - 1; i++) {
			const prefix = i === 1 ? answerPrefix : " ".repeat(answerPrefixWidth);
			pushBoxLine(` ${prefix}${editorLines[i]}`);
		}

		pushBoxLine();
		lines.push(this.border(`├${"─".repeat(innerWidth)}┤`));

		if (this.showingConfirmation) {
			const message =
				unanswered > 0
					? ` Submit answers? ${unanswered} unanswered ${unanswered === 1 ? "item" : "items"} will be sent as '(no answer)'. Enter/y confirm • Esc/n back`
					: " Submit answers? Enter/y confirm • Esc/n back";
			pushBoxLine(this.theme.fg("warning", truncateToWidth(message, innerWidth - 1, "…")));
		} else {
			const controls = " Tab/Enter next • Shift+Tab previous • Shift+Enter newline • Esc cancel";
			pushBoxLine(this.theme.fg("dim", truncateToWidth(controls, innerWidth - 1, "…")));
		}

		lines.push(this.border(`╰${"─".repeat(innerWidth)}╯`));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

export default function (pi: ExtensionAPI) {
	registerAnswerSettings(pi);

	const answerHandler = async (ctx: ExtensionContext) => {
		if (!ctx.hasUI) {
			ctx.ui.notify("answer requires interactive mode", "error");
			return;
		}

		if (!ctx.model) {
			ctx.ui.notify("No model selected", "error");
			return;
		}

		const { text: lastAssistantText, skippedIncomplete } = findLastCompletedAssistantMessage(ctx);
		if (!lastAssistantText) {
			ctx.ui.notify(
				skippedIncomplete ? "No completed assistant message found yet" : "No assistant messages found",
				"error",
			);
			return;
		}

		if (skippedIncomplete) {
			ctx.ui.notify("Using the last completed assistant message", "warning");
		}

		const extractionModelPreferences = getExtractionModelPreferences(ctx.modelRegistry);
		const extractionModel = await selectExtractionModel(ctx.modelRegistry, extractionModelPreferences);
		if (!extractionModel) {
			ctx.ui.notify(
				`No configured extraction model is available with a configured API key. Checked: ${formatExtractionModelPreferences(extractionModelPreferences)}`,
				"error",
			);
			return;
		}

		const extractionOutcome = await ctx.ui.custom<ExtractionOutcome>((tui, theme, _kb, done) => {
			const loader = new BorderedLoader(
				tui,
				theme,
				`Extracting questions using ${extractionModel.provider}/${extractionModel.id}...`,
			);
			loader.onAbort = () => done({ type: "cancelled" });

			const doExtract = async () => {
				const apiKey = await ctx.modelRegistry.getApiKey(extractionModel);
				if (!apiKey) {
					return {
						type: "error",
						message: `No API key available for ${extractionModel.provider}/${extractionModel.id}`,
					} as ExtractionOutcome;
				}

				const userMessage: UserMessage = {
					role: "user",
					content: [{ type: "text", text: lastAssistantText }],
					timestamp: Date.now(),
				};

				const response = await complete(
					extractionModel,
					{ systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
					{ apiKey, signal: loader.signal },
				);

				if (response.stopReason === "aborted") {
					return { type: "cancelled" } as ExtractionOutcome;
				}

				const responseText = getTextParts(response.content).join("\n").trim();
				if (!responseText) {
					return {
						type: "error",
						message: "Question extraction returned an empty response.",
					} as ExtractionOutcome;
				}

				return parseExtractionResult(responseText);
			};

			doExtract()
				.then(done)
				.catch((error) => {
					done({
						type: "error",
						message: error instanceof Error ? error.message : String(error),
					});
				});

			return loader;
		});

		if (extractionOutcome.type === "cancelled") {
			ctx.ui.notify("Cancelled", "info");
			return;
		}

		if (extractionOutcome.type === "error") {
			ctx.ui.notify(extractionOutcome.message, "error");
			return;
		}

		if (extractionOutcome.result.questions.length === 0) {
			ctx.ui.notify("No questions found in the selected assistant message", "info");
			return;
		}

		const answersResult = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			return new AnswerComponent(extractionOutcome.result.questions, tui, theme, done);
		});

		if (answersResult === null) {
			ctx.ui.notify("Cancelled", "info");
			return;
		}

		if (ctx.isIdle()) {
			pi.sendUserMessage(answersResult);
		} else {
			pi.sendUserMessage(answersResult, { deliverAs: "followUp" });
			ctx.ui.notify("Answers queued as a follow-up message", "info");
		}
	};

	pi.registerCommand("answer", {
		description: "Extract questions from the last completed assistant message into an interactive Q&A",
		handler: async (_args, ctx) => answerHandler(ctx),
	});

	pi.registerCommand("answer-config", {
		description: "Configure answer extraction models with a searchable picker",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("answer-config requires interactive mode", "error");
				return;
			}

			await configureAnswerExtractionModels(ctx, ctx.modelRegistry);
			registerAnswerSettings(pi, ctx.modelRegistry);
			ctx.ui.notify("Updated answer extraction model settings", "info");
		},
	});

	pi.registerShortcut("ctrl+.", {
		description: "Extract and answer questions",
		handler: answerHandler,
	});

	pi.on("session_start", async (_event, ctx) => {
		registerAnswerSettings(pi, ctx.modelRegistry);
	});
}
