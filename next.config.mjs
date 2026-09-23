/** @type {import('next').NextConfig} */
const privateNoIndex = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "private, no-store" },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Token-bearing and internal pages must never be indexed, cached, or leak their URL via Referer.
      { source: "/work-with-tim/proposal/:path*", headers: privateNoIndex },
      { source: "/work-with-tim/schedule/:path*", headers: privateNoIndex },
      { source: "/work-with-tim/accepted", headers: privateNoIndex },
      { source: "/work-with-tim/payment-success", headers: privateNoIndex },
      { source: "/admin/:path*", headers: privateNoIndex },
    ];
  },
};

export default nextConfig;
