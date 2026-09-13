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
    .setName("request-email")
    .setDescription("Request a freshway custom email"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setTitle("Request Custom Email")
      .setCustomId(`request_email_modal:${interaction.user.id}`);

    const email = new LabelBuilder()
      .setLabel("Provide the email you want to request")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("email")
          .setPlaceholder("example@freshwayroblox.com")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      );

    const reason = new LabelBuilder()
      .setLabel("Why are you requesting a custom email?")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("reason")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      );

    modal.addLabelComponents(email, reason);

    await interaction.showModal(modal);
  },
};
