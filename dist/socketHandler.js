"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
const socket_io_1 = require("socket.io");
const Message_1 = require("./models/Message");
function initSocket(server) {
    const io = new socket_io_1.Server(server, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
    });
    // Track which socket belongs to which user+team
    io.on('connection', (socket) => {
        console.log(`[Socket] connected: ${socket.id}`);
        // ── Room Management ──────────────────────────────────────────────────────
        socket.on('join_room', ({ teamId, userId, userName }) => {
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
            socket.to(teamId).emit('user_typing', { userName, userId: socket.data.userId });
        });
        socket.on('typing_stop', ({ teamId }) => {
            socket.to(teamId).emit('user_stopped_typing', { userId: socket.data.userId });
        });
        // ── WebRTC Call Signaling ─────────────────────────────────────────────────
        // Initiate a call to everyone in the room
        socket.on('call_user', ({ teamId, callerName, callType }) => {
            socket.to(teamId).emit('incoming_call', {
                from: socket.id,
                callerName,
                callType,
            });
        });
        // Accept a call — send back answer signal to caller
        socket.on('call_accepted', ({ to, callerName }) => {
            io.to(to).emit('call_accepted', { from: socket.id, callerName });
        });
        // Decline a call
        socket.on('call_rejected', ({ to }) => {
            io.to(to).emit('call_rejected', { from: socket.id });
        });
        // Relay SDP offer (after call accepted, initiator sends offer)
        socket.on('webrtc_offer', ({ to, sdp }) => {
            io.to(to).emit('webrtc_offer', { from: socket.id, sdp });
        });
        // Relay SDP answer (recipient sends answer back)
        socket.on('webrtc_answer', ({ to, sdp }) => {
            io.to(to).emit('webrtc_answer', { from: socket.id, sdp });
        });
        // Relay ICE candidates
        socket.on('webrtc_ice_candidate', ({ to, candidate }) => {
            io.to(to).emit('webrtc_ice_candidate', { from: socket.id, candidate });
        });
        // End call — notify everyone in the room
        socket.on('call_ended', ({ teamId }) => {
            io.to(teamId).emit('call_ended', { from: socket.id });
        });
        // ── Disconnect ───────────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            console.log(`[Socket] disconnected: ${socket.id}`);
            if (socket.data.teamId) {
                socket.to(socket.data.teamId).emit('user_left', {
                    userId: socket.data.userId,
                    userName: socket.data.userName,
                });
                // Also end any active call
                socket.to(socket.data.teamId).emit('call_ended', { from: socket.id });
            }
        });
    });
    return io;
}
