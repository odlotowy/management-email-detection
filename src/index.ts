import { connectDatabase } from "./database";
import { config } from "./config";
import dns from "dns";
import "./health";

import { DiscordBot } from "./discord/DiscordBot";
import { MailMonitor } from "./mail/MailMonitor";

async function main(): Promise<void> {
  console.log("");
  console.log("========================================");
  console.log("       FRESHWAY MAIL DISCORD BOT");
  console.log("========================================");
  console.log("");

  dns.setServers(["0.0.0.0", "1.1.1.1"]);

  await connectDatabase();

  const discord = new DiscordBot();

  globalThis.__sendEmailNotification = async (emailId, email, mailbox) => {
    await discord.sendEmailNotification(emailId, email, mailbox);
  };

  await discord.start();

  console.log(
    `[System] Starting ${config.mailboxes.length} mailbox monitor(s)...`,
  );

  const monitors = config.mailboxes.map((mailbox) => new MailMonitor(mailbox));

  await Promise.all(monitors.map((monitor) => monitor.start()));
}

process.on("SIGINT", async () => {
  console.log("[System] Shutting down...");

  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[System] Shutting down...");

  process.exit(0);
});

main().catch((error) => {
  console.error("[System] Fatal error:", error);

  process.exit(1);
});
