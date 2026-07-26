"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const Standup_1 = require("../models/Standup");
const Team_1 = require("../models/Team");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const postStandupSchema = zod_1.z.object({
    teamId: zod_1.z.string(),
    yesterday: zod_1.z.string().min(1, 'Field "Yesterday" is required'),
    today: zod_1.z.string().min(1, 'Field "Today" is required'),
    blockers: zod_1.z.string().optional(),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});
// Helper check
async function userBelongsToTeam(userId, teamId) {
    const team = await Team_1.Team.findOne({ _id: teamId, 'members.user': userId });
    return !!team;
}
// @route   GET /api/standups
// @desc    Get all standups for a team on a specific date (YYYY-MM-DD)
router.get('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { teamId, date } = req.query;
        if (!teamId || typeof teamId !== 'string') {
            return res.status(400).json({ error: 'teamId query parameter is required' });
        }
        if (!date || typeof date !== 'string') {
            return res.status(400).json({ error: 'date query parameter (YYYY-MM-DD) is required' });
        }
        if (!(await userBelongsToTeam(req.userId, teamId))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const standups = await Standup_1.Standup.find({ teamId, date })
            .populate('userId', 'name email avatarUrl')
            .sort({ createdAt: -1 });
        return res.status(200).json(standups);
    }
    catch (error) {
        console.error('Fetch standups error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// @route   POST /api/standups
// @desc    Post or update user's daily standup
router.post('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const body = postStandupSchema.parse(req.body);
        if (!(await userBelongsToTeam(req.userId, body.teamId))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Upsert the standup log for this user on this day
        const filter = {
            teamId: body.teamId,
            userId: req.userId,
            date: body.date,
        };
        const update = {
            yesterday: body.yesterday,
            today: body.today,
            blockers: body.blockers || '',
        };
        const standup = await Standup_1.Standup.findOneAndUpdate(filter, update, {
            new: true,
            upsert: true,
            runValidators: true,
        }).populate('userId', 'name email avatarUrl');
        return res.status(200).json(standup);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Submit standup error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
