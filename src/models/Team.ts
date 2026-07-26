import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITeamMember {
  user: mongoose.Types.ObjectId;
  role: 'owner' | 'admin' | 'member';
}

export interface ITeam extends Document {
  name: string;
  description: string;
  owner: mongoose.Types.ObjectId;
  members: ITeamMember[];
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' }
  }]
}, { timestamps: true });

export const Team = (mongoose.models.Team || mongoose.model<ITeam>('Team', TeamSchema)) as Model<ITeam>;
