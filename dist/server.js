"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const db_1 = require("./config/db");
const socketHandler_1 = require("./socketHandler");
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const teams_1 = __importDefault(require("./routes/teams"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const milestones_1 = __importDefault(require("./routes/milestones"));
const standups_1 = __importDefault(require("./routes/standups"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const chat_1 = __importDefault(require("./routes/chat"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const PORT = process.env.PORT || 5000;
// Connect to Database
(0, db_1.connectDB)();
// Attach Socket.io
(0, socketHandler_1.initSocket)(httpServer);
// Middleware
app.use((0, cors_1.default)({
    origin: '*',
    credentials: true,
}));
app.use(express_1.default.json());
// Serve local uploads as static files (fallback when Cloudinary is not configured)
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'public', 'uploads')));
// API Routes
app.use('/api/auth', auth_1.default);
app.use('/api/teams', teams_1.default);
app.use('/api/tasks', tasks_1.default);
app.use('/api/milestones', milestones_1.default);
app.use('/api/standups', standups_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/chat', chat_1.default);
// Base route
app.get('/', (req, res) => {
    res.send('Aether Project Management API is running...');
});
// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});
// Start Server (using httpServer instead of app.listen so Socket.io works)
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
