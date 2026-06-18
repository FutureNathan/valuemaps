/** @type {import('next').NextConfig} */

// A build stamp so the running version is visible in the UI. Uses the Vercel
// commit SHA when present (exact version), otherwise the build date + time.
// Evaluated at build time, baked into the client bundle as a constant.
const now = new Date();
const p = (n) => String(n).padStart(2, "0");
const date = `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}`;
const sha = process.env.VERCEL_GIT_COMMIT_SHA;
const stamp = sha ? sha.slice(0, 7) : `${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;

const nextConfig = {
  // Keep deploys resilient: a stray lint warning shouldn't fail a "for fun" build.
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_BUILD: `${date}.${stamp}`,
  },
};

export default nextConfig;
