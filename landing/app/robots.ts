import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/login",
        "/signup",
        "/welcome",
        "/reset-password",
        "/extension-auth",
        "/auth/",
      ],
    },
    sitemap: "https://amintaapp.com/sitemap.xml",
  };
}
