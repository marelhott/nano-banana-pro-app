import { NextResponse } from "next/server";
import { getGenerateMetricsSnapshot } from "@/lib/observability/generateMetrics";
import { getGenerationJobStats } from "@/lib/generation/jobQueue";

export async function GET() {
  const now = new Date().toISOString();
  const recent = getGenerateMetricsSnapshot(10);

  return NextResponse.json({
    ok: true,
    service: "node-banana",
    timestamp: now,
    uptimeSeconds: Math.round(process.uptime()),
    env: {
      nodeEnv: process.env.NODE_ENV || "development",
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasReplicateKey: Boolean(process.env.REPLICATE_API_KEY),
      hasFalKey: Boolean(process.env.FAL_API_KEY),
      hasAlertWebhook: Boolean(process.env.ALERT_WEBHOOK_URL),
    },
    generate: {
      last10mErrorRate: recent.errorRate,
      last10mTotal: recent.total,
      avgDurationMs: recent.avgDurationMs,
    },
    jobs: getGenerationJobStats(),
  });
}
