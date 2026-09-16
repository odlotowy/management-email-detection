import { Schema, model, type Document } from "mongoose";

export interface IEmailAccount extends Document {
  email: string;
  password: string;
  ownerId: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

const emailAccountSchema = new Schema<IEmailAccount>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },

  password: {
    type: String,
    required: true,
  },

  ownerId: {
    type: String,
    required: true,
  },

  createdById: {
    type: String,
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export const EmailAccount = model<IEmailAccount>(
  "EmailAccount",
  emailAccountSchema,
);
