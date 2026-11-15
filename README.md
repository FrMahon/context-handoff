# 🧠 context-handoff

**A Claude Code plugin that warns you before your context fills up and gets everything ready for `/clear`, so you never lose the thread.**

## ✨ What it does

When the conversation reaches ~150k tokens, Claude automatically:

1. 🧭 Tells you whether to clear **now** or finish what you're doing first.
2. 💾 Saves state, decisions and pending work to the project's memory.
3. 🌿 Notes the current branch and uncommitted changes.
4. 📋 Gives you a **ready-to-paste prompt** for the new session.

It warns once per stretch (with a reminder at 200k).

## 🚀 Install

Requires Node ≥ 18.

```
/plugin marketplace add FrMahon/context-handoff
/plugin install context-handoff@context-handoff
```

That's it, nothing else to configure. You can also run it manually with `/context-handoff`.

## ⚙️ How it works

A hook runs on every message and reads the token count from the local transcript. Past the threshold, it asks Claude to use the `context-handoff` skill. Below the threshold it costs zero tokens.

To change the threshold:

```
CONTEXT_HANDOFF_THRESHOLD=120000
```

## ⚠️ Limitations

- The warning is an injected instruction, not a command: Claude almost always follows it, but it's not guaranteed.
- It doesn't run `/clear` for you; that's up to you.
- If the transcript format changes, the hook fails silently and simply doesn't warn.

## 🔒 Privacy

Everything runs on your machine. Nothing is sent anywhere.

## 🛠️ Development

```
npm test
```

Free to use. Public domain ([Unlicense](LICENSE)).
