import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow 127.0.0.1 to access Next.js dev HMR resources
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'http',  hostname: 'localhost', port: '8000' },
      { protocol: 'http',  hostname: '127.0.0.1', port: '8000' },
    ],
    dangerouslyAllowLocalIP: true,
  },
}

export default nextConfig
