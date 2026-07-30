"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
const socket_io_1 = require("socket.io");
const mongoose_1 = __importDefault(require("mongoose"));
const Message_1 = require("./models/Message");
const Team_1 = require("./models/Team");
function initSocket(server) {
    const io = new socket_io_1.Server(server, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
    });
    const activeCalls = new Map(); // teamId -> ActiveCall
    async function endCallSession(teamId) {
        const call = activeCalls.get(teamId);
        if (!call)
            return;
        activeCalls.delete(teamId);
        const now = new Date();
        const duration = call.connectedAt
            ? Math.round((now.getTime() - call.connectedAt.getTime()) / 1000)
            : 0;
        try {
            const msgText = duration > 0
                ? `Call ended · ${duration}s`
                : `Call missed`;
            const msg = await Message_1.Message.create({
                teamId: call.teamId,
                sender: call.callerUserId,
                text: msgText,
                isCallHistory: true,
                callHistory: {
                    callType: call.callType,
                    duration,
                    joinedParticipants: Array.from(call.participants),
                    startedAt: call.startedAt,
                    endedAt: now,
                }
            });
            const populated = await Message_1.Message.findById(msg._id)
                .populate('sender', 'name avatarUrl');
            io.to(call.teamId).emit('new_message', populated);
        }
        catch (err) {
            console.error('[Socket] Failed to save call history message:', err);
        }
    }
    // Track which socket belongs to which user+team
    io.on('connection', (socket) => {
        console.log(`[Socket] connected: ${socket.id}`);
        // ── Room Management ──────────────────────────────────────────────────────
        socket.on('join_room', async ({ teamId, userId, userName }) => {
            // Authorization Check: only if DB is connected (so E2E tests run in isolation can bypass this check)
            if (mongoose_1.default.connection.readyState === 1) {
                try {
                    const team = await Team_1.Team.findOne({ _id: teamId, 'members.user': userId });
                    if (!team) {
                        console.warn(`[Socket] Unauthorized join attempt by user ${userId} to team ${teamId}`);
                        socket.emit('error', { message: 'Access denied: You are not a member of this team' });
                        return;
                    }
                }
                catch (err) {
                    console.error('[Socket] join_room auth check error:', err);
                    socket.emit('error', { message: 'Database validation failed' });
                    return;
                }
            }
            // Leave all previous rooms first (other than socket's own room)
            const prevRooms = Array.from(socket.rooms).filter(r => r !== socket.id);
            prevRooms.forEach(r => socket.leave(r));
            socket.join(teamId);
            socket.data.teamId = teamId;
            socket.data.userId = userId;
            socket.data.userName = userName;
            // Notify others in room
            socket.to(teamId).emit('user_joined', { userId, userName });
        });
        socket.on('leave_room', ({ teamId }) => {
            socket.leave(teamId);
            socket.to(teamId).emit('user_left', { userId: socket.data.userId, userName: socket.data.userName });
        });
        // ── Messaging ────────────────────────────────────────────────────────────
        socket.on('send_message', async (data) => {
            try {
                // Authorization Check
                if (mongoose_1.default.connection.readyState === 1) {
                    const team = await Team_1.Team.findOne({ _id: data.teamId, 'members.user': data.senderId });
                    if (!team) {
                        console.warn(`[Socket] Unauthorized send_message attempt by user ${data.senderId} to team ${data.teamId}`);
                        socket.emit('message_error', { error: 'Access denied: You are not a member of this team' });
                        return;
                    }
                }
                const msg = await Message_1.Message.create({
                    teamId: data.teamId,
                    sender: data.senderId,
                    text: data.text || '',
                    attachments: data.attachments || [],
                });
                const populated = await Message_1.Message.findById(msg._id)
                    .populate('sender', 'name avatarUrl');
                io.to(data.teamId).emit('new_message', populated);
            }
            catch (err) {
                console.error('[Socket] send_message error:', err);
                socket.emit('message_error', { error: 'Failed to send message' });
            }
        });
        // ── Typing Indicators ────────────────────────────────────────────────────
        socket.on('typing_start', ({ teamId, userName }) => {
            if (socket.data.teamId !== teamId)
                return;
            socket.to(teamId).emit('user_typing', { userName, userId: socket.data.userId });
        });
        socket.on('typing_stop', ({ teamId }) => {
            if (socket.data.teamId !== teamId)
                return;
            socket.to(teamId).emit('user_stopped_typing', { userId: socket.data.userId });
        });
        // ── WebRTC Call Signaling ─────────────────────────────────────────────────
        // Initiate a call to everyone in the room
        socket.on('call_user', ({ teamId, callerName, callType }) => {
            if (socket.data.teamId !== teamId)
                return;
            // Initialize the call session
            const name = callerName || socket.data.userName || 'Unknown';
            activeCalls.set(teamId, {
                teamId,
                callType,
                callerId: socket.id,
                callerUserId: socket.data.userId,
                callerName: name,
                startedAt: new Date(),
                participants: new Set([name]),
                socketToUser: new Map([[socket.id, { userId: socket.data.userId, userName: name }]]),
            });
            socket.to(teamId).emit('incoming_call', {
                from: socket.id,
                callerName: name,
                callType,
            });
        });
        // Accept a call — send back answer signal to caller
        socket.on('call_accepted', ({ to, callerName }) => {
            const targetSocket = io.sockets.sockets.get(to);
            if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
                io.to(to).emit('call_accepted', { from: socket.id, callerName });
                const call = activeCalls.get(socket.data.teamId);
                if (call) {
                    if (!call.connectedAt) {
                        call.connectedAt = new Date();
                    }
                    const name = callerName || socket.data.userName || 'Unknown';
                    call.participants.add(name);
                    call.socketToUser.set(socket.id, { userId: socket.data.userId, userName: name });
                }
            }
        });
        // Decline a call
        socket.on('call_rejected', async ({ to }) => {
            const targetSocket = io.sockets.sockets.get(to);
            if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
                io.to(to).emit('call_rejected', { from: socket.id });
            }
            // If a call is declined and no connection occurred, end the session
            await endCallSession(socket.data.teamId);
        });
        // Relay SDP offer (after call accepted, initiator sends offer)
        socket.on('webrtc_offer', ({ to, sdp }) => {
            const targetSocket = io.sockets.sockets.get(to);
            if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
                io.to(to).emit('webrtc_offer', { from: socket.id, sdp });
            }
        });
        // Relay SDP answer (recipient sends answer back)
        socket.on('webrtc_answer', ({ to, sdp }) => {
            const targetSocket = io.sockets.sockets.get(to);
            if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
                io.to(to).emit('webrtc_answer', { from: socket.id, sdp });
            }
        });
        // Relay ICE candidates
        socket.on('webrtc_ice_candidate', ({ to, candidate }) => {
            const targetSocket = io.sockets.sockets.get(to);
            if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
                io.to(to).emit('webrtc_ice_candidate', { from: socket.id, candidate });
            }
        });
        // End call — notify everyone in the room
        socket.on('call_ended', async ({ teamId }) => {
            if (socket.data.teamId !== teamId)
                return;
            io.to(teamId).emit('call_ended', { from: socket.id });
            await endCallSession(teamId);
        });
        // ── Disconnect ───────────────────────────────────────────────────────────
        socket.on('disconnect', async () => {
            console.log(`[Socket] disconnected: ${socket.id}`);
            if (socket.data.teamId) {
                socket.to(socket.data.teamId).emit('user_left', {
                    userId: socket.data.userId,
                    userName: socket.data.userName,
                });
                // If this socket was a participant in an active call, end the call
                const call = activeCalls.get(socket.data.teamId);
                if (call && call.socketToUser.has(socket.id)) {
                    socket.to(socket.data.teamId).emit('call_ended', { from: socket.id });
                    await endCallSession(socket.data.teamId);
                }
            }
        });
    });
    return io;
}
