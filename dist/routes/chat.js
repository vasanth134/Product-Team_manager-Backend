"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cloudinary_1 = require("cloudinary");
const Message_1 = require("../models/Message");
const Team_1 = require("../models/Team");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ─── Cloudinary Setup ────────────────────────────────────────────────────────
const hasCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET);
if (hasCloudinary) {
    cloudinary_1.v2.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}
// ─── Local Fallback Upload Dir ───────────────────────────────────────────────
const uploadsDir = path_1.default.join(process.cwd(), 'public', 'uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
// ─── Multer (memory storage — works for both Cloudinary and local) ───────────
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
    fileFilter: (_req, file, cb) => {
        const allowed = /image\/(jpeg|jpg|png|gif|webp)|audio\/(mpeg|mp4|ogg|wav|webm)/;
        if (allowed.test(file.mimetype))
            cb(null, true);
        else
            cb(new Error('Only image and audio files are allowed'));
    },
});
// ─── POST /api/chat/upload ───────────────────────────────────────────────────
// Uploads an image or audio file; returns { url, type }
router.post('/upload', auth_1.authenticateJWT, upload.single('file'), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'No file uploaded' });
        const isImage = req.file.mimetype.startsWith('image/');
        const fileType = isImage ? 'image' : 'audio';
        let url = '';
        if (hasCloudinary) {
            // Upload buffer to Cloudinary
            const result = await new Promise((resolve, reject) => {
                const stream = cloudinary_1.v2.uploader.upload_stream({ resource_type: isImage ? 'image' : 'video', folder: 'aether-chat' }, (err, result) => (err ? reject(err) : resolve(result)));
                stream.end(req.file.buffer);
            });
            url = result.secure_url;
        }
        else {
            // Local fallback — save to public/uploads
            const ext = path_1.default.extname(req.file.originalname) || (isImage ? '.png' : '.webm');
            const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
            const filePath = path_1.default.join(uploadsDir, filename);
            fs_1.default.writeFileSync(filePath, req.file.buffer);
            url = `/uploads/${filename}`;
        }
        return res.status(200).json({ url, type: fileType });
    }
    catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ error: error.message || 'Upload failed' });
    }
});
// Helper check to verify if the user belongs to the team
async function userBelongsToTeam(userId, teamId) {
    const team = await Team_1.Team.findOne({ _id: teamId, 'members.user': userId });
    return !!team;
}
// ─── GET /api/chat/messages?teamId=xxx&before=<msgId>&limit=50 ───────────────
router.get('/messages', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { teamId, before, limit = '50' } = req.query;
        if (!teamId)
            return res.status(400).json({ error: 'teamId is required' });
        // Validate team membership
        if (!(await userBelongsToTeam(req.userId, teamId))) {
            return res.status(403).json({ error: 'Access denied: You are not a member of this team' });
        }
        const query = { teamId };
        if (before)
            query._id = { $lt: before };
        const messages = await Message_1.Message.find(query)
            .populate('sender', 'name avatarUrl')
            .sort({ createdAt: -1 })
            .limit(Math.min(parseInt(limit, 10), 100));
        return res.status(200).json(messages.reverse());
    }
    catch (error) {
        console.error('Fetch messages error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
