"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { WorkflowFile } from "@/store/workflowStore";
import { getAllPresets, PRESET_TEMPLATES } from "@/lib/quickstart/templates";
import { QuickstartBackButton } from "./QuickstartBackButton";
import { TemplateCard } from "./TemplateCard";
import { CommunityWorkflowMeta, TemplateCategory, TemplateMetadata } from "@/types/quickstart";
import { useWorkflowStore } from "@/store/workflowStore";
import type { ProviderModel } from "@/lib/providers/types";
import { createDefaultNodeData } from "@/store/utils/nodeDefaults";
import type { LLMGenerateRequest, LLMGenerateResponse } from "@/types";

interface TemplateExplorerViewProps {
  onBack: () => void;
  onWorkflowSelected: (workflow: WorkflowFile) => void;
  initialTab?: "templates" | "models";
  onOpenSettings?: () => void;
}

type CategoryFilter = "all" | TemplateCategory;

const CATEGORY_OPTIONS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "Vše" },
  { id: "simple", label: "Jednoduché" },
  { id: "advanced", label: "Pokročilé" },
  { id: "community", label: "Komunita" },
];

const MODEL_DESC_TRANSLATIONS_KEY = "node-banana-model-desc-cs-v1";

function loadModelDescTranslations(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MODEL_DESC_TRANSLATIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveModelDescTranslations(value: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MODEL_DESC_TRANSLATIONS_KEY, JSON.stringify(value));
  } catch {
    return;
  }
}

