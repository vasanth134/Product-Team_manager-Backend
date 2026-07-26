"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const Team_1 = require("../models/Team");
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const createTeamSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Team name must be at least 2 characters'),
    description: zod_1.z.string().optional(),
});
const inviteMemberSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    role: zod_1.z.enum(['admin', 'member']).default('member'),
});
// @route   GET /api/teams
// @desc    Get all teams for logged in user
router.get('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const teams = await Team_1.Team.find({
            'members.user': req.userId
        }).populate('members.user', 'name email avatarUrl');
        return res.status(200).json(teams);
    }
    catch (error) {
        console.error('Fetch teams error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// @route   POST /api/teams
// @desc    Create a new team
router.post('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const body = createTeamSchema.parse(req.body);
        const newTeam = new Team_1.Team({
            name: body.name,
            description: body.description || '',
            owner: req.userId,
            members: [{
                    user: req.userId,
                    role: 'owner'
                }]
        });
        await newTeam.save();
        // Populate owner info
        const populatedTeam = await Team_1.Team.findById(newTeam._id).populate('members.user', 'name email avatarUrl');
        return res.status(201).json(populatedTeam);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Create team error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// @route   POST /api/teams/:teamId/invite
// @desc    Invite a user to the team by email
router.post('/:teamId/invite', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { teamId } = req.params;
        const body = inviteMemberSchema.parse(req.body);
        const team = await Team_1.Team.findById(teamId);
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        // Check if user is owner or admin in this team
        const requesterRole = team.members.find(m => m.user.toString() === req.userId)?.role;
        if (requesterRole !== 'owner' && requesterRole !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized to invite members to this team' });
        }
        // Find the user to invite
        const userToInvite = await User_1.User.findOne({ email: body.email.toLowerCase() });
        if (!userToInvite) {
            return res.status(404).json({ error: 'User with this email not found. Make sure they have registered.' });
        }
        // Check if user is already in the team
        const isAlreadyMember = team.members.some(m => m.user.toString() === userToInvite._id.toString());
        if (isAlreadyMember) {
            return res.status(400).json({ error: 'User is already a member of this team' });
        }
        // Add user to team
        team.members.push({
            user: userToInvite._id,
            role: body.role
        });
        await team.save();
        const updatedTeam = await Team_1.Team.findById(teamId).populate('members.user', 'name email avatarUrl');
        return res.status(200).json(updatedTeam);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Invite member error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
