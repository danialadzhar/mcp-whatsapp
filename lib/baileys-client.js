const path = require("path");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const db = require("./db");

const AUTH_DIR = path.join(__dirname, "..", "auth_info");

const store = {
  connectionState: "disconnected",
  lastQR: null,
  historySync: {
    received: false,
    lastChatCount: 0,
    lastMessageCount: 0,
  },
};

function extractText(message) {
  if (!message) return null;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    null
  );
}

function messageType(message) {
  if (!message) return "unknown";
  if (message.conversation || message.extendedTextMessage) return "text";
  if (message.imageMessage) return "image";
  if (message.videoMessage) return "video";
  if (message.audioMessage) return "audio";
  if (message.stickerMessage) return "sticker";
  if (message.documentMessage) return "document";
  if (message.reactionMessage) return "reaction";
  if (message.protocolMessage) return "protocol";
  return Object.keys(message)[0] || "unknown";
}

function persistMessage(msg) {
  const jid = msg.key?.remoteJid;
  if (!jid || !msg.key?.id) return;

  const text = extractText(msg.message);
  const type = messageType(msg.message);

  db.upsertMessage({
    id: msg.key.id,
    jid,
    from_me: msg.key.fromMe,
    participant: msg.key.participant || null,
    push_name: msg.pushName || null,
    timestamp: Number(msg.messageTimestamp) || null,
    text,
    message_type: type,
  });

  db.upsertChat({
    jid,
    push_name: msg.pushName || null,
    last_message_time: Number(msg.messageTimestamp) || null,
    last_message_preview: text || `[${type}]`,
  });
}

async function connectBaileys({ printQR = false, log = () => {} } = {}) {
  db.init();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      store.lastQR = qr;
      if (printQR) {
        log("\n[QR] Scan guna WhatsApp > Linked Devices:\n");
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection) {
      store.connectionState = connection;
      log(`[CONN] ${connection}`);
    }

    if (connection === "open") {
      store.lastQR = null;
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      log(`[CLOSE] status=${statusCode}, reconnect=${shouldReconnect}`);

      if (shouldReconnect) {
        connectBaileys({ printQR, log });
      } else {
        log("[LOGOUT] Session expired. Delete auth_info/ and rescan.");
      }
    }
  });

  sock.ev.on("messaging-history.set", (payload) => {
    const { chats = [], messages = [], isLatest } = payload;
    log(
      `[HISTORY] chats=${chats.length} msgs=${messages.length} latest=${isLatest}`
    );

    for (const chat of chats) {
      db.upsertChat({
        jid: chat.id,
        name: chat.name || null,
        last_message_time: Number(chat.conversationTimestamp) || null,
        unread_count: chat.unreadCount ?? null,
      });
    }

    for (const msg of messages) {
      persistMessage(msg);
    }

    store.historySync.received = true;
    store.historySync.lastChatCount += chats.length;
    store.historySync.lastMessageCount += messages.length;
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;
    for (const msg of messages) {
      persistMessage(msg);
    }
  });

  sock.ev.on("chats.upsert", (chats) => {
    for (const chat of chats) {
      db.upsertChat({
        jid: chat.id,
        name: chat.name || null,
        last_message_time: Number(chat.conversationTimestamp) || null,
        unread_count: chat.unreadCount ?? null,
      });
    }
  });

  sock.ev.on("chats.update", (updates) => {
    for (const u of updates) {
      if (!u.id) continue;
      db.upsertChat({
        jid: u.id,
        name: u.name || null,
        last_message_time: Number(u.conversationTimestamp) || null,
        unread_count: u.unreadCount ?? null,
      });
    }
  });

  return sock;
}

function getStore() {
  return store;
}

module.exports = { connectBaileys, getStore };
