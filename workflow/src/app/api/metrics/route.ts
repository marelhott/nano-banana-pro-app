import { NextRequest, NextResponse } from "next/server";
import { getGenerateMetricsOverview, getGenerateMetricsSnapshot } from "@/lib/observability/generateMetrics";
import { getGenerationJobStats } from "@/lib/generation/jobQueue";

export async function GET(request: NextRequest) {
  const windowParam = Number(request.nextUrl.searchParams.get("windowMinutes") || 60);
  const windowMinutes = Number.isFinite(windowParam) ? Math.max(1, Math.min(24 * 60, windowParam)) : 60;

  return NextResponse.json({
    ok: true,
    snapshot: getGenerateMetricsSnapshot(windowMinutes),
    overview: getGenerateMetricsOverview(),
    jobs: getGenerationJobStats(),
  });
}
