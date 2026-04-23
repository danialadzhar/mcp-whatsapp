const { connectBaileys, getStore } = require("./lib/baileys-client");
const db = require("./lib/db");

// History sync is considered done if no [HISTORY] event has arrived for N seconds.
const IDLE_TIMEOUT_SECONDS = 30;

(async () => {
  console.log("=".repeat(60));
  console.log("  mcp-whatsapp — SETUP & HISTORY SYNC");
  console.log("=".repeat(60));
  console.log();
  console.log("[SETUP] Starting... please wait.");

  db.init();

  let authReady = false;
  let completed = false;
  let lastHistoryAt = null;
  let totalBatches = 0;

  await connectBaileys({
    printQR: true,
    log: (msg) => {
      if (typeof msg === "string" && msg.startsWith("[HISTORY]")) {
        totalBatches++;
        lastHistoryAt = Date.now();
        const { chatCount, msgCount } = db.stats();
        console.log(
          `${msg} | batch #${totalBatches} | DB: ${chatCount} chats, ${msgCount} messages`
        );
      } else {
        console.log(msg);
      }
    },
  });

  const interval = setInterval(() => {
    const state = getStore().connectionState;

    if (state === "open" && !authReady) {
      authReady = true;
      console.log();
      console.log("-".repeat(60));
      console.log("[OK] WhatsApp connected.");
      console.log();
      console.log(
        ">>> DO NOT CLOSE THE TERMINAL — downloading chat history..."
      );
      console.log(
        ">>> This can take 5-30 minutes depending on how many chats you have."
      );
      console.log(
        ">>> You'll see [HISTORY] lines every time a batch arrives."
      );
      console.log(
        `>>> Script auto-detects completion when no new batch arrives for ${IDLE_TIMEOUT_SECONDS}s.`
      );
      console.log("-".repeat(60));
      console.log();
    }

    if (completed) return;

    if (authReady && lastHistoryAt) {
      const idleSec = (Date.now() - lastHistoryAt) / 1000;
      if (idleSec >= IDLE_TIMEOUT_SECONDS) {
        completed = true;
        clearInterval(interval);
        const { chatCount, msgCount } = db.stats();
        console.log();
        console.log("=".repeat(60));
        console.log("  HISTORY SYNC COMPLETE (idle detection)");
        console.log("=".repeat(60));
        console.log(`  Total batches received : ${totalBatches}`);
        console.log(`  Total chats in DB      : ${chatCount}`);
        console.log(`  Total messages         : ${msgCount}`);
        console.log(
          `  Idle for ${IDLE_TIMEOUT_SECONDS}s — no new batches, assuming done.`
        );
        console.log();
        console.log("  SAFE TO EXIT — press Ctrl+C.");
        console.log();
        console.log("  Next step:");
        console.log("    1. Press Ctrl+C to stop setup.js");
        console.log("    2. Open Claude Desktop");
        console.log('    3. Ask: "list my whatsapp chats"');
        console.log("=".repeat(60));
      }
    }
  }, 2000);

  // If connected but no [HISTORY] arrives in 2 minutes
  setTimeout(() => {
    if (authReady && totalBatches === 0) {
      console.log();
      console.log(
        "[WARN] Connected for 2 minutes but no [HISTORY] batch received."
      );
      console.log(
        "  You may have skipped 'Include chat history' when scanning the QR."
      );
      console.log(
        "  You can Ctrl+C — new messages will still be tracked from now on."
      );
    }
  }, 120 * 1000);
})();
