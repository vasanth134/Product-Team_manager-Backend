import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttachment {
  type: 'image' | 'audio';
  url: string;
  name?: string;
}

export interface ICallHistory {
  callType: 'audio' | 'video';
  duration: number; // in seconds
  joinedParticipants: string[]; // names of participants
  startedAt: Date;
  endedAt: Date;
}

export interface IMessage extends Document {
  teamId: mongoose.Types.ObjectId;
  channelId?: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  text?: string;
  attachments: IAttachment[];
  isCallHistory?: boolean;
  callHistory?: ICallHistory;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>({
  type: { type: String, enum: ['image', 'audio'], required: true },
  url:  { type: String, required: true },
  name: { type: String, default: '' },
}, { _id: false });

const CallHistorySchema = new Schema<ICallHistory>({
  callType: { type: String, enum: ['audio', 'video'], required: true },
  duration: { type: Number, required: true },
  joinedParticipants: { type: [String], default: [] },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, required: true },
}, { _id: false });

const MessageSchema = new Schema<IMessage>({
  teamId:      { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  channelId:   { type: Schema.Types.ObjectId, ref: 'Channel', required: false, index: true },
  sender:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text:        { type: String, default: '' },
  attachments: { type: [AttachmentSchema], default: [] },
  isCallHistory: { type: Boolean, default: false },
  callHistory: { type: CallHistorySchema, default: undefined },
}, { timestamps: true });

export const Message = (mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema)) as Model<IMessage>;
