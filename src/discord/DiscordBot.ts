import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ContainerBuilder,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  SeparatorBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type TextChannel,
} from "discord.js";

import { config } from "../config";
import { EmailModel } from "../models/Email";
import { EmailRequest } from "../models/EmailRequest";
import { EmailAccount } from "../models/EmailAccount.js";

import { CommandHandler } from "./CommandHandler";

import type { MailboxConfig, ParsedEmailData } from "../types";

export class DiscordBot {
  public readonly client: Client;
  public readonly commandHandler: CommandHandler;

  private readonly emailManagerId = "1177912080490319903";
  private readonly emailLogsChannelId = "1548373683721212005";

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    });

    this.commandHandler = new CommandHandler(this.client);

    this.registerEvents();
  }

  public async start(): Promise<void> {
    await this.client.login(config.discordToken);

    await this.commandHandler.loadCommands();

    await this.commandHandler.registerCommands();
  }

  private registerEvents(): void {
    this.client.once(Events.ClientReady, (client) => {
      console.log(`[Discord] Logged in as ${client.user.tag}.`);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isButton()) {
        await this.handleButton(interaction);

        return;
      }

      if (interaction.isChatInputCommand()) {
        await this.commandHandler.handleInteraction(interaction);
      }
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (
        !interaction.isModalSubmit() ||
        !interaction.customId.startsWith("request_email_modal:")
      ) {
        return;
      }

      const userId = interaction.customId.split(":")[1];

      const email = interaction.fields.getTextInputValue("email").trim();

      const reason = interaction.fields.getTextInputValue("reason").trim();

      const channel = interaction.guild?.channels.cache.get(
        this.emailLogsChannelId,
      );

      if (!channel || !channel.isSendable()) {
        await interaction.reply({
          content: "The logging channel could not be found.",
          flags: MessageFlags.Ephemeral,
        });

        return;
      }

      // Generate unique request ID
      const requestId = `REQ-${Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()}`;

      // Save request to MongoDB
      try {
        await EmailRequest.create({
          requestId,
          userId,
          email,
          reason,
          status: "pending",
        });
      } catch (error) {
        console.error("[Email Request] Failed to save request:", error);

        await interaction.reply({
          content: "Something went wrong while creating your request.",
          flags: MessageFlags.Ephemeral,
        });

        return;
      }

      // Send request to logging channel
      const container = new ContainerBuilder();

      const text = new TextDisplayBuilder().setContent(
        `# New Custom Email Request

A new custom email request has been made and the Engineering Department has been notified.

**Email Details:**
> Email Address: ${email}

> **Reason:** ${reason}`,
      );

      container.addTextDisplayComponents(text);

      const separator = new SeparatorBuilder();

      container.addSeparatorComponents(separator);

      const text2 = new TextDisplayBuilder().setContent(
        `-# Request ID: \`${requestId}\`\n-# Request made by <@${userId}>`,
      );

      container.addTextDisplayComponents(text2);

      await channel.send({
        flags: MessageFlags.IsComponentsV2,
        components: [container],
      });

      // DM Engineering user
      try {
        const emailManager = await this.client.users.fetch(this.emailManagerId);

        await emailManager.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("New Custom Email Request")
              .setDescription(
                `You have received a new custom email request.\n\n` +
                  `**Request ID**\n` +
                  `\`${requestId}\`\n\n` +
                  `**Requested By**\n` +
                  `<@${userId}>\n\n` +
                  `**Email Address**\n` +
                  `\`${email}\`\n\n` +
                  `**Reason**\n` +
                  `${reason}\n\n` +
                  `After creating the account, reply to this DM using:\n` +
                  `\`<Request ID> <Password>\`\n\n` +
                  `Example:\n` +
                  `\`${requestId} MyPassword123\``,
              )
              .setColor("Blue")
              .setFooter({
                text: "FreshWay Engineering Department",
              })
              .setTimestamp(),
          ],
        });
      } catch (error) {
        console.error("[Email Request] Failed to DM Engineering user:", error);
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              "Custom email request has been created successfully!",
            )
            .setColor("Green"),
        ],
        flags: MessageFlags.Ephemeral,
      });
    });

    this.client.on(Events.MessageCreate, async (message) => {
      console.log(`[MessageCreate] ${message.author.tag}: ${message.content}`);

      // Ignore bots
      if (message.author.bot) return;

      // Only process DMs
      if (message.guild !== null) return;

      // Only Engineering user can manage requests
      if (message.author.id !== this.emailManagerId) return;

      const content = message.content.trim();

      if (!content) return;

      const parts = content.split(/\s+/);

      if (parts.length < 2) {
        await message.reply(
          "Invalid format.\n\n" +
            "To complete a request:\n" +
            "`REQUEST_ID PASSWORD`\n\n" +
            "To reject a request:\n" +
            "`REQUEST_ID denied`\n\n" +
            "Example:\n" +
            "`REQ-A7K2XP MyPassword123`",
        );

        return;
      }

      const requestId = parts.shift()!;
      const value = parts.join(" ");

      // Find pending request
      const request = await EmailRequest.findOne({
        requestId,
        status: "pending",
      });

      if (!request) {
        await message.reply(
          `No pending request was found with ID \`${requestId}\`.`,
        );

        return;
      }

      /*
       * =========================
       * REJECT REQUEST
       * =========================
       */

      if (value.toLowerCase() === "denied") {
        // Save that this request is waiting for a rejection reason
        await EmailRequest.updateOne(
          {
            requestId,
            status: "pending",
          },
          {
            $set: {
              status: "awaiting_rejection_reason",
            },
          },
        );

        await message.reply(
          `Request \`${requestId}\` is being rejected.\n\n` +
            `Please provide the reason for rejecting this request.`,
        );

        return;
      }

      /*
       * =========================
       * PASSWORD
       * =========================
       */

      const password = value;

      // Complete request
      request.status = "completed";
      request.password = password;
      request.completedAt = new Date();

      await request.save();

      await EmailAccount.create({
        email: request.email,
        password,
        ownerId: request.userId,
        createdById: message.author.id,
      });

      // Thank Engineering
      await message.reply(
        `Thank you. The password for request \`${requestId}\` has been received successfully.`,
      );

      // Logging channel
      const channel = await this.client.channels.fetch(this.emailLogsChannelId);

      if (channel && channel.isSendable()) {
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("Custom Email Request Completed")
              .setDescription(
                "The requested custom email account has been completed.",
              )
              .addFields(
                {
                  name: "Request ID",
                  value: `\`${request.requestId}\``,
                  inline: true,
                },
                {
                  name: "Requested By",
                  value: `<@${request.userId}>`,
                  inline: true,
                },
                {
                  name: "Email Address",
                  value: `\`${request.email}\``,
                },
                {
                  name: "Reason",
                  value: request.reason,
                },
                {
                  name: "Password",
                  value: `\`${password}\``,
                },
              )
              .setColor("Green")
              .setTimestamp(),
          ],
        });
      }

      // DM requester
      try {
        const requester = await this.client.users.fetch(request.userId);

        const ImageEmbed = new EmbedBuilder()
          .setImage(
            "https://cdn.discordapp.com/attachments/1523377560883560640/1525785030608293968/FreshWay_MGMT_Banner.png",
          )
          .setColor(0x0a5e0c);

        const embed = new EmbedBuilder()
          .setTitle("FreshWay Management Email Account")
          .setColor(0x0a5e0c)
          .setDescription(
            `
The following credentials can be used to access the FreshWay Management Email account:

**Email:** ${request.email}
**Password:** ||${password}||

You can access the email account through the FreshWay Mail portal using the link below:
https://mail.freshwayroblox.com/

**Please Note:** All password changes must be logged using \`/password change\` command. Failure to do so may result in a disciplinary actions.

**Custom Email Client Configuration:**
      `,
          )
          .addFields(
            {
              name: "IMAP",
              value: `
> **Server:** mail.freshwayroblox.com
> **Security:** SSL/TLS
> **Port:** 993
> **Username:** ${request.email}
> **Password:** ||${password}||
          `,
              inline: true,
            },
            {
              name: "SMTP",
              value: `
> **Server:** mail.freshwayroblox.com
> **Security:** SSL/TLS
> **Port:** 465
> **Username:** ${request.email}
> **Password:** ||${password}||
          `,
              inline: true,
            },
          );

        await requester.send({
          embeds: [ImageEmbed, embed],
        });
      } catch (error) {
        console.error(
          `[Email Request] Failed to DM requester ${request.userId}:`,
          error,
        );
      }

      console.log(`[Email Request] Request ${requestId} completed.`);
    });

    this.client.on(Events.MessageCreate, async (message) => {
      // Ignore bots
      if (message.author.bot) return;

      // Only DMs
      if (message.guild !== null) return;

      // Only Engineering user
      if (message.author.id !== this.emailManagerId) return;

      const rejectionRequest = await EmailRequest.findOne({
        status: "awaiting_rejection_reason",
      }).sort({
        createdAt: 1,
      });

      if (!rejectionRequest) return;

      const rejectionReason = message.content.trim();

      if (!rejectionReason) {
        await message.reply(
          "Please provide a reason for rejecting the request.",
        );

        return;
      }

      // Update MongoDB
      rejectionRequest.status = "rejected";
      rejectionRequest.rejectionReason = rejectionReason;
      rejectionRequest.rejectedAt = new Date();

      await rejectionRequest.save();

      // Confirm to Engineering
      await message.reply(
        `Request \`${rejectionRequest.requestId}\` has been rejected successfully.`,
      );

      // Logging channel
      const channel = await this.client.channels.fetch(this.emailLogsChannelId);

      if (channel && channel.isSendable()) {
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("Custom Email Request Rejected")
              .setDescription("A custom email request has been rejected.")
              .addFields(
                {
                  name: "Request ID",
                  value: `\`${rejectionRequest.requestId}\``,
                  inline: true,
                },
                {
                  name: "Requested By",
                  value: `<@${rejectionRequest.userId}>`,
                  inline: true,
                },
                {
                  name: "Email Address",
                  value: `\`${rejectionRequest.email}\``,
                },
                {
                  name: "Original Reason",
                  value: rejectionRequest.reason,
                },
                {
                  name: "Rejection Reason",
                  value: rejectionReason,
                },
                {
                  name: "Rejected By",
                  value: `<@${message.author.id}>`,
                },
              )
              .setColor("Red")
              .setTimestamp(),
          ],
        });
      }

      // DM requester
      try {
        const requester = await this.client.users.fetch(
          rejectionRequest.userId,
        );

        await requester.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("Custom Email Request Rejected")
              .setDescription("Your custom email request has been rejected.")
              .addFields({
                name: "Reason",
                value: rejectionReason,
              })
              .setColor("Red")
              .setFooter({
                text: `Request ID: ${rejectionRequest.requestId}`,
              })
              .setTimestamp(),
          ],
        });
      } catch (error) {
        console.error(
          `[Email Request] Failed to DM requester ${rejectionRequest.userId}:`,
          error,
        );
      }

      console.log(
        `[Email Request] Request ${rejectionRequest.requestId} rejected.`,
      );
    });
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith("email:view:")) {
      return;
    }

    const emailId = interaction.customId.substring("email:view:".length);

    await this.handleViewEmail(interaction, emailId);
  }

  private async handleViewEmail(
    interaction: ButtonInteraction,
    emailId: string,
  ): Promise<void> {
    if (config.allowedRoleIds.length > 0) {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: "You cannot use this button here.",
          ephemeral: true,
        });

        return;
      }

      if (!interaction.guild) return;

      const member = await interaction.guild.members.fetch(interaction.user.id);

      const hasPermission = config.allowedRoleIds.some((roleId) =>
        member.roles.cache.has(roleId),
      );

      if (!hasPermission) {
        await interaction.reply({
          content: "You do not have permission to view email contents.",
          ephemeral: true,
        });

        return;
      }
    }

    const email = await EmailModel.findById(emailId).lean();

    if (!email) {
      await interaction.reply({
        content: "This email could not be found.",
        ephemeral: true,
      });

      return;
    }

    const text = email.text?.trim() || "No text content available.";

    const chunks = this.splitMessage(text, 1800);

    const header = [
      `**From:** ${this.escapeMarkdown(email.from)}`,
      `**To:** ${this.escapeMarkdown(email.to)}`,
      `**Subject:** ${this.escapeMarkdown(email.subject)}`,
      `**Date:** <t:${Math.floor(email.date.getTime() / 1000)}:F>`,
      "",
    ].join("\n");

    const firstMessage = `${header}${chunks[0] ?? ""}`;

    await interaction.reply({
      content: firstMessage,
      ephemeral: true,
    });

    for (let index = 1; index < chunks.length; index++) {
      await interaction.followUp({
        content: chunks[index],
        ephemeral: true,
      });
    }

    if (email.attachments.length > 0) {
      const attachments = email.attachments
        .map((attachment) => `• ${this.escapeMarkdown(attachment)}`)
        .join("\n");

      await interaction.followUp({
        content: `**Attachments:**\n${attachments}`,
        ephemeral: true,
      });
    }
  }

  public async sendEmailNotification(
    emailId: string,
    email: ParsedEmailData,
    mailbox: MailboxConfig,
  ): Promise<void> {
    const channel = await this.client.channels.fetch(mailbox.discordChannelId);

    if (!channel || !channel.isTextBased()) {
      console.error(
        `[Discord] Channel ${mailbox.discordChannelId} is not a text channel.`,
      );

      return;
    }

    const textChannel = channel as TextChannel;

    const embed = new EmbedBuilder()
      .setTitle("New Email Received")
      .setDescription(`A new email has been received in **${mailbox.name}**.`)
      .setColor(0x2ecc71)
      .addFields(
        {
          name: "From",
          value: this.truncate(email.from, 1024),
          inline: false,
        },
        {
          name: "To",
          value: this.truncate(email.to, 1024),
          inline: false,
        },
        {
          name: "Subject",
          value: this.truncate(email.subject, 1024),
          inline: false,
        },
        {
          name: "Preview",
          value: this.truncate(email.preview || "No preview available.", 1024),
          inline: false,
        },
      )
      .setFooter({
        text: `${mailbox.email} • FreshWay Mail Services`,
      })
      .setTimestamp(email.date);

    if (email.attachments.length > 0) {
      embed.addFields({
        name: "Attachments",
        value: this.truncate(
          email.attachments.map((attachment) => `• ${attachment}`).join("\n"),
          1024,
        ),
        inline: false,
      });
    }

    const button = new ButtonBuilder()
      .setCustomId(`email:view:${emailId}`)
      .setLabel("View Email")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    const message = await textChannel.send({
      embeds: [embed],
      components: [row],
    });

    await EmailModel.findByIdAndUpdate(emailId, {
      discordMessageId: message.id,
    });

    console.log(`[Discord] Sent notification for "${email.subject}".`);
  }

  private truncate(text: string, length: number): string {
    if (text.length <= length) {
      return text;
    }

    return `${text.slice(0, length - 3)}...`;
  }

  private escapeMarkdown(text: string): string {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/\*/g, "\\*")
      .replace(/_/g, "\\_")
      .replace(/~/g, "\\~")
      .replace(/`/g, "\\`");
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];

    let remaining = text.trim();

    while (remaining.length > maxLength) {
      let splitAt = remaining.lastIndexOf("\n", maxLength);

      if (splitAt < 500) {
        splitAt = remaining.lastIndexOf(" ", maxLength);
      }

      if (splitAt <= 0) {
        splitAt = maxLength;
      }

      chunks.push(remaining.slice(0, splitAt));

      remaining = remaining.slice(splitAt).trimStart();
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }
}
