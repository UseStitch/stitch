---
name: skillify
description: Capture the current chat's repeatable process as a reusable skill when the user asks to turn a conversation, workflow, or process into a skill.
---

# Skillify

You are capturing this session's repeatable process as a reusable skill.

## Goal

Create a high-quality skill that can be reused in future chats. The saved skill should preserve the user's preferences, constraints, checkpoints, and success criteria from this conversation.

## Process

### 1. Analyze The Session

Review the current conversation before asking questions. Identify:

- The repeatable process that was performed or designed.
- The inputs or arguments a future user would provide.
- The major steps in order.
- The success criteria for each step.
- Places where the user corrected, constrained, or steered the work.
- Tools, permissions, files, applications, or external services required.
- Whether any work should be delegated to `task`.
- The artifacts the skill should produce.

Success criteria: You can summarize the candidate skill name, goal, inputs, steps, and output artifacts in concrete terms.

### 2. Interview The User

Use the `question` tool for clarification. Do not ask questions in plain text when you need a user decision.

Ask only what is needed. For a simple workflow, one short confirmation round is enough.

Clarify:

- Skill name and one-line description.
- Goal and completion criteria.
- Inputs or arguments the future skill needs.
- Required tools or toolsets.
- Any human checkpoints before irreversible actions.
- Whether the skill should run inline in the main chat or delegate self-contained work to `task`.
- Trigger phrases or requests that should cause the model to load the skill in future chats.

Success criteria: The user has confirmed the important behavior, or the remaining details are obvious from the conversation.

### 3. Draft The Skill

Draft the full skill content before saving it. Use this structure:

```markdown
# Skill Title

Describe when to use this skill, including trigger phrases and example user requests.

## Inputs

- `input_name`: Description of the input.

## Goal

State the artifact or outcome this skill must produce.

## Steps

### 1. Step Name

Specific instruction for this step.

Success criteria: State how to know this step is complete.

### 2. Step Name

Specific instruction for this step.

Success criteria: State how to know this step is complete.

## Rules

- Hard constraints and preferences from the user.
```

Rules for the generated skill:

- Keep the skill focused on one repeatable workflow.
- Include concrete success criteria for every major step.
- Include user corrections as rules when they are likely to matter later.
- Prefer direct execution in the current chat unless the work is self-contained and does not need mid-process user input.
- If delegation is useful, say exactly when to use `task` and what result it should return.
- Do not add broad flexibility, extra features, or speculative tools.

Success criteria: The draft is complete enough to save without additional hidden assumptions.

### 3b. Identify Reference Files (Optional)

Decide whether the skill benefits from companion files alongside `SKILL.md`. Reference files are useful when:

- The skill references a template, schema, or boilerplate that would be too long to inline.
- The skill runs scripts or config files that are better maintained separately.
- Examples, sample data, or lookup tables would clutter the main skill body.

If reference files are needed, plan each file with a relative path inside the skill directory (e.g., `reference/template.md`, `scripts/run.sh`). These will be written using the `Write` tool after `SKILL.md` is saved.

If no reference files are needed, skip this step.

Success criteria: You know exactly which additional files (if any) to write and their paths relative to the skill directory.

### 4. Confirm And Save

Show the user:
- The proposed skill name and description.
- The full `SKILL.md` content.
- A list of any reference files to be created alongside it.

Use the `question` tool to ask whether it should be saved.

Only after confirmation:

1. Call `create_skill` with:
   - `name`: lowercase letters, numbers, and single hyphens only.
   - `description`: concise one-line description.
   - `content`: the final Markdown body, without YAML frontmatter.

2. If there are reference files, use the `Write` tool to create each one at its absolute path inside the skill directory. The skill directory is located at the path reported in the `create_skill` output (the `location` field points to `SKILL.md`; companion files sit alongside it in the same directory).

After saving, tell the user:

- The skill name.
- Where it was saved.
- Any reference files that were written and their paths.
- That future chats can invoke it by matching the skill description, and `/skillify` can be used again to create more skills.

Success criteria: The skill and all reference files are saved successfully and the user knows how it will be reused.
