import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { Team } from '../models/Team';
import { User } from '../models/User';
import { Invite } from '../models/Invite';
import { Task } from '../models/Task';
import { Milestone } from '../models/Milestone';
import { Standup } from '../models/Standup';
import { Message } from '../models/Message';
import { Channel } from '../models/Channel';
import { authenticateJWT } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { sendInviteEmail } from '../utils/mailer';

const router = Router();

const createTeamSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters'),
  description: z.string().optional(),
});

const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member']).default('member'),
});

// @route   GET /api/teams
// @desc    Get all teams for logged in user
router.get('/', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const teams = await Team.find({
      'members.user': req.userId
    }).populate('members.user', 'name email avatarUrl');
    
    return res.status(200).json(teams);
  } catch (error) {
    console.error('Fetch teams error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/teams
// @desc    Create a new team
router.post('/', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const body = createTeamSchema.parse(req.body);
    
    const newTeam = new Team({
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
    const populatedTeam = await Team.findById(newTeam._id).populate('members.user', 'name email avatarUrl');

    return res.status(201).json(populatedTeam);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create team error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/teams/:teamId/invite
// @desc    Invite a user to the team by email, sending a magic login link
router.post('/:teamId/invite', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { teamId } = req.params;
    const body = inviteMemberSchema.parse(req.body);

    const team = await Team.findById(teamId);
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
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const isAlreadyMember = team.members.some(m => m.user.toString() === existingUser._id.toString());
      if (isAlreadyMember) {
        return res.status(400).json({ error: 'User is already a member of this team' });
      }
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Save Invite record (upsert if pending invite already exists)
    await Invite.findOneAndUpdate(
      { email, team: team._id, status: 'pending' },
      {
        email,
        team: team._id,
        role: body.role,
        token,
        invitedBy: req.userId as any,
      },
      { upsert: true, new: true }
    );

    // Send email invitation
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const inviteLink = `${clientUrl}/?inviteToken=${token}`;
    const inviter = await User.findById(req.userId);
    const inviterName = inviter ? inviter.name : 'A team manager';

    await sendInviteEmail(email, team.name, inviterName, inviteLink);

    return res.status(200).json({
      message: 'Invitation sent successfully',
      inviteLink,
      team: await Team.findById(teamId).populate('members.user', 'name email avatarUrl')
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Invite error:', error);
    return res.status(500).json({ error: 'Server error during invite' });
  }
});

// @route   GET /api/teams/invites/details/:token
// @desc    Public endpoint to view invite details
router.get('/invites/details/:token', async (req, res): Promise<any> => {
  try {
    const { token } = req.params;
    const invite = await Invite.findOne({ token, status: 'pending' })
      .populate('team', 'name description')
      .populate('invitedBy', 'name');

    if (!invite) {
      return res.status(404).json({ error: 'Invitation link is invalid or has expired' });
    }

    return res.status(200).json({
      email: invite.email,
      teamId: invite.team._id,
      teamName: (invite.team as any).name,
      teamDescription: (invite.team as any).description,
      inviterName: (invite.invitedBy as any).name,
      role: invite.role,
    });
  } catch (error) {
    console.error('Invite lookup error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/teams/invites/accept
// @desc    Authenticated endpoint to accept invitation
router.post('/invites/accept', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const invite = await Invite.findOne({ token, status: 'pending' });
    if (!invite) {
      return res.status(404).json({ error: 'Invitation link is invalid or has expired' });
    }

    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'Authenticated user not found' });
    }

    // Verify invited email matches logged in email
    if (currentUser.email.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(400).json({
        error: `Invitation was sent to ${invite.email}, but you are logged in as ${currentUser.email}. Please switch accounts.`
      });
    }

    const team = await Team.findById(invite.team);
    if (!team) {
      return res.status(404).json({ error: 'Team no longer exists' });
    }

    // Add user if not already in team
    const isMember = team.members.some(m => m.user.toString() === currentUser._id.toString());
    if (!isMember) {
      team.members.push({
        user: currentUser._id as any,
        role: invite.role
      });
      await team.save();
    }

    invite.status = 'accepted';
    await invite.save();

    const populatedTeam = await Team.findById(team._id).populate('members.user', 'name email avatarUrl');
    return res.status(200).json(populatedTeam);
  } catch (error) {
    console.error('Accept invite error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/teams/:teamId
// @desc    Delete a team (Only creator/owner can delete)
router.delete('/:teamId', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { teamId } = req.params;
    const team = await Team.findById(teamId);
    
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Only owner can delete the team
    if (team.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only the team creator (owner) can delete this team' });
    }

    // Delete associated data
    await Team.findByIdAndDelete(teamId);
    await Task.deleteMany({ teamId });
    await Milestone.deleteMany({ teamId });
    await Standup.deleteMany({ teamId });
    await Message.deleteMany({ teamId });
    await Invite.deleteMany({ team: teamId });

    return res.status(200).json({ message: 'Team and all associated data deleted successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    return res.status(500).json({ error: 'Server error during team deletion' });
  }
});

// @route   PUT /api/teams/:teamId/members/:userId
// @desc    Update a team member's role (owner or admin only)
router.put('/:teamId/members/:userId', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { teamId, userId } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check requester role (must be owner or admin)
    const requester = team.members.find(m => m.user.toString() === req.userId);
    if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized to manage team members' });
    }

    // Target member
    const targetMember = team.members.find(m => m.user.toString() === userId);
    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found in team' });
    }

    // Protect owner role
    if (targetMember.role === 'owner') {
      return res.status(400).json({ error: 'Cannot change the role of the team owner' });
    }

    // Update role
    targetMember.role = role;
    await team.save();

    const populatedTeam = await Team.findById(teamId).populate('members.user', 'name email avatarUrl');
    return res.status(200).json(populatedTeam);
  } catch (error) {
    console.error('Update member role error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/teams/:teamId/members/:userId
// @desc    Remove a member from the team (owner or admin only; admins cannot remove owners or other admins)
router.delete('/:teamId/members/:userId', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { teamId, userId } = req.params;
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check requester role (must be owner or admin)
    const requester = team.members.find(m => m.user.toString() === req.userId);
    if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized to manage team members' });
    }

    // Target member
    const targetMember = team.members.find(m => m.user.toString() === userId);
    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found in team' });
    }

    // Protect owner
    if (targetMember.role === 'owner') {
      return res.status(400).json({ error: 'Cannot remove the team owner' });
    }

    // Admins cannot remove other admins
    if (requester.role === 'admin' && targetMember.role === 'admin') {
      return res.status(403).json({ error: 'Admins cannot remove other admins' });
    }

    // Remove member
    team.members = team.members.filter(m => m.user.toString() !== userId) as any;
    await team.save();

    // Clean up assignee on any tasks for this team
    await Task.updateMany(
      { teamId, assignee: userId },
      { $set: { assignee: null } }
    );

    const populatedTeam = await Team.findById(teamId).populate('members.user', 'name email avatarUrl');
    return res.status(200).json(populatedTeam);
  } catch (error) {
    console.error('Remove member error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/teams/:teamId/invites
// @desc    Get all pending invites for the team (owner or admin only)
router.get('/:teamId/invites', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { teamId } = req.params;
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const requester = team.members.find(m => m.user.toString() === req.userId);
    if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const invites = await Invite.find({ team: teamId, status: 'pending' }).populate('invitedBy', 'name');
    return res.status(200).json(invites);
  } catch (error) {
    console.error('Get invites error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/teams/:teamId/invites/:inviteId
// @desc    Revoke/Cancel a pending invite (owner or admin only)
router.delete('/:teamId/invites/:inviteId', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { teamId, inviteId } = req.params;
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const requester = team.members.find(m => m.user.toString() === req.userId);
    if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await Invite.findOneAndDelete({ _id: inviteId, team: teamId });
    return res.status(200).json({ message: 'Invitation revoked successfully' });
  } catch (error) {
    console.error('Revoke invite error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/teams/:teamId/channels
// @desc    Get all channels in the team. Auto-creates a General channel if none exist.
router.get('/:teamId/channels', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { teamId } = req.params;
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const requester = team.members.find(m => m.user.toString() === req.userId);
    if (!requester) {
      return res.status(403).json({ error: 'Access denied: Not a member of this team' });
    }

    let channels = await Channel.find({ teamId });
    if (channels.length === 0) {
      const generalChannel = new Channel({
        name: 'General',
        description: 'Default general room for chat',
        teamId: team._id,
        createdBy: team.owner
      });
      await generalChannel.save();
      channels = [generalChannel];
    }

    return res.status(200).json(channels);
  } catch (error) {
    console.error('Get channels error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/teams/:teamId/channels
// @desc    Create a new channel in the team
router.post('/:teamId/channels', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { teamId } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Channel name is required' });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const requester = team.members.find(m => m.user.toString() === req.userId);
    if (!requester) {
      return res.status(403).json({ error: 'Access denied: Not a member of this team' });
    }

    const newChannel = new Channel({
      name: name.trim(),
      description: description || '',
      teamId: team._id,
      createdBy: req.userId
    });

    await newChannel.save();
    return res.status(201).json(newChannel);
  } catch (error) {
    console.error('Create channel error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
