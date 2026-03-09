/**
 * HealthKit Sync Service — Task 2.2
 *
 * Orchestrates reading from HealthKit and pushing to the backend.
 * Tracks sync state in AsyncStorage to avoid re-fetching data.
 *
 * Sync strategies:
 * - Initial (onboarding): 90 days of history
 * - Regular (app launch): last 7 days
 * - Background: last 7 days (triggered by expo-background-fetch)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  HEALTHKIT_INITIAL_SYNC_DAYS,
  HEALTHKIT_REGULAR_SYNC_DAYS,
  API_URL,
} from "../constants/config";
import { readAllMetrics, NormalizedMetric } from "./healthkit";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  LAST_SYNC_DATE: "healthkit_last_sync_date",
  SOURCE_ID: "healthkit_source_id",
  HAS_INITIAL_SYNC: "healthkit_initial_sync_done",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  success: boolean;
  metricsCount: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync("access_token");
}

/**
 * Ensure an `apple_healthkit` data source exists for this user.
 * Creates one on first call, then caches the source ID locally.
 */
async function ensureHealthKitSource(): Promise<string | null> {
  // Check local cache first
  const cached = await AsyncStorage.getItem(STORAGE_KEYS.SOURCE_ID);
  if (cached) return cached;

  const token = await getAuthToken();
  if (!token) return null;

  try {
    // Try to create a new source — the backend will handle if it already exists
    const response = await fetch(`${API_URL}/sources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        source_type: "apple_healthkit",
        config: { platform: "ios", sdk: "react-native-health" },
      }),
    });

    if (response.ok) {
      const source = await response.json();
      await AsyncStorage.setItem(STORAGE_KEYS.SOURCE_ID, source.id);
      return source.id;
    }

    // If source already exists, fetch it from the list
    if (response.status === 409) {
      return fetchExistingSourceId(token);
    }

    console.warn("[HealthKit Sync] Failed to create source:", response.status);
    return null;
  } catch (err) {
    console.warn("[HealthKit Sync] Error creating source:", err);
    return null;
  }
}

async function fetchExistingSourceId(token: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/sources`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return null;

    const sources = await response.json();
    const hkSource = sources.find(
      (s: { source_type: string }) => s.source_type === "apple_healthkit"
    );

    if (hkSource) {
      await AsyncStorage.setItem(STORAGE_KEYS.SOURCE_ID, hkSource.id);
      return hkSource.id;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Push normalized metrics to the backend via POST /metrics.
 * The backend handles deduplication via ON CONFLICT DO UPDATE.
 */
async function pushMetrics(
  metrics: NormalizedMetric[],
  sourceId: string
): Promise<boolean> {
  if (metrics.length === 0) return true;

  const token = await getAuthToken();
  if (!token) return false;

  // Attach source_id to each metric
  const payload = metrics.map((m) => ({
    ...m,
    source_id: sourceId,
  }));

  // Batch in chunks of 100 to avoid oversized requests
  const BATCH_SIZE = 100;
  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const batch = payload.slice(i, i + BATCH_SIZE);

    try {
      const response = await fetch(`${API_URL}/metrics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.warn(
          `[HealthKit Sync] Push batch ${i / BATCH_SIZE + 1} failed:`,
          response.status
        );
        return false;
      }
    } catch (err) {
      console.warn("[HealthKit Sync] Push error:", err);
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Sync orchestrators
// ---------------------------------------------------------------------------

/**
 * Initial sync — run during onboarding.
 * Fetches 90 days of HealthKit data to build the user's baseline.
 */
export async function syncInitial(
  onProgress?: (message: string) => void
): Promise<SyncResult> {
  try {
    onProgress?.("Setting up HealthKit data source...");
    const sourceId = await ensureHealthKitSource();
    if (!sourceId) {
      return { success: false, metricsCount: 0, error: "Failed to create data source" };
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - HEALTHKIT_INITIAL_SYNC_DAYS);
    startDate.setHours(0, 0, 0, 0);

    onProgress?.("Reading health data from the last 90 days...");
    const metrics = await readAllMetrics(startDate);

    if (metrics.length === 0) {
      return { success: true, metricsCount: 0 };
    }

    onProgress?.(`Syncing ${metrics.length} data points...`);
    const pushed = await pushMetrics(metrics, sourceId);

    if (pushed) {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_DATE, new Date().toISOString());
      await AsyncStorage.setItem(STORAGE_KEYS.HAS_INITIAL_SYNC, "true");
    }

    return {
      success: pushed,
      metricsCount: metrics.length,
      error: pushed ? undefined : "Failed to push metrics to server",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[HealthKit Sync] Initial sync failed:", message);
    return { success: false, metricsCount: 0, error: message };
  }
}

/**
 * Regular sync — run on app launch (foreground).
 * Fetches last 7 days of HealthKit data.
 */
export async function syncRegular(): Promise<SyncResult> {
  try {
    const sourceId = await ensureHealthKitSource();
    if (!sourceId) {
      return { success: false, metricsCount: 0, error: "No data source" };
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - HEALTHKIT_REGULAR_SYNC_DAYS);
    startDate.setHours(0, 0, 0, 0);

    const metrics = await readAllMetrics(startDate);

    if (metrics.length === 0) {
      return { success: true, metricsCount: 0 };
    }

    const pushed = await pushMetrics(metrics, sourceId);

    if (pushed) {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_DATE, new Date().toISOString());
    }

    return {
      success: pushed,
      metricsCount: metrics.length,
      error: pushed ? undefined : "Failed to push metrics",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[HealthKit Sync] Regular sync failed:", message);
    return { success: false, metricsCount: 0, error: message };
  }
}

/**
 * Background sync — triggered by expo-background-fetch.
 * Same as regular sync but with minimal logging.
 */
export async function syncBackground(): Promise<SyncResult> {
  return syncRegular();
}

// ---------------------------------------------------------------------------
// State queries
// ---------------------------------------------------------------------------

/**
 * Get the timestamp of the last successful sync.
 */
export async function getLastSyncDate(): Promise<Date | null> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_DATE);
  return stored ? new Date(stored) : null;
}

/**
 * Check if the initial (onboarding) sync has been completed.
 */
export async function hasCompletedInitialSync(): Promise<boolean> {
  const done = await AsyncStorage.getItem(STORAGE_KEYS.HAS_INITIAL_SYNC);
  return done === "true";
}

/**
 * Check if HealthKit data is available (has any metrics been read before).
 */
export async function hasHealthKitData(): Promise<boolean> {
  // Quick probe: try to read steps from the last 7 days
  const { readSteps } = await import("./healthkit");
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const metrics = await readSteps(startDate);
  return metrics.length > 0;
}

/**
 * Clear all HealthKit sync state (for logout / account reset).
 */
export async function clearSyncState(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.LAST_SYNC_DATE,
    STORAGE_KEYS.SOURCE_ID,
    STORAGE_KEYS.HAS_INITIAL_SYNC,
  ]);
}
