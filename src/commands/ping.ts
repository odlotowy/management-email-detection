import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Ping command"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({
      content: "Pong!",
    });
  },
};
