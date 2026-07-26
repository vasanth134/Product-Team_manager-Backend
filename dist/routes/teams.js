"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const crypto_1 = __importDefault(require("crypto"));
const Team_1 = require("../models/Team");
const User_1 = require("../models/User");
const Invite_1 = require("../models/Invite");
const auth_1 = require("../middleware/auth");
const mailer_1 = require("../utils/mailer");
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
// @desc    Invite a user to the team by email, sending a magic login link
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
        const email = body.email.toLowerCase();
        // Check if user is already in the team (if they exist)
        const existingUser = await User_1.User.findOne({ email });
        if (existingUser) {
            const isAlreadyMember = team.members.some(m => m.user.toString() === existingUser._id.toString());
            if (isAlreadyMember) {
                return res.status(400).json({ error: 'User is already a member of this team' });
            }
        }
        // Generate unique token
        const token = crypto_1.default.randomBytes(32).toString('hex');
        // Save Invite record (upsert if pending invite already exists)
        await Invite_1.Invite.findOneAndUpdate({ email, team: team._id, status: 'pending' }, {
            email,
            team: team._id,
            role: body.role,
            token,
            invitedBy: req.userId,
        }, { upsert: true, new: true });
        // Send email invitation
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        const inviteLink = `${clientUrl}/?inviteToken=${token}`;
        const inviter = await User_1.User.findById(req.userId);
        const inviterName = inviter ? inviter.name : 'A team manager';
        await (0, mailer_1.sendInviteEmail)(email, team.name, inviterName, inviteLink);
        return res.status(200).json({
            message: 'Invitation sent successfully',
            inviteLink,
            team: await Team_1.Team.findById(teamId).populate('members.user', 'name email avatarUrl')
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Invite error:', error);
        return res.status(500).json({ error: 'Server error during invite' });
    }
});
// @route   GET /api/teams/invites/details/:token
// @desc    Public endpoint to view invite details
router.get('/invites/details/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const invite = await Invite_1.Invite.findOne({ token, status: 'pending' })
            .populate('team', 'name description')
            .populate('invitedBy', 'name');
        if (!invite) {
            return res.status(404).json({ error: 'Invitation link is invalid or has expired' });
        }
        return res.status(200).json({
            email: invite.email,
            teamId: invite.team._id,
            teamName: invite.team.name,
            teamDescription: invite.team.description,
            inviterName: invite.invitedBy.name,
            role: invite.role,
        });
    }
    catch (error) {
        console.error('Invite lookup error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// @route   POST /api/teams/invites/accept
// @desc    Authenticated endpoint to accept invitation
router.post('/invites/accept', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }
        const invite = await Invite_1.Invite.findOne({ token, status: 'pending' });
        if (!invite) {
            return res.status(404).json({ error: 'Invitation link is invalid or has expired' });
        }
        const currentUser = await User_1.User.findById(req.userId);
        if (!currentUser) {
            return res.status(404).json({ error: 'Authenticated user not found' });
        }
        // Verify invited email matches logged in email
        if (currentUser.email.toLowerCase() !== invite.email.toLowerCase()) {
            return res.status(400).json({
                error: `Invitation was sent to ${invite.email}, but you are logged in as ${currentUser.email}. Please switch accounts.`
            });
        }
        const team = await Team_1.Team.findById(invite.team);
        if (!team) {
            return res.status(404).json({ error: 'Team no longer exists' });
        }
        // Add user if not already in team
        const isMember = team.members.some(m => m.user.toString() === currentUser._id.toString());
        if (!isMember) {
            team.members.push({
                user: currentUser._id,
                role: invite.role
            });
            await team.save();
        }
        invite.status = 'accepted';
        await invite.save();
        const populatedTeam = await Team_1.Team.findById(team._id).populate('members.user', 'name email avatarUrl');
        return res.status(200).json(populatedTeam);
    }
    catch (error) {
        console.error('Accept invite error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
