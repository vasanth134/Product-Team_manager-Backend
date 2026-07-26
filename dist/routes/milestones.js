"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const Milestone_1 = require("../models/Milestone");
const Team_1 = require("../models/Team");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const createMilestoneSchema = zod_1.z.object({
    teamId: zod_1.z.string(),
    title: zod_1.z.string().min(1, 'Milestone title is required'),
    description: zod_1.z.string().optional(),
    startDate: zod_1.z.string(),
    endDate: zod_1.z.string(),
    status: zod_1.z.enum(['planned', 'active', 'completed']).default('planned'),
});
const updateMilestoneSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Milestone title is required').optional(),
    description: zod_1.z.string().optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    status: zod_1.z.enum(['planned', 'active', 'completed']).optional(),
});
// Helper check
async function userBelongsToTeam(userId, teamId) {
    const team = await Team_1.Team.findOne({ _id: teamId, 'members.user': userId });
    return !!team;
}
// @route   GET /api/milestones
router.get('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { teamId } = req.query;
        if (!teamId || typeof teamId !== 'string') {
            return res.status(400).json({ error: 'teamId query parameter is required' });
        }
        if (!(await userBelongsToTeam(req.userId, teamId))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const milestones = await Milestone_1.Milestone.find({ teamId }).sort({ startDate: 1 });
        return res.status(200).json(milestones);
    }
    catch (error) {
        console.error('Fetch milestones error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// @route   POST /api/milestones
router.post('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const body = createMilestoneSchema.parse(req.body);
        if (!(await userBelongsToTeam(req.userId, body.teamId))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const milestone = new Milestone_1.Milestone({
            teamId: body.teamId,
            title: body.title,
            description: body.description || '',
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
            status: body.status,
        });
        await milestone.save();
        return res.status(201).json(milestone);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Create milestone error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// @route   PUT /api/milestones/:milestoneId
router.put('/:milestoneId', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { milestoneId } = req.params;
        const body = updateMilestoneSchema.parse(req.body);
        const milestone = await Milestone_1.Milestone.findById(milestoneId);
        if (!milestone) {
            return res.status(404).json({ error: 'Milestone not found' });
        }
        if (!(await userBelongsToTeam(req.userId, milestone.teamId.toString()))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (body.title !== undefined)
            milestone.title = body.title;
        if (body.description !== undefined)
            milestone.description = body.description;
        if (body.startDate !== undefined)
            milestone.startDate = new Date(body.startDate);
        if (body.endDate !== undefined)
            milestone.endDate = new Date(body.endDate);
        if (body.status !== undefined)
            milestone.status = body.status;
        await milestone.save();
        return res.status(200).json(milestone);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Update milestone error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// @route   DELETE /api/milestones/:milestoneId
router.delete('/:milestoneId', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { milestoneId } = req.params;
        const milestone = await Milestone_1.Milestone.findById(milestoneId);
        if (!milestone) {
            return res.status(404).json({ error: 'Milestone not found' });
        }
        if (!(await userBelongsToTeam(req.userId, milestone.teamId.toString()))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await milestone.deleteOne();
        return res.status(200).json({ success: true, message: 'Milestone deleted successfully' });
    }
    catch (error) {
        console.error('Delete milestone error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
