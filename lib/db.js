const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "whatsapp.db");

let db;

function init() {
  if (db) return db;

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      push_name TEXT,
      last_message_time INTEGER,
      last_message_preview TEXT,
      unread_count INTEGER DEFAULT 0,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_chats_last_message_time
      ON chats(last_message_time DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT NOT NULL,
      jid TEXT NOT NULL,
      from_me INTEGER DEFAULT 0,
      participant TEXT,
      push_name TEXT,
      timestamp INTEGER,
      text TEXT,
      message_type TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (jid, id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_jid_time
      ON messages(jid, timestamp DESC);
  `);

  return db;
}

function upsertChat(chat) {
  const stmt = init().prepare(`
    INSERT INTO chats (jid, name, push_name, last_message_time, last_message_preview, unread_count, updated_at)
    VALUES (@jid, @name, @push_name, @last_message_time, @last_message_preview, @unread_count, @updated_at)
    ON CONFLICT(jid) DO UPDATE SET
      name = COALESCE(excluded.name, chats.name),
      push_name = COALESCE(excluded.push_name, chats.push_name),
      last_message_time = COALESCE(excluded.last_message_time, chats.last_message_time),
      last_message_preview = COALESCE(excluded.last_message_preview, chats.last_message_preview),
      unread_count = COALESCE(excluded.unread_count, chats.unread_count),
      updated_at = excluded.updated_at
  `);

  stmt.run({
    jid: chat.jid,
    name: chat.name ?? null,
    push_name: chat.push_name ?? null,
    last_message_time: chat.last_message_time ?? null,
    last_message_preview: chat.last_message_preview ?? null,
    unread_count: chat.unread_count ?? null,
    updated_at: Math.floor(Date.now() / 1000),
  });
}

function upsertMessage(msg) {
  const stmt = init().prepare(`
    INSERT OR REPLACE INTO messages
      (id, jid, from_me, participant, push_name, timestamp, text, message_type)
    VALUES
      (@id, @jid, @from_me, @participant, @push_name, @timestamp, @text, @message_type)
  `);

  stmt.run({
    id: msg.id,
    jid: msg.jid,
    from_me: msg.from_me ? 1 : 0,
    participant: msg.participant ?? null,
    push_name: msg.push_name ?? null,
    timestamp: msg.timestamp ?? null,
    text: msg.text ?? null,
    message_type: msg.message_type ?? null,
  });
}

function listChats({ limit = 50, search = null } = {}) {
  const base = `
    SELECT jid, name, push_name, last_message_time, last_message_preview, unread_count
    FROM chats
  `;
  const where = search
    ? `WHERE name LIKE @q OR push_name LIKE @q OR jid LIKE @q`
    : "";
  const sql = `${base} ${where} ORDER BY last_message_time DESC NULLS LAST LIMIT @limit`;
  return init()
    .prepare(sql)
    .all({ limit, q: search ? `%${search}%` : null });
}

function getMessages(jid, { limit = 50 } = {}) {
  return init()
    .prepare(
      `SELECT id, from_me, participant, push_name, timestamp, text, message_type
       FROM messages
       WHERE jid = @jid
       ORDER BY timestamp DESC
       LIMIT @limit`
    )
    .all({ jid, limit });
}

function stats() {
  const chatCount = init()
    .prepare("SELECT COUNT(*) AS n FROM chats")
    .get().n;
  const msgCount = init()
    .prepare("SELECT COUNT(*) AS n FROM messages")
    .get().n;
  return { chatCount, msgCount };
}

module.exports = {
  init,
  upsertChat,
  upsertMessage,
  listChats,
  getMessages,
  stats,
  DB_PATH,
};
