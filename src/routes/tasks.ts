import { Router } from 'express';
import { z } from 'zod';
import { Task } from '../models/Task';
import { Team } from '../models/Team';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();

const createTaskSchema = z.object({
  teamId: z.string(),
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  assignee: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  storyPoints: z.number().nonnegative().default(0),
  dueDate: z.string().nullable().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').optional(),
  description: z.string().optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignee: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  storyPoints: z.number().nonnegative().optional(),
  dueDate: z.string().nullable().optional(),
});

// Helper check to verify if the user belongs to the team
async function userBelongsToTeam(userId: string, teamId: string): Promise<boolean> {
  const team = await Team.findOne({ _id: teamId, 'members.user': userId });
  return !!team;
}

// @route   GET /api/tasks
// @desc    Get tasks for a specific team
router.get('/', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { teamId } = req.query;
    if (!teamId || typeof teamId !== 'string') {
      return res.status(400).json({ error: 'teamId query parameter is required' });
    }

    if (!(await userBelongsToTeam(req.userId!, teamId))) {
      return res.status(403).json({ error: 'Access denied to this team' });
    }

    const tasks = await Task.find({ teamId })
      .populate('assignee', 'name email avatarUrl')
      .populate('milestoneId', 'title status')
      .sort({ updatedAt: -1 });

    return res.status(200).json(tasks);
  } catch (error) {
    console.error('Fetch tasks error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/tasks
// @desc    Create a new task
router.post('/', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const body = createTaskSchema.parse(req.body);

    if (!(await userBelongsToTeam(req.userId!, body.teamId))) {
      return res.status(403).json({ error: 'Access denied to this team' });
    }

    const task = new Task({
      teamId: body.teamId,
      title: body.title,
      description: body.description || '',
      status: body.status,
      priority: body.priority,
      assignee: body.assignee || null,
      milestoneId: body.milestoneId || null,
      storyPoints: body.storyPoints,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    });

    await task.save();
    
    const populated = await Task.findById(task._id)
      .populate('assignee', 'name email avatarUrl')
      .populate('milestoneId', 'title status');

    return res.status(201).json(populated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create task error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/tasks/:taskId
// @desc    Update an existing task
router.put('/:taskId', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { taskId } = req.params;
    const body = updateTaskSchema.parse(req.body);

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!(await userBelongsToTeam(req.userId!, task.teamId.toString()))) {
      return res.status(403).json({ error: 'Access denied to this team' });
    }

    // Apply updates
    if (body.title !== undefined) task.title = body.title;
    if (body.description !== undefined) task.description = body.description;
    if (body.status !== undefined) task.status = body.status;
    if (body.priority !== undefined) task.priority = body.priority;
    if (body.assignee !== undefined) task.assignee = body.assignee as any;
    if (body.milestoneId !== undefined) task.milestoneId = body.milestoneId as any;
    if (body.storyPoints !== undefined) task.storyPoints = body.storyPoints;
    if (body.dueDate !== undefined) task.dueDate = body.dueDate ? new Date(body.dueDate) : undefined;

    await task.save();

    const populated = await Task.findById(task._id)
      .populate('assignee', 'name email avatarUrl')
      .populate('milestoneId', 'title status');

    return res.status(200).json(populated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update task error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/tasks/:taskId
// @desc    Delete a task
router.delete('/:taskId', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { taskId } = req.params;
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!(await userBelongsToTeam(req.userId!, task.teamId.toString()))) {
      return res.status(403).json({ error: 'Access denied to this team' });
    }

    await task.deleteOne();

    return res.status(200).json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
