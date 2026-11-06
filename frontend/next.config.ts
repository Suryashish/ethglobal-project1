import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
