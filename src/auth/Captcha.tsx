import { useLingui } from "@lingui/react/macro";
import { type ComponentType, type Ref, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewProps } from "react-native-webview";

import { CAPTCHA_ORIGIN, captchaPage, parseCaptchaMessage } from "./captchaPage";

// react-native-webview 14 types its class in a way React 19.3 JSX cannot read
const Web = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

export type CaptchaHandle = { reset(): void };

/**
 * Cloudflare Turnstile inside a small WebView. Calls `onToken` when the
 * check passes; each token works once, so call `reset()` after a failed
 * submit.
 */
export const Captcha = forwardRef<
  CaptchaHandle,
  { siteKey: string; onToken: (token: string | null) => void; onError: () => void }
>(function Captcha({ siteKey, onToken, onError }, ref) {
  const { i18n } = useLingui();
  const web = useRef<WebView>(null);
  // like the web: invisible unless Cloudflare needs a tap
  const [interactive, setInteractive] = useState(false);

  useImperativeHandle(ref, () => ({
    reset() {
      onToken(null);
      web.current?.injectJavaScript("window.resetCaptcha&&window.resetCaptcha();true;");
    },
  }));

  return (
    <View style={{ height: interactive ? 72 : 1, overflow: "hidden", borderRadius: 10 }} accessibilityLabel="captcha">
      <Web
        ref={web}
        source={{ html: captchaPage(siteKey, i18n.locale), baseUrl: CAPTCHA_ORIGIN }}
        originWhitelist={["https://*"]}
        style={{ backgroundColor: "transparent" }}
        javaScriptEnabled
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        onMessage={(event: WebViewMessageEvent) => {
          const message = parseCaptchaMessage(event.nativeEvent.data);
          if (!message) return;
          if (message.type === "interactive") return setInteractive(true);
          if (message.type === "hidden") return setInteractive(false);
          if (message.type === "token") onToken(message.token);
          else if (message.type === "expired") onToken(null);
          else onError();
        }}
        onError={onError}
      />
    </View>
  );
});
