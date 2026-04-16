import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import { createNotificationChannel, displayNotification } from './src/services/notifications';

const messaging = getMessaging();

// Background FCM handler
setBackgroundMessageHandler(messaging, async (remoteMessage) => {
  await createNotificationChannel();
  const title = remoteMessage.notification?.title ?? 'Новое сообщение';
  const body  = remoteMessage.notification?.body  ?? '';
  const data  = remoteMessage.data;
  await displayNotification(title, body, data);
});

// Notifee background event
notifee.onBackgroundEvent(async ({ type }) => {
  if (type === EventType.PRESS) {
    // TODO: навигация
  }
});

AppRegistry.registerComponent(appName, () => App);