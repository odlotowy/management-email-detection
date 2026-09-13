import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("management-account")
    .setDescription("Shows the management account credentials"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      await interaction.editReply({
        content: "This command can only be used in a server.",
      });
      return;
    }

    const logsChannelId = "1548373683721212005";
    const logsChannel = interaction.guild.channels.cache.get(logsChannelId);

    if (!logsChannel || !logsChannel.isSendable()) {
      await interaction.editReply({
        content: "The logs channel could not be found.",
      });
      return;
    }

    const member = interaction.user;

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

**Email:** management@freshwayroblox.com
**Password:** ||lLg3S90UvppvIiBIm8JVxNpRU||

You can access the email account through the FreshWay Mail portal using the link below:
https://mail.freshwayroblox.com/

Please keep the account credentials confidential and do not share them with anyone outside of the authorized Management team. The account should only be used for official FreshWay Management matters and communication.

If you experience any issues accessing the account or believe the account credentials may have been compromised, contact the Management Leadership team immediately.

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
> **Username:** management@freshwayroblox.com
> **Password:** ||lLg3S90UvppvIiBIm8JVxNpRU||
          `,
          inline: true,
        },
        {
          name: "SMTP",
          value: `
> **Server:** mail.freshwayroblox.com
> **Security:** SSL/TLS
> **Port:** 465
> **Username:** management@freshwayroblox.com
> **Password:** ||lLg3S90UvppvIiBIm8JVxNpRU||
          `,
          inline: true,
        },
      );

    await logsChannel.send(
      `**${interaction.user.tag} has viewed management email credentials**`,
    );

    try {
      await member.send({
        embeds: [ImageEmbed, embed],
      });

      await interaction.editReply({
        content: "Check your DMs!",
      });
    } catch (error) {
      console.error(
        `[Commands] Failed to send management account credentials to ${interaction.user.tag}:`,
        error,
      );

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              "Your DMs are disabled. Please turn them on to receive the credentials.",
            )
            .setColor("Red"),
        ],
      });
    }
  },
};
