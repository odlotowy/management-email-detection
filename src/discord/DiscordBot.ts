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
  SeparatorBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type TextChannel,
} from "discord.js";

import { config } from "../config.js";
import { EmailModel } from "../models/Email.js";

import { CommandHandler } from "./CommandHandler.js";

import type { MailboxConfig, ParsedEmailData } from "../types.js";

export class DiscordBot {
  public readonly client: Client;
  public readonly commandHandler: CommandHandler;

  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds],
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
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("request_email_modal:")
      ) {
        const userId = interaction.customId.split(":")[1];
        const email = interaction.fields.getTextInputValue("email");
        const reason = interaction.fields.getTextInputValue("reason");

        const channel = interaction.guild?.channels.cache.get(
          "1548373683721212005",
        );
        if (!channel || !channel.isSendable()) return;

        const container = new ContainerBuilder();

        const text = new TextDisplayBuilder().setContent(
          `# New Custom Email Request\nA new custom email request has been made and it's pending review.\n\n**Email Details:**\n> Email Address: ${email}\n\n> **Reason:** ${reason}`,
        );

        container.addTextDisplayComponents(text);

        const separator = new SeparatorBuilder();
        container.addSeparatorComponents(separator);

        const text2 = new TextDisplayBuilder().setContent(
          `-# Request made by <@${userId}>`,
        );

        container.addTextDisplayComponents(text2);

        channel.send({
          flags: MessageFlags.IsComponentsV2,
          components: [container],
        });

        interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                "Custom email request has been created successfully!",
              )
              .setColor("Green"),
          ],
          flags: 64,
        });
      }
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
