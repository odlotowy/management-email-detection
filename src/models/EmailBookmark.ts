import mongoose, { Document, Schema } from "mongoose";

export interface IEmailBookmark extends Document {
  emailId: string;
  userId: string;
  createdAt: Date;
}

const EmailBookmarkSchema = new Schema<IEmailBookmark>(
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
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

EmailBookmarkSchema.index({ emailId: 1, userId: 1 }, { unique: true });

export const EmailBookmarkModel =
  mongoose.models.EmailBookmark ||
  mongoose.model<IEmailBookmark>("EmailBookmark", EmailBookmarkSchema);
