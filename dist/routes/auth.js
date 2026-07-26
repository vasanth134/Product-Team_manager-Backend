"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'aether_jwt_secret_token_12345!';
const signupSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
// @route   POST /api/auth/signup
router.post('/signup', async (req, res) => {
    try {
        const body = signupSchema.parse(req.body);
        const existingUser = await User_1.User.findOne({ email: body.email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: 'A user with this email already exists' });
        }
        const passwordHash = await bcryptjs_1.default.hash(body.password, 10);
        const newUser = new User_1.User({
            name: body.name,
            email: body.email.toLowerCase(),
            passwordHash,
            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(body.name)}`
        });
        await newUser.save();
        const token = jsonwebtoken_1.default.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(201).json({
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                avatarUrl: newUser.avatarUrl,
                role: newUser.role
            }
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Signup error:', error);
        return res.status(500).json({ error: 'Server error during signup' });
    }
});
// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const body = loginSchema.parse(req.body);
        const user = await User_1.User.findOne({ email: body.email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        const isMatch = await bcryptjs_1.default.compare(body.password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(200).json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
                role: user.role
            }
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Server error during login' });
    }
});
// @route   GET /api/auth/me
router.get('/me', auth_1.authenticateJWT, async (req, res) => {
    try {
        const user = await User_1.User.findById(req.userId).select('-passwordHash');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.status(200).json({
            id: user._id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
            role: user.role
        });
    }
    catch (error) {
        console.error('Auth check error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
const updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').optional(),
    email: zod_1.z.string().email('Invalid email address').optional(),
    avatarUrl: zod_1.z.string().optional(),
    role: zod_1.z.string().optional(),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters').optional(),
});
// @route   PUT /api/auth/profile
// @desc    Update user profile data
router.put('/profile', auth_1.authenticateJWT, async (req, res) => {
    try {
        const body = updateProfileSchema.parse(req.body);
        const user = await User_1.User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (body.name)
            user.name = body.name;
        if (body.email && body.email.toLowerCase() !== user.email) {
            const emailExists = await User_1.User.findOne({ email: body.email.toLowerCase() });
            if (emailExists) {
                return res.status(400).json({ error: 'A user with this email already exists' });
            }
            user.email = body.email.toLowerCase();
        }
        if (body.avatarUrl !== undefined)
            user.avatarUrl = body.avatarUrl;
        if (body.role !== undefined)
            user.role = body.role;
        if (body.password) {
            user.passwordHash = await bcryptjs_1.default.hash(body.password, 10);
        }
        await user.save();
        return res.status(200).json({
            id: user._id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
            role: user.role,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Update profile error:', error);
        return res.status(500).json({ error: 'Server error during profile update' });
    }
});
exports.default = router;
