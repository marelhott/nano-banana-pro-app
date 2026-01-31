"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useCommentNavigation } from "@/hooks/useCommentNavigation";
import { useWorkflowStore } from "@/store/workflowStore";
import { PromptNodeData } from "@/types";
import { PromptEditorModal } from "@/components/modals/PromptEditorModal";

type PromptNodeType = Node<PromptNodeData, "prompt">;

export function PromptNode({ id, data, selected }: NodeProps<PromptNodeType>) {
  const nodeData = data;
  const commentNavigation = useCommentNavigation(id);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const incrementModalCount = useWorkflowStore((state) => state.incrementModalCount);
  const decrementModalCount = useWorkflowStore((state) => state.decrementModalCount);
  const getConnectedInputs = useWorkflowStore((state) => state.getConnectedInputs);
  const edges = useWorkflowStore((state) => state.edges);
  const [isModalOpenLocal, setIsModalOpenLocal] = useState(false);

  // Local state for prompt to prevent cursor jumping during typing
  const [localPrompt, setLocalPrompt] = useState(nodeData.prompt);
  const [isEditing, setIsEditing] = useState(false);

  // Check if this node has any incoming text connections
  const hasIncomingTextConnection = useMemo(() => {
    return edges.some((edge) => edge.target === id && edge.targetHandle === "text");
  }, [edges, id]);

  // Get connected text input and update prompt when connection provides text
  useEffect(() => {
    if (hasIncomingTextConnection) {
      const { text } = getConnectedInputs(id);
      if (text !== null && text !== nodeData.prompt) {
        updateNodeData(id, { prompt: text });
      }
    }
  }, [hasIncomingTextConnection, id, getConnectedInputs, updateNodeData, nodeData.prompt]);

  // Sync from props when not actively editing
  useEffect(() => {
    if (!isEditing) {
      setLocalPrompt(nodeData.prompt);
    }
  }, [nodeData.prompt, isEditing]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalPrompt(e.target.value);
    },
    []
  );

  const handleFocus = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (localPrompt !== nodeData.prompt) {
      updateNodeData(id, { prompt: localPrompt });
    }
  }, [id, localPrompt, nodeData.prompt, updateNodeData]);

  const handleOpenModal = useCallback(() => {
    setIsModalOpenLocal(true);
    incrementModalCount();
  }, [incrementModalCount]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpenLocal(false);
    decrementModalCount();
  }, [decrementModalCount]);

  const handleSubmitModal = useCallback(
    (prompt: string) => {
      updateNodeData(id, { prompt });
    },
    [id, updateNodeData]
  );

  return (
    <>
      <BaseNode
        id={id}
        title="Prompt"
        customTitle={nodeData.customTitle}
        comment={nodeData.comment}
        onCustomTitleChange={(title) => updateNodeData(id, { customTitle: title || undefined })}
        onCommentChange={(comment) => updateNodeData(id, { comment: comment || undefined })}
        onExpand={handleOpenModal}
        selected={selected}
        commentNavigation={commentNavigation ?? undefined}
      >
        {/* Text input handle - for receiving text from LLM nodes */}
        <Handle
          type="target"
          position={Position.Left}
          id="text"
          data-handletype="text"
        />

        <textarea
          value={localPrompt}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={hasIncomingTextConnection ? "Receiving text from connected node..." : "Describe what to generate..."}
          className="nodrag nopan nowheel w-full flex-1 min-h-[70px] p-2 text-xs leading-relaxed text-neutral-100 border border-neutral-700 rounded bg-neutral-900/50 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-600 focus:border-neutral-600 placeholder:text-neutral-500"
          readOnly={hasIncomingTextConnection}
        />

        {/* Text output handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="text"
          data-handletype="text"
        />
      </BaseNode>

      {/* Modal - rendered via portal to escape React Flow stacking context */}
      {isModalOpenLocal && createPortal(
        <PromptEditorModal
          isOpen={isModalOpenLocal}
          initialPrompt={nodeData.prompt}
          onSubmit={handleSubmitModal}
          onClose={handleCloseModal}
        />,
        document.body
      )}
    </>
  );
}
