const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const { connectBaileys, getStore } = require("./lib/baileys-client");
const db = require("./lib/db");

// IMPORTANT: MCP via stdio = stdout is reserved for protocol.
// All logs MUST go to stderr.
const log = (...args) => console.error("[mcp]", ...args);

const TOOLS = [
  {
    name: "whatsapp_status",
    description:
      "Check WhatsApp connection status and database stats. Returns connection state, whether history sync has completed, and counts of chats/messages in the persistent DB.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whatsapp_list_chats",
    description:
      "List WhatsApp chats from the persistent DB (sorted by last message time, newest first). Includes chats synced from history + new chats. Supports optional search by chat name or JID.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max chats to return (default 50)",
        },
        search: {
          type: "string",
          description:
            "Optional keyword to filter by chat name, pushName, or JID",
        },
      },
    },
  },
  {
    name: "whatsapp_read_messages",
    description:
      "Read messages from a specific chat JID, sorted newest-first. Reads from the persistent DB (includes history + new messages).",
    inputSchema: {
      type: "object",
      properties: {
        jid: {
          type: "string",
          description:
            "Chat JID (e.g. 60123456789@s.whatsapp.net or 225404329713761@lid)",
        },
        limit: {
          type: "number",
          description: "Max messages to return (default 50)",
        },
      },
      required: ["jid"],
    },
  },
];

function handleStatus() {
  const store = getStore();
  const { chatCount, msgCount } = db.stats();

  return {
    connectionState: store.connectionState,
    hasPendingQR: Boolean(store.lastQR),
    historySyncReceived: store.historySync.received,
    dbStats: { chats: chatCount, messages: msgCount },
    hint:
      store.connectionState !== "open"
        ? "Not connected. If auth expired, run `node setup.js` manually in the project folder."
        : store.historySync.received
        ? "Connected. History sync received."
        : "Connected. Waiting for history sync (usually arrives within 1-2 minutes of first connect).",
  };
}

function handleListChats(args = {}) {
  const limit = args.limit ?? 50;
  const search = args.search || null;

  const rows = db.listChats({ limit, search });

  return {
    count: rows.length,
    chats: rows.map((r) => ({
      jid: r.jid,
      name: r.name || r.push_name || null,
      lastMessageTime: r.last_message_time,
      lastMessagePreview: r.last_message_preview,
      unreadCount: r.unread_count,
    })),
  };
}

function handleReadMessages(args) {
  if (!args?.jid) throw new Error("jid is required");
  const limit = args.limit ?? 50;

  const rows = db.getMessages(args.jid, { limit });

  return {
    jid: args.jid,
    count: rows.length,
    messages: rows.map((r) => ({
      id: r.id,
      fromMe: Boolean(r.from_me),
      pushName: r.push_name,
      timestamp: r.timestamp,
      text: r.text,
      messageType: r.message_type,
    })),
  };
}

async function main() {
  log("Starting MCP server...");

  db.init();
  log(`DB ready at ${db.DB_PATH}`);

  connectBaileys({ printQR: false, log: (m) => log(m) }).catch((err) => {
    log("Baileys connect error:", err?.message);
  });

  const server = new Server(
    { name: "whatsapp-bot", version: "0.2.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      let result;
      switch (name) {
        case "whatsapp_status":
          result = handleStatus();
          break;
        case "whatsapp_list_chats":
          result = handleListChats(args);
          break;
        case "whatsapp_read_messages":
          result = handleReadMessages(args);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${err.message}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server ready.");
}

main().catch((err) => {
  log("Fatal:", err);
  process.exit(1);
});
