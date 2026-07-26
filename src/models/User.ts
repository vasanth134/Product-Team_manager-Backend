import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  role?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  avatarUrl: { type: String, default: '' },
  role: { type: String, default: 'Developer' },
}, { timestamps: true });

export const User = (mongoose.models.User || mongoose.model<IUser>('User', UserSchema)) as Model<IUser>;
