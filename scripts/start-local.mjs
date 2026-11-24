#!/usr/bin/env node
// Development only: start Expo against the local test stack instead of
// api.zrzur.com. Release builds ignore the override (see src/lib/apiUrl.ts).
//   npm run start:local -- [--web] [--port 31310]
// The address defaults to 127.0.0.1:14702; on a phone use the computer's
// Wi-Fi address: ZRZUR_LOCAL_API=192.168.1.20:14702 npm run start:local
import { spawn } from "node:child_process";

const api = process.env.ZRZUR_LOCAL_API ?? "http://127.0.0.1:14702";
const child = spawn("npx", ["expo", "start", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, EXPO_PUBLIC_ZRZUR_API: api },
});
child.on("exit", (code) => process.exit(code ?? 0));
