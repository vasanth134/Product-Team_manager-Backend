import mongoose, { Schema, Document } from 'mongoose';

export interface IStandup extends Document {
  teamId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  yesterday: string;
  today: string;
  blockers: string;
  date: string; // Format: YYYY-MM-DD
  createdAt: Date;
  updatedAt: Date;
}

const StandupSchema = new Schema<IStandup>({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  yesterday: { type: String, required: true },
  today: { type: String, required: true },
  blockers: { type: String, default: '' },
  date: { type: String, required: true } // Format: YYYY-MM-DD
}, { timestamps: true });

// Avoid duplicate submissions per user, team, and date
StandupSchema.index({ teamId: 1, userId: 1, date: 1 }, { unique: true });

export const Standup = mongoose.model<IStandup>('Standup', StandupSchema);
