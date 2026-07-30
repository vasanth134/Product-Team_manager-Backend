import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChannel extends Document {
  name: string;
  description?: string;
  teamId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema = new Schema<IChannel>({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export const Channel = (mongoose.models.Channel || mongoose.model<IChannel>('Channel', ChannelSchema)) as Model<IChannel>;
