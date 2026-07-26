import mongoose, { Schema, Document } from 'mongoose';

export interface ITask extends Document {
  teamId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee?: mongoose.Types.ObjectId;
  milestoneId?: mongoose.Types.ObjectId;
  storyPoints: number;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], default: 'todo' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  milestoneId: { type: Schema.Types.ObjectId, ref: 'Milestone', default: null },
  storyPoints: { type: Number, default: 0 },
  dueDate: { type: Date, default: null }
}, { timestamps: true });

export const Task = mongoose.model<ITask>('Task', TaskSchema);
