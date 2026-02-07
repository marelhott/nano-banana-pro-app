import type { GenerateResponse } from "@/types";

export type GenerationJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface GenerationJob {
  id: string;
  provider: string;
  status: GenerationJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  webhookUrl?: string;
  result?: GenerateResponse;
  error?: string;
}

const JOB_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_JOBS = 2000;
const jobs = new Map<string, GenerationJob>();

function nowIso(): string {
  return new Date().toISOString();
}

function cleanupJobs() {
  const now = Date.now();
  const toDelete: string[] = [];

  for (const [jobId, job] of jobs.entries()) {
    const updatedAtMs = Date.parse(job.updatedAt);
    if (Number.isFinite(updatedAtMs) && now - updatedAtMs > JOB_TTL_MS) {
      toDelete.push(jobId);
    }
  }

  toDelete.forEach((jobId) => jobs.delete(jobId));

  if (jobs.size > MAX_JOBS) {
    const sorted = Array.from(jobs.values()).sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
    const removeCount = jobs.size - MAX_JOBS;
    for (let i = 0; i < removeCount; i += 1) {
      const item = sorted[i];
      if (item) jobs.delete(item.id);
    }
  }
}

function buildJobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidWebhookUrl(webhookUrl?: string): boolean {
  if (!webhookUrl) return false;
  try {
    const parsed = new URL(webhookUrl);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function notifyWebhook(job: GenerationJob): Promise<void> {
  if (!job.webhookUrl || !isValidWebhookUrl(job.webhookUrl)) return;

  try {
    await fetch(job.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: job.id,
        provider: job.provider,
        status: job.status,
        result: job.result,
        error: job.error,
        updatedAt: job.updatedAt,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error(`[JobQueue] Failed to notify webhook for job ${job.id}`, error);
  }
}

export function enqueueGenerationJob(params: {
  provider: string;
  runner: () => Promise<GenerateResponse>;
  webhookUrl?: string;
}): GenerationJob {
  cleanupJobs();

  const createdAt = nowIso();
  const job: GenerationJob = {
    id: buildJobId(),
    provider: params.provider,
    status: "queued",
    createdAt,
    updatedAt: createdAt,
    webhookUrl: isValidWebhookUrl(params.webhookUrl) ? params.webhookUrl : undefined,
  };

  jobs.set(job.id, job);

  queueMicrotask(async () => {
    const startedAt = nowIso();
    const running: GenerationJob = {
      ...job,
      status: "running",
      startedAt,
      updatedAt: startedAt,
    };
    jobs.set(job.id, running);

    try {
      const result = await params.runner();
      const finishedAt = nowIso();
      const success = Boolean(result?.success);
      const completed: GenerationJob = {
        ...running,
        status: success ? "succeeded" : "failed",
        finishedAt,
        updatedAt: finishedAt,
        result,
        error: success ? undefined : result?.error || "Generation failed",
      };
      jobs.set(job.id, completed);
      await notifyWebhook(completed);
    } catch (error: any) {
      const finishedAt = nowIso();
      const failed: GenerationJob = {
        ...running,
        status: "failed",
        finishedAt,
        updatedAt: finishedAt,
        error: error?.message || "Generation failed",
      };
      jobs.set(job.id, failed);
      await notifyWebhook(failed);
    } finally {
      cleanupJobs();
    }
  });

  return job;
}

export function getGenerationJob(jobId: string): GenerationJob | null {
  cleanupJobs();
  return jobs.get(jobId) || null;
}

export function getGenerationJobStats() {
  cleanupJobs();
  const values = Array.from(jobs.values());

  return {
    total: values.length,
    queued: values.filter((item) => item.status === "queued").length,
    running: values.filter((item) => item.status === "running").length,
    succeeded: values.filter((item) => item.status === "succeeded").length,
    failed: values.filter((item) => item.status === "failed").length,
  };
}
