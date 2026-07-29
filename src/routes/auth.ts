import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User';
import { authenticateJWT } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { devEmailsList } from '../utils/mailer';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'aether_jwt_secret_token_12345!';

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// @route   POST /api/auth/signup
router.post('/signup', async (req, res): Promise<any> => {
  try {
    const body = signupSchema.parse(req.body);
    const existingUser = await User.findOne({ email: body.email.toLowerCase() });
    
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const newUser = new User({
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash,
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(body.name)}`
    });

    await newUser.save();

    const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '7d' });
    
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Server error during signup' });
  }
});

// @route   POST /api/auth/login
router.post('/login', async (req, res): Promise<any> => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await User.findOne({ email: body.email.toLowerCase() });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(body.password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

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
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error during login' });
  }
});

// @route   GET /api/auth/me
router.get('/me', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash');
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
  } catch (error) {
    console.error('Auth check error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  email: z.string().email('Invalid email address').optional(),
  avatarUrl: z.string().optional(),
  role: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

// @route   PUT /api/auth/profile
// @desc    Update user profile data
router.put('/profile', authenticateJWT, async (req: AuthRequest, res): Promise<any> => {
  try {
    const body = updateProfileSchema.parse(req.body);
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (body.name) user.name = body.name;
    
    if (body.email && body.email.toLowerCase() !== user.email) {
      const emailExists = await User.findOne({ email: body.email.toLowerCase() });
      if (emailExists) {
        return res.status(400).json({ error: 'A user with this email already exists' });
      }
      user.email = body.email.toLowerCase();
    }
    
    if (body.avatarUrl !== undefined) user.avatarUrl = body.avatarUrl;
    if (body.role !== undefined) user.role = body.role;
    
    if (body.password) {
      user.passwordHash = await bcrypt.hash(body.password, 10);
    }

    await user.save();

    return res.status(200).json({
      id: user._id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Server error during profile update' });
  }
});

// @route   POST /api/auth/google
// @desc    Authenticate with Google OAuth ID Token
router.post('/google', async (req, res): Promise<any> => {
  try {
    const { credential, mockName, mockEmail } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Credential token is required' });
    }

    let email = '';
    let name = '';
    let avatarUrl = '';

    // Handle Mock Authentication for Developer Flow
    if (credential.startsWith('mock_google_jwt_')) {
      email = mockEmail?.toLowerCase() || 'mock.google@aether.io';
      name = mockName || 'Mock Google User';
      avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
    } else {
      // Real Google Identity Verification
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      if (!googleClientId) {
        return res.status(500).json({ error: 'Google OAuth is not configured on this server.' });
      }

      const client = new OAuth2Client(googleClientId);
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return res.status(400).json({ error: 'Invalid Google token payload' });
      }

      email = payload.email.toLowerCase();
      name = payload.name || email.split('@')[0];
      avatarUrl = payload.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
    }

    // Find or create Google User
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        name,
        email,
        passwordHash: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
        avatarUrl,
        role: 'Developer'
      });
      await user.save();
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

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
  } catch (error) {
    console.error('Google OAuth error:', error);
    return res.status(500).json({ error: 'Authentication failed during Google login' });
  }
});

// @route   GET /api/auth/dev/emails
// @desc    Dev-mailbox endpoint to retrieve mocked emails (Dev Only)
router.get('/dev/emails', (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Access denied: Developer mailbox is disabled in production.' });
  }
  res.json(devEmailsList);
});

export default router;
