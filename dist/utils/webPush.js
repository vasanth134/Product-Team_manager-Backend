"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = void 0;
const web_push_1 = __importDefault(require("web-push"));
const User_1 = require("../models/User");
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BAbNTTfAcDHiT-kOZrztPNjyA2wFSECS0JSh09DHMLrcUYNuIzWxp1kLitdBgScNd3IxffHnAboz8WMFkR2Db6I';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'v5M2WAOAY3aQfDvQkPu4w3QU-JjVvV8lokdY6boEbuQ';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:support@aether.workspace';
try {
    web_push_1.default.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}
catch (error) {
    console.error('Failed to configure web-push VAPID details:', error);
}
const sendPushNotification = async (userId, payload) => {
    try {
        const user = await User_1.User.findById(userId);
        if (!user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
            return;
        }
        const payloadString = JSON.stringify(payload);
        const subscriptionsToKeep = [];
        for (const sub of user.pushSubscriptions) {
            try {
                await web_push_1.default.sendNotification({
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.keys.p256dh,
                        auth: sub.keys.auth
                    }
                }, payloadString);
                subscriptionsToKeep.push(sub);
            }
            catch (err) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                    console.log(`Pruning expired push subscription for user ${userId}:`, sub.endpoint);
                }
                else {
                    console.error(`Failed to send push notification to subscription for user ${userId}:`, err);
                    subscriptionsToKeep.push(sub);
                }
            }
        }
        if (subscriptionsToKeep.length !== user.pushSubscriptions.length) {
            user.pushSubscriptions = subscriptionsToKeep;
            await user.save();
        }
    }
    catch (error) {
        console.error('Error in sendPushNotification helper:', error);
    }
};
exports.sendPushNotification = sendPushNotification;
