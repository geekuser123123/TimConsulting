import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/work-with-tim/proposal/", "/work-with-tim/schedule/", "/work-with-tim/accepted", "/work-with-tim/payment-success", "/admin/", "/api/"],
    },
  };
}
