/**
 * Background HealthKit Sync — Task 2.4
 *
 * Registers an expo-background-fetch task that periodically syncs
 * HealthKit data to the backend even when the app is not in the foreground.
 *
 * iOS controls the actual frequency — we can only provide a minimum interval hint.
 * In practice, iOS schedules background fetches based on app usage patterns.
 *
 * Usage:
 *   Call `registerBackgroundSync()` once at app startup (in the root layout).
 *   Call `unregisterBackgroundSync()` on logout.
 */

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { HEALTHKIT_BACKGROUND_SYNC_INTERVAL } from "../constants/config";
import { syncBackground } from "./healthkit-sync";

// ---------------------------------------------------------------------------
// Task name
// ---------------------------------------------------------------------------

export const HEALTHKIT_SYNC_TASK = "HEALTHKIT_BACKGROUND_SYNC";

// ---------------------------------------------------------------------------
// Task definition
// ---------------------------------------------------------------------------

/**
 * The background task itself. expo-task-manager invokes this when iOS
 * triggers a background fetch event.
 *
 * IMPORTANT: This must be defined at module scope (top-level), not inside
 * a React component. TaskManager.defineTask runs even when the JS bundle
 * is cold-started in the background.
 */
TaskManager.defineTask(HEALTHKIT_SYNC_TASK, async () => {
  try {
    console.log("[Background Sync] Starting HealthKit sync...");
    const result = await syncBackground();

    if (result.success && result.metricsCount > 0) {
      console.log(
        `[Background Sync] Synced ${result.metricsCount} metrics`
      );
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    if (result.success && result.metricsCount === 0) {
      console.log("[Background Sync] No new data");
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    console.warn("[Background Sync] Failed:", result.error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (err) {
    console.error("[Background Sync] Error:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the background sync task with iOS.
 * Safe to call multiple times — it checks if already registered.
 */
export async function registerBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    HEALTHKIT_SYNC_TASK
  );

  if (isRegistered) {
    console.log("[Background Sync] Already registered");
    return;
  }

  // Check if background fetch is available
  const status = await BackgroundFetch.getStatusAsync();
  if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
    console.warn(
      "[Background Sync] Background fetch is denied by the user. " +
        "Enable it in Settings > General > Background App Refresh."
    );
    return;
  }

  if (status === BackgroundFetch.BackgroundFetchStatus.Restricted) {
    console.warn(
      "[Background Sync] Background fetch is restricted (e.g., Low Power Mode)."
    );
    return;
  }

  await BackgroundFetch.registerTaskAsync(HEALTHKIT_SYNC_TASK, {
    minimumInterval: HEALTHKIT_BACKGROUND_SYNC_INTERVAL,
    stopOnTerminate: false, // Continue after app is swiped away
    startOnBoot: true, // Start after device reboot
  });

  console.log("[Background Sync] Registered successfully");
}

/**
 * Unregister the background sync task. Call on logout.
 */
export async function unregisterBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    HEALTHKIT_SYNC_TASK
  );

  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(HEALTHKIT_SYNC_TASK);
    console.log("[Background Sync] Unregistered");
  }
}

/**
 * Check if background sync is currently registered and active.
 */
export async function isBackgroundSyncRegistered(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(HEALTHKIT_SYNC_TASK);
}
