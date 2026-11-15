---
name: context-handoff
description: Use when the conversation context is getting large (around 150k tokens), when a hook says "CONTEXT HANDOFF", or when the user wants to prepare for /clear. Saves state to memory, records the branch and hands over a ready-to-paste prompt to resume in a fresh session.
---

# Context handoff

Prepare a clean `/clear` so nothing is lost. Do it once per stretch, in the user's language. Do not touch the user's code.

## Steps

1. **Say whether to clear now or finish first.** If a change is half-done, uncommitted, or a test is running, recommend finishing that first and say what is left. Otherwise recommend clearing now. One or two sentences.

2. **Save state to memory.** If you have a persistent memory directory, update the existing file for this project's status (create one only if none exists) instead of adding a duplicate. Record: what is being done, decisions made and why, pending work. Keep the index in sync if your memory uses one. With no memory system, skip this step and put the same content in the prompt of step 4.

3. **Record the repo state.** If the folder is a git repo, run `git branch --show-current`, `git status --short` and `git log -3 --oneline`, and include branch, uncommitted changes and last commits in the saved state and the prompt. If it is not a repo, say so in one line.

4. **Hand over the resume prompt** as a single code block the user can paste after `/clear`:
   - what we were doing and why
   - branch and state (clean / uncommitted changes)
   - what is left, in order
   - which files or docs to read first

End with one line: "Run /clear and paste the prompt above." Do not repeat the handoff again in this stretch unless the user asks.
