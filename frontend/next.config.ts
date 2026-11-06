import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'self' blob:; base-uri 'self'; form-action 'self'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // @iigs/* packages are consumed as TypeScript source and import siblings with ".js" suffixes
  // (TS ESM style). Webpack maps ".js" -> ".ts"; Turbopack cannot, so dev/build run with --webpack.
  transpilePackages: ["@iigs/core", "@iigs/world"],
  serverExternalPackages: ["@ethersphere/bee-js"],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
