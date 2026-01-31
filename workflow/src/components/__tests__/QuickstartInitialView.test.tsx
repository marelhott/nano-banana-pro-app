import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuickstartInitialView } from "@/components/quickstart/QuickstartInitialView";

describe("QuickstartInitialView", () => {
  const mockOnSelectBlankCanvas = vi.fn();
  const mockOnSelectTemplates = vi.fn();
  const mockOnSelectModels = vi.fn();
  const mockOnSelectVibe = vi.fn();
  const mockOnSelectLoad = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Rendering", () => {
    it("should render the Node Banana title and logo", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      expect(screen.getByText("Node Banana")).toBeInTheDocument();
      expect(screen.getByAltText("")).toBeInTheDocument(); // Logo image
    });

    it("should render the description text", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      expect(
        screen.getByText(/editor workflowů založený na uzlech/i)
      ).toBeInTheDocument();
    });

    it("should render all five option buttons", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      expect(screen.getByText("Prázdné plátno")).toBeInTheDocument();
      expect(screen.getByText("Načíst workflow")).toBeInTheDocument();
      expect(screen.getByText("Šablony")).toBeInTheDocument();
      expect(screen.getByText("Modely")).toBeInTheDocument();
      expect(screen.getByText("Vygenerovat workflow")).toBeInTheDocument();
    });

    it("should render option descriptions", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      expect(screen.getByText("Začít od nuly")).toBeInTheDocument();
      expect(screen.getByText("Otevřít existující soubor")).toBeInTheDocument();
      expect(screen.getByText("Předpřipravené workflow")).toBeInTheDocument();
      expect(screen.getByText("Prohlížet fal.ai a Replicate")).toBeInTheDocument();
      expect(screen.getByText("Vygenerovat workflow")).toBeInTheDocument();
    });
  });

  describe("Blank Canvas Option", () => {
    it("should call onSelectBlankCanvas when clicked", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      fireEvent.click(screen.getByText("Prázdné plátno"));

      expect(mockOnSelectBlankCanvas).toHaveBeenCalledTimes(1);
    });

    it("should display correct description for blank canvas", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      expect(screen.getByText("Začít od nuly")).toBeInTheDocument();
    });
  });

  describe("Load Workflow Option", () => {
    it("should call onSelectLoad when clicked", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      fireEvent.click(screen.getByText("Načíst workflow"));

      expect(mockOnSelectLoad).toHaveBeenCalledTimes(1);
    });
  });

  describe("Templates Option", () => {
    it("should call onSelectTemplates when clicked", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      fireEvent.click(screen.getByText("Šablony"));

      expect(mockOnSelectTemplates).toHaveBeenCalledTimes(1);
    });
  });

  describe("Prompt a Workflow Option", () => {
    it("should call onSelectVibe when clicked", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      fireEvent.click(screen.getByText("Vygenerovat workflow"));

      expect(mockOnSelectVibe).toHaveBeenCalledTimes(1);
    });

    it("should display Beta badge on prompt option", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      expect(screen.getByText("Beta")).toBeInTheDocument();
    });
  });

  describe("External Links", () => {
    it("should render Discord link with correct URL", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      const discordLink = screen.getByText("Discord").closest("a");
      expect(discordLink).toHaveAttribute(
        "href",
        "https://discord.com/invite/89Nr6EKkTf"
      );
      expect(discordLink).toHaveAttribute("target", "_blank");
      expect(discordLink).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("should render Twitter/X link with correct URL", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      const twitterLink = screen.getByText("Willie").closest("a");
      expect(twitterLink).toHaveAttribute("href", "https://x.com/ReflctWillie");
      expect(twitterLink).toHaveAttribute("target", "_blank");
      expect(twitterLink).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("should render docs link", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      const docsLink = screen.getByText("Docs").closest("a");
      expect(docsLink).toHaveAttribute("href", "https://node-banana-docs.vercel.app/");
      expect(docsLink).toHaveAttribute("target", "_blank");
      expect(docsLink).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("Accessibility", () => {
    it("should have all buttons as interactive button elements", () => {
      render(
        <QuickstartInitialView
          onSelectBlankCanvas={mockOnSelectBlankCanvas}
          onSelectTemplates={mockOnSelectTemplates}
          onSelectModels={mockOnSelectModels}
          onSelectVibe={mockOnSelectVibe}
          onSelectLoad={mockOnSelectLoad}
        />
      );

      const buttons = screen.getAllByRole("button");
      // Should have 5 option buttons
      expect(buttons.length).toBe(5);
    });
  });
});
