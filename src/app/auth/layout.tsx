import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({ title: "Sign in", description: "Sign in to your TheFastestWeb account.", path: "/auth/login", index: false, follow: false });
export default function AuthLayout({ children }: { children: ReactNode }) { return children; }
