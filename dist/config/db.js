"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aether';
        mongoose_1.default.set('strictQuery', true);
        await mongoose_1.default.connect(mongoURI);
        console.log('MongoDB connected successfully to:', mongoURI.replace(/:[^@]+@/, ':****@')); // Hide credentials in log
    }
    catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        process.exit(1);
    }
};
exports.connectDB = connectDB;
