/**
 * Environment-aware configuration for the mobile app.
 *
 * In development, the backend runs on your Mac via Docker.
 * Your iPhone reaches it via the Mac's LAN IP on the same WiFi network.
 *
 * To find your Mac's IP: run `ipconfig getifaddr en0` in Terminal.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

const IOS_SIMULATOR_API_URL = "http://127.0.0.1:8000";
const ANDROID_EMULATOR_API_URL = "http://10.0.2.2:8000";

function hostUriToApiUrl(hostUri?: string | null): string | null {
  if (!hostUri) return null;

  const [host] = hostUri.split(":");
  if (!host) return null;

  if (host === "localhost" || host === "127.0.0.1") {
    return IOS_SIMULATOR_API_URL;
  }

  return `http://${host}:8000`;
}

// Development API URL:
// - Explicit DEV_API_URL from app config wins
// - Expo dev sessions can infer the Mac's LAN IP from hostUri
// - iOS simulator falls back to localhost
// - Android emulator falls back to 10.0.2.2
const inferredDevApiUrl =
  Platform.OS === "android"
    ? ANDROID_EMULATOR_API_URL
    : hostUriToApiUrl(Constants.expoConfig?.hostUri) || IOS_SIMULATOR_API_URL;
const DEV_API_URL = Constants.expoConfig?.extra?.devApiUrl || inferredDevApiUrl;
const PROD_API_URL = "https://your-api.railway.app";

export const API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;

/**
 * HealthKit metric type mappings.
 * Maps HealthKit data types to VitalView metric types.
 */
export const HEALTHKIT_METRIC_TYPES = {
  sleep_hours: "HKCategoryTypeIdentifierSleepAnalysis",
  hrv: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  resting_hr: "HKQuantityTypeIdentifierRestingHeartRate",
  steps: "HKQuantityTypeIdentifierStepCount",
} as const;

/**
 * Number of days to fetch from HealthKit during onboarding (initial sync).
 */
export const HEALTHKIT_INITIAL_SYNC_DAYS = 90;

/**
 * Number of days to fetch from HealthKit on regular app launches.
 */
export const HEALTHKIT_REGULAR_SYNC_DAYS = 7;

/**
 * Minimum interval between background syncs (in seconds).
 * iOS background fetch uses this as a hint — actual intervals are controlled by the OS.
 */
export const HEALTHKIT_BACKGROUND_SYNC_INTERVAL = 4 * 60 * 60; // 4 hours
