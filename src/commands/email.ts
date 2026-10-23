import {
  ChatInputCommandInteraction,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";

import mongoose from "mongoose";

import { EmailModel } from "../models/Email.js";
import { EmailBookmarkModel } from "../models/EmailBookmark.js";
import { EmailNoteModel } from "../models/EmailNote.js";
import { EmailAuditModel } from "../models/EmailAudit.js";
import { getMailboxStatuses } from "../mail/MailMonitorStatus.js";

const GREEN = 0x0a5e0c;
const MAX_RESULTS = 10;

type AuditAction =
  | "view"
  | "bookmark_add"
  | "bookmark_remove"
  | "note_add"
  | "analytics_view"
  | "status_view";

function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 3)}...`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dateText(date: Date | string | null | undefined): string {
  if (!date) return "Never";

  const timestamp = new Date(date).getTime();

  if (Number.isNaN(timestamp)) return "Unknown";

  return `<t:${Math.floor(timestamp / 1000)}:f>`;
}

function validEmailId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}

function createContainer(title: string, body: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(GREEN)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        body.slice(0, 3900) || "No information available.",
      ),
    );
}

async function respond(
  interaction: ChatInputCommandInteraction,
  title: string,
  body: string,
): Promise<void> {
  await interaction.editReply({
    components: [createContainer(title, body)],
    allowedMentions: { parse: [] },
  });
}

async function audit(
  interaction: ChatInputCommandInteraction,
  action: AuditAction,
  options: {
    emailId?: string;
    mailboxId?: string;
    details?: string;
  } = {},
): Promise<void> {
  try {
    await EmailAuditModel.create({
      userId: interaction.user.id,
      username: interaction.user.tag,
      action,
      ...options,
    });
  } catch (error) {
    console.error("[Email] Failed to save audit record:", error);
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("email")
    .setDescription("Manage monitored email accounts")

    // Existing commands

    .addSubcommand((sub) =>
      sub
        .setName("latest")
        .setDescription("View the latest received emails")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of emails to display")
            .setMinValue(1)
            .setMaxValue(MAX_RESULTS),
        )
        .addStringOption((option) =>
          option.setName("mailbox").setDescription("Filter by mailbox ID"),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("search")
        .setDescription("Search emails by sender, recipient or content")
        .addStringOption((option) =>
          option
            .setName("query")
            .setDescription("Text to search for")
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(200),
        )
        .addStringOption((option) =>
          option.setName("mailbox").setDescription("Filter by mailbox ID"),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View a stored email")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("MongoDB email document ID")
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("stats")
        .setDescription("View email statistics")
        .addStringOption((option) =>
          option.setName("mailbox").setDescription("Filter by mailbox ID"),
        ),
    )

    .addSubcommand((sub) =>
      sub.setName("info").setDescription("View stored mailbox information"),
    )

    // New commands

    .addSubcommand((sub) =>
      sub.setName("status").setDescription("View live email monitor status"),
    )

    .addSubcommand((sub) =>
      sub
        .setName("bookmark")
        .setDescription("Add or remove a personal email bookmark")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("MongoDB email document ID")
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("note")
        .setDescription("Add an internal note to an email")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("MongoDB email document ID")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("content")
            .setDescription("Internal note")
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2000),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("notes")
        .setDescription("View internal notes for an email")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("MongoDB email document ID")
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("audit")
        .setDescription("View the email audit log")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of records to display")
            .setMinValue(1)
            .setMaxValue(10),
        )
        .addStringOption((option) =>
          option.setName("user").setDescription("Filter by Discord user ID"),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("analytics")
        .setDescription("View email activity analytics")
        .addStringOption((option) =>
          option.setName("mailbox").setDescription("Filter by mailbox ID"),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });

    try {
      const command = interaction.options.getSubcommand();
      const mailboxId = interaction.options.getString("mailbox");

      // /email latest

      if (command === "latest") {
        const limit = interaction.options.getInteger("limit") ?? 5;

        const emails = await EmailModel.find(mailboxId ? { mailboxId } : {})
          .sort({ date: -1, _id: -1 })
          .limit(limit)
          .lean();

        if (!emails.length) {
          await respond(
            interaction,
            "Latest Emails",
            "No stored emails were found.",
          );
          return;
        }

        const body = emails
          .map(
            (email, index) =>
              `### ${index + 1}. ${truncate(email.subject, 150)}\n` +
              `**From:** ${truncate(email.from, 200)}\n` +
              `**Mailbox:** \`${email.mailboxId}\`\n` +
              `**Received:** ${dateText(email.date)}\n` +
              `**ID:** \`${email._id.toString()}\`\n` +
              `> ${truncate(email.preview || "No preview available.", 180)}`,
          )
          .join("\n\n");

        await respond(interaction, "Latest Emails", body);
        return;
      }

      // /email search

      if (command === "search") {
        const query = interaction.options.getString("query", true);
        const regex = new RegExp(escapeRegex(query), "i");

        const filter: Record<string, unknown> = {
          $or: [
            { from: regex },
            { to: regex },
            { subject: regex },
            { text: regex },
          ],
        };

        if (mailboxId) filter.mailboxId = mailboxId;

        const emails = await EmailModel.find(filter)
          .sort({ date: -1 })
          .limit(MAX_RESULTS)
          .lean();

        if (!emails.length) {
          await respond(
            interaction,
            "Email Search",
            `No emails matched **${truncate(query, 150)}**.`,
          );
          return;
        }

        const body =
          `Showing ${emails.length} result(s), maximum ${MAX_RESULTS}.\n\n` +
          emails
            .map(
              (email, index) =>
                `### ${index + 1}. ${truncate(email.subject, 130)}\n` +
                `**From:** ${truncate(email.from, 180)}\n` +
                `**Received:** ${dateText(email.date)}\n` +
                `**Mailbox:** \`${email.mailboxId}\`\n` +
                `**ID:** \`${email._id.toString()}\`\n` +
                `> ${truncate(email.preview || "No preview available.", 150)}`,
            )
            .join("\n\n");

        await respond(interaction, "Email Search Results", body);
        return;
      }

      // /email view

      if (command === "view") {
        const id = interaction.options.getString("id", true);

        if (!validEmailId(id)) {
          await respond(
            interaction,
            "Invalid ID",
            "Provide a valid MongoDB email ID.",
          );
          return;
        }

        const email = await EmailModel.findById(id).lean();

        if (!email) {
          await respond(
            interaction,
            "Email Not Found",
            "No email matches that ID.",
          );
          return;
        }

        await audit(interaction, "view", {
          emailId: id,
          mailboxId: email.mailboxId,
        });

        const attachments = email.attachments.length
          ? email.attachments
              .map((name) => `- ${truncate(name, 150)}`)
              .join("\n")
          : "No attachments.";

        const body =
          `**Subject:** ${truncate(email.subject, 200)}\n` +
          `**From:** ${truncate(email.from, 250)}\n` +
          `**To:** ${truncate(email.to, 250)}\n` +
          `**Mailbox:** \`${email.mailboxId}\`\n` +
          `**Received:** ${dateText(email.date)}\n` +
          `**Message ID:** ${truncate(email.messageId, 200)}\n` +
          `**Database ID:** \`${email._id.toString()}\`\n\n` +
          `### Message Content\n${truncate(email.text?.trim() || email.preview || "No text content available.", 1800)}\n\n` +
          `### Attachments (${email.attachments.length})\n${attachments}`;

        await respond(interaction, "Email Details", body);
        return;
      }

      // /email stats

      if (command === "stats") {
        const filter = mailboxId ? { mailboxId } : {};
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

        const [total, today, lastSevenDays, withAttachments, mailboxes] =
          await Promise.all([
            EmailModel.countDocuments(filter),
            EmailModel.countDocuments({
              ...filter,
              date: { $gte: startOfToday, $lte: now },
            }),
            EmailModel.countDocuments({
              ...filter,
              date: { $gte: sevenDaysAgo, $lte: now },
            }),
            EmailModel.countDocuments({
              ...filter,
              "attachments.0": { $exists: true },
            }),
            EmailModel.distinct("mailboxId", filter),
          ]);

        await respond(
          interaction,
          "Email Statistics",
          `**Scope:** ${mailboxId ? `\`${mailboxId}\`` : "All mailboxes"}\n\n` +
            `**Total emails:** ${total.toLocaleString()}\n` +
            `**Received today:** ${today.toLocaleString()}\n` +
            `**Last 7 days:** ${lastSevenDays.toLocaleString()}\n` +
            `**Emails with attachments:** ${withAttachments.toLocaleString()}\n` +
            `**Mailboxes represented:** ${mailboxes.length}`,
        );
        return;
      }

      // /email info

      if (command === "info") {
        const mailboxes = await EmailModel.aggregate<{
          _id: string;
          total: number;
          latestDate: Date | null;
          withAttachments: number;
        }>([
          {
            $group: {
              _id: "$mailboxId",
              total: { $sum: 1 },
              latestDate: { $max: "$date" },
              withAttachments: {
                $sum: {
                  $cond: [
                    {
                      $gt: [{ $size: { $ifNull: ["$attachments", []] } }, 0],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]);

        if (!mailboxes.length) {
          await respond(
            interaction,
            "Mailbox Information",
            "No mailbox email records have been stored yet.",
          );
          return;
        }

        const body = mailboxes
          .map(
            (mailbox) =>
              `### ${truncate(mailbox._id, 120)}\n` +
              `**Stored emails:** ${mailbox.total.toLocaleString()}\n` +
              `**Emails with attachments:** ${mailbox.withAttachments.toLocaleString()}\n` +
              `**Latest email:** ${dateText(mailbox.latestDate)}`,
          )
          .join("\n\n");

        await respond(interaction, "Mailbox Information", body);
        return;
      }

      // /email status

      if (command === "status") {
        const statuses = getMailboxStatuses();

        if (!statuses.length) {
          await audit(interaction, "status_view");

          await respond(
            interaction,
            "Email Monitor Status",
            "No monitor instances are registered in this process. Ensure your MailMonitor instances are created and started.",
          );
          return;
        }

        const counts = await EmailModel.aggregate<{
          _id: string;
          total: number;
          latest: Date | null;
        }>([
          {
            $group: {
              _id: "$mailboxId",
              total: { $sum: 1 },
              latest: { $max: "$date" },
            },
          },
        ]);

        const countMap = new Map(counts.map((item) => [item._id, item]));

        const body = statuses
          .map((status) => {
            const stored = countMap.get(status.mailboxId);

            return (
              `### ${truncate(status.mailboxName, 100)}\n` +
              `**Mailbox:** \`${status.mailboxId}\`\n` +
              `**Address:** ${truncate(status.email, 150)}\n` +
              `**Monitor running:** ${status.running ? "Yes" : "No"}\n` +
              `**IMAP connected now:** ${status.connected ? "Yes" : "No"}\n` +
              `**Started:** ${dateText(status.startedAt)}\n` +
              `**Last connected:** ${dateText(status.connectedAt)}\n` +
              `**Last sync:** ${dateText(status.lastSyncAt)}\n` +
              `**Stored emails:** ${(stored?.total ?? 0).toLocaleString()}\n` +
              `**Latest email:** ${dateText(stored?.latest)}\n` +
              `**Last error:** ${truncate(status.lastError ?? "None recorded", 180)}`
            );
          })
          .join("\n\n");

        await audit(interaction, "status_view");

        await respond(
          interaction,
          "Email Monitor Status",
          `${body}\n\n-# Status is held in memory and resets when the bot restarts.`,
        );
        return;
      }

      // /email bookmark

      if (command === "bookmark") {
        const id = interaction.options.getString("id", true);

        if (!validEmailId(id)) {
          await respond(
            interaction,
            "Invalid ID",
            "Provide a valid MongoDB email ID.",
          );
          return;
        }

        const email = await EmailModel.findById(id).lean();

        if (!email) {
          await respond(
            interaction,
            "Email Not Found",
            "No email matches that ID.",
          );
          return;
        }

        const existing = await EmailBookmarkModel.findOne({
          emailId: id,
          userId: interaction.user.id,
        });

        if (existing) {
          await EmailBookmarkModel.deleteOne({ _id: existing._id });

          await audit(interaction, "bookmark_remove", {
            emailId: id,
            mailboxId: email.mailboxId,
          });

          await respond(
            interaction,
            "Bookmark Removed",
            `Removed your bookmark for **${truncate(email.subject, 180)}**.`,
          );
        } else {
          await EmailBookmarkModel.updateOne(
            { emailId: id, userId: interaction.user.id },
            { $setOnInsert: { emailId: id, userId: interaction.user.id } },
            { upsert: true },
          );

          await audit(interaction, "bookmark_add", {
            emailId: id,
            mailboxId: email.mailboxId,
          });

          await respond(
            interaction,
            "Email Bookmarked",
            `Saved **${truncate(email.subject, 180)}** to your personal bookmarks.`,
          );
        }
        return;
      }

      // /email note

      if (command === "note") {
        const id = interaction.options.getString("id", true);
        const content = interaction.options.getString("content", true).trim();

        if (!validEmailId(id)) {
          await respond(
            interaction,
            "Invalid ID",
            "Provide a valid MongoDB email ID.",
          );
          return;
        }

        if (!content) {
          await respond(
            interaction,
            "Invalid Note",
            "The note cannot be empty.",
          );
          return;
        }

        const email = await EmailModel.findById(id).lean();

        if (!email) {
          await respond(
            interaction,
            "Email Not Found",
            "No email matches that ID.",
          );
          return;
        }

        await EmailNoteModel.create({
          emailId: id,
          userId: interaction.user.id,
          username: interaction.user.tag,
          content,
        });

        await audit(interaction, "note_add", {
          emailId: id,
          mailboxId: email.mailboxId,
        });

        await respond(
          interaction,
          "Note Added",
          `**Email:** ${truncate(email.subject, 180)}\n\n**Note:**\n${truncate(content, 2200)}`,
        );
        return;
      }

      // /email notes

      if (command === "notes") {
        const id = interaction.options.getString("id", true);

        if (!validEmailId(id)) {
          await respond(
            interaction,
            "Invalid ID",
            "Provide a valid MongoDB email ID.",
          );
          return;
        }

        const email = await EmailModel.findById(id).lean();

        if (!email) {
          await respond(
            interaction,
            "Email Not Found",
            "No email matches that ID.",
          );
          return;
        }

        const notes = await EmailNoteModel.find({ emailId: id })
          .sort({ createdAt: -1 })
          .limit(MAX_RESULTS)
          .lean();

        const body = notes.length
          ? notes
              .map(
                (note) =>
                  `**${truncate(note.username, 100)}** · ${dateText(note.createdAt)}\n` +
                  `${truncate(note.content, 350)}`,
              )
              .join("\n\n")
          : "No internal notes have been added to this email.";

        await respond(interaction, "Email Notes", body);
        return;
      }

      // /email audit

      if (command === "audit") {
        if (
          !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        ) {
          await respond(
            interaction,
            "Permission Denied",
            "You need the Manage Server permission to view email audit records.",
          );
          return;
        }

        const limit = interaction.options.getInteger("limit") ?? 10;
        const userId = interaction.options.getString("user");
        const filter = userId ? { userId } : {};

        const records = await EmailAuditModel.find(filter)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        const body = records.length
          ? records
              .map(
                (record) =>
                  `**${record.action}** · ${dateText(record.createdAt)}\n` +
                  `**User:** ${truncate(record.username, 100)} (\`${record.userId}\`)\n` +
                  `**Email ID:** ${record.emailId ? `\`${record.emailId}\`` : "N/A"}\n` +
                  `**Mailbox:** ${record.mailboxId ? `\`${record.mailboxId}\`` : "N/A"}`,
              )
              .join("\n\n")
          : "No audit records match your filters.";

        await respond(interaction, "Email Audit Log", body);
        return;
      }

      // /email analytics

      if (command === "analytics") {
        const filter = mailboxId ? { mailboxId } : {};
        const now = new Date();

        const startToday = new Date(now);
        startToday.setHours(0, 0, 0, 0);

        const startWeek = new Date(now);
        startWeek.setDate(startWeek.getDate() - 6);
        startWeek.setHours(0, 0, 0, 0);

        const [total, today, week, attachments, daily, senders] =
          await Promise.all([
            EmailModel.countDocuments(filter),
            EmailModel.countDocuments({
              ...filter,
              date: { $gte: startToday, $lte: now },
            }),
            EmailModel.countDocuments({
              ...filter,
              date: { $gte: startWeek, $lte: now },
            }),
            EmailModel.countDocuments({
              ...filter,
              "attachments.0": { $exists: true },
            }),
            EmailModel.aggregate<{ _id: string; count: number }>([
              {
                $match: {
                  ...filter,
                  date: { $gte: startWeek, $lte: now },
                },
              },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: "$date",
                    },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ]),
            EmailModel.aggregate<{ _id: string; count: number }>([
              { $match: filter },
              { $group: { _id: "$from", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 5 },
            ]),
          ]);

        const dailyText = daily.length
          ? daily.map((day) => `\`${day._id}\` — **${day.count}**`).join("\n")
          : "No emails received during this period.";

        const senderText = senders.length
          ? senders
              .map(
                (sender) =>
                  `**${truncate(sender._id || "Unknown", 100)}** — ${sender.count}`,
              )
              .join("\n")
          : "No sender data available.";

        await audit(interaction, "analytics_view", {
          mailboxId: mailboxId ?? undefined,
        });

        await respond(
          interaction,
          "Email Analytics",
          `**Scope:** ${mailboxId ? `\`${mailboxId}\`` : "All mailboxes"}\n\n` +
            `**Total stored emails:** ${total.toLocaleString()}\n` +
            `**Received today:** ${today.toLocaleString()}\n` +
            `**Received in the last 7 days:** ${week.toLocaleString()}\n` +
            `**Emails with attachments:** ${attachments.toLocaleString()}\n\n` +
            `### Daily Volume\n${dailyText}\n\n` +
            `### Top 5 Senders\n${senderText}`,
        );
      }
    } catch (error) {
      console.error("[Commands] Email command failed:", error);

      await respond(
        interaction,
        "Email Command Error",
        "An error occurred while processing the command. Check the bot logs.",
      ).catch(() => null);
    }
  },
};
