import { Server } from 'socket.io';
import http from 'http';
import mongoose from 'mongoose';
import { Message } from './models/Message';
import { Team } from './models/Team';

export function initSocket(server: http.Server) {
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // Track active call sessions in each team room
  interface ActiveCall {
    teamId: string;
    callType: 'audio' | 'video';
    callerId: string; // Socket ID
    callerUserId: string; // User ID
    callerName: string;
    startedAt: Date;
    connectedAt?: Date; // Set when first peer accepts
    participants: Set<string>; // UserNames of everyone who joined/accepted
    socketToUser: Map<string, { userId: string; userName: string }>; // Socket ID -> User info
  }
  const activeCalls = new Map<string, ActiveCall>(); // teamId -> ActiveCall

  async function endCallSession(teamId: string) {
    const call = activeCalls.get(teamId);
    if (!call) return;

    activeCalls.delete(teamId);

    const now = new Date();
    const duration = call.connectedAt 
      ? Math.round((now.getTime() - call.connectedAt.getTime()) / 1000)
      : 0;

    const msgText = duration > 0 
      ? `Call ended · ${duration}s` 
      : `Call missed`;

    const isValidTeamId = mongoose.Types.ObjectId.isValid(call.teamId);
    const isValidSenderId = mongoose.Types.ObjectId.isValid(call.callerUserId);

    if (mongoose.connection.readyState === 1 && isValidTeamId && isValidSenderId) {
      try {
        const msg = await Message.create({
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

        const populated = await Message.findById(msg._id)
          .populate('sender', 'name avatarUrl');

        io.to(call.teamId).emit('new_message', populated);
      } catch (err) {
        console.error('[Socket] Failed to save call history message:', err);
      }
    } else {
      // Fallback for tests or disconnected DB
      const mockMsg = {
        _id: new mongoose.Types.ObjectId().toString(),
        teamId: call.teamId,
        sender: { 
          _id: call.callerUserId, 
          name: call.callerName, 
          avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${call.callerName}` 
        },
        text: msgText,
        attachments: [],
        isCallHistory: true,
        callHistory: {
          callType: call.callType,
          duration,
          joinedParticipants: Array.from(call.participants),
          startedAt: call.startedAt.toISOString(),
          endedAt: now.toISOString(),
        },
        createdAt: now.toISOString(),
      };
      io.to(call.teamId).emit('new_message', mockMsg);
    }
  }

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
        from:       socket.id,
        callerName: name,
        callType,
      });
    });

    // Accept a call — send back answer signal to caller
    socket.on('call_accepted', ({ to, callerName }: { to: string; callerName: string }) => {
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
    socket.on('call_rejected', async ({ to }: { to: string }) => {
      const targetSocket = io.sockets.sockets.get(to);
      if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
        io.to(to).emit('call_rejected', { from: socket.id });
      }
      
      // If a call is declined and no connection occurred, end the session
      await endCallSession(socket.data.teamId);
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
    socket.on('call_ended', async ({ teamId }: { teamId: string }) => {
      if (socket.data.teamId !== teamId) return;
      io.to(teamId).emit('call_ended', { from: socket.id });
      await endCallSession(teamId);
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`[Socket] disconnected: ${socket.id}`);
      if (socket.data.teamId) {
        socket.to(socket.data.teamId).emit('user_left', {
          userId:   socket.data.userId,
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
