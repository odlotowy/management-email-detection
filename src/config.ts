import "dotenv/config";

import * as fs from "node:fs";
import * as path from "node:path";

import type { MailboxConfig } from "./types.js";

const mailboxesPath = path.join(process.cwd(), "config", "mailboxes.json");

if (!fs.existsSync(mailboxesPath)) {
  throw new Error(`[System] Missing configuration file: ${mailboxesPath}`);
}

const mailboxes = JSON.parse(
  fs.readFileSync(mailboxesPath, "utf8"),
) as MailboxConfig[];

for (const mailbox of mailboxes) {
  if (!mailbox.id) {
    throw new Error("[System] Mailbox is missing id.");
  }

  if (!mailbox.email) {
    throw new Error(`[System] Mailbox ${mailbox.id} is missing email.`);
  }

  if (!mailbox.imapHost) {
    throw new Error(`[System] Mailbox ${mailbox.id} is missing IMAP host.`);
  }

  if (!mailbox.passwordEnv) {
    throw new Error(`[System] Mailbox ${mailbox.id} is missing passwordEnv.`);
  }

  if (!process.env[mailbox.passwordEnv]) {
    throw new Error(
      `[System] Missing environment variable ${mailbox.passwordEnv}.`,
    );
  }

  if (!mailbox.discordChannelId) {
    throw new Error(
      `[System] Mailbox ${mailbox.id} is missing Discord channel ID.`,
    );
  }
}

if (!process.env.DISCORD_TOKEN) {
  throw new Error("[System] Missing DISCORD_TOKEN.");
}

if (!process.env.MONGODB_URI) {
  throw new Error("[System] Missing MONGODB_URI.");
}

if (!process.env.DISCORD_GUILD_ID) {
  throw new Error("[System] Missing DISCORD_GUILD_ID.");
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN,

  mongodbUri: process.env.MONGODB_URI,

  discordGuildId: process.env.DISCORD_GUILD_ID,

  checkInterval: Number(process.env.CHECK_INTERVAL ?? 10000),

  allowedRoleIds: (process.env.ALLOWED_ROLE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),

  mailboxes,
};
