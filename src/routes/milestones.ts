import { Router } from 'express';
import { z } from 'zod';
import { Milestone } from '../models/Milestone';
import { Team } from '../models/Team';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();

const createMilestoneSchema = z.object({
  teamId: z.string(),
  title: z.string().min(1, 'Milestone title is required'),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['planned', 'active', 'completed']).default('planned'),
});

const updateMilestoneSchema = z.object({
  title: z.string().min(1, 'Milestone title is required').optional(),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['planned', 'active', 'completed']).optional(),
});

// Helper check
async function userBelongsToTeam(userId: string, teamId: string): Promise<boolean> {
  const team = await Team.findOne({ _id: teamId, 'members.user': userId });
  return !!team;
}

// @route   GET /api/milestones
router.get('/', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { teamId } = req.query;
    if (!teamId || typeof teamId !== 'string') {
      return res.status(400).json({ error: 'teamId query parameter is required' });
    }

    if (!(await userBelongsToTeam(req.userId!, teamId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const milestones = await Milestone.find({ teamId }).sort({ startDate: 1 });
    return res.status(200).json(milestones);
  } catch (error) {
    console.error('Fetch milestones error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/milestones
router.post('/', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const body = createMilestoneSchema.parse(req.body);

    if (!(await userBelongsToTeam(req.userId!, body.teamId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const milestone = new Milestone({
      teamId: body.teamId,
      title: body.title,
      description: body.description || '',
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      status: body.status,
    });

    await milestone.save();
    return res.status(201).json(milestone);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create milestone error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/milestones/:milestoneId
router.put('/:milestoneId', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { milestoneId } = req.params;
    const body = updateMilestoneSchema.parse(req.body);

    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    if (!(await userBelongsToTeam(req.userId!, milestone.teamId.toString()))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (body.title !== undefined) milestone.title = body.title;
    if (body.description !== undefined) milestone.description = body.description;
    if (body.startDate !== undefined) milestone.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) milestone.endDate = new Date(body.endDate);
    if (body.status !== undefined) milestone.status = body.status;

    await milestone.save();
    return res.status(200).json(milestone);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update milestone error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/milestones/:milestoneId
router.delete('/:milestoneId', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { milestoneId } = req.params;
    const milestone = await Milestone.findById(milestoneId);

    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    if (!(await userBelongsToTeam(req.userId!, milestone.teamId.toString()))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await milestone.deleteOne();
    return res.status(200).json({ success: true, message: 'Milestone deleted successfully' });
  } catch (error) {
    console.error('Delete milestone error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
