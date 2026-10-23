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
import { pathToFileURL } from "node:url";

import { config } from "../config.js";

export interface Command {
  data: SlashCommandBuilder;

  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export class CommandHandler {
  public readonly commands = new Collection<string, Command>();

  constructor(private readonly client: Client) {}

  public async loadCommands(): Promise<void> {
    const commandsPath = path.join(process.cwd(), "src", "commands");

    if (!fs.existsSync(commandsPath)) {
      fs.mkdirSync(commandsPath, {
        recursive: true,
      });

      console.log("[Commands] Created commands directory.");

      return;
    }

    const files = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".js"))
      .filter((file) => !file.endsWith(".d.ts"));

    for (const file of files) {
      try {
        const filePath = path.join(commandsPath, file);

        const fileUrl = pathToFileURL(filePath).href;

        const imported = await import(`${fileUrl}?update=${Date.now()}`);

        const command = imported.default ?? imported.command;

        if (!command || !command.data || !command.execute) {
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
    const rest = new REST({
      version: "10",
    }).setToken(config.discordToken);

    const commandData = Array.from(this.commands.values()).map((command) =>
      command.data.toJSON(),
    );

    console.log(`[Commands] Registering ${commandData.length} command(s)...`);

    await rest.put(
      Routes.applicationGuildCommands(
        this.client.user!.id,
        config.discordGuildId,
      ),
      {
        body: commandData,
      },
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

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          embeds: [new EmbedBuilder().setDescription(message).setColor("Red")],
          flags: 64,
        });
      } else {
        await interaction.reply({
          embeds: [new EmbedBuilder().setDescription(message).setColor("Red")],
          flags: 64,
        });
      }
    }
  }
}
