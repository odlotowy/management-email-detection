import {
  ChatInputCommandInteraction,
  LabelBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("change-password")
    .setDescription("Log password change to your email account"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) return;

    const modal = new ModalBuilder()
      .setTitle("Email Password Change")
      .setCustomId(`password-change-modal:${interaction.user.id}`);

    const pass = new LabelBuilder()
      .setLabel("New Password")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("pass")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(6),
      );

    modal.addLabelComponents(pass);

    await interaction.showModal(modal);
  },
};
