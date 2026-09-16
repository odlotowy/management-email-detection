import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";

import { EmailAccount } from "../models/EmailAccount.js";

const EMAIL_ROLE_ID = "1523360343227895952";

export default {
  data: new SlashCommandBuilder()
    .setName("email")
    .setDescription("Manage FreshWay email accounts")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all email accounts")
        .addBooleanOption((option) =>
          option
            .setName("show-passwords")
            .setDescription("Show the passwords of all email accounts")
            .setRequired(false),
        ),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("find")
        .setDescription("Find email accounts belonging to a user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The owner of the email account")
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("show-passwords")
            .setDescription("Show the passwords of the email accounts")
            .setRequired(false),
        ),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("View information about an email account")
        .addStringOption((option) =>
          option
            .setName("email")
            .setDescription("The email address (not case-sensitive)")
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("show-password")
            .setDescription("Show the account password")
            .setRequired(false),
        ),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("search")
        .setDescription("Search for email accounts")
        .addStringOption((option) =>
          option
            .setName("query")
            .setDescription("Email address or part of an email address")
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("show-passwords")
            .setDescription("Show the passwords of matching accounts")
            .setRequired(false),
        ),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete an email account from the database")
        .addStringOption((option) =>
          option
            .setName("email")
            .setDescription("The email address to delete")
            .setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    console.log("[DEBUG] cwd:", process.cwd());
    console.log("[DEBUG] models:", fs.readdirSync(path.resolve("src/models")));

    /*
     * =========================
     * PERMISSION CHECK
     * =========================
     */

    if (!interaction.guild) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription("This command can only be used in a guild")
            .setColor("Red"),
        ],
        flags: 64,
      });

      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);

    const hasPermission =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.has(EMAIL_ROLE_ID);

    if (!hasPermission) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              "You do not have permission to manage email accounts",
            )
            .setColor("Red"),
        ],
        flags: 64,
      });

      return;
    }

    const subcommand = interaction.options.getSubcommand();

    /**
     * =========================
     * /email list
     * =========================
     */

    if (subcommand === "list") {
      const showPasswords =
        interaction.options.getBoolean("show-passwords") ?? false;

      const accounts = await EmailAccount.find().sort({ email: 1 }).lean();

      if (accounts.length === 0) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                "There are currently no email accounts in the database",
              )
              .setColor("Red"),
          ],
        });

        return;
      }

      const lines = accounts.map((account, index) => {
        let result =
          `**${index + 1}. ${account.email}**\n` +
          `> Owner: <@${account.ownerId}>`;

        if (showPasswords) {
          result += `\n> Password: \`${account.password}\``;
        }

        return result;
      });

      const chucks: string[] = [];

      let current = "";

      for (const line of lines) {
        if ((current + "\n\n" + line).length > 3900) {
          chucks.push(current);
          current = line;
        } else {
          current += current ? `\n\n${line}` : line;
        }
      }

      if (current) {
        chucks.push(current);
      }

      const embeds = chucks.map((chunk, index) =>
        new EmbedBuilder()
          .setTitle(
            `Email Accounts${chucks.length > 1 ? ` (${index + 1}/${chucks.length})` : ""}`,
          )
          .setDescription(chunk)
          .setColor("Blue")
          .setFooter({
            text: `Total accounts: ${accounts.length}`,
          }),
      );

      await interaction.reply({
        embeds,
      });

      return;
    }

    /**
     * =========================
     * /email find
     * =========================
     */

    if (subcommand === "find") {
      const user = interaction.options.getUser("user", true);

      const showPasswords =
        interaction.options.getBoolean("show-passwords") ?? false;

      const accounts = await EmailAccount.find().sort({ email: 1 }).lean();

      if (accounts.length === 0) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(`<@${user.id}> does not have any email accounts`)
              .setColor("Red"),
          ],
        });

        return;
      }

      const description = accounts
        .map((account, index) => {
          let result = `**${index + 1}. ${account.email}**`;

          if (showPasswords) {
            result += `\n> Password: \`${account.password}\``;
          }

          return result;
        })
        .join("\n\n");

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Email Accounts — ${user.username}`)
            .setDescription(description)
            .addFields({
              name: "Owner",
              value: `<@${user.id}>`,
            })
            .setColor("Blue")
            .setFooter({
              text: `Total accounts: ${accounts.length}`,
            }),
        ],
      });

      return;
    }

    /**
     * =========================
     * /email info
     * =========================
     */

    if (subcommand === "info") {
      const email = interaction.options.getString("email", true).toLowerCase();

      const showPassword =
        interaction.options.getBoolean("show-password") ?? false;

      const account = await EmailAccount.findOne({
        email,
      }).lean();

      if (!account) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                `No email account with the address \`${email}\` was found`,
              )
              .setColor("Red"),
          ],
        });

        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("Email Account Information")
        .addFields(
          {
            name: "Email",
            value: `\`${account.email}\``,
            inline: true,
          },
          {
            name: "Owner",
            value: `<@${account.ownerId}>`,
            inline: true,
          },
          {
            name: "Created By",
            value: `<@${account.createdById}>`,
          },
          {
            name: "Created At",
            value: `<t:${Math.floor(account.createdAt.getTime() / 1000)}:F>`,
          },
        )
        .setColor("Blue");

      if (showPassword) {
        embed.addFields({
          name: "Password",
          value: `\`${account.password}\``,
        });
      }

      await interaction.reply({
        embeds: [embed],
      });

      return;
    }

    /**
     * =========================
     * /email search
     * =========================
     */

    if (subcommand === "search") {
      const query = interaction.options.getString("query", true).toLowerCase();

      const showPasswords =
        interaction.options.getBoolean("show-passwords") ?? false;

      const accounts = await EmailAccount.find({
        email: {
          $regex: query,
          $options: "i",
        },
      })
        .sort({ email: 1 })
        .lean();

      if (accounts.length === 0) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                `No email accounts mathcing \`${query}\` were found`,
              )
              .setColor("Red"),
          ],
        });

        return;
      }

      const description = accounts
        .map((account, index) => {
          let result =
            `**${index + 1}. ${account.email}**\n` +
            `> Owner: <@${account.ownerId}>`;

          if (showPasswords) {
            result += `\n> Password: \`${account.password}\``;
          }

          return result;
        })
        .join("\n\n");

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Email Search Results")
            .setDescription(description)
            .setColor("Blue")
            .setFooter({
              text: `Found ${accounts.length} account(s)`,
            }),
        ],
      });

      return;
    }

    /**
     * =========================
     * /email delete
     * =========================
     */

    if (subcommand === "delete") {
      const email = interaction.options.getString("email", true).toLowerCase();

      const account = await EmailAccount.findOneAndDelete({
        email,
      });

      if (!account) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                `No email account with the address \`${email}\` was found`,
              )
              .setColor("Red"),
          ],
        });

        return;
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Email Account Deleted")
            .setDescription(
              `The email account \`${account.email}\` has been removed from the database.`,
            )
            .addFields({
              name: "Owner",
              value: `<@${account.ownerId}>`,
            })
            .setColor("Red")
            .setTimestamp(),
        ],
      });

      return;
    }
  },
};
