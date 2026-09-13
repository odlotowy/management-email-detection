import mongoose from "mongoose";

import { config } from "./config";

export async function connectDatabase(): Promise<void> {
  console.log("[Database] Connecting...");

  await mongoose
    .connect(config.mongodbUri)
    .then(() => {
      console.log("[Database] Connected to MongoDB!");
    })
    .catch((err) => {
      console.error(
        "[Database] Error occured while connecting to MongoDB",
        err,
      );
    });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();

  console.log("[Database] Disconnected from MongoDB.");
}
