/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep deploys resilient: a stray lint warning shouldn't fail a "for fun" build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
