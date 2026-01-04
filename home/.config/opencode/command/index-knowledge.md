---
description: Generate/update hierarchical AGENTS.md files for codebases
---

Load the indexing-agent-knowledge skill and use it to generate or update AGENTS.md files.
Auto-detects fresh init vs incremental update based on existing files.

<skill>
$FILE{skill/indexing-agent-knowledge/SKILL.md}
</skill>

<user-request>
$ARGUMENTS
</user-request>
