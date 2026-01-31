import { NextResponse } from "next/server";

const DEFAULT_COMMUNITY_WORKFLOWS_API_URL =
  "https://nodebananapro.com/api/public/community-workflows";

function getCatalogBaseUrl() {
  return process.env.COMMUNITY_WORKFLOWS_API_URL || DEFAULT_COMMUNITY_WORKFLOWS_API_URL;
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
