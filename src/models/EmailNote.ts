import mongoose, { Document, Schema } from "mongoose";

export interface IEmailNote extends Document {
  emailId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: Date;
}

const EmailNoteSchema = new Schema<IEmailNote>(
  {
    emailId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 2000,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

EmailNoteSchema.index({ emailId: 1, createdAt: -1 });

export const EmailNoteModel =
  mongoose.models.EmailNote ||
  mongoose.model<IEmailNote>("EmailNote", EmailNoteSchema);
