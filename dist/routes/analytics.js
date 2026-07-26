"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Task_1 = require("../models/Task");
const Team_1 = require("../models/Team");
const Milestone_1 = require("../models/Milestone");
const Standup_1 = require("../models/Standup");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Helper check
async function userBelongsToTeam(userId, teamId) {
    const team = await Team_1.Team.findOne({ _id: teamId, 'members.user': userId });
    return !!team;
}
// @route   GET /api/analytics
// @desc    Get dashboard analytics for a team
router.get('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { teamId } = req.query;
        if (!teamId || typeof teamId !== 'string') {
            return res.status(400).json({ error: 'teamId query parameter is required' });
        }
        if (!(await userBelongsToTeam(req.userId, teamId))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // 1. Fetch team members to compute workload
        const team = await Team_1.Team.findById(teamId).populate('members.user', 'name email avatarUrl');
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        // 2. Fetch all tasks for the team
        const tasks = await Task_1.Task.find({ teamId });
        // 3. Status Distribution
        const statusCounts = {
            backlog: 0,
            todo: 0,
            in_progress: 0,
            review: 0,
            done: 0,
        };
        // Priority Distribution
        const priorityCounts = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0,
        };
        let totalPoints = 0;
        let completedPoints = 0;
        tasks.forEach(task => {
            if (task.status in statusCounts) {
                statusCounts[task.status]++;
            }
            if (task.priority in priorityCounts) {
                priorityCounts[task.priority]++;
            }
            totalPoints += task.storyPoints || 0;
            if (task.status === 'done') {
                completedPoints += task.storyPoints || 0;
            }
        });
        // 4. Team Workload Mapping
        const workload = team.members.map(member => {
            const user = member.user;
            const userTasks = tasks.filter(t => t.assignee && t.assignee.toString() === user._id.toString());
            const openTasks = userTasks.filter(t => t.status !== 'done').length;
            const completedTasks = userTasks.filter(t => t.status === 'done').length;
            const pointsAssigned = userTasks.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
            return {
                userId: user._id,
                name: user.name,
                avatarUrl: user.avatarUrl,
                openTasks,
                completedTasks,
                pointsAssigned,
            };
        });
        // 5. Milestone Completion Rates
        const milestones = await Milestone_1.Milestone.find({ teamId });
        const milestoneStats = milestones.map(m => {
            const msTasks = tasks.filter(t => t.milestoneId && t.milestoneId.toString() === m._id.toString());
            const total = msTasks.length;
            const completed = msTasks.filter(t => t.status === 'done').length;
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
            return {
                id: m._id,
                title: m.title,
                status: m.status,
                totalTasks: total,
                completedTasks: completed,
                completionPercentage: percentage,
            };
        });
        // 6. Today's Standup Completion
        const todayStr = new Date().toISOString().split('T')[0];
        const todayStandups = await Standup_1.Standup.find({ teamId, date: todayStr });
        const standupSubmissionRate = {
            submitted: todayStandups.length,
            total: team.members.length,
            percentage: team.members.length > 0 ? Math.round((todayStandups.length / team.members.length) * 100) : 0,
        };
        return res.status(200).json({
            summary: {
                totalTasks: tasks.length,
                completedTasks: statusCounts.done,
                completionRate: tasks.length > 0 ? Math.round((statusCounts.done / tasks.length) * 100) : 0,
                totalPoints,
                completedPoints,
                pointsCompletionRate: totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0,
            },
            statusCounts,
            priorityCounts,
            workload,
            milestones: milestoneStats,
            standupsToday: standupSubmissionRate,
        });
    }
    catch (error) {
        console.error('Fetch analytics error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
