import { Stack } from "expo-router";

import { useTheme } from "@/theme/ThemeProvider";
import { screenMotion } from "@/ui/app/transitions";
import { useReduceMotion } from "@/ui/kit/motion";

/** Signed-out screens: no native header, each screen draws the web's page */
export default function AuthLayout() {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // sign in, sign up, reset: the platform push (a fade with reduced motion)
        ...screenMotion("push", { reduce, wide: false }),
        contentStyle: { backgroundColor: palette.frame },
      }}
    />
  );
}
