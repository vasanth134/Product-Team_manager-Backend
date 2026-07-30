import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import { Message } from '../models/Message';
import { Team } from '../models/Team';
import { Channel } from '../models/Channel';
import { Notification } from '../models/Notification';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── Cloudinary Setup ────────────────────────────────────────────────────────
const hasCloudinary = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
    api_key:     process.env.CLOUDINARY_API_KEY,
    api_secret:  process.env.CLOUDINARY_API_SECRET,
  });
}

// ─── Local Fallback Upload Dir ───────────────────────────────────────────────
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ─── Multer (memory storage — works for both Cloudinary and local) ───────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req, file, cb) => {
    const allowed = /image\/(jpeg|jpg|png|gif|webp)|audio\/(mpeg|mp4|ogg|wav|webm)/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image and audio files are allowed'));
  },
});

// ─── POST /api/chat/upload ───────────────────────────────────────────────────
// Uploads an image or audio file; returns { url, type }
router.post('/upload', authenticateJWT, upload.single('file'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const isImage = req.file.mimetype.startsWith('image/');
    const fileType: 'image' | 'audio' = isImage ? 'image' : 'audio';
    let url = '';

    if (hasCloudinary) {
      // Upload buffer to Cloudinary
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: isImage ? 'image' : 'video', folder: 'aether-chat' },
          (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(req.file!.buffer);
      });
      url = result.secure_url;
    } else {
      // Local fallback — save to public/uploads
      const ext      = path.extname(req.file.originalname) || (isImage ? '.png' : '.webm');
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, req.file.buffer);
      url = `/uploads/${filename}`;
    }

    return res.status(200).json({ url, type: fileType });
  } catch (error: any) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

// Helper check to verify if the user belongs to the team
async function userBelongsToTeam(userId: string, teamId: string): Promise<boolean> {
  const team = await Team.findOne({ _id: teamId, 'members.user': userId });
  return !!team;
}

// ─── GET /api/chat/messages?teamId=xxx&channelId=yyy&before=<msgId>&limit=50 ───────────────
router.get('/messages', authenticateJWT, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { teamId, channelId, before, limit = '50' } = req.query as Record<string, string>;
    if (!teamId) return res.status(400).json({ error: 'teamId is required' });

    // Validate team membership
    if (!(await userBelongsToTeam(req.userId!, teamId))) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this team' });
    }

    const query: any = { teamId };
    if (channelId) {
      const channel = await Channel.findById(channelId);
      if (channel && channel.name === 'General') {
        query.$or = [
          { channelId: channel._id },
          { channelId: { $exists: false } },
          { channelId: null }
        ];
      } else {
        query.channelId = channelId;
      }
    }
    if (before) query._id = { $lt: before };

    const messages = await Message.find(query)
      .populate('sender', 'name avatarUrl')
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10), 100));

    return res.status(200).json(messages.reverse());
  } catch (error) {
    console.error('Fetch messages error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/chat/notifications
// @desc    Get unread notifications for current user
router.get('/notifications', authenticateJWT, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const notifications = await Notification.find({ recipient: req.userId, isRead: false })
      .populate('sender', 'name avatarUrl')
      .populate('teamId', 'name')
      .populate('channelId', 'name')
      .sort({ createdAt: -1 });

    return res.status(200).json(notifications);
  } catch (error) {
    console.error('Fetch notifications error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/chat/notifications/mark-read
// @desc    Mark notifications as read
router.post('/notifications/mark-read', authenticateJWT, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { notificationIds } = req.body;
    const query: any = { recipient: req.userId };
    if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      query._id = { $in: notificationIds };
    }

    await Notification.updateMany(query, { $set: { isRead: true } });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
