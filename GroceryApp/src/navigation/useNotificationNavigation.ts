/**
 * Hook to handle notification taps → navigation.
 *
 * When a user taps a notification (from background/killed state or foreground),
 * this hook navigates to the relevant grocery list.
 */

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import type { AppNavigationProp } from './deepLinks';

export function useNotificationNavigation(navigation: AppNavigationProp) {
  const lastResponse = useRef<Notifications.NotificationResponse | null>(null);

  useEffect(() => {
    // Handle notification tap when app was in background/killed
    Notifications.getLastNotificationResponseAsync().then((r) => {
      const responseId = r?.notification?.request?.identifier;
      if (responseId && responseId !== lastResponse.current?.notification?.request?.identifier) {
        lastResponse.current = r;
        navigateToNotification(r.notification);
      }
    });

    // Handle notification tap when app is in foreground
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateToNotification(response.notification);
    });

    return () => subscription.remove();
  }, [navigation]);

  function navigateToNotification(notification: Notifications.Notification) {
    const data = notification.request.content.data;
    if (data?.listId) {
      navigation.navigate('GroceryList', { listId: data.listId as string });
    }
  }
}
