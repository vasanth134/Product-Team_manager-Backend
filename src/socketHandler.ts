import { Server } from 'socket.io';
import http from 'http';
import { Message } from './models/Message';

export function initSocket(server: http.Server) {
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // Track which socket belongs to which user+team
  io.on('connection', (socket) => {
    console.log(`[Socket] connected: ${socket.id}`);

    // ── Room Management ──────────────────────────────────────────────────────
    socket.on('join_room', ({ teamId, userId, userName }: { teamId: string; userId: string; userName: string }) => {
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
      socket.to(teamId).emit('user_typing', { userName, userId: socket.data.userId });
    });

    socket.on('typing_stop', ({ teamId }: { teamId: string }) => {
      socket.to(teamId).emit('user_stopped_typing', { userId: socket.data.userId });
    });

    // ── WebRTC Call Signaling ─────────────────────────────────────────────────
    // Initiate a call to everyone in the room
    socket.on('call_user', ({ teamId, callerName, callType }: { teamId: string; callerName: string; callType: 'audio' | 'video' }) => {
      socket.to(teamId).emit('incoming_call', {
        from:       socket.id,
        callerName,
        callType,
      });
    });

    // Accept a call — send back answer signal to caller
    socket.on('call_accepted', ({ to, callerName }: { to: string; callerName: string }) => {
      io.to(to).emit('call_accepted', { from: socket.id, callerName });
    });

    // Decline a call
    socket.on('call_rejected', ({ to }: { to: string }) => {
      io.to(to).emit('call_rejected', { from: socket.id });
    });

    // Relay SDP offer (after call accepted, initiator sends offer)
    socket.on('webrtc_offer', ({ to, sdp }: { to: string; sdp: any }) => {
      io.to(to).emit('webrtc_offer', { from: socket.id, sdp });
    });

    // Relay SDP answer (recipient sends answer back)
    socket.on('webrtc_answer', ({ to, sdp }: { to: string; sdp: any }) => {
      io.to(to).emit('webrtc_answer', { from: socket.id, sdp });
    });

    // Relay ICE candidates
    socket.on('webrtc_ice_candidate', ({ to, candidate }: { to: string; candidate: any }) => {
      io.to(to).emit('webrtc_ice_candidate', { from: socket.id, candidate });
    });

    // End call — notify everyone in the room
    socket.on('call_ended', ({ teamId }: { teamId: string }) => {
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
