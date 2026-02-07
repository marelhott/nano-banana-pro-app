type GenerateProvider = "gemini" | "replicate" | "fal" | "unknown";

interface GenerateMetricEvent {
  ts: number;
  provider: GenerateProvider;
  success: boolean;
  statusCode: number;
  durationMs: number;
}

interface ProviderSummary {
  total: number;
  success: number;
  failed: number;
  errorRate: number;
  avgDurationMs: number;
}

const MAX_EVENTS = 20000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const ALERT_WINDOW_MINUTES = 10;

const events: GenerateMetricEvent[] = [];
let lastAlertAt = 0;

function clampProvider(provider: string): GenerateProvider {
  if (provider === "gemini" || provider === "replicate" || provider === "fal") return provider;
  return "unknown";
}

function trimEvents(now: number): void {
  const oldestAllowed = now - RETENTION_MS;
  let trimCount = 0;

  while (trimCount < events.length && events[trimCount].ts < oldestAllowed) {
    trimCount += 1;
  }

  if (trimCount > 0) {
    events.splice(0, trimCount);
  }

  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

function summarizeProvider(data: GenerateMetricEvent[]): ProviderSummary {
  const total = data.length;
  const failed = data.filter((item) => !item.success).length;
  const success = total - failed;
  const totalDuration = data.reduce((acc, item) => acc + item.durationMs, 0);

  return {
    total,
    success,
    failed,
    errorRate: total > 0 ? failed / total : 0,
    avgDurationMs: total > 0 ? Math.round(totalDuration / total) : 0,
  };
}

function getAlertConfig() {
  const threshold = Number(process.env.ERROR_ALERT_THRESHOLD || 0.35);
  const minRequests = Number(process.env.ERROR_ALERT_MIN_REQUESTS || 20);
  const webhookUrl = process.env.ALERT_WEBHOOK_URL || "";

  return {
    threshold: Number.isFinite(threshold) ? threshold : 0.35,
    minRequests: Number.isFinite(minRequests) ? minRequests : 20,
    webhookUrl,
  };
}

async function maybeSendAlert(now: number): Promise<void> {
  const { threshold, minRequests, webhookUrl } = getAlertConfig();
  if (!webhookUrl) return;
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;

  const snapshot = getGenerateMetricsSnapshot(ALERT_WINDOW_MINUTES);
  if (snapshot.total < minRequests) return;
  if (snapshot.errorRate < threshold) return;

  lastAlertAt = now;

  const payload = {
    service: "node-banana-generate",
    level: "warning",
    message: `Generate API error rate is high (${(snapshot.errorRate * 100).toFixed(1)}%)`,
    windowMinutes: ALERT_WINDOW_MINUTES,
    metrics: snapshot,
    timestamp: new Date(now).toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("[Metrics] Failed to send alert webhook", error);
  }
}

export function recordGenerateMetric(input: {
  provider: string;
  success: boolean;
  statusCode: number;
  durationMs: number;
}): void {
  const now = Date.now();
  events.push({
    ts: now,
    provider: clampProvider(input.provider),
    success: Boolean(input.success),
    statusCode: Number.isFinite(input.statusCode) ? input.statusCode : 500,
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : 0,
  });
  trimEvents(now);
  void maybeSendAlert(now);
}

export function getGenerateMetricsSnapshot(windowMinutes = 60) {
  const now = Date.now();
  trimEvents(now);

  const windowStart = now - Math.max(1, windowMinutes) * 60 * 1000;
  const inWindow = events.filter((item) => item.ts >= windowStart);
  const summary = summarizeProvider(inWindow);

  const providers: GenerateProvider[] = ["gemini", "replicate", "fal", "unknown"];
  const providerBreakdown = Object.fromEntries(
    providers.map((provider) => {
      const data = inWindow.filter((item) => item.provider === provider);
      return [provider, summarizeProvider(data)];
    })
  );

  return {
    windowMinutes: Math.max(1, windowMinutes),
    total: summary.total,
    success: summary.success,
    failed: summary.failed,
    errorRate: summary.errorRate,
    avgDurationMs: summary.avgDurationMs,
    providerBreakdown,
    timestamp: new Date(now).toISOString(),
  };
}

export function getGenerateMetricsOverview() {
  return {
    uptimeSeconds: Math.round(process.uptime()),
    eventsStored: events.length,
    last10m: getGenerateMetricsSnapshot(10),
    last60m: getGenerateMetricsSnapshot(60),
  };
}
