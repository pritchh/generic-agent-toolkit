# Generic Agent Toolkit

A local MCP server that **routes** an agent from an idea to reviewed implementation.

Any MCP-capable harness can spawn this process over stdio. The agent does not need native skill routing. It calls `list_skills` and `get_skill`, then follows those instructions when talking to whatever other MCPs are connected.

You do not keep a daemon running. The harness starts this process for the session and stops it afterward.

## What it is for

- Decide **when** to use another MCP (and which skill to load first).
- Turn a product requirements document (PRD) into dependency-aware tasks for coding agents.
- Guide each task through implementation and evidence-based review.
- Keep workflow and confirmation style in one catalog.
- Work in Cursor, Claude Desktop, Codex, or a custom MCP client.

## Install

Requires Node 22 or newer.

```bash
git clone https://github.com/klemie/generic-agent-toolkit.git
cd generic-agent-toolkit
npm run setup
```

`npm run setup` installs dependencies, detects which dev harnesses are on this machine, registers the server in each one's **global** MCP config, and confirms the server starts. Restart the harness afterward.

Supported harnesses: Cursor, Claude Code, Claude Desktop, Codex CLI, Windsurf, Gemini CLI, VS Code.

Useful flags:

```bash
node scripts/setup.mjs --dry-run              # show what would change
node scripts/setup.mjs --all                  # write every supported harness
node scripts/setup.mjs --harness cursor,codex # pick specific harnesses
node scripts/setup.mjs --remove               # unregister
```

Existing config files are backed up to `<file>.bak` before writing. Other MCP servers in those files are left alone. If a config uses comments or trailing commas, the script skips it and prints the entry to paste by hand.

## Manual setup

If your harness is not listed, add this to its **global** MCP settings (not a project file inside this repo). The command does not depend on the folder you have open:

```json
{
  "mcpServers": {
    "generic-agent-toolkit": {
      "command": "node",
      "args": ["/absolute/path/to/generic-agent-toolkit/bin/generic-agent-toolkit.mjs"]
    }
  }
}
```

Use the real path on that machine. A copy of this snippet lives in `examples/mcp.client.json`. Codex CLI uses TOML (`[mcp_servers.generic-agent-toolkit]` with the same `command` and `args`), and VS Code uses a `servers` key with `"type": "stdio"`. OpenCode Desktop uses a different file and a different shape; see below.

The harness starts this process when a session begins, including when the open project is somewhere else.

### OpenCode Desktop

`npm run setup` does not register OpenCode. The desktop app reads the same global config as the CLI, and that file is often missing until you create it.

| Platform | File |
| --- | --- |
| macOS, Linux | `~/.config/opencode/opencode.json` |
| Windows | `%USERPROFILE%\.config\opencode\opencode.json` |

Check whether the file is there. On macOS or Linux:

```bash
cat ~/.config/opencode/opencode.json
```

On Windows (PowerShell):

```powershell
Get-Content "$env:USERPROFILE\.config\opencode\opencode.json"
```

If the command prints JSON, the file exists: add the `mcp` entry from below next to the keys you already have. Replacing the whole file drops providers, models, and any other servers.

If it reports that the file does not exist, create the directory and an empty config, then paste the snippet below into it. On macOS or Linux:

```bash
mkdir -p ~/.config/opencode
printf '{}\n' > ~/.config/opencode/opencode.json
```

On Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode" | Out-Null
Set-Content "$env:USERPROFILE\.config\opencode\opencode.json" '{}'
```

OpenCode does not read the `mcpServers` snippet above. Put the server under `mcp`, set `type` to `local`, and put `node` and the script path together in one `command` array:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "generic-agent-toolkit": {
      "type": "local",
      "command": [
        "node",
        "/absolute/path/to/generic-agent-toolkit/bin/generic-agent-toolkit.mjs"
      ],
      "enabled": true
    }
  }
}
```

Use the real path on that machine. Quit the desktop app and open it again so it rereads the file. In a session, run `/mcp` and confirm `generic-agent-toolkit` is connected, then ask the agent to call `list_skills`.

Slash commands are optional. Routing happens through tool calls, driven by this server’s instructions and skill descriptions.

## Skills

Packages live under `skills/`. Each one is an [agentskills.io](https://agentskills.io) folder with `SKILL.md`. The core route is `create-prd` → `create-agent-tasks` → `implement-agent-task` → `review-agent-task`.

## Catalog dashboard

To see how the skills fit together, build the dashboard:

```bash
npm run dashboard
```

This writes `dashboard/index.html`. Open it in a browser. It needs no server and no network connection.

The page shows a routing diagram with the router (`help`), the core lifecycle, supporting workflows, and the shared behavior skill (`grill-me`). Below it is a card for each skill with its description, the skills it loads and is loaded by, its extra files, and its full `SKILL.md`. Click a skill in the diagram to highlight its connections, or filter the cards by name or description.

Everything is read from `skills/`, so rerun the command after adding or editing a skill. Links come from skill names written in backticks or as `get_skill("…")` in a skill's `SKILL.md` and reference files, and the lifecycle comes from the longest `a` → `b` chain written in the catalog. The `dashboard/` folder is gitignored.

## License

[MIT](LICENSE). Copyright (c) 2026 Kris Lemieux and Red Brick Media.
