import { DEFAULT_API_URL, fetchInstanceConfig, normalizeApiUrl, resolveApiUrl } from "../apiUrl";

describe("resolveApiUrl", () => {
  it("always uses the official API in a release build", () => {
    expect(resolveApiUrl("http://127.0.0.1:14702", false)).toBe(DEFAULT_API_URL);
    expect(resolveApiUrl(undefined, false)).toBe("https://api.zrzur.com");
  });
  it("lets a development build use the local test stack", () => {
    expect(resolveApiUrl("127.0.0.1:14702", true)).toBe("http://127.0.0.1:14702");
    expect(resolveApiUrl("", true)).toBe(DEFAULT_API_URL);
    expect(resolveApiUrl("ftp://x", true)).toBe(DEFAULT_API_URL);
  });
});

describe("normalizeApiUrl", () => {
  it.each([
    ["api.zrzur.com", "https://api.zrzur.com"],
    ["https://api.zrzur.com/", "https://api.zrzur.com"],
    ["  https://chat.example.org/api// ", "https://chat.example.org/api"],
    ["127.0.0.1:14702", "http://127.0.0.1:14702"],
    ["192.168.1.20:14702", "http://192.168.1.20:14702"],
    ["localhost:14702", "http://localhost:14702"],
    ["http://10.0.2.2:14702", "http://10.0.2.2:14702"],
    ["", undefined],
    ["ftp://example.org", undefined],
    ["https://", undefined],
  ])("%p becomes %p", (input, expected) => {
    expect(normalizeApiUrl(input)).toBe(expected);
  });
});

function answer(body: unknown, status = 200) {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("fetchInstanceConfig", () => {
  it("reads the captcha key and features", async () => {
    const config = await fetchInstanceConfig(
      "https://api.zrzur.com",
      answer({
        zrzur: "26.3.0",
        features: { captcha: { enabled: true, key: "0xKEY" }, email: true, invite_only: false },
      }),
    );
    expect(config).toEqual({ version: "26.3.0", captchaKey: "0xKEY", email: true, inviteOnly: false });
  });

  it("has no captcha key when the captcha is off", async () => {
    const config = await fetchInstanceConfig(
      "http://127.0.0.1:14702",
      answer({ revolt: "0.8", features: { captcha: { enabled: false, key: "" }, email: false } }),
    );
    expect(config.captchaKey).toBeUndefined();
    expect(config.email).toBe(false);
  });

  it("refuses an address that is not a Zrzur API", async () => {
    await expect(fetchInstanceConfig("https://example.org", answer({ hello: "world" }))).rejects.toThrow(
      "NotZrzur",
    );
    await expect(fetchInstanceConfig("https://example.org", answer({}, 404))).rejects.toThrow("NotZrzur");
  });
});
