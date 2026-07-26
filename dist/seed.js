"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const User_1 = require("./models/User");
const Team_1 = require("./models/Team");
const Milestone_1 = require("./models/Milestone");
const Task_1 = require("./models/Task");
const Standup_1 = require("./models/Standup");
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aether';
const dummyNames = [
    'Alex Rivera', 'Sarah Chen', 'Marcus Johnson', 'Elena Rostova',
    'David Kim', 'Aisha Diallo', 'Liam Gallagher', 'Chloe Dubois',
    'Vikram Singh', 'Zoe Martinez'
];
async function seed() {
    try {
        console.log('Connecting to database...');
        await mongoose_1.default.connect(MONGO_URI);
        console.log('Connected.');
        // Clear existing collections
        console.log('Clearing database tables...');
        await User_1.User.deleteMany({});
        await Team_1.Team.deleteMany({});
        await Milestone_1.Milestone.deleteMany({});
        await Task_1.Task.deleteMany({});
        await Standup_1.Standup.deleteMany({});
        console.log('Creating users...');
        const passwordHash = await bcryptjs_1.default.hash('password123', 10);
        const users = [];
        // Create 10 users
        for (let i = 0; i < dummyNames.length; i++) {
            const name = dummyNames[i];
            const email = `${name.toLowerCase().replace(' ', '.')}@aether.io`;
            const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
            const user = new User_1.User({
                name,
                email,
                passwordHash,
                avatarUrl
            });
            await user.save();
            users.push(user);
        }
        console.log(`Created ${users.length} users successfully. Use 'password123' to log in as any of them.`);
        console.log('Primary login email:', users[0].email);
        // Create 2 Teams
        console.log('Creating teams...');
        // Team 1: Core SaaS Platform
        const team1 = new Team_1.Team({
            name: 'Aether Core SaaS Product',
            description: 'Developing core web application, cloud infrastructure, and databases.',
            owner: users[0]._id,
            members: [
                { user: users[0]._id, role: 'owner' }, // Alex
                { user: users[1]._id, role: 'admin' }, // Sarah
                { user: users[2]._id, role: 'member' }, // Marcus
                { user: users[3]._id, role: 'member' }, // Elena
                { user: users[4]._id, role: 'member' }, // David
                { user: users[9]._id, role: 'member' }, // Zoe
            ]
        });
        await team1.save();
        // Team 2: Mobile Client Apps
        const team2 = new Team_1.Team({
            name: 'Aether Mobile App Team',
            description: 'Building native iOS and Android apps using React Native.',
            owner: users[1]._id,
            members: [
                { user: users[1]._id, role: 'owner' }, // Sarah
                { user: users[5]._id, role: 'admin' }, // Aisha
                { user: users[6]._id, role: 'member' }, // Liam
                { user: users[7]._id, role: 'member' }, // Chloe
                { user: users[8]._id, role: 'member' }, // Vikram
                { user: users[0]._id, role: 'member' }, // Alex is cross-functional
            ]
        });
        await team2.save();
        console.log('Created teams:');
        console.log(`- ${team1.name} (6 members)`);
        console.log(`- ${team2.name} (6 members)`);
        // Create Milestones
        console.log('Creating product milestones...');
        const now = new Date();
        // Milestones for Team 1
        const t1Milestone1 = new Milestone_1.Milestone({
            teamId: team1._id,
            title: 'v1.0.0 Public Launch',
            description: 'Launch the core MVP version of the product with subscription plans and user billing.',
            startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            endDate: new Date(now.getFullYear(), now.getMonth() + 1, 15),
            status: 'active'
        });
        await t1Milestone1.save();
        const t1Milestone2 = new Milestone_1.Milestone({
            teamId: team1._id,
            title: 'High-Performance API Rewrite',
            description: 'Refactor REST endpoints to GraphQL and optimize Database indices for high load.',
            startDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
            endDate: new Date(now.getFullYear(), now.getMonth() + 2, 30),
            status: 'planned'
        });
        await t1Milestone2.save();
        // Milestones for Team 2
        const t2Milestone1 = new Milestone_1.Milestone({
            teamId: team2._id,
            title: 'App Store Submission MVP',
            description: 'Get iOS and Android apps approved on App Store & Google Play Store.',
            startDate: new Date(now.getFullYear(), now.getMonth() - 1, 15),
            endDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
            status: 'active'
        });
        await t2Milestone1.save();
        // Create Tasks
        console.log('Creating tasks...');
        // Tasks for Team 1
        const tasksT1 = [
            {
                title: 'Design database schema for subscription billing',
                description: 'Need user subscriptions table, Stripe product IDs mapping, and payment logs collection.',
                status: 'done',
                priority: 'high',
                assignee: users[0]._id, // Alex
                milestoneId: t1Milestone1._id,
                storyPoints: 5,
                dueDate: new Date(now.getFullYear(), now.getMonth() - 1, 20)
            },
            {
                title: 'Integrate Stripe Webhooks for payment events',
                description: 'Verify stripe signature, handle invoice.paid, customer.subscription.deleted events.',
                status: 'in_progress',
                priority: 'critical',
                assignee: users[1]._id, // Sarah
                milestoneId: t1Milestone1._id,
                storyPoints: 8,
                dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5)
            },
            {
                title: 'Create Dashboard UI skeleton',
                description: 'Build layouts, sidebar, global state provider, and loading screens with glassmorphism.',
                status: 'done',
                priority: 'medium',
                assignee: users[2]._id, // Marcus
                milestoneId: t1Milestone1._id,
                storyPoints: 3,
                dueDate: new Date(now.getFullYear(), now.getMonth() - 1, 25)
            },
            {
                title: 'Implement drag-and-drop on Kanban Board',
                description: 'Use native HTML5 drag-and-drop or a custom library to allow moving tasks between columns.',
                status: 'review',
                priority: 'high',
                assignee: users[3]._id, // Elena
                milestoneId: t1Milestone1._id,
                storyPoints: 5,
                dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
            },
            {
                title: 'Setup automated deployment pipeline with GitHub Actions',
                description: 'Lint, run unit tests, and build Docker image on push to master.',
                status: 'todo',
                priority: 'medium',
                assignee: users[4]._id, // David
                milestoneId: t1Milestone1._id,
                storyPoints: 3,
                dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10)
            },
            {
                title: 'Optimize heavy aggregation queries for team workload',
                description: 'Build secondary index on assignee and status fields in database.',
                status: 'backlog',
                priority: 'low',
                assignee: users[9]._id, // Zoe
                milestoneId: t1Milestone2._id,
                storyPoints: 5,
            },
            {
                title: 'Draft API documentation for v1 APIs',
                description: 'Use OpenAPI/Swagger spec to outline endpoints, models, and errors.',
                status: 'todo',
                priority: 'low',
                assignee: users[0]._id, // Alex
                milestoneId: t1Milestone1._id,
                storyPoints: 2,
                dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 12)
            }
        ];
        // Tasks for Team 2
        const tasksT2 = [
            {
                title: 'Setup React Native boilerplate with Expo',
                description: 'Initialize Expo with TypeScript, configure navigation libraries.',
                status: 'done',
                priority: 'high',
                assignee: users[5]._id, // Aisha
                milestoneId: t2Milestone1._id,
                storyPoints: 5,
                dueDate: new Date(now.getFullYear(), now.getMonth() - 1, 28)
            },
            {
                title: 'Implement Push Notifications',
                description: 'Integrate Firebase Cloud Messaging and Apple Push Notification service.',
                status: 'in_progress',
                priority: 'high',
                assignee: users[6]._id, // Liam
                milestoneId: t2Milestone1._id,
                storyPoints: 8,
                dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4)
            },
            {
                title: 'User Profile & Settings screen mobile layout',
                description: 'Design and build screens for updating avatar, password, and active team lists.',
                status: 'todo',
                priority: 'low',
                assignee: users[7]._id, // Chloe
                milestoneId: t2Milestone1._id,
                storyPoints: 3,
                dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 9)
            },
            {
                title: 'Fix iOS build credentials & cert signing issues',
                description: 'Regenerate provisional profiles and update signing configuration in Xcode.',
                status: 'in_progress',
                priority: 'critical',
                assignee: users[1]._id, // Sarah
                milestoneId: t2Milestone1._id,
                storyPoints: 5,
                dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
            },
            {
                title: 'Setup offline sync using Realm DB',
                description: 'Cache local actions when internet is unavailable, sync to database when online.',
                status: 'backlog',
                priority: 'high',
                assignee: users[8]._id, // Vikram
                storyPoints: 13,
            }
        ];
        for (const t of tasksT1) {
            await new Task_1.Task({ ...t, teamId: team1._id }).save();
        }
        for (const t of tasksT2) {
            await new Task_1.Task({ ...t, teamId: team2._id }).save();
        }
        console.log(`Successfully seeded tasks (7 for Team 1, 5 for Team 2).`);
        // Create Standups
        console.log('Seeding daily standup journals...');
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const todayStr = now.toISOString().split('T')[0];
        // Yesterday's standups (Team 1)
        await new Standup_1.Standup({
            teamId: team1._id,
            userId: users[0]._id,
            yesterday: 'Finished the layout schema designs for user subscription collections.',
            today: 'Drafting core billing endpoints and initializing stripe webhook handler.',
            blockers: 'Stripe API keys needed from project owner.',
            date: yesterdayStr
        }).save();
        await new Standup_1.Standup({
            teamId: team1._id,
            userId: users[1]._id,
            yesterday: 'Helped Sarah test Auth JWT controller updates.',
            today: 'Integrating stripe payment webhooks with mock express environment.',
            blockers: '',
            date: yesterdayStr
        }).save();
        await new Standup_1.Standup({
            teamId: team1._id,
            userId: users[2]._id,
            yesterday: 'Finished designing sidebars and dashboard glassmorphic layouts.',
            today: 'Working on standard dynamic charting elements with mock data.',
            blockers: 'Wait on endpoint models specification to map correct metrics fields.',
            date: yesterdayStr
        }).save();
        // Today's standups (Team 1)
        await new Standup_1.Standup({
            teamId: team1._id,
            userId: users[0]._id,
            yesterday: 'Worked on draft endpoint models for invoices and subscription logs.',
            today: 'Completing user registration validation checks with Zod helper.',
            blockers: '',
            date: todayStr
        }).save();
        await new Standup_1.Standup({
            teamId: team1._id,
            userId: users[2]._id,
            yesterday: 'Tested custom charts with SVG configurations.',
            today: 'Combining dashboard widgets with state selector for team routing.',
            blockers: '',
            date: todayStr
        }).save();
        await new Standup_1.Standup({
            teamId: team1._id,
            userId: users[3]._id,
            yesterday: 'Implemented simple task columns inside React drag-and-drop controller.',
            today: 'Reviewing drag callbacks, styling ghost items during drags.',
            blockers: '',
            date: todayStr
        }).save();
        console.log('Daily standups seeded successfully.');
        console.log('Database Seeding Completed Successfully!');
        process.exit(0);
    }
    catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}
seed();
