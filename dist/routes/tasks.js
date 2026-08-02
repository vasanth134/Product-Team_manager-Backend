"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const Task_1 = require("../models/Task");
const Team_1 = require("../models/Team");
const auth_1 = require("../middleware/auth");
const webPush_1 = require("../utils/webPush");
const router = (0, express_1.Router)();
const createTaskSchema = zod_1.z.object({
    teamId: zod_1.z.string(),
    title: zod_1.z.string().min(1, 'Task title is required'),
    description: zod_1.z.string().optional(),
    status: zod_1.z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).default('todo'),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    assignee: zod_1.z.string().nullable().optional(),
    milestoneId: zod_1.z.string().nullable().optional(),
    storyPoints: zod_1.z.number().nonnegative().default(0),
    dueDate: zod_1.z.string().nullable().optional(),
});
const updateTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Task title is required').optional(),
    description: zod_1.z.string().optional(),
    status: zod_1.z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'critical']).optional(),
    assignee: zod_1.z.string().nullable().optional(),
    milestoneId: zod_1.z.string().nullable().optional(),
    storyPoints: zod_1.z.number().nonnegative().optional(),
    dueDate: zod_1.z.string().nullable().optional(),
});
// Helper check to verify if the user belongs to the team
async function userBelongsToTeam(userId, teamId) {
    const team = await Team_1.Team.findOne({ _id: teamId, 'members.user': userId });
    return !!team;
}
// @route   GET /api/tasks
// @desc    Get tasks for a specific team
router.get('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { teamId } = req.query;
        if (!teamId || typeof teamId !== 'string') {
            return res.status(400).json({ error: 'teamId query parameter is required' });
        }
        if (!(await userBelongsToTeam(req.userId, teamId))) {
            return res.status(403).json({ error: 'Access denied to this team' });
        }
        const tasks = await Task_1.Task.find({ teamId })
            .populate('assignee', 'name email avatarUrl')
            .populate('milestoneId', 'title status')
            .sort({ updatedAt: -1 });
        return res.status(200).json(tasks);
    }
    catch (error) {
        console.error('Fetch tasks error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// @route   POST /api/tasks
// @desc    Create a new task
router.post('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const body = createTaskSchema.parse(req.body);
        if (!(await userBelongsToTeam(req.userId, body.teamId))) {
            return res.status(403).json({ error: 'Access denied to this team' });
        }
        const task = new Task_1.Task({
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
        const populated = await Task_1.Task.findById(task._id)
            .populate('assignee', 'name email avatarUrl')
            .populate('milestoneId', 'title status');
        if (task.assignee && task.assignee.toString() !== req.userId) {
            (0, webPush_1.sendPushNotification)(task.assignee.toString(), {
                title: 'New Task Assigned',
                body: `You have been assigned: "${task.title}"`,
                data: {
                    taskId: task._id,
                    url: `/`
                }
            }).catch(pErr => console.error('[Push] Task assign notification failed:', pErr));
        }
        return res.status(201).json(populated);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Create task error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// @route   PUT /api/tasks/:taskId
// @desc    Update an existing task
router.put('/:taskId', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { taskId } = req.params;
        const body = updateTaskSchema.parse(req.body);
        const task = await Task_1.Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        if (!(await userBelongsToTeam(req.userId, task.teamId.toString()))) {
            return res.status(403).json({ error: 'Access denied to this team' });
        }
        // Apply updates
        const originalAssignee = task.assignee?.toString() || null;
        if (body.title !== undefined)
            task.title = body.title;
        if (body.description !== undefined)
            task.description = body.description;
        if (body.status !== undefined)
            task.status = body.status;
        if (body.priority !== undefined)
            task.priority = body.priority;
        if (body.assignee !== undefined)
            task.assignee = body.assignee;
        if (body.milestoneId !== undefined)
            task.milestoneId = body.milestoneId;
        if (body.storyPoints !== undefined)
            task.storyPoints = body.storyPoints;
        if (body.dueDate !== undefined)
            task.dueDate = body.dueDate ? new Date(body.dueDate) : undefined;
        await task.save();
        const populated = await Task_1.Task.findById(task._id)
            .populate('assignee', 'name email avatarUrl')
            .populate('milestoneId', 'title status');
        const newAssignee = task.assignee?.toString() || null;
        if (newAssignee && newAssignee !== req.userId && newAssignee !== originalAssignee) {
            (0, webPush_1.sendPushNotification)(newAssignee, {
                title: 'Task Assigned to You',
                body: `Task assigned: "${task.title}"`,
                data: {
                    taskId: task._id,
                    url: `/`
                }
            }).catch(pErr => console.error('[Push] Task assign notification failed:', pErr));
        }
        return res.status(200).json(populated);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Update task error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// @route   DELETE /api/tasks/:taskId
// @desc    Delete a task
router.delete('/:taskId', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await Task_1.Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        if (!(await userBelongsToTeam(req.userId, task.teamId.toString()))) {
            return res.status(403).json({ error: 'Access denied to this team' });
        }
        await task.deleteOne();
        return res.status(200).json({ success: true, message: 'Task deleted successfully' });
    }
    catch (error) {
        console.error('Delete task error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
