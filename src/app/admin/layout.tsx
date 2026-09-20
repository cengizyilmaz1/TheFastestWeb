import type { ReactNode } from "react";
import { LockKey } from "@phosphor-icons/react/dist/ssr";
import { authorizeAdmin } from "./authorize";
import { AdminNav } from "./_components/admin-nav";

export const dynamic = "force-dynamic";

/** Shell only. Each page authorizes itself as well: a layout is not re-rendered
 * on client navigation, so it cannot be the access boundary. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await authorizeAdmin();
  return <div className="admin-shell mx-auto w-full max-w-[1360px] px-6 pb-16 pt-8 max-[640px]:px-4">
    <div className="grid gap-8 min-[1000px]:grid-cols-[216px_minmax(0,1fr)]">
      <aside className="min-w-0 min-[1000px]:sticky min-[1000px]:top-[84px] min-[1000px]:self-start">
        <p className="mb-4 flex items-center gap-2 px-3 text-[0.74rem] font-semibold text-text-secondary"><LockKey size={15} weight="fill" aria-hidden="true" className="text-accent" />Administrator panel</p>
        <AdminNav />
        <p className="mt-5 hidden px-3 text-[0.7rem] leading-relaxed text-text-secondary min-[1000px]:block">Private area. Access is rechecked on every page, and every change is written to the audit log.</p>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  </div>;
}
