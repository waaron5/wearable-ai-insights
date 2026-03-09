/**
 * Root layout — expo-router entry point.
 *
 * This will eventually house the AuthProvider, theme provider,
 * and navigation guards. For now, it renders the slot (child routes).
 */

import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Slot />
    </>
  );
}
