import { Schema, model, type Document } from "mongoose";

export interface IEmailRequest extends Document {
  requestId: string;
  userId: string;
  email: string;
  reason: string;
  status: "pending" | "completed";
  password?: string;
  createdAt: Date;
  completedAt?: Date;
}

const emailRequestSchema = new Schema<IEmailRequest>({
  requestId: {
    type: String,
    required: true,
    unique: true,
  },

  userId: {
    type: String,
    required: true,
  },

  email: {
    type: String,
    required: true,
  },

  reason: {
    type: String,
    required: true,
  },

  status: {
    type: String,
    enum: ["pending", "completed"],
    default: "pending",
  },

  password: {
    type: String,
    required: false,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  completedAt: {
    type: Date,
    required: false,
  },
});

export const EmailRequest = model<IEmailRequest>(
  "EmailRequest",
  emailRequestSchema,
);
