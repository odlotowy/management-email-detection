import {
  Collection,
  EmbedBuilder,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandBuilder,
} from "discord.js";

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { config } from "../config.js";

export interface Command {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export class CommandHandler {
  public readonly commands = new Collection<string, Command>();

  constructor(private readonly client: Client) {}

  public async loadCommands(): Promise<void> {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const commandsPath = path.resolve(currentDir, "..", "commands");

    if (!fs.existsSync(commandsPath)) {
      throw new Error(
        `[Commands] Commands directory not found: ${commandsPath}`,
      );
    }

    const files = fs
      .readdirSync(commandsPath)
      .filter((file) => /\.(ts|js)$/.test(file))
      .filter((file) => !file.endsWith(".d.ts"));

    this.commands.clear();

    for (const file of files) {
      try {
        const filePath = path.join(commandsPath, file);
        const fileUrl = pathToFileURL(filePath).href;

        const imported = await import(`${fileUrl}?update=${Date.now()}`);

        const command: Command | undefined =
          imported.default ?? imported.command;

        if (!command?.data || typeof command.execute !== "function") {
          console.warn(
            `[Commands] Skipping ${file}: invalid command structure.`,
          );
          continue;
        }

        const commandName = command.data.name;

        if (this.commands.has(commandName)) {
          console.warn(`[Commands] Duplicate command: ${commandName}`);
          continue;
        }

        this.commands.set(commandName, command);
        console.log(`[Commands] Loaded /${commandName}`);
      } catch (error) {
        console.error(`[Commands] Failed to load ${file}:`, error);
      }
    }

    console.log(`[Commands] Loaded ${this.commands.size} command(s).`);
  }

  public async registerCommands(): Promise<void> {
    if (!this.client.user) {
      throw new Error(
        "[Commands] Cannot register commands before the client is ready.",
      );
    }

    const rest = new REST({ version: "10" }).setToken(config.discordToken);

    const commandData = Array.from(this.commands.values()).map((command) =>
      command.data.toJSON(),
    );

    console.log(`[Commands] Registering ${commandData.length} command(s)...`);

    await rest.put(
      Routes.applicationGuildCommands(
        this.client.user.id,
        config.discordGuildId,
      ),
      { body: commandData },
    );

    console.log(
      `[Commands] Successfully registered ${commandData.length} command(s).`,
    );
  }

  public async handleInteraction(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      console.warn(`[Commands] Unknown command: /${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(
        `[Commands] Error executing /${interaction.commandName}:`,
        error,
      );

      const message = "An error occurred while executing this command.";

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            embeds: [
              new EmbedBuilder().setDescription(message).setColor("Red"),
            ],
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            embeds: [
              new EmbedBuilder().setDescription(message).setColor("Red"),
            ],
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.error(`[Commands] Failed to send error response:`, replyError);
      }
    }
  }
}
