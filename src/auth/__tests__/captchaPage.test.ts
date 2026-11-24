import { captchaPage, parseCaptchaMessage } from "../captchaPage";

describe("captcha page", () => {
  it("reads token, error and expiry messages", () => {
    expect(parseCaptchaMessage(JSON.stringify({ type: "token", token: "abc" }))).toEqual({
      type: "token",
      token: "abc",
    });
    expect(parseCaptchaMessage(JSON.stringify({ type: "error" }))).toEqual({ type: "error" });
    expect(parseCaptchaMessage(JSON.stringify({ type: "expired" }))).toEqual({ type: "expired" });
  });

  it("ignores anything else", () => {
    expect(parseCaptchaMessage("not json")).toBeUndefined();
    expect(parseCaptchaMessage(JSON.stringify({ type: "token", token: "" }))).toBeUndefined();
    expect(parseCaptchaMessage(JSON.stringify({ type: "other" }))).toBeUndefined();
  });

  it("keeps the site key and language to safe characters", () => {
    const page = captchaPage("0x4AAA_b-1'</script><script>alert(1)", "ar'");
    expect(page).toContain("sitekey:'0x4AAA_b-1scriptscriptalert1'");
    expect(page).toContain("language:'ar'");
    expect(page).toContain("challenges.cloudflare.com/turnstile/v0/api.js");
  });
});
