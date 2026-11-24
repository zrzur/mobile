import { Stack } from "expo-router";

import { useTheme } from "@/theme/ThemeProvider";
import { screenMotion } from "@/ui/app/transitions";
import { useReduceMotion } from "@/ui/kit/motion";

/**
 * First entry of a new account: username, then month and year of birth.
 * Both screens stay registered; the root layout sends the person to the step
 * that is due (a guard per screen here made this stack change its routes
 * while the root removed it, and the change reached no navigator).
 */
export default function SetupLayout() {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  return (
    <Stack screenOptions={{ headerShown: false, ...screenMotion("push", { reduce, wide: false }), contentStyle: { backgroundColor: palette.frame } }}>
      <Stack.Screen name="username" />
      <Stack.Screen name="age" />
    </Stack>
  );
}
