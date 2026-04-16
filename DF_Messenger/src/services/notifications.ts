import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  requestPermission,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native';
import { api } from '../api/client';

const messaging = getMessaging();

export async function createNotificationChannel() {
  await notifee.createChannel({
    id: 'messages',
    name: 'Messages',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    sound: 'default',
    vibration: true,
  });
}

export async function displayNotification(
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  await notifee.displayNotification({
    title,
    body,
    data,
    android: {
      channelId: 'messages',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      pressAction: { id: 'default' },
      smallIcon: 'ic_launcher',
    },
  });
}

export async function registerDeviceToken() {
  try {
    console.log('registerDeviceToken: START')
    
    const authStatus = await requestPermission(messaging);
    console.log('registerDeviceToken: authStatus =', authStatus)
    
    const enabled =
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL;
    
    console.log('registerDeviceToken: enabled =', enabled)
    if (!enabled) return;
    
    await createNotificationChannel();
    
    const token = await getToken(messaging);
    console.log('FCM TOKEN:', token);
    
    const response = await api.post('/user/me/device-token', { token });
    console.log('registerDeviceToken: token saved, response =', response.status)
    
  } catch (e) {
    console.warn('Push init error:', e);
  }
}

export async function unregisterDeviceToken() {
  try {
    const token = await getToken(messaging);
    await api.delete('/user/me/device-token', { data: { token } });
  } catch (e) {
    console.warn('Push unregister error:', e);
  }
}