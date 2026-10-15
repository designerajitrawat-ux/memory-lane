import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const agentOrigin = new URL(process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8787").origin;

// The page may only connect to itself and our agent service (never to Qloo or Claude directly).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${agentOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@memory-lane/shared"],
  // Qloo's own pictures of items, resized and served from this site (img-src stays 'self'): the
  // browser never contacts Qloo, and nothing is stored by us. Qloo's image files never change, so the
  // optimizer keeps its copies for a month.
  images: {
    remotePatterns: [new URL("https://images.qloo.com/i/**")],
    minimumCacheTTL: 2_678_400,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
