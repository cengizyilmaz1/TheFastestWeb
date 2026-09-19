import { NextRequest, NextResponse } from "next/server";
import { seedSites } from "@/db/seed";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const period = request.nextUrl.searchParams.get("period") || "30d";

  const site = seedSites.find((s) => s.slug === slug);
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Generate mock historical data since we don't have real speed_tests yet
  const days = period === "30d" ? 30 : period === "90d" ? 90 : 365;
  const dataPoints = [];
  const baseScore = site.currentScore ?? 90;
  const now = new Date();

  for (let i = days; i >= 0; i -= Math.ceil(days / 12)) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const variance = (Math.random() - 0.5) * 10;
    const score = Math.max(
      60,
      Math.min(100, Math.round(baseScore + variance))
    );

    dataPoints.push({
      score,
      testedAt: date.toISOString(),
    });
  }

  // Ensure last point matches current score
  if (dataPoints.length > 0) {
    dataPoints[dataPoints.length - 1].score = baseScore;
  }

  return NextResponse.json({ data: dataPoints });
}
