# Pi Agent Workspace

Extensions and skills that customize Pi for agent-assisted development workflows.

## Language

**Scratchpad file**:
A persisted Markdown document used to carry human- or agent-curated context across branches, sessions, or projects.
_Avoid_: Scratchpad note, scratchpad item

**Scratchpad scope**:
The availability boundary of a scratchpad file, either project-specific or global.
_Avoid_: Storage location, directory

**Project scratchpad file**:
A scratchpad file available within the project where it was created.
_Avoid_: Local note, repo note

**Global scratchpad file**:
A scratchpad file available across projects.
_Avoid_: Shared note, universal note

**Scratchpad reference**:
A user-facing mention that includes a scratchpad file in a request.
_Avoid_: Agent tool, note handle

**Scratchpad snapshot**:
The copy of a scratchpad file's contents included in a request when a scratchpad reference is submitted.
_Avoid_: Live scratchpad, hydrated note
