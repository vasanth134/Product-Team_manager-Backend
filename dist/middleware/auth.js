"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateJWT = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const authenticateJWT = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        // If token is a valid mongoose ObjectId, we can directly use it
        if (mongoose_1.default.Types.ObjectId.isValid(token)) {
            req.userId = token;
            return next();
        }
        const jwtSecret = process.env.JWT_SECRET || 'aether_jwt_secret_token_12345!';
        try {
            const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
            req.userId = decoded.userId;
            return next();
        }
        catch (err) {
            // If verification fails, proceed to default user fallback instead of returning 403
        }
    }
    // Fallback: Use the first user in the database or create a default one
    try {
        let user = await User_1.User.findOne({});
        if (!user) {
            user = new User_1.User({
                name: 'Alex Rivera',
                email: 'alex.rivera@aether.io',
                passwordHash: 'no-password-needed',
                avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex%20Rivera'
            });
            await user.save();
        }
        req.userId = user._id.toString();
        next();
    }
    catch (err) {
        console.error('Bypassed auth error:', err);
        // If DB is unavailable, return a clear error instead of proceeding with
        // undefined userId which causes confusing downstream validation failures.
        return res.status(503).json({
            error: 'Database unavailable. Please try again later.'
        });
    }
};
exports.authenticateJWT = authenticateJWT;