export function TemplateExplorerView({
  onBack,
  onWorkflowSelected,
  initialTab = "templates",
  onOpenSettings,
}: TemplateExplorerViewProps) {
  const [activeTab, setActiveTab] = useState<"templates" | "models">(initialTab);
  const [communityWorkflows, setCommunityWorkflows] = useState<CommunityWorkflowMeta[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providerSettings = useWorkflowStore((s) => s.providerSettings);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const presets = getAllPresets();

  // Debounce search query
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Calculate node counts for each preset
  const presetMetadata = useMemo(() => {
    const metadata: Record<string, TemplateMetadata> = {};
    PRESET_TEMPLATES.forEach((template) => {
      metadata[template.id] = {
        nodeCount: template.workflow.nodes.length,
        category: template.category,
        tags: template.tags,
      };
    });
    return metadata;
  }, []);

  // Primary thumbnails (resized content images - 288px for 2x retina)
  const primaryThumbnails: Record<string, string> = {
    "product-shot": "/template-thumbnails/primary/product-shot.jpg",
    "model-product": "/template-thumbnails/primary/model-product.jpg",
    "color-variations": "/template-thumbnails/primary/color-variations.jpg",
    "background-swap": "/template-thumbnails/primary/background-swap.jpg",
    "style-transfer": "/template-thumbnails/primary/style-transfer.jpg",
    "scene-composite": "/template-thumbnails/primary/scene-composite.jpg",
  };

  // Hover thumbnails (workflow screenshots - 288px)
  const hoverThumbnails: Record<string, string> = {
    "product-shot": "/template-thumbnails/product-shot.png",
    "model-product": "/template-thumbnails/model-product.png",
    "color-variations": "/template-thumbnails/color-variations.png",
    "background-swap": "/template-thumbnails/background-swap.png",
    "style-transfer": "/template-thumbnails/style-transfer.png",
    "scene-composite": "/template-thumbnails/scene-composite.png",
  };

  // Filter presets based on search, category, and tags
  const filteredPresets = useMemo(() => {
    return presets.filter((preset) => {
      // Search filter: match name or description
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        const matchesSearch =
          preset.name.toLowerCase().includes(searchLower) ||
          preset.description.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (categoryFilter !== "all" && categoryFilter !== "community") {
        if (preset.category !== categoryFilter) return false;
      }

      // If "community" is selected, hide preset templates (they're not community)
      if (categoryFilter === "community") {
        return false;
      }

      // Tags filter (OR logic - match ANY selected tag)
      if (selectedTags.size > 0) {
        const hasMatchingTag = preset.tags.some((tag) => selectedTags.has(tag));
        if (!hasMatchingTag) return false;
      }

      return true;
    });
  }, [presets, debouncedSearch, categoryFilter, selectedTags]);

  // Filter community workflows
  const filteredCommunity = useMemo(() => {
    // Only show community workflows if "all" or "community" category selected
    if (categoryFilter !== "all" && categoryFilter !== "community") {
      return [];
    }

    return communityWorkflows.filter((workflow) => {
      // Search filter
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        const matchesSearch =
          workflow.name.toLowerCase().includes(searchLower) ||
          workflow.author.toLowerCase().includes(searchLower) ||
          workflow.description.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Tags filter (OR logic - match ANY selected tag)
      if (selectedTags.size > 0) {
        const hasMatchingTag = workflow.tags.some((tag) => selectedTags.has(tag));
        if (!hasMatchingTag) return false;
      }

      return true;
    });
  }, [communityWorkflows, debouncedSearch, categoryFilter, selectedTags]);

  // Collect all unique tags from presets and community workflows
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    presets.forEach((preset) => {
      preset.tags.forEach((tag) => tags.add(tag));
    });
    communityWorkflows.forEach((workflow) => {
      workflow.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [presets, communityWorkflows]);

  // Toggle tag selection
  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setDebouncedSearch("");
    setCategoryFilter("all");
    setSelectedTags(new Set());
  }, []);

  // Check if any filters are active
  const hasActiveFilters = searchQuery || categoryFilter !== "all" || selectedTags.size > 0;

  // Check if results are empty
  const hasNoResults =
    filteredPresets.length === 0 &&
    (categoryFilter === "community" ? filteredCommunity.length === 0 : true) &&
    !isLoadingList;

  // Fetch community workflows on mount
  useEffect(() => {
    async function fetchCommunityWorkflows() {
      try {
        const [officialRes, shrimblyRes] = await Promise.all([
          fetch("/api/community-workflows"),
          fetch("/api/community-workflows?source=shrimbly"),
        ]);

        const [official, shrimbly] = await Promise.all([
          officialRes.json().catch(() => null),
          shrimblyRes.json().catch(() => null),
        ]);

        const combined: CommunityWorkflowMeta[] = [];
        if (official?.success && Array.isArray(official.workflows)) {
          combined.push(...official.workflows);
        } else if (official && official.success === false) {
          console.error("Failed to fetch community workflows:", official.error);
        }
        if (shrimbly?.success && Array.isArray(shrimbly.workflows)) {
          combined.push(...shrimbly.workflows);
        } else if (shrimbly && shrimbly.success === false) {
          console.error("Failed to fetch shrimbly workflows:", shrimbly.error);
        }

        setCommunityWorkflows(combined);
      } catch (err) {
        console.error("Error fetching community workflows:", err);
      } finally {
        setIsLoadingList(false);
      }
    }

    fetchCommunityWorkflows();
  }, []);

  const handlePresetSelect = useCallback(
    async (templateId: string) => {
      setLoadingWorkflowId(templateId);
      setError(null);

      try {
        const response = await fetch("/api/quickstart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId,
            contentLevel: "full",
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to load template");
        }

        if (result.workflow) {
          onWorkflowSelected(result.workflow);
        }
      } catch (err) {
        console.error("Error loading preset:", err);
        setError(err instanceof Error ? err.message : "Failed to load template");
      } finally {
        setLoadingWorkflowId(null);
      }
    },
    [onWorkflowSelected]
  );

  const handleCommunitySelect = useCallback(
    async (workflowId: string) => {
      setLoadingWorkflowId(workflowId);
      setError(null);

      try {
        // Step 1: Get presigned download URL from API
        const response = await fetch(`/api/community-workflows/${workflowId}`);
        const result = await response.json();

        if (!result.success || !result.downloadUrl) {
          throw new Error(result.error || "Failed to get download URL");
        }

        // Step 2: Download workflow directly from R2
        const workflowResponse = await fetch(result.downloadUrl);
        if (!workflowResponse.ok) {
          throw new Error("Failed to download workflow");
        }

        const workflow = await workflowResponse.json();
        onWorkflowSelected(workflow);
      } catch (err) {
        console.error("Error loading community workflow:", err);
        setError(err instanceof Error ? err.message : "Failed to load workflow");
      } finally {
        setLoadingWorkflowId(null);
      }
    },
    [onWorkflowSelected]
  );

  const isLoading = loadingWorkflowId !== null;

  const [models, setModels] = useState<ProviderModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [translatedDescriptions, setTranslatedDescriptions] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<Record<string, boolean>>({});
  const [modelsSearch, setModelsSearch] = useState("");
  const [debouncedModelsSearch, setDebouncedModelsSearch] = useState("");
  const modelsSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [providerFilter, setProviderFilter] = useState<{ replicate: boolean; fal: boolean }>({
    replicate: true,
    fal: true,
  });
  const [capabilityFilter, setCapabilityFilter] = useState<"all" | "image" | "video">("all");

  useEffect(() => {
    setTranslatedDescriptions(loadModelDescTranslations());
  }, []);

  useEffect(() => {
    if (modelsSearchTimeoutRef.current) clearTimeout(modelsSearchTimeoutRef.current);
    modelsSearchTimeoutRef.current = setTimeout(() => {
      setDebouncedModelsSearch(modelsSearch);
    }, 300);
    return () => {
      if (modelsSearchTimeoutRef.current) clearTimeout(modelsSearchTimeoutRef.current);
    };
  }, [modelsSearch]);

  const fetchModels = useCallback(async () => {
    setIsLoadingModels(true);
    setModelsError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedModelsSearch) params.set("search", debouncedModelsSearch);
      if (capabilityFilter !== "all") {
        params.set(
          "capabilities",
          capabilityFilter === "image"
            ? "text-to-image,image-to-image"
            : "text-to-video,image-to-video"
        );
      }

      const headers: Record<string, string> = {};
      const replicateKey = providerSettings.providers.replicate?.apiKey;
      const falKey = providerSettings.providers.fal?.apiKey;
      if (replicateKey) headers["X-Replicate-Key"] = replicateKey;
      if (falKey) headers["X-Fal-Key"] = falKey;

      const res = await fetch(`/api/models?${params.toString()}`, { headers });
      const data = await res.json();
      if (!data?.success || !Array.isArray(data?.models)) {
        throw new Error(data?.error || "Failed to fetch models");
      }

      const onlyExternal = data.models.filter((m: ProviderModel) => m.provider === "replicate" || m.provider === "fal");
      setModels(onlyExternal);
    } catch (e) {
      setModels([]);
      setModelsError(e instanceof Error ? e.message : "Failed to fetch models");
    } finally {
      setIsLoadingModels(false);
    }
  }, [debouncedModelsSearch, capabilityFilter, providerSettings]);

  useEffect(() => {
    if (activeTab === "models") {
      fetchModels();
    }
  }, [activeTab, fetchModels]);

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (!providerFilter.fal && m.provider === "fal") return false;
      if (!providerFilter.replicate && m.provider === "replicate") return false;
      return true;
    });
  }, [models, providerFilter]);

  const canTranslate = !!(
    providerSettings.providers.gemini?.apiKey ||
    providerSettings.providers.openai?.apiKey
  );

  const translateModelDescription = useCallback(
    async (model: ProviderModel) => {
      const key = `${model.provider}:${model.id}`;
      if (!model.description) return;
      if (translatedDescriptions[key]) return;
      if (translating[key]) return;

      const geminiKey = providerSettings.providers.gemini?.apiKey;
      const openaiKey = providerSettings.providers.openai?.apiKey;
      const provider = geminiKey ? "google" : openaiKey ? "openai" : null;
      if (!provider) return;

      setTranslating((prev) => ({ ...prev, [key]: true }));
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (provider === "google" && geminiKey) headers["X-Gemini-API-Key"] = geminiKey;
        if (provider === "openai" && openaiKey) headers["X-OpenAI-API-Key"] = openaiKey;

        const body: LLMGenerateRequest = {
          provider,
          model: provider === "google" ? "gemini-3-flash-preview" : "gpt-4.1-mini",
          temperature: 0.2,
          maxTokens: 512,
          prompt: [
            "Přelož následující anglický popis AI modelu do češtiny.",
            "- Zachovej názvy produktů, providerů a technické termíny (např. LoRA, CFG, seed).",
            "- Nezkracuj význam, ale buď stručný.",
            "- Nevracej nic jiného než samotný překlad (žádné uvozovky, žádné vysvětlování).",
            "---",
            model.description,
          ].join("\n"),
        };

        const res = await fetch("/api/llm", { method: "POST", headers, body: JSON.stringify(body) });
        const data: LLMGenerateResponse = await res.json();
        if (!res.ok || !data.success || !data.text) {
          throw new Error(data.success === false ? data.error : "Translation failed");
        }
        const translated = data.text.trim();
        if (!translated) return;
        const next = { ...translatedDescriptions, [key]: translated };
        setTranslatedDescriptions(next);
        saveModelDescTranslations(next);
      } finally {
        setTranslating((prev) => ({ ...prev, [key]: false }));
      }
    },
    [providerSettings, translatedDescriptions, translating]
  );

  const createWorkflowFromModel = useCallback(
    (model: ProviderModel) => {
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `wf-${Date.now()}`;
      const promptNodeId = `prompt-${id}`;
      const genNodeId = `gen-${id}`;
      const outNodeId = `out-${id}`;

      const isVideoModel = model.capabilities.some((cap) => cap === "text-to-video" || cap === "image-to-video");
      const genNodeType = isVideoModel ? "generateVideo" : "nanoBanana";

      const promptNode = {
        id: promptNodeId,
        type: "prompt",
        position: { x: 120, y: 220 },
        data: createDefaultNodeData("prompt"),
      };

      const genNodeBaseData = createDefaultNodeData(genNodeType as any) as any;
      const genNode = {
        id: genNodeId,
        type: genNodeType,
        position: { x: 520, y: 200 },
        data: {
          ...genNodeBaseData,
          selectedModel: {
            provider: model.provider,
            modelId: model.id,
            displayName: model.name,
          },
          model: genNodeType === "nanoBanana" ? (genNodeBaseData.model || "nano-banana-pro") : undefined,
        },
      };

      const outNode = {
        id: outNodeId,
        type: "output",
        position: { x: 920, y: 200 },
        data: createDefaultNodeData("output"),
      };

      const edges = [
        {
          id: `e-${promptNodeId}-${genNodeId}`,
          source: promptNodeId,
          target: genNodeId,
          sourceHandle: "text",
          targetHandle: "text",
        },
        {
          id: `e-${genNodeId}-${outNodeId}`,
          source: genNodeId,
          target: outNodeId,
          sourceHandle: isVideoModel ? "video" : "image",
          targetHandle: "image",
        },
      ];

      const workflow: WorkflowFile = {
        version: 1,
        id,
        name: `${model.provider.toUpperCase()}: ${model.name}`,
        nodes: [promptNode as any, genNode as any, outNode as any],
        edges: edges as any,
        edgeStyle: "curved",
      };

      onWorkflowSelected(workflow);
    },
    [onWorkflowSelected]
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-neutral-700 flex items-center gap-4">
        <QuickstartBackButton onClick={onBack} disabled={isLoading} />
        <h2 className="text-lg font-semibold text-neutral-100">
          Průzkumník
        </h2>

        <div className="ml-auto flex items-center gap-1 bg-neutral-900/50 border border-neutral-700 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setActiveTab("templates")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "templates"
                ? "bg-blue-500/20 text-blue-300"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Šablony
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("models")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "models"
                ? "bg-blue-500/20 text-blue-300"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Modely
          </button>
        </div>
      </div>

      {/* Content - Sidebar + Main Grid */}
      <div className="flex-1 flex min-h-0 overflow-clip">
        {activeTab === "models" ? (
          <>
            <div className="w-56 flex-shrink-0 bg-neutral-900/80 border-r border-neutral-700 p-4 space-y-5 overflow-y-auto">
              <div className="space-y-2">
                <h3 className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Hledat</h3>
                <input
                  type="text"
                  value={modelsSearch}
                  onChange={(e) => setModelsSearch(e.target.value)}
                  placeholder="Hledat modely…"
                  className="w-full px-3 py-2 text-[13px] bg-neutral-700/50 border border-neutral-600 rounded-lg text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Provider</h3>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setProviderFilter((p) => ({ ...p, replicate: !p.replicate }))}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md text-left transition-colors ${
                      providerFilter.replicate
                        ? "bg-blue-500/20 border border-blue-500/50 text-blue-300"
                        : "bg-neutral-700/30 border border-transparent text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
                    }`}
                  >
                    Replicate
                  </button>
                  <button
                    type="button"
                    onClick={() => setProviderFilter((p) => ({ ...p, fal: !p.fal }))}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md text-left transition-colors ${
                      providerFilter.fal
                        ? "bg-blue-500/20 border border-blue-500/50 text-blue-300"
                        : "bg-neutral-700/30 border border-transparent text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
                    }`}
                  >
                    fal.ai
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Typ</h3>
                <div className="flex flex-col gap-1">
                  {[
                    { id: "all" as const, label: "Vše" },
                    { id: "image" as const, label: "Obrázek" },
                    { id: "video" as const, label: "Video" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCapabilityFilter(opt.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md text-left transition-colors ${
                        capabilityFilter === opt.id
                          ? "bg-blue-500/20 border border-blue-500/50 text-blue-300"
                          : "bg-neutral-700/30 border border-transparent text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {(!providerSettings.providers.replicate?.apiKey || !providerSettings.providers.fal?.apiKey) && (
                <div className="text-[11px] text-neutral-400 space-y-2">
                  <div>
                    {!providerSettings.providers.replicate?.apiKey && (
                      <div>Replicate: chybí API klíč</div>
                    )}
                    {!providerSettings.providers.fal?.apiKey && <div>fal.ai: chybí API klíč</div>}
                  </div>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="w-full px-3 py-2 text-xs font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors"
                    >
                      Otevřít nastavení
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Modely
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchModels}
                    className="px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-700/40 hover:bg-neutral-700/60 rounded-md transition-colors"
                    disabled={isLoadingModels}
                  >
                    Obnovit
                  </button>
                </div>
              </div>

              {modelsError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  {modelsError}
                </div>
              )}

              {isLoadingModels ? (
                <div className="text-[13px] text-neutral-400">Načítám modely…</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredModels.map((m) => (
                    <button
                      key={`${m.provider}:${m.id}`}
                      type="button"
                      onClick={() => createWorkflowFromModel(m)}
                      className="text-left p-4 rounded-lg border border-neutral-700/50 hover:border-neutral-600 hover:bg-neutral-800/40 transition-all duration-150"
                    title="Vytvořit workflow z tohoto modelu"
                    >
                      <div className="flex gap-3">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-neutral-900/60 border border-neutral-700/50 flex items-center justify-center flex-shrink-0">
                          {m.coverImage ? (
                            <img
                              src={m.coverImage}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <span className="text-[11px] text-neutral-500">Bez náhledu</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium text-neutral-200 truncate">
                                {m.name}
                              </div>
                              <div className="text-[12px] text-neutral-500 mt-0.5 truncate">
                                {m.provider} • {m.capabilities.join(", ")}
                              </div>
                            </div>
                            <span className="text-[11px] font-medium text-blue-300 bg-blue-500/10 rounded px-2 py-1 shrink-0">
                              Použít
                            </span>
                          </div>

                          {m.description && (
                            <div className="text-[12px] text-neutral-400 mt-2 line-clamp-3">
                              {translatedDescriptions[`${m.provider}:${m.id}`] || m.description}
                            </div>
                          )}

                          {m.description && !translatedDescriptions[`${m.provider}:${m.id}`] && (
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  translateModelDescription(m).catch(() => null);
                                }}
                                className="px-2.5 py-1 text-[11px] font-medium text-neutral-200 bg-neutral-700/50 hover:bg-neutral-700 rounded-md transition-colors disabled:opacity-60"
                                disabled={!canTranslate || !!translating[`${m.provider}:${m.id}`]}
                                title={canTranslate ? "Přeložit do češtiny" : "Nastav Gemini/OpenAI klíč v nastavení"}
                              >
                                {translating[`${m.provider}:${m.id}`] ? "Překládám…" : "Přeložit"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
        <div className="w-48 flex-shrink-0 bg-neutral-900/80 border-r border-neutral-700 p-4 space-y-5 overflow-y-auto">
          {/* Search Input */}
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat šablony…"
              className="w-full pl-8 pr-3 py-2 text-[13px] bg-neutral-700/50 border border-neutral-600 rounded-lg text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Category Filters */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Kategorie</h3>
            <div className="flex flex-col gap-1">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setCategoryFilter(option.id)}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded-md text-left transition-colors
                    ${
                      categoryFilter === option.id
                        ? "bg-blue-500/20 border border-blue-500/50 text-blue-300"
                        : "bg-neutral-700/30 border border-transparent text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
                    }
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Provider Tags */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Provider</h3>
            <div className="flex flex-col gap-1">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded-md text-left transition-colors
                    ${
                      selectedTags.has(tag)
                        ? "bg-blue-500/20 border border-blue-500/50 text-blue-300"
                        : "bg-neutral-700/30 border border-transparent text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
                    }
                  `}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="w-full px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-300 bg-neutral-700/30 hover:bg-neutral-700/50 rounded-md transition-colors"
            >
              Vyčistit filtry
            </button>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-6">
          {/* Empty State */}
          {hasNoResults && hasActiveFilters && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg
                className="w-12 h-12 text-neutral-600 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <h3 className="text-[13px] font-medium text-neutral-300 mb-1">Nenalezeny žádné šablony</h3>
              <p className="text-[12px] text-neutral-500 mb-4">Zkus upravit vyhledávání nebo filtry</p>
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors"
              >
                Vyčistit vše
              </button>
            </div>
          )}

          {/* Quick Start Templates */}
          {filteredPresets.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Rychlý start
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {filteredPresets.map((preset) => (
                  <TemplateCard
                    key={preset.id}
                    template={preset}
                    nodeCount={presetMetadata[preset.id]?.nodeCount ?? 0}
                    previewImage={primaryThumbnails[preset.id]}
                    hoverImage={hoverThumbnails[preset.id]}
                    isLoading={loadingWorkflowId === preset.id}
                    onUseWorkflow={() => handlePresetSelect(preset.id)}
                    disabled={isLoading && loadingWorkflowId !== preset.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          {filteredPresets.length > 0 && (filteredCommunity.length > 0 || (isLoadingList && categoryFilter !== "community")) && (
            <div className="border-t border-neutral-700" />
          )}

          {/* Community Workflows */}
          {(filteredCommunity.length > 0 || (isLoadingList && (categoryFilter === "all" || categoryFilter === "community"))) && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Komunita
              </h3>

              {isLoadingList ? (
                <div className="flex items-center justify-center py-8">
                  <svg
                    className="w-5 h-5 text-neutral-500 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredCommunity.map((workflow) => (
                    <TemplateCard
                      key={workflow.id}
                      template={{
                        id: workflow.id,
                        name: workflow.name,
                        description: workflow.description,
                        icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
                        category: "community",
                        tags: workflow.tags,
                      }}
                      nodeCount={workflow.nodeCount}
                      previewImage={workflow.previewImage}
                      hoverImage={workflow.hoverImage}
                      isLoading={loadingWorkflowId === workflow.id}
                      onUseWorkflow={() => handleCommunitySelect(workflow.id)}
                      disabled={isLoading && loadingWorkflowId !== workflow.id}
                    />
                  ))}
                </div>
              )}

              {/* Discord CTA */}
              <p className="text-xs text-neutral-500 mt-3">
                Chceš sdílet svoje workflow?{" "}
                <a
                  href="https://discord.com/invite/89Nr6EKkTf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 underline"
                >
                  Přidej se na Discord
                </a>{" "}
                a pošli ho do komunitních šablon.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <svg
                className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="text-xs text-red-400/70 hover:text-red-400 mt-1"
                >
                  Zavřít
                </button>
              </div>
            </div>
          )}
        </div>
          </>
        )}
      </div>

    </div>
  );
}
