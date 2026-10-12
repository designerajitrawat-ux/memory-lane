import { describe, expect, it } from "vitest";
import { rateLimitKey } from "./clientIp";

describe("rateLimitKey", () => {
  it("keeps IPv4 as is and folds IPv6 to its /64", () => {
    expect(rateLimitKey("203.0.113.9")).toBe("203.0.113.9");
    expect(rateLimitKey("2001:db8:1:2::a")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("2001:0db8:0001:0002:ffff:0000:0000:0001")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitKey("::ffff:198.51.100.7")).toBe("198.51.100.7");
  });
});
