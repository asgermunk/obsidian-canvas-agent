# Canvas Agent for Obsidian

An Obsidian plugin that pulls a module from Canvas LMS and lets Claude write concise study notes into your vault. It also answers questions from your notes, with clickable `[[links]]`.

It runs Claude Code on your own computer through the Claude Agent SDK, so it uses your Claude subscription (or an Anthropic API key). It is a desktop plugin and runs on **Windows and macOS**.

## What it does

- **Write module notes.** Pick a course and a module. The agent reads every page, assignment and file in the module, saves the slides and PDFs into the module's `attachments/` folder, and writes notes that link to the notes you already have.
- **Answer questions.** It searches your vault first and links every note it uses. Anything from outside your notes is labelled.
- **Follows your rules.** If your vault has a `CLAUDE.md` at the root, the agent follows it, together with any skills in `.claude/skills/`. If there is no `CLAUDE.md`, it asks whether to set up a nested folder structure, and then writes one for you.
- **Source order.** It uses a book in your vault first, then its own knowledge, then the web.

## Requirements

- Obsidian 1.5 or newer (desktop)
- [Node.js](https://nodejs.org) 18 or newer, and git
- A Claude Pro/Max subscription, or an Anthropic API key
- A Canvas account

## Install

Run these in a terminal (Terminal on Mac, PowerShell on Windows).

```bash
git clone https://github.com/asgermunk/obsidian-canvas-agent.git
cd obsidian-canvas-agent
npm install
npm run build
```

Then copy the plugin into your vault. Use the path of your own vault folder:

```bash
# Mac
node scripts/install.mjs "/Users/you/Documents/My Vault"

# Windows
node scripts/install.mjs "C:\Users\you\Documents\My Vault"
```

The script prints the path of the Claude program it found. It remembers the vault, so later updates are only `npm run deploy` (build and copy).

### Log Claude in (one time)

The SDK ships its own Claude program. It does not share a login with the Claude desktop app or another Claude Code install. Run the path that the install script printed:

```bash
# Mac (Apple silicon)
node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude

# Windows
node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe
```

Choose a theme, choose **Claude account with subscription**, and sign in in the browser. When you see the `>` prompt, type `/exit`.

Using an API key instead? Skip this and paste the key in the plugin settings.

### Turn it on in Obsidian

1. Restart Obsidian.
2. Settings → Community plugins → turn off Restricted mode if it is on → enable **Canvas Agent**.
3. Settings → Canvas Agent:
   - **Canvas URL**: your school's Canvas address, for example `https://yourschool.instructure.com`.
   - **Canvas API token**: in Canvas, open Account → Settings → **New access token**, and paste the token here.
   - Click **Test connection**. A popup lists your courses.
   - **Protected folders** (optional): folders the agent must never change, comma separated.

## Use

Click the **graduation cap** in the left ribbon to open the chat.

- **Module notes…** (or the command *Canvas Agent: Write notes for a Canvas module*): pick a course, then a module.
- Or type: `write notes for module 3 in Machine Learning`.
- Ask questions: `what is gradient descent?`. Follow-ups keep the context. **New chat** starts over.
- Enter sends, Shift+Enter makes a new line, and **Stop** cancels a run.

## Update

```bash
git pull
npm install
npm run deploy
```

Then switch the plugin off and on in Obsidian.

## Security

- The Canvas token and API key are kept in Obsidian's secret storage, not in `data.json`. They stay out of a synced or committed vault.
- The Canvas tools run inside the plugin. Claude sees the course content, never the token.
- The agent can write only inside the vault, never in `.obsidian/` or in your protected folders. It can read files and search the web. The only shell commands it can run are the Python scripts in `.claude/skills/*/scripts/`.

## Troubleshooting

- **"Claude is not logged in"**: do the login step above.
- **An error in red in the chat**: the full log is in `<vault>/.obsidian/plugins/canvas-agent/debug.log`.
- **Mac: "claude cannot be opened"**: run `xattr -d com.apple.quarantine <path to claude>` once.

## How it is built

| File | Role |
|---|---|
| `src/main.ts` | Plugin entry, commands, ribbon |
| `src/settings.ts` | Settings tab and secret storage |
| `src/canvas/client.ts` | Canvas REST client (read only) |
| `src/canvas/tools.ts` | Canvas tools for Claude, as an in-process MCP server |
| `src/agent/runner.ts` | Runs the Agent SDK, streams replies, keeps the session |
| `src/agent/prompt.ts` | Instructions added to Claude's system prompt |
| `src/agent/guard.ts` | Decides which writes and commands are allowed |
| `src/ui/` | Chat view and the course and module pickers |

Obsidian loads plugins as CommonJS inside a browser window, but the SDK is ESM and written for Node. `esbuild.config.mjs` adds two fixes: a file URL for `import.meta.url`, and a fallback for `events.setMaxListeners`, which rejects the browser's `AbortSignal`.
