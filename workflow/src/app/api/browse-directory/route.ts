import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { assertLocalFsApiEnabled, assertPathAllowed } from "@/lib/security/localFs";
import { normalizeSelectedPath } from "./normalizeSelectedPath";

const execAsync = promisify(exec);

// GET: Open native directory picker and return the selected path
export async function GET() {
  const platform = process.platform;

  try {
    assertLocalFsApiEnabled();

    let selectedPath: string | null = null;

    if (platform === "darwin") {
      // macOS: Use osascript to open folder picker
      const { stdout } = await execAsync(
        `osascript -e 'set folderPath to POSIX path of (choose folder with prompt "Select a folder to save workflows")' -e 'return folderPath'`
      );
      selectedPath = stdout.trim();
    } else if (platform === "win32") {
      // Windows: Use the modern IFileOpenDialog (Vista+) for a nice folder picker
      // Write script to temp file to avoid escaping issues
      const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
internal class FileOpenDialogRCW { }

[ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IFileOpenDialog {
    [PreserveSig] int Show([In] IntPtr hwndOwner);
    void SetFileTypes(); void SetFileTypeIndex(); void GetFileTypeIndex(); void Advise(); void Unadvise();
    void SetOptions([In] uint fos);
    void GetOptions(); void SetDefaultFolder(); void SetFolder(); void GetFolder();
    void GetCurrentSelection(); void SetFileName(); void GetFileName();
    void SetTitle([In, MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel(); void SetFileNameLabel();
    void GetResult([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
}

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IShellItem {
    void BindToHandler(); void GetParent();
    [PreserveSig] int GetDisplayName([In] uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
}

public class FolderPicker {
    public static string Show(string title) {
        var dlg = (IFileOpenDialog)new FileOpenDialogRCW();
        dlg.SetOptions(0x20);
        dlg.SetTitle(title);
        if (dlg.Show(IntPtr.Zero) == 0) {
            IShellItem item; dlg.GetResult(out item);
            string path; item.GetDisplayName(0x80058000, out path);
            return path;
        }
        return null;
    }
}
"@ -ErrorAction Stop

$result = [FolderPicker]::Show("Select a folder to save workflows")
if ($result) { Write-Output $result }
`;

      const tempFile = join(tmpdir(), `browse-folder-${Date.now()}.ps1`);
      try {
        await writeFile(tempFile, psScript, "utf-8");
        const { stdout } = await execAsync(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${tempFile}"`,
          { timeout: 120000 }
        );
        selectedPath = stdout.trim();
      } finally {
        // Clean up temp file
        try { await unlink(tempFile); } catch { /* ignore */ }
      }
    } else if (platform === "linux") {
      // Linux: Try zenity (common on GNOME) or kdialog (KDE)
      try {
        const { stdout } = await execAsync(
          `zenity --file-selection --directory --title="Select a folder to save workflows" 2>/dev/null`
        );
        selectedPath = stdout.trim();
      } catch {
        // Try kdialog as fallback
        try {
          const { stdout } = await execAsync(
            `kdialog --getexistingdirectory ~ --title "Select a folder to save workflows"`
          );
          selectedPath = stdout.trim();
        } catch {
          return NextResponse.json(
            {
              success: false,
              error:
                "No supported dialog tool found. Please install zenity or kdialog.",
            },
            { status: 500 }
          );
        }
      }
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported platform: ${platform}` },
        { status: 500 }
      );
    }

    // User cancelled the dialog
    if (!selectedPath) {
      return NextResponse.json({
        success: true,
        cancelled: true,
        path: null,
      });
    }

    selectedPath = normalizeSelectedPath(selectedPath, platform);
    selectedPath = assertPathAllowed(selectedPath);

    return NextResponse.json({
      success: true,
      cancelled: false,
      path: selectedPath,
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
    // Check if user cancelled (osascript returns error code when cancelled)
    if (
      error instanceof Error &&
      (error.message.includes("User canceled") ||
        error.message.includes("-128"))
    ) {
      return NextResponse.json({
        success: true,
        cancelled: true,
        path: null,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to open dialog",
      },
      { status: 500 }
    );
  }
}
