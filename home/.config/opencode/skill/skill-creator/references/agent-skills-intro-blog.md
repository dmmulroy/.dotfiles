# Equipping Agents for the Real World with Agent Skills

> Source: Anthropic Engineering Blog, Oct 16, 2025
> Updated: Agent Skills published as open standard (Dec 18, 2025)

LLMs are powerful, but real work requires procedural knowledge and organizational context. Agent Skills are organized folders of instructions, scripts, and resources that agents discover and load dynamically for specific tasks.

Building a skill = creating an onboarding guide for a new hire. Instead of fragmented custom agents per use case, anyone can specialize agents with composable capabilities by capturing and sharing procedural knowledge.

![Skill directory structure](../assets/images/skill-directory-structure.jpg)

## Anatomy of a Skill

Simplest form: directory with `SKILL.md` file.

YAML frontmatter required: `name` and `description`. At startup, agent pre-loads metadata of every installed skill into system prompt.

![SKILL.md anatomy](../assets/images/skill-md-anatomy.jpg)

### Progressive Disclosure Levels

1. **Metadata** (name + description) - Always in context, enough to know when skill applies
2. **SKILL.md body** - Loaded when agent thinks skill is relevant
3. **Bundled files** - Referenced from SKILL.md, loaded only as needed

Example: PDF skill has `reference.md` and `forms.md` separate from core `SKILL.md`. Form-filling instructions in `forms.md` only loaded when filling forms.

![Bundled content](../assets/images/skill-bundled-content.jpg)

![Progressive disclosure](../assets/images/progressive-disclosure.jpg)

### Context Window Flow

1. Start: system prompt + skill metadata + user message
2. Agent triggers skill by reading `pdf/SKILL.md`
3. Agent reads bundled files as needed (e.g., `forms.md`)
4. Agent proceeds with task using loaded instructions

![Context window flow](../assets/images/context-window-flow.jpg)

### Code Execution

Skills can include pre-written scripts. Benefits:
- Sorting via code vs token generation = far cheaper
- Deterministic reliability
- Scripts run without loading into context
- Consistent, repeatable workflows

Example: Python script extracts PDF form fields without loading script or PDF into context.

![Code execution](../assets/images/code-execution.jpg)

## Developing Skills: Best Practices

**Start with evaluation:** Run agents on representative tasks, observe struggles, build skills incrementally to address gaps.

**Structure for scale:**
- Split unwieldy SKILL.md into separate files
- Keep mutually exclusive contexts separate (reduces tokens)
- Code serves as both executable tools and documentation
- Clarify whether scripts should run directly or be read as reference

**Think from agent's perspective:**
- Monitor real usage, iterate on observations
- Watch for unexpected trajectories or overreliance
- Pay attention to `name` and `description` - agent uses these to decide when to trigger

**Iterate with agent:**
- Ask agent to capture successful approaches into skill
- When off track, ask for self-reflection
- Discover what context agent actually needs vs anticipating upfront

## Security Considerations

Skills provide new capabilities through instructions and code. Malicious skills may:
- Introduce vulnerabilities
- Direct data exfiltration
- Cause unintended actions

Recommendations:
- Install only from trusted sources
- Audit less-trusted skills before use
- Review bundled files, code dependencies, resources
- Watch for instructions connecting to untrusted external sources

## Future

Skills complement MCP servers for complex workflows with external tools.

Long-term: agents create, edit, evaluate Skills themselves - codifying their own patterns into reusable capabilities.
