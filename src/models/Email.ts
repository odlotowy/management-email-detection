import mongoose, { Document, Model, Schema } from "mongoose";

export interface IEmail extends Document {
  mailboxId: string;

  messageUid: number;

  messageId: string;

  from: string;
  to: string;

  subject: string;

  text: string;

  html?: string;

  preview: string;

  date: Date;

  attachments: string[];

  discordMessageId?: string;

  createdAt: Date;
}

const EmailSchema = new Schema<IEmail>(
  {
    mailboxId: {
      type: String,
      required: true,
      index: true,
    },

    messageUid: {
      type: Number,
      required: true,
    },

    messageId: {
      type: String,
      required: true,
    },

    from: {
      type: String,
      required: true,
    },

    to: {
      type: String,
      required: true,
    },

    subject: {
      type: String,
      required: true,
    },

    text: {
      type: String,
      default: "",
    },

    html: {
      type: String,
    },

    preview: {
      type: String,
      default: "",
    },

    date: {
      type: Date,
      required: true,
    },

    attachments: {
      type: [String],
      default: [],
    },

    discordMessageId: {
      type: String,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

EmailSchema.index(
  {
    mailboxId: 1,
    messageUid: 1,
  },
  {
    unique: true,
  },
);

export const EmailModel: Model<IEmail> = mongoose.model<IEmail>(
  "Email",
  EmailSchema,
);
