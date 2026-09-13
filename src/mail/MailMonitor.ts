import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";

import { EmailModel } from "../models/Email";
import type { MailboxConfig, ParsedEmailData } from "../types";

export class MailMonitor {
  private readonly mailbox: MailboxConfig;

  private client: ImapFlow | null = null;

  private running = false;

  constructor(mailbox: MailboxConfig) {
    this.mailbox = mailbox;
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    console.log(`[Mail:${this.mailbox.id}] Starting monitor...`);

    while (this.running) {
      try {
        await this.runConnection();
      } catch (error) {
        console.error(`[Mail:${this.mailbox.id}] Connection error:`, error);
      }

      if (this.running) {
        console.log(`[Mail:${this.mailbox.id}] Reconnecting in 5 seconds...`);

        await this.sleep(5000);
      }
    }
  }

  public async stop(): Promise<void> {
    this.running = false;

    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // Ignore logout errors.
      }

      this.client = null;
    }
  }

  private async runConnection(): Promise<void> {
    const password = process.env[this.mailbox.passwordEnv];

    if (!password) {
      throw new Error(
        `Missing password environment variable ${this.mailbox.passwordEnv}.`,
      );
    }

    this.client = new ImapFlow({
      host: this.mailbox.imapHost,

      port: this.mailbox.imapPort,

      secure: this.mailbox.imapSecure,

      auth: {
        user: this.mailbox.email,
        pass: password,
      },

      logger: false,
    });

    this.client.on("error", (error) => {
      console.error(`[Mail:${this.mailbox.id}] IMAP error:`, error);
    });

    console.log(
      `[Mail:${this.mailbox.id}] Connecting to ${this.mailbox.imapHost}:${this.mailbox.imapPort}...`,
    );

    await this.client.connect();

    console.log(`[Mail:${this.mailbox.id}] Connected.`);

    await this.processMailbox();

    await this.client.logout();

    this.client = null;
  }

  private async processMailbox(): Promise<void> {
    if (!this.client) {
      return;
    }

    const lock = await this.client.getMailboxLock("INBOX");

    try {
      const existingEmails = await this.client.search(
        {
          all: true,
        },
        {
          uid: true,
        },
      );

      if (!existingEmails || existingEmails.length === 0) {
        console.log(`[Mail:${this.mailbox.id}] Inbox is empty.`);

        return;
      }

      const maxUid = Math.max(...existingEmails);

      const latestStoredEmail = await EmailModel.findOne({
        mailboxId: this.mailbox.id,
      })
        .sort({
          messageUid: -1,
        })
        .lean();

      if (!latestStoredEmail) {
        console.log(`[Mail:${this.mailbox.id}] First run detected.`);

        console.log(
          `[Mail:${this.mailbox.id}] Marking existing emails as already known.`,
        );

        const latestMessage = await this.client.fetchOne(
          maxUid,
          {
            source: true,
            envelope: true,
          },
          {
            uid: true,
          },
        );

        if (latestMessage) {
          await this.saveEmail(latestMessage, maxUid, false);
        }

        return;
      }

      const lastUid = latestStoredEmail.messageUid;

      const newUids = existingEmails
        .filter((uid) => uid > lastUid)
        .sort((a, b) => a - b);

      if (newUids.length === 0) {
        return;
      }

      console.log(
        `[Mail:${this.mailbox.id}] Found ${newUids.length} new email(s).`,
      );

      for (const uid of newUids) {
        await this.processEmail(uid);
      }
    } finally {
      lock.release();
    }
  }

  private async processEmail(uid: number): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const message = await this.client.fetchOne(
        uid,
        {
          source: true,
          envelope: true,
        },
        {
          uid: true,
        },
      );

      if (!message) {
        console.error(`[Mail:${this.mailbox.id}] Could not fetch UID ${uid}.`);

        return;
      }

      await this.saveEmail(message, uid, true);
    } catch (error) {
      console.error(
        `[Mail:${this.mailbox.id}] Failed to process UID ${uid}:`,
        error,
      );
    }
  }

  private async saveEmail(
    message: FetchMessageObject,
    uid: number,
    notify: boolean,
  ): Promise<void> {
    if (!message.source) {
      return;
    }

    const parsed = await simpleParser(message.source);

    const email = this.parseEmail(parsed, uid);

    const existing = await EmailModel.findOne({
      mailboxId: this.mailbox.id,
      messageUid: uid,
    });

    if (existing) {
      return;
    }

    const created = await EmailModel.create({
      mailboxId: email.mailboxId,

      messageUid: email.messageUid,

      messageId: email.messageId,

      from: email.from,

      to: email.to,

      subject: email.subject,

      text: email.text,

      html: email.html,

      preview: email.preview,

      date: email.date,

      attachments: email.attachments,
    });

    console.log(`[Mail:${this.mailbox.id}] Saved email ${created._id}.`);

    if (notify) {
      await this.sendDiscordNotification(created._id.toString(), email);
    }
  }

  private parseEmail(parsed: ParsedMail, uid: number): ParsedEmailData {
    const from = parsed.from?.text ?? "Unknown sender";

    const to = parsed.to
      ? Array.isArray(parsed.to)
        ? parsed.to.map((value) => value.text).join(", ")
        : parsed.to.text
      : this.mailbox.email;

    const subject = parsed.subject ?? "No subject";

    let text = parsed.text ?? "";

    text = this.cleanText(text);

    const preview = this.truncate(text, 1000);

    const attachments = parsed.attachments.map(
      (attachment) => attachment.filename ?? "Unnamed attachment",
    );

    return {
      messageUid: uid,

      mailboxId: this.mailbox.id,

      mailboxName: this.mailbox.name,

      mailboxAddress: this.mailbox.email,

      messageId: parsed.messageId ?? `${this.mailbox.id}-${uid}`,

      from,

      to,

      subject,

      text,

      html: parsed.html ? String(parsed.html) : undefined,

      preview,

      date: parsed.date ?? new Date(),

      attachments,
    };
  }

  private async sendDiscordNotification(
    emailId: string,
    email: ParsedEmailData,
  ): Promise<void> {
    const event = globalThis.__sendEmailNotification;

    if (!event) {
      console.warn("[Discord] Notification handler is not ready.");

      return;
    }

    await event(emailId, email, this.mailbox);
  }

  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private truncate(text: string, length: number): string {
    if (text.length <= length) {
      return text;
    }

    return `${text.slice(0, length - 3)}...`;
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

declare global {
  var __sendEmailNotification:
    | ((
        emailId: string,
        email: ParsedEmailData,
        mailbox: MailboxConfig,
      ) => Promise<void>)
    | undefined;
}
