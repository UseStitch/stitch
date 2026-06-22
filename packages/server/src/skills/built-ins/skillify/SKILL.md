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

### 4. Confirm And Save

Show the user the proposed skill name, description, and full content. Then use the `question` tool to ask whether it should be saved.

Only after confirmation, call `create_skill` with:

- `name`: lowercase letters, numbers, and single hyphens only.
- `description`: concise one-line description.
- `content`: the final Markdown body, without YAML frontmatter.

After saving, tell the user:

- The skill name.
- Where it was saved.
- That future chats can invoke it by matching the skill description, and `/skillify` can be used again to create more skills.

Success criteria: The skill is saved successfully and the user knows how it will be reused.
