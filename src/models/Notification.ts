import mongoose, { Schema, Document, Model } from 'mongoose';

export interface INotification extends Document {
  recipient: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  channelId?: mongoose.Types.ObjectId;
  messageId: mongoose.Types.ObjectId;
  text: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: false },
  messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
  text: { type: String, required: true },
  isRead: { type: Boolean, default: false, index: true }
}, { timestamps: true });

export const Notification = (mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema)) as Model<INotification>;
