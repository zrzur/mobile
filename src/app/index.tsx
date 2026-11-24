import { Redirect } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";

/** The app's start address: sends each state to its first screen */
export default function Start() {
  const { state } = useAuth();
  if (state.status === "loading") return null;
  if (state.status === "signedOut") return <Redirect href="/login" />;
  // the step is still being asked for: the root layout moves on once it is known
  if (state.account === "checking") return null;
  const step = typeof state.account === "object" ? state.account.step : undefined;
  if (step === "username") return <Redirect href="/username" />;
  if (step === "age") return <Redirect href="/age" />;
  return <Redirect href="/home" />;
}
