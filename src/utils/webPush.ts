import webpush from 'web-push';
import { User } from '../models/User';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BAbNTTfAcDHiT-kOZrztPNjyA2wFSECS0JSh09DHMLrcUYNuIzWxp1kLitdBgScNd3IxffHnAboz8WMFkR2Db6I';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'v5M2WAOAY3aQfDvQkPu4w3QU-JjVvV8lokdY6boEbuQ';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:support@aether.workspace';

try {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (error) {
  console.error('Failed to configure web-push VAPID details:', error);
}

export const sendPushNotification = async (userId: string, payload: { title: string; body: string; data?: any }) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
      return;
    }

    const payloadString = JSON.stringify(payload);
    const subscriptionsToKeep: any[] = [];

    for (const sub of user.pushSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth
            }
          },
          payloadString
        );
        subscriptionsToKeep.push(sub);
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log(`Pruning expired push subscription for user ${userId}:`, sub.endpoint);
        } else {
          console.error(`Failed to send push notification to subscription for user ${userId}:`, err);
          subscriptionsToKeep.push(sub);
        }
      }
    }

    if (subscriptionsToKeep.length !== user.pushSubscriptions.length) {
      user.pushSubscriptions = subscriptionsToKeep;
      await user.save();
    }
  } catch (error) {
    console.error('Error in sendPushNotification helper:', error);
  }
};
