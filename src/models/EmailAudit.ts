import mongoose, { Document, Schema } from "mongoose";

export type EmailAuditAction =
  | "view"
  | "bookmark_add"
  | "bookmark_remove"
  | "note_add"
  | "analytics_view"
  | "status_view";

export interface IEmailAudit extends Document {
  userId: string;
  username: string;
  action: EmailAuditAction;
  emailId?: string;
  mailboxId?: string;
  details?: string;
  createdAt: Date;
}

const EmailAuditSchema = new Schema<IEmailAudit>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "view",
        "bookmark_add",
        "bookmark_remove",
        "note_add",
        "analytics_view",
        "status_view",
      ],
      index: true,
    },
    emailId: {
      type: String,
      index: true,
    },
    mailboxId: {
      type: String,
      index: true,
    },
    details: {
      type: String,
      maxlength: 250,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

EmailAuditSchema.index({ createdAt: -1 });

export const EmailAuditModel =
  mongoose.models.EmailAudit ||
  mongoose.model<IEmailAudit>("EmailAudit", EmailAuditSchema);
