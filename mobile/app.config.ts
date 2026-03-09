import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "VitalView",
  slug: "vitalview",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "vitalview",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0f766e",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.vitalview.app",
    buildNumber: "1",
    infoPlist: {
      NSHealthShareUsageDescription:
        "VitalView reads your health data (sleep, heart rate variability, resting heart rate, and steps) to generate personalized weekly health debriefs and track trends over time.",
      NSHealthUpdateUsageDescription:
        "VitalView does not write to your health data. This permission is requested by the HealthKit framework but is not used.",
      UIBackgroundModes: ["fetch", "remote-notification"],
    },
    entitlements: {
      "com.apple.developer.healthkit": true,
      "com.apple.developer.healthkit.access": ["health-records"],
      "aps-environment": "development",
    },
    config: {
      usesNonExemptEncryption: false,
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#0f766e",
      },
    ],
    [
      "expo-background-fetch",
      {
        startOnBoot: true,
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "your-eas-project-id",
    },
  },
});
