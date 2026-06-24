# Componentize

Use this when the user wants to componentize, extract, or organize UI code into reusable components.

## Activation

Activate when the user asks to:

- componentize an existing page, section, or prototype
- extract or componentize a page or section
- extract repeated UI into reusable components
- reduce duplication in UI code
- turn a draft implementation into production-ready code structure
- split a large UI file into smaller, focused modules

Do not activate when:

- the user wants a brand-new design or layout
- the request is only about visual polish
- the user wants to clean up Tailwind classes without extracting components
- the user only wants responsive behavior, dark mode, or image adaptation

## User-facing progress updates

Keep the user informed so longer runs do not look stuck.

- One-line status update before each major phase.
- Concrete and lightweight: what you are doing now, not verbose logs.

## Rules

- Break designs into small, focused components instead of rendering everything in a single large component — extract repeated patterns, logical sections, and self-contained UI blocks into their own components
- Never bake margins into components — apply margins at the call site instead; every component must accept a `class` attribute and merge it with the classes on the component's top-level element
- Use `clsx` or similar to merge classes together in client-side components
- Always extract form controls into reusable components organized by HTML element — one `Input` component for all `<input>` types (text, email, password, etc.), one `Select` for `<select>`, one `Textarea` for `<textarea>`; never create type-specific components like `EmailInput` or `PasswordInput`; check the project for existing ones before creating new ones
- When two or more elements share the same structure and styling but differ only in props like labels, placeholders, or types — extract them into a single reusable component parameterized by those differences
- After extracting components, scan them for duplicated patterns and extract shared elements into reusable components — e.g. repeated section container/max-width/padding wrappers, repeated heading group structures (eyebrow + heading + subheading), repeated card shells, repeated button styles
- Always use existing project components when they are available — reuse or extend them instead of creating new ones; buttons and form elements are especially common candidates
