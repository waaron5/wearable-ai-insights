/**
 * Push notification service — registration, permission handling,
 * token management, and notification response (deep link) handling.
 *
 * Uses expo-notifications for APNs integration.
 */

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { api } from "./api";

// ---------------------------------------------------------------------------
// Default notification behavior (show banner even when app is foregrounded)
// ---------------------------------------------------------------------------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ---------------------------------------------------------------------------
// Permission + token registration
// ---------------------------------------------------------------------------

/**
 * Request push notification permission and register the device token
 * with the backend.
 *
 * Safe to call multiple times — re-sends the token on each app launch
 * to handle token rotation.
 *
 * @returns The device push token string, or null if unavailable.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS !== "ios") {
    return null;
  }

  try {
    // Check / request permission
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission not granted");
      return null;
    }

    // Get the APNs device token
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const deviceToken = tokenData.data;

    if (typeof deviceToken !== "string" || !deviceToken) {
      console.warn("Unexpected device token format:", tokenData);
      return null;
    }

    // Send to backend
    try {
      await api.updatePushToken(deviceToken);
      console.log("Push token registered with backend");
    } catch (err) {
      console.warn("Failed to register push token with backend:", err);
    }

    return deviceToken;
  } catch (err) {
    console.error("Error registering for push notifications:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deep link handler
// ---------------------------------------------------------------------------

/**
 * Handle a notification response (user tapped a notification).
 * Routes to the appropriate screen based on the notification payload.
 */
function handleNotificationResponse(
  response: Notifications.NotificationResponse
) {
  const data = response.notification.request.content.data;

  if (data?.type === "debrief_ready") {
    // Navigate to the dashboard which shows the latest debrief
    router.push("/(app)/(tabs)/");
  }

  // Clear badge count after tap
  Notifications.setBadgeCountAsync(0).catch(() => {});
}

// ---------------------------------------------------------------------------
// React hook for notification listeners
// ---------------------------------------------------------------------------

/**
 * Hook that sets up notification listeners on mount.
 * Call this once in the root layout or app shell.
 *
 * - Listens for incoming notifications (foreground)
 * - Listens for notification taps (background/killed → deep link)
 * - Handles the case where the app was opened from a killed state via notification
 */
export function useNotificationListeners() {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Listen for notifications received while app is in foreground
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("Notification received in foreground:", notification);
      });

    // Listen for user tapping a notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse
      );

    // Check if the app was opened from a notification (killed state)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);
}
