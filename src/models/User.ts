import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  role?: string;
  pushSubscriptions?: IPushSubscription[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  avatarUrl: { type: String, default: '' },
  role: { type: String, default: 'Developer' },
  pushSubscriptions: [{
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    }
  }]
}, { timestamps: true });

export const User = (mongoose.models.User || mongoose.model<IUser>('User', UserSchema)) as Model<IUser>;
