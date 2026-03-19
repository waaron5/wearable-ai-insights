/**
 * Environment-aware configuration for the mobile app.
 *
 * In development, the backend runs on your Mac via Docker.
 * Your iPhone reaches it via the Mac's LAN IP on the same WiFi network.
 *
 * To find your Mac's IP: run `ipconfig getifaddr en0` in Terminal.
 */
import Constants from "expo-constants";

// Development API URL. Set via environment variable or defaults to 10.0.2.2 (simulator localhost).
// For physical device or custom Mac IP, set DEV_API_URL env var.
// To find your Mac's LAN IP: run `ipconfig getifaddr en0` in Terminal
const DEV_API_URL = Constants.expoConfig?.extra?.devApiUrl || "http://10.0.2.2:8000";
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
