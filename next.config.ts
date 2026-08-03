import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // `standalone` keeps the production image small — it bundles only the traced
  // server files, which matters when the whole product ships as one container.
  output: 'standalone',
  reactStrictMode: true,
  images: {
    // MinIO serves media over the S3 API; hostnames come from env so the same
    // build works locally, on staging, and on the Iranian host.
    remotePatterns: [
      {
        protocol: (process.env.S3_PUBLIC_PROTOCOL as 'http' | 'https') ?? 'http',
        hostname: process.env.S3_PUBLIC_HOSTNAME ?? 'localhost',
        port: process.env.S3_PUBLIC_PORT ?? '9000',
      },
    ],
  },
  experimental: {
    // Three.js is the largest client dependency; keep it out of the shared chunk.
    optimizePackageImports: ['lucide-react'],
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
