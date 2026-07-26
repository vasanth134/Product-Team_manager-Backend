import mongoose, { Schema, Document } from 'mongoose';

export interface IMilestone extends Document {
  teamId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  status: 'planned' | 'active' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<IMilestone>({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ['planned', 'active', 'completed'], default: 'planned' }
}, { timestamps: true });

export const Milestone = mongoose.model<IMilestone>('Milestone', MilestoneSchema);
