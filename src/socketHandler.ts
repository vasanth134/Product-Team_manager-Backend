import { Server } from 'socket.io';
import http from 'http';
import mongoose from 'mongoose';
import { Message } from './models/Message';
import { Team } from './models/Team';

export function initSocket(server: http.Server) {
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // Track which socket belongs to which user+team
  io.on('connection', (socket) => {
    console.log(`[Socket] connected: ${socket.id}`);

    // ── Room Management ──────────────────────────────────────────────────────
    socket.on('join_room', async ({ teamId, userId, userName }: { teamId: string; userId: string; userName: string }) => {
      // Authorization Check: only if DB is connected (so E2E tests run in isolation can bypass this check)
      if (mongoose.connection.readyState === 1) {
        try {
          const team = await Team.findOne({ _id: teamId, 'members.user': userId });
          if (!team) {
            console.warn(`[Socket] Unauthorized join attempt by user ${userId} to team ${teamId}`);
            socket.emit('error', { message: 'Access denied: You are not a member of this team' });
            return;
          }
        } catch (err) {
          console.error('[Socket] join_room auth check error:', err);
          socket.emit('error', { message: 'Database validation failed' });
          return;
        }
      }

      // Leave all previous rooms first (other than socket's own room)
      const prevRooms = Array.from(socket.rooms).filter(r => r !== socket.id);
      prevRooms.forEach(r => socket.leave(r));

      socket.join(teamId);
      socket.data.teamId  = teamId;
      socket.data.userId  = userId;
      socket.data.userName = userName;

      // Notify others in room
      socket.to(teamId).emit('user_joined', { userId, userName });
    });

    socket.on('leave_room', ({ teamId }: { teamId: string }) => {
      socket.leave(teamId);
      socket.to(teamId).emit('user_left', { userId: socket.data.userId, userName: socket.data.userName });
    });

    // ── Messaging ────────────────────────────────────────────────────────────
    socket.on('send_message', async (data: {
      teamId: string;
      senderId: string;
      text?: string;
      attachments?: { type: 'image' | 'audio'; url: string; name?: string }[];
    }) => {
      try {
        // Authorization Check
        if (mongoose.connection.readyState === 1) {
          const team = await Team.findOne({ _id: data.teamId, 'members.user': data.senderId });
          if (!team) {
            console.warn(`[Socket] Unauthorized send_message attempt by user ${data.senderId} to team ${data.teamId}`);
            socket.emit('message_error', { error: 'Access denied: You are not a member of this team' });
            return;
          }
        }

        const msg = await Message.create({
          teamId:      data.teamId,
          sender:      data.senderId,
          text:        data.text || '',
          attachments: data.attachments || [],
        });

        const populated = await Message.findById(msg._id)
          .populate('sender', 'name avatarUrl');

        io.to(data.teamId).emit('new_message', populated);
      } catch (err) {
        console.error('[Socket] send_message error:', err);
        socket.emit('message_error', { error: 'Failed to send message' });
      }
    });

    // ── Typing Indicators ────────────────────────────────────────────────────
    socket.on('typing_start', ({ teamId, userName }: { teamId: string; userName: string }) => {
      if (socket.data.teamId !== teamId) return;
      socket.to(teamId).emit('user_typing', { userName, userId: socket.data.userId });
    });

    socket.on('typing_stop', ({ teamId }: { teamId: string }) => {
      if (socket.data.teamId !== teamId) return;
      socket.to(teamId).emit('user_stopped_typing', { userId: socket.data.userId });
    });

    // ── WebRTC Call Signaling ─────────────────────────────────────────────────
    // Initiate a call to everyone in the room
    socket.on('call_user', ({ teamId, callerName, callType }: { teamId: string; callerName: string; callType: 'audio' | 'video' }) => {
      if (socket.data.teamId !== teamId) return;
      socket.to(teamId).emit('incoming_call', {
        from:       socket.id,
        callerName,
        callType,
      });
    });

    // Accept a call — send back answer signal to caller
    socket.on('call_accepted', ({ to, callerName }: { to: string; callerName: string }) => {
      const targetSocket = io.sockets.sockets.get(to);
      if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
        io.to(to).emit('call_accepted', { from: socket.id, callerName });
      }
    });

    // Decline a call
    socket.on('call_rejected', ({ to }: { to: string }) => {
      const targetSocket = io.sockets.sockets.get(to);
      if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
        io.to(to).emit('call_rejected', { from: socket.id });
      }
    });

    // Relay SDP offer (after call accepted, initiator sends offer)
    socket.on('webrtc_offer', ({ to, sdp }: { to: string; sdp: any }) => {
      const targetSocket = io.sockets.sockets.get(to);
      if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
        io.to(to).emit('webrtc_offer', { from: socket.id, sdp });
      }
    });

    // Relay SDP answer (recipient sends answer back)
    socket.on('webrtc_answer', ({ to, sdp }: { to: string; sdp: any }) => {
      const targetSocket = io.sockets.sockets.get(to);
      if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
        io.to(to).emit('webrtc_answer', { from: socket.id, sdp });
      }
    });

    // Relay ICE candidates
    socket.on('webrtc_ice_candidate', ({ to, candidate }: { to: string; candidate: any }) => {
      const targetSocket = io.sockets.sockets.get(to);
      if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
        io.to(to).emit('webrtc_ice_candidate', { from: socket.id, candidate });
      }
    });

    // End call — notify everyone in the room
    socket.on('call_ended', ({ teamId }: { teamId: string }) => {
      if (socket.data.teamId !== teamId) return;
      io.to(teamId).emit('call_ended', { from: socket.id });
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[Socket] disconnected: ${socket.id}`);
      if (socket.data.teamId) {
        socket.to(socket.data.teamId).emit('user_left', {
          userId:   socket.data.userId,
          userName: socket.data.userName,
        });
        // Also end any active call
        socket.to(socket.data.teamId).emit('call_ended', { from: socket.id });
      }
    });
  });

  return io;
}
