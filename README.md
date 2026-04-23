# mcp-whatsapp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives **Claude Desktop** read-only access to your WhatsApp chats and message history.

Built on [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web protocol) — no phone number, no business API, no cloud service. Everything runs locally on your machine.

> **⚠️ Disclaimer**
> This is an unofficial integration. WhatsApp may terminate accounts that use unauthorized clients. Use a secondary/test number, not your primary one. Author is not responsible for bans.

---

## ✨ Features

- 🔌 **Local-first** — no external API, no cloud
- 💾 **SQLite persistence** — chats + messages saved to local DB
- 📚 **History sync** — downloads your existing WhatsApp history on first pair
- 🔎 **Search chats** by name, push name, or JID
- 📖 **Read messages** from any chat (text, image captions, media metadata)
- 🧠 **Claude-native** — ask Claude Desktop in plain language

## 🔧 Available MCP Tools

| Tool | Description |
|---|---|
| `whatsapp_status` | Connection status + DB stats |
| `whatsapp_list_chats` | List chats (sorted by last message), optional keyword search |
| `whatsapp_read_messages` | Read messages from a specific chat JID |

---

## 📦 Prerequisites

- **Node.js 18+** — check with `node --version`
- **Claude Desktop** (macOS or Windows) — [download](https://claude.ai/download)
- **A WhatsApp account** with a phone you can scan QR with
- **macOS or Linux** recommended (Windows works with adjusted paths)

---

## 🚀 Installation

### 1. Clone the repo
```bash
git clone https://github.com/danialadzhar/mcp-whatsapp.git
cd mcp-whatsapp
```

### 2. Install dependencies
```bash
npm install
```

> If `better-sqlite3` fails to build, ensure you have Xcode Command Line Tools (macOS): `xcode-select --install`

---

## 🔐 First-time Setup (Pair WhatsApp + History Sync)

### 1. Run the setup script
```bash
node setup.js
```

A QR code will appear in the terminal.

### 2. In your phone, open WhatsApp
- Go to **Settings → Linked Devices → Link a Device**
- When prompted **"Include chat history"** or similar — **choose YES** to download your history
- Scan the QR code from the terminal

### 3. Wait for history to download
Terminal will print:
```
[HISTORY] chats=35 msgs=500 isLatest=false | batch #1 | DB: 35 chats, 500 messages
[HISTORY] chats=0 msgs=1200 isLatest=false | batch #2 | DB: 35 chats, 1700 messages
...
```

Depending on your account size, this takes **5-30 minutes**. The script auto-detects completion when no new batch has arrived for 30 seconds.

### 4. Stop the script
When you see `HISTORY SYNC COMPLETE` and `SAFE TO EXIT`, press **Ctrl+C**.

---

## ⚙️ Claude Desktop Configuration

### 1. Locate your Claude Desktop config file

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

### 2. Add the MCP server

Open the file and merge this into the `mcpServers` section (create the key if it doesn't exist):

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/mcp-whatsapp/mcp-server.js"
      ]
    }
  }
}
```

**Replace with your actual paths:**
- Get node path: `which node` (macOS/Linux) or `where node` (Windows)
- Use absolute paths — Claude Desktop doesn't resolve shell PATH reliably

Example (macOS, Homebrew node):
```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "/opt/homebrew/bin/node",
      "args": [
        "/Users/yourname/projects/mcp-whatsapp/mcp-server.js"
      ]
    }
  }
}
```

### 3. Restart Claude Desktop
**Fully quit** with Cmd+Q (not just close window), then reopen.

### 4. Test
In any Claude Desktop chat, ask:
```
what is my whatsapp status
```

Claude will call the `whatsapp_status` tool. Approve the permission prompt when it appears.

---

## 💬 Example Prompts

Once connected, you can ask Claude Desktop:

- *"List my 10 most recent WhatsApp chats"*
- *"Search my WhatsApp for chats with 'Ahmad'"*
- *"Summarize my last 50 messages with 60123456789@s.whatsapp.net"*
- *"How many unread WhatsApp chats do I have?"*
- *"Show me the last message from each group chat"*
- *"Find conversations where someone mentioned 'meeting'"* (Claude will chain list + read)

Claude decides which tools to call based on your question.

---

## 🐛 Troubleshooting

### ❌ `Error: Cannot find module '@whiskeysockets/baileys'`
You didn't install dependencies.
```bash
cd mcp-whatsapp
npm install
```

### ❌ `status=440, reconnect=true` loop in logs
Two processes are fighting for the same WhatsApp session. Common causes:

1. **Claude Desktop spawns duplicate MCP servers** — disable Cowork/Scheduled Tasks in `claude_desktop_config.json`:
   ```json
   "preferences": {
     "coworkScheduledTasksEnabled": false,
     "ccdScheduledTasksEnabled": false
   }
   ```
2. **Terminal script + Claude Desktop both running** — kill terminal processes:
   ```bash
   ps aux | grep "mcp-whatsapp" | grep -v grep
   kill <PID>
   ```
3. **Two Claude Desktop instances** — fully quit with Cmd+Q, reopen once.

### ❌ QR code not appearing when running `setup.js`
- Make sure no other Node process is holding `auth_info/`:
  ```bash
  ps aux | grep "mcp-whatsapp" | grep -v grep
  ```
- Fully quit Claude Desktop (Cmd+Q) before running `setup.js`.
- Delete `auth_info/` and retry:
  ```bash
  rm -rf auth_info
  node setup.js
  ```

### ❌ Tools not appearing in Claude Desktop
1. Verify config JSON is valid:
   ```bash
   # macOS
   python3 -c "import json; json.load(open('$HOME/Library/Application Support/Claude/claude_desktop_config.json'))"
   ```
2. Check MCP server logs:
   ```bash
   # macOS
   tail -50 ~/Library/Logs/Claude/mcp-server-whatsapp.log
   ```
3. Verify node path in config is correct:
   ```bash
   which node
   ```
4. **Fully quit and restart Claude Desktop** — reloading config requires full app restart.

### ❌ `connectionState: "connecting"` forever
- Session may be corrupt. Fix by re-pairing:
  ```bash
  # 1. Quit Claude Desktop (Cmd+Q)
  # 2. Delete auth
  rm -rf auth_info whatsapp.db
  # 3. Re-run setup
  node setup.js
  # 4. Scan QR
  ```

### ❌ `0 chats, 0 messages` in DB after setup
- You likely skipped the **"Include chat history"** prompt in WhatsApp during QR scan.
- WhatsApp only offers history sync during initial pairing. Fix:
  ```bash
  rm -rf auth_info whatsapp.db
  node setup.js
  ```
  When your phone asks, choose to include history this time.

### ❌ History sync never starts even with correct config
- Some WhatsApp versions skip the history transfer prompt. Workarounds:
  - Update WhatsApp on your phone to latest version
  - On the phone: Settings → Chats → Chat history transfer (if available)
  - Accept that only new messages will be captured going forward

### ❌ `node-gyp` / `better-sqlite3` build errors
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential python3`
- **Windows**: install [windows-build-tools](https://www.npmjs.com/package/windows-build-tools) or Visual Studio Build Tools

### ❌ Permission denied when Claude Desktop tries to call a tool
First time each tool is called, Claude Desktop asks for approval. Pick **"Allow for this task"** for smooth usage. You can also set permissions per-tool in Claude Desktop Settings.

---

## ❓ FAQ

### **Does this bot capture messages 24/7?**
No. The MCP server only runs while Claude Desktop is open. When Claude Desktop quits, the bot disconnects.

However — WhatsApp queues undelivered messages to linked devices for up to ~14 days. When you reopen Claude Desktop, offline messages arrive and are saved to the DB.

For true 24/7 capture, run a separate background daemon (not included in this repo).

### **Will WhatsApp ban my account?**
Risk exists for any unofficial client. Mitigations:
- Use a **secondary/test number** if possible
- **Don't spam-send** (this repo is read-only so lower risk)
- Don't use for bulk marketing

### **Can I send messages with this MCP?**
This version is **read-only** intentionally (safer). To add send capability, add a `whatsapp_send_message` tool in `mcp-server.js` — but be careful, MCP-triggered sends are powerful and can be abused by prompt injection.

### **Where is my data stored?**
- `auth_info/` — session credentials (keep private, do not share/commit)
- `whatsapp.db` — SQLite with your chats and messages (keep private)

Both are gitignored.

### **How do I uninstall?**
```bash
# Quit Claude Desktop
# Remove MCP server entry from claude_desktop_config.json
# Delete the repo folder
rm -rf mcp-whatsapp
```

On your phone: WhatsApp → Linked Devices → remove this device.

### **Can multiple MCP servers share the same WhatsApp session?**
No. WhatsApp allows only one active connection per linked device auth. Running multiple MCP instances causes the `status=440` conflict loop.

### **What about groups?**
Group chats are supported — listed and readable like any other chat. JIDs end with `@g.us`.

---

## 🛠 Known Limitations

- Media (images, videos, audio) not downloaded — only text + metadata
- Reactions tracked as separate messages, not linked to parent
- Deleted messages not captured
- History sync amount depends on WhatsApp — typically last 6 months
- macOS/Linux tested; Windows paths need adjustment in config
- Not designed for multi-account / multi-tenant use

---

## 🤝 Contributing

Issues and PRs welcome. Please:
- File issues with logs (redact personal data)
- Keep PRs scoped to one feature/fix
- Don't add `send_message` without thoughtful safety design (permission gates, rate limits, confirmation UX)

---

## 📄 License

[MIT](LICENSE) © Danial Adzhar

---

## 🙏 Credits

- [Baileys](https://github.com/WhiskeySockets/Baileys) — reverse-engineered WhatsApp Web client
- [Model Context Protocol](https://modelcontextprotocol.io/) — standard by Anthropic
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — fast synchronous SQLite
