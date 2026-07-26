import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttachment {
  type: 'image' | 'audio';
  url: string;
  name?: string;
}

export interface IMessage extends Document {
  teamId: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  text?: string;
  attachments: IAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>({
  type: { type: String, enum: ['image', 'audio'], required: true },
  url:  { type: String, required: true },
  name: { type: String, default: '' },
}, { _id: false });

const MessageSchema = new Schema<IMessage>({
  teamId:      { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  sender:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text:        { type: String, default: '' },
  attachments: { type: [AttachmentSchema], default: [] },
}, { timestamps: true });

export const Message = (mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema)) as Model<IMessage>;
