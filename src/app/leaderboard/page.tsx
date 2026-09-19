import type { Metadata } from "next";
import { z } from "zod";
import { RankingView } from "@/components/rankings/RankingView";
export const metadata: Metadata = { title: "Website speed rankings", description: "Weekly, monthly and all-time website performance rankings, with separate mobile and desktop results.", alternates: { canonical: "/leaderboard" } };
const searchSchema = z.object({ kind: z.enum(["weekly", "monthly", "all_time"]).optional(), strategy: z.enum(["mobile", "desktop"]).optional(), scope: z.enum(["overall", "country", "category", "technology", "improved", "newcomer"]).optional(), scopeKey: z.string().max(100).optional(), periodKey: z.string().max(8).optional(), cursor: z.string().regex(/^\d{1,8}$/).optional() });
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = searchSchema.safeParse(await searchParams);
  return <RankingView query={query.success ? query.data : {}} />;
}
