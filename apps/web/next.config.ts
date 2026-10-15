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
  // Qloo's own pictures of items, resized by Vercel's image optimizer and served from this site
  // (img-src stays 'self', so the browser never contacts Qloo). Only their URLs are in our database;
  // the optimizer caches its resized copies for up to a month (Qloo's files never change). Kept tight
  // so the public /_next/image endpoint can't be used for other files or many variants (security
  // review W1): one host, files directly under /i/, no query, few sizes, one format, no redirects.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.qloo.com", port: "", pathname: "/i/*", search: "" },
    ],
    imageSizes: [96, 192],
    deviceSizes: [384, 640, 828, 1080],
    qualities: [75],
    formats: ["image/webp"],
    maximumRedirects: 0,
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
