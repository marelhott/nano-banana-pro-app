import { NextResponse } from "next/server";

const DEFAULT_COMMUNITY_WORKFLOWS_API_URL =
  "https://nodebananapro.com/api/public/community-workflows";

function getCatalogBaseUrl() {
  return process.env.COMMUNITY_WORKFLOWS_API_URL || DEFAULT_COMMUNITY_WORKFLOWS_API_URL;
}

type ProviderTag = "fal" | "replicate" | "gemini" | "openai";

function detectProviders(workflow: any): ProviderTag[] {
  const providers = new Set<ProviderTag>();
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];

  for (const node of nodes) {
    const candidate =
      node?.data?.selectedModel?.provider ||
      node?.data?.model?.provider ||
      node?.data?.provider ||
      null;
    if (!candidate) continue;
    const p = String(candidate).toLowerCase();
    if (p === "fal" || p === "replicate" || p === "gemini" || p === "openai") {
      providers.add(p);
    }
  }

  return Array.from(providers);
}

async function fetchShrimblyExamples() {
  const listUrl = "https://api.github.com/repos/shrimbly/node-banana/contents/examples";
  const listRes = await fetch(listUrl, {
    headers: { Accept: "application/vnd.github+json" },
    next: { revalidate: 300 },
  });

  if (!listRes.ok) {
    throw new Error(`Failed to fetch shrimbly examples list: ${listRes.status}`);
  }

  const entries = await listRes.json();
  const jsonFiles = Array.isArray(entries)
    ? entries.filter((e: any) => e?.type === "file" && typeof e?.name === "string" && e.name.toLowerCase().endsWith(".json"))
    : [];

  const workflows = await Promise.all(
    jsonFiles.map(async (file: any) => {
      const rawUrl = `https://raw.githubusercontent.com/shrimbly/node-banana/master/examples/${encodeURIComponent(file.name)}`;
      const wfRes = await fetch(rawUrl, { next: { revalidate: 300 } });
      if (!wfRes.ok) {
        return null;
      }
      const workflow = await wfRes.json();
      const nodeCount = Array.isArray(workflow?.nodes) ? workflow.nodes.length : 0;
      const providers = detectProviders(workflow);
      const tags = providers.length > 0 ? providers : [];
      const id = `shrimbly:${file.name}`;
      const name = String(file.name).replace(/\.json$/i, "").replace(/[-_]/g, " ");
      return {
        id,
        name,
        description: "Imported from shrimbly/node-banana examples",
        tags,
        nodeCount,
        previewImage: undefined,
        hoverImage: undefined,
        provider: providers[0] || undefined,
      };
    })
  );

  return workflows.filter(Boolean);
}

/**
 * GET: List all community workflows from the remote API
 *
 * This proxies to the node-banana-pro hosted service which stores
 * community workflows in R2 storage.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const providerFilter = url.searchParams.get("provider")?.toLowerCase();
    const source = (url.searchParams.get("source") || "official").toLowerCase();

    if (source === "shrimbly" || source === "node-banana" || source === "github") {
      const workflows = await fetchShrimblyExamples();
      const filtered =
        providerFilter && (providerFilter === "fal" || providerFilter === "replicate")
          ? workflows.filter((w: any) => Array.isArray(w?.tags) && w.tags.map((t: any) => String(t).toLowerCase()).includes(providerFilter))
          : workflows;

      return NextResponse.json({
        success: true,
        workflows: filtered,
      });
    }

    const response = await fetch(getCatalogBaseUrl(), {
      headers: {
        Accept: "application/json",
      },
      // Cache for 5 minutes
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      console.error(
        "Error fetching community workflows:",
        response.status,
        response.statusText
      );
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch community workflows",
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data && data.success === true && Array.isArray(data.workflows)) {
      data.workflows = data.workflows.map((w: any) => {
        const provider = w?.provider ? String(w.provider).toLowerCase() : null;
        const tags = Array.isArray(w?.tags) ? w.tags.map((t: any) => String(t).toLowerCase()) : [];
        const mergedTags = provider && !tags.includes(provider) ? [...tags, provider] : tags;
        return {
          ...w,
          provider: provider || w?.provider,
          tags: mergedTags,
        };
      });
    }

    if (
      providerFilter &&
      (providerFilter === "fal" || providerFilter === "replicate") &&
      data &&
      data.success === true &&
      Array.isArray(data.workflows)
    ) {
      const normalized = data.workflows.filter((w: any) => {
        const tags = Array.isArray(w?.tags) ? w.tags.map((t: any) => String(t).toLowerCase()) : [];
        const provider = w?.provider ? String(w.provider).toLowerCase() : null;
        return provider === providerFilter || tags.includes(providerFilter);
      });

      return NextResponse.json({
        ...data,
        workflows: normalized,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error listing community workflows:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to list community workflows",
      },
      { status: 500 }
    );
  }
}
