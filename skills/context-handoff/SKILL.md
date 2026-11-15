---
name: context-handoff
description: Use when context is getting large (~150k tokens), when a hook says "CONTEXT HANDOFF", or before /clear. Saves state to memory and hands over a ready-to-paste prompt to resume in a fresh session.
---

# Context handoff

Prepare a clean `/clear`. Once per stretch, in the user's language. Use as few tool calls as possible: every call re-reads the whole (large) context. Do not touch the user's code or read files just for this.

1. **Recommend.** If a change is half-done, uncommitted or a test is running, say to finish first and what is left, then do steps 2-4 yourself right after finishing, so the handoff describes finished work. Otherwise recommend clearing now. Two sentences at most.

2. **Gather in one turn.** Run one command: `git branch --show-current; git status --short; git log -3 --oneline` (if not a repo, say so in one line). In the same turn, read your project-status memory file if it exists.

3. **Save only what is new.** Compare with what that memory already says. Write only if state, decisions or pending work changed (update the existing file, no duplicates; keep the index in sync). If nothing changed, skip the write. With no memory system, skip this step.

4. **Hand over the prompt** in one code block to paste after `/clear`: what we were doing and why; branch and state (clean or uncommitted changes); what is left, in order; which files to read first.

End with: "Run /clear and paste the prompt above." Do not repeat in this stretch unless asked or the state changed after delivering (then refresh once).
