import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "@/utils/logger";
import { assertLocalFsApiEnabled, assertPathAllowed, sanitizeIdSegment } from "@/lib/security/localFs";

export const maxDuration = 300; // 5 minute timeout for large image operations

const IMAGES_FOLDER = "inputs";
const LEGACY_IMAGES_FOLDER = ".images"; // For backward compatibility

// POST: Save an image to the workflow's inputs or generations folder
export async function POST(request: NextRequest) {
  let workflowPath: string | undefined;
  let imageId: string | undefined;
  let folder: string | undefined;
  try {
    assertLocalFsApiEnabled();

    const body = await request.json();
    workflowPath = body.workflowPath;
    imageId = body.imageId;
    folder = body.folder || IMAGES_FOLDER; // Default to "inputs"
    const imageData = body.imageData; // Base64 data URL

    // Validate folder is one of the allowed values
    if (folder !== IMAGES_FOLDER && folder !== "generations") {
      folder = IMAGES_FOLDER;
    }

    logger.info('file.save', 'Workflow image save request received', {
      workflowPath,
      imageId,
      folder,
      hasImageData: !!imageData,
    });

    if (!workflowPath || !imageId || !imageData) {
      logger.warn('file.save', 'Workflow image save validation failed: missing fields', {
        hasWorkflowPath: !!workflowPath,
        hasImageId: !!imageId,
        hasImageData: !!imageData,
      });
      return NextResponse.json(
        { success: false, error: "Missing required fields (workflowPath, imageId, imageData)" },
        { status: 400 }
      );
    }

    const safeWorkflowPath = assertPathAllowed(workflowPath);
    const safeImageId = sanitizeIdSegment(imageId);
    if (!safeImageId) {
      return NextResponse.json(
        { success: false, error: "Invalid imageId format" },
        { status: 400 }
      );
    }

    // Validate workflow directory exists
    try {
      const stats = await fs.stat(safeWorkflowPath);
      if (!stats.isDirectory()) {
        logger.warn('file.error', 'Workflow image save failed: path is not a directory', {
          workflowPath: safeWorkflowPath,
        });
        return NextResponse.json(
          { success: false, error: "Workflow path is not a directory" },
          { status: 400 }
        );
      }
    } catch (dirError) {
      logger.warn('file.error', 'Workflow image save failed: directory does not exist', {
        workflowPath: safeWorkflowPath,
      });
      return NextResponse.json(
        { success: false, error: "Workflow directory does not exist" },
        { status: 400 }
      );
    }

    // Create target folder if it doesn't exist
    const targetFolder = path.join(safeWorkflowPath, folder);
    try {
      await fs.mkdir(targetFolder, { recursive: true });
    } catch (mkdirError) {
      logger.error('file.error', 'Failed to create target folder', {
        targetFolder,
      }, mkdirError instanceof Error ? mkdirError : undefined);
      return NextResponse.json(
        { success: false, error: "Failed to create target folder" },
        { status: 500 }
      );
    }

    // Construct file path
    const filename = `${safeImageId}.png`;
    const filePath = path.join(targetFolder, filename);

    // Extract base64 data and convert to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Write the image file
    await fs.writeFile(filePath, buffer);

    logger.info('file.save', 'Workflow image saved successfully', {
      filePath,
      imageId,
      fileSize: buffer.length,
    });

    return NextResponse.json({
      success: true,
      imageId: safeImageId,
      filePath,
    });
  } catch (error) {
    if (error instanceof Error && (
      error.message === "Local filesystem API is disabled in production" ||
      error.message === "Path is outside allowed roots"
    )) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }
    logger.error('file.error', 'Failed to save workflow image', {
      workflowPath,
      imageId,
    }, error instanceof Error ? error : undefined);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Save failed",
      },
      { status: 500 }
    );
  }
}

// GET: Load an image from the workflow's folders (inputs, generations, or legacy .images)
export async function GET(request: NextRequest) {
  const workflowPath = request.nextUrl.searchParams.get("workflowPath");
  const imageId = request.nextUrl.searchParams.get("imageId");
  const folder = request.nextUrl.searchParams.get("folder"); // Optional hint for which folder to check first

  logger.info('file.load', 'Workflow image load request received', {
    workflowPath,
    imageId,
    folder,
  });

  if (!workflowPath || !imageId) {
    logger.warn('file.load', 'Workflow image load validation failed: missing parameters', {
      hasWorkflowPath: !!workflowPath,
      hasImageId: !!imageId,
    });
    return NextResponse.json(
      { success: false, error: "Missing required parameters (workflowPath, imageId)" },
      { status: 400 }
    );
  }

  try {
    assertLocalFsApiEnabled();
    const safeWorkflowPath = assertPathAllowed(workflowPath);
    const safeImageId = sanitizeIdSegment(imageId);
    if (!safeImageId) {
      return NextResponse.json(
        { success: false, error: "Invalid imageId format" },
        { status: 400 }
      );
    }

    // Validate workflow directory exists
    try {
      const stats = await fs.stat(safeWorkflowPath);
      if (!stats.isDirectory()) {
        return NextResponse.json(
          { success: false, error: "Workflow path is not a directory" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Workflow directory does not exist" },
        { status: 400 }
      );
    }

    // Construct file path - check folders in order based on hint
    const filename = `${safeImageId}.png`;
    const inputsFolder = path.join(safeWorkflowPath, IMAGES_FOLDER);
    const generationsFolder = path.join(safeWorkflowPath, "generations");
    const legacyFolder = path.join(safeWorkflowPath, LEGACY_IMAGES_FOLDER);

    // Build search order based on folder hint
    const searchOrder = folder === "generations"
      ? [generationsFolder, inputsFolder, legacyFolder]
      : [inputsFolder, generationsFolder, legacyFolder];

    let filePath: string | null = null;

    // Check each folder in order
    for (const searchFolder of searchOrder) {
      const candidatePath = path.join(searchFolder, filename);
      try {
        await fs.access(candidatePath);
        filePath = candidatePath;
        if (searchFolder === legacyFolder) {
          logger.info('file.load', 'Found image in legacy .images folder', { filePath });
        }
        break;
      } catch {
        // File not found in this folder, try next
      }
    }

    if (!filePath) {
      // Return 200 with success: false to avoid Next.js error overlay
      // Missing files are expected when workflow refs point to deleted/moved images
      logger.info('file.load', 'Workflow image not found (expected for missing refs)', {
        imageId,
        searchedFolders: searchOrder,
      });
      return NextResponse.json({
        success: false,
        error: "Image file not found",
        notFound: true,
      });
    }

    // Read the image file
    const buffer = await fs.readFile(filePath);

    // Convert to base64 data URL
    const base64 = buffer.toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    logger.info('file.load', 'Workflow image loaded successfully', {
      filePath,
      imageId,
      fileSize: buffer.length,
    });

    return NextResponse.json({
      success: true,
        imageId,
        image: dataUrl,
      });
  } catch (error) {
    if (error instanceof Error && (
      error.message === "Local filesystem API is disabled in production" ||
      error.message === "Path is outside allowed roots"
    )) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }
    logger.error('file.error', 'Failed to load workflow image', {
      workflowPath,
      imageId,
    }, error instanceof Error ? error : undefined);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Load failed",
      },
      { status: 500 }
    );
  }
}
