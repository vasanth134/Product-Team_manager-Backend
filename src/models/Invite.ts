import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInvite extends Document {
  email: string;
  team: mongoose.Types.ObjectId;
  role: 'admin' | 'member';
  token: string;
  invitedBy: mongoose.Types.ObjectId;
  status: 'pending' | 'accepted';
  createdAt: Date;
}

const InviteSchema = new Schema<IInvite>({
  email: { type: String, required: true, index: true },
  team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
  token: { type: String, required: true, unique: true, index: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
  createdAt: { type: Date, default: Date.now, expires: 604800 } // 7 days TTL
}, { timestamps: true });

export const Invite = (mongoose.models.Invite || mongoose.model<IInvite>('Invite', InviteSchema)) as Model<IInvite>;
