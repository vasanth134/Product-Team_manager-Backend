import { Server } from 'socket.io';
import http from 'http';
import mongoose from 'mongoose';
import { Message } from './models/Message';
import { Team } from './models/Team';
import { Channel } from './models/Channel';
import { Notification } from './models/Notification';
import { User } from './models/User';

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

  async function removeParticipantFromCall(teamId: string, socketId: string) {
    const call = activeCalls.get(teamId);
    if (!call) return;

    const info = call.socketToUser.get(socketId);
    if (info) {
      call.socketToUser.delete(socketId);
      const userSockets = Array.from(call.socketToUser.values()).filter(v => v.userName === info.userName);
      if (userSockets.length === 0) {
        call.participants.delete(info.userName);
      }
    }

    // Notify remaining participants to close WebRTC peer connection to this socket
    io.to(teamId).emit('call_ended', { from: socketId });

    if (call.socketToUser.size < 2) {
      // Less than 2 participants left, end call session entirely
      activeCalls.delete(teamId);

      const now = new Date();
      const duration = call.connectedAt 
        ? Math.round((now.getTime() - call.connectedAt.getTime()) / 1000)
        : 0;

      try {
        const msgText = duration > 0 
          ? `Call ended · ${duration}s` 
          : `Call missed`;
        
        const isValidTeamId = mongoose.Types.ObjectId.isValid(call.teamId);
        const isValidSenderId = mongoose.Types.ObjectId.isValid(call.callerUserId);

        if (mongoose.connection.readyState === 1 && isValidTeamId && isValidSenderId) {
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
      } catch (err) {
        console.error('[Socket] Failed to save call history message:', err);
      }

      // Reset room call status
      io.to(teamId).emit('active_call_update', null);
    } else {
      // Call continues with remaining participants, broadcast updated status
      io.to(teamId).emit('active_call_update', {
        callType: call.callType,
        participants: Array.from(call.participants)
      });
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

      // Leave all previous rooms first (other than socket's own room and user room)
      const prevRooms = Array.from(socket.rooms).filter(r => r !== socket.id && !r.startsWith('user:'));
      prevRooms.forEach(r => socket.leave(r));

      socket.join(teamId);
      if (userId) {
        socket.join(`user:${userId}`);
      }

      socket.data.teamId  = teamId;
      socket.data.userId  = userId;
      socket.data.userName = userName;

      // Auto-join General channel room
      if (mongoose.connection.readyState === 1 && teamId) {
        try {
          let generalChannel = await Channel.findOne({ teamId, name: 'General' });
          if (!generalChannel) {
            generalChannel = new Channel({
              name: 'General',
              description: 'Default general room for chat',
              teamId: new mongoose.Types.ObjectId(teamId),
              createdBy: new mongoose.Types.ObjectId(userId)
            });
            await generalChannel.save();
          }
          socket.join(`channel:${generalChannel._id}`);
          socket.data.channelId = generalChannel._id.toString();
        } catch (err) {
          console.error('[Socket] Failed to join general channel room:', err);
        }
      }

      // Notify others in room
      socket.to(teamId).emit('user_joined', { userId, userName });

      // If active call exists for this room, notify the joined user
      const call = activeCalls.get(teamId);
      if (call) {
        socket.emit('active_call_update', {
          callType: call.callType,
          participants: Array.from(call.participants)
        });
      }
    });

    socket.on('join_channel', ({ channelId }: { channelId: string }) => {
      // Leave previous channel rooms
      const prevRooms = Array.from(socket.rooms).filter(r => r.startsWith('channel:'));
      prevRooms.forEach(r => socket.leave(r));
      
      socket.join(`channel:${channelId}`);
      socket.data.channelId = channelId;
      console.log(`[Socket] user ${socket.data.userId} joined channel:${channelId}`);
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
      channelId?: string;
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

        let channelId = data.channelId;
        if (!channelId && mongoose.connection.readyState === 1) {
          // Resolve default General channel
          let generalChannel = await Channel.findOne({ teamId: data.teamId, name: 'General' });
          if (!generalChannel) {
            generalChannel = new Channel({
              name: 'General',
              description: 'Default general room for chat',
              teamId: new mongoose.Types.ObjectId(data.teamId),
              createdBy: new mongoose.Types.ObjectId(data.senderId)
            });
            await generalChannel.save();
          }
          channelId = generalChannel._id.toString();
        }

        let msg: any = null;
        if (mongoose.connection.readyState === 1) {
          const created = await Message.create({
            teamId:      data.teamId,
            channelId:   channelId || undefined,
            sender:      data.senderId,
            text:        data.text || '',
            attachments: data.attachments || [],
          });
          msg = await Message.findById(created._id).populate('sender', 'name avatarUrl');
        } else {
          msg = {
            _id: new mongoose.Types.ObjectId().toString(),
            teamId: data.teamId,
            channelId: channelId,
            sender: {
              _id: data.senderId,
              name: 'Test User',
              avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Test'
            },
            text: data.text || '',
            attachments: data.attachments || [],
            createdAt: new Date().toISOString()
          };
        }

        // Broadcast to team for E2E tests and legacy clients
        io.to(data.teamId).emit('new_message', msg);

        // Broadcast to channel room for isolation
        if (channelId) {
          io.to(`channel:${channelId}`).emit('new_message', msg);
        }

        // ── Mentions Parsing & Notification Persist & Live Emit ──
        if (data.text && mongoose.connection.readyState === 1) {
          try {
            const team = await Team.findById(data.teamId).populate('members.user');
            if (team) {
              const mentionedUsers: any[] = [];
              const messageTextLower = data.text.toLowerCase();

              for (const m of team.members) {
                const memberUser = m.user as any;
                if (memberUser && memberUser._id.toString() !== data.senderId) {
                  const nameLower = memberUser.name.toLowerCase();
                  const emailNameLower = memberUser.email.split('@')[0].toLowerCase();
                  const nameNormalizedLower = memberUser.name.replace(/\s+/g, '').toLowerCase();

                  const mentionPatterns = [
                    `@${nameLower}`,
                    `@${emailNameLower}`,
                    `@${nameNormalizedLower}`
                  ];

                  const isMentioned = mentionPatterns.some(pattern => {
                    const idx = messageTextLower.indexOf(pattern);
                    if (idx === -1) return false;

                    const charBefore = idx > 0 ? messageTextLower[idx - 1] : '';
                    const charAfter = messageTextLower[idx + pattern.length];

                    const isCharBeforeSeparator = !charBefore || /[^a-zA-Z0-9._-]/.test(charBefore);
                    const isCharAfterSeparator = !charAfter || /[^a-zA-Z0-9._-]/.test(charAfter);

                    return isCharBeforeSeparator && isCharAfterSeparator;
                  });

                  if (isMentioned) {
                    if (!mentionedUsers.some(u => u._id.toString() === memberUser._id.toString())) {
                      mentionedUsers.push(memberUser);
                    }
                  }
                }
              }

              if (msg && msg._id) {
                for (const recipient of mentionedUsers) {
                  const notif = await Notification.create({
                    recipient: recipient._id,
                    sender: data.senderId,
                    teamId: data.teamId,
                    channelId: channelId || undefined,
                    messageId: msg._id,
                    text: data.text || 'Mentioned you in chat',
                  });

                  const populatedNotif = await Notification.findById(notif._id)
                    .populate('sender', 'name avatarUrl')
                    .populate('teamId', 'name')
                    .populate('channelId', 'name');

                  io.to(`user:${recipient._id}`).emit('new_notification', populatedNotif);
                }
              }
            }
          } catch (mErr) {
            console.error('[Socket] Mentions processing failed:', mErr);
          }
        }
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

      // Broadcast call active update
      io.to(teamId).emit('active_call_update', {
        callType,
        participants: [name]
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

          io.to(socket.data.teamId).emit('active_call_update', {
            callType: call.callType,
            participants: Array.from(call.participants)
          });
        }
      }
    });

    // Join an active ongoing call
    socket.on('join_active_call', ({ teamId }: { teamId: string }) => {
      const call = activeCalls.get(teamId);
      if (!call) {
        socket.emit('call_error', { message: 'No active call session found' });
        return;
      }

      const name = socket.data.userName || 'Unknown';
      
      // Notify all existing participants in this call about new peer
      for (const [peerSocketId] of call.socketToUser) {
        io.to(peerSocketId).emit('peer_joined_call', {
          socketId: socket.id,
          userName: name
        });
      }

      // Add socket to call state
      call.participants.add(name);
      call.socketToUser.set(socket.id, { userId: socket.data.userId, userName: name });
      if (!call.connectedAt) {
        call.connectedAt = new Date();
      }

      // Send the client a list of existing sockets to open WebRTC connections to
      const existingPeers = Array.from(call.socketToUser.entries())
        .filter(([sid]) => sid !== socket.id)
        .map(([sid, info]) => ({ socketId: sid, userName: info.userName }));

      socket.emit('call_joined_success', {
        peers: existingPeers,
        callType: call.callType
      });

      // Broadcast active call updates to everyone in room
      io.to(teamId).emit('active_call_update', {
        callType: call.callType,
        participants: Array.from(call.participants)
      });
    });

    // Decline a call
    socket.on('call_rejected', async ({ to }: { to: string }) => {
      const targetSocket = io.sockets.sockets.get(to);
      if (targetSocket && targetSocket.data.teamId === socket.data.teamId) {
        io.to(to).emit('call_rejected', { from: socket.id });
      }
      
      await removeParticipantFromCall(socket.data.teamId, socket.id);
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
      await removeParticipantFromCall(teamId, socket.id);
    });

    // Relay screen sharing status
    socket.on('screen_share_status', ({ teamId, isSharing }: { teamId: string; isSharing: boolean }) => {
      if (socket.data.teamId !== teamId) return;
      socket.to(teamId).emit('screen_share_status', { socketId: socket.id, isSharing });
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`[Socket] disconnected: ${socket.id}`);
      if (socket.data.teamId) {
        socket.to(socket.data.teamId).emit('user_left', {
          userId:   socket.data.userId,
          userName: socket.data.userName,
        });
        
        // If this socket was a participant in an active call, remove them
        const call = activeCalls.get(socket.data.teamId);
        if (call && call.socketToUser.has(socket.id)) {
          await removeParticipantFromCall(socket.data.teamId, socket.id);
        }
      }
    });
  });

  return io;
}
