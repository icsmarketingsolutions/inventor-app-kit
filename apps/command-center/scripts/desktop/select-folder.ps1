$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.IO;
using System.Runtime.InteropServices;

namespace InventorOS.NativeDialogs
{
    [ComImport]
    [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, out IntPtr ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    [ComImport]
    [Guid("42F85136-DB7E-439C-85F1-E4075D135FC8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IFileDialog
    {
        [PreserveSig]
        int Show(IntPtr parent);
        void SetFileTypes(uint count, IntPtr filterSpec);
        void SetFileTypeIndex(uint fileTypeIndex);
        void GetFileTypeIndex(out uint fileTypeIndex);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem shellItem);
        void SetFolder(IShellItem shellItem);
        void GetFolder(out IShellItem shellItem);
        void GetCurrentSelection(out IShellItem shellItem);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem shellItem);
        void AddPlace(IShellItem shellItem, uint alignment);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
        void Close(int result);
        void SetClientGuid(ref Guid clientGuid);
        void ClearClientData();
        void SetFilter(IntPtr filter);
    }

    [ComImport]
    [Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
    internal class FileOpenDialog
    {
    }

    public static class FolderPicker
    {
        private const uint FosNoChangeDirectory = 0x00000008;
        private const uint FosPickFolders = 0x00000020;
        private const uint FosForceFileSystem = 0x00000040;
        private const uint FosPathMustExist = 0x00000800;
        private const uint FosNoDereferenceLinks = 0x00100000;
        private const uint FosDontAddToRecent = 0x02000000;
        private const uint SigdnFileSystemPath = 0x80058000;
        private const int Cancelled = unchecked((int)0x800704C7);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        private static extern void SHCreateItemFromParsingName(
            [MarshalAs(UnmanagedType.LPWStr)] string path,
            IntPtr bindingContext,
            ref Guid shellItemGuid,
            out IShellItem shellItem);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr FindWindow(string className, string windowName);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetForegroundWindow(IntPtr window);

        public static string Pick(string initialPath)
        {
            var owner = FindWindow(null, "INVENTOR O.S. Command Center · inventor-os");
            if (owner == IntPtr.Zero)
            {
                throw new InvalidOperationException("No se encontró la ventana propietaria.");
            }
            IFileDialog dialog = null;
            IShellItem initialItem = null;
            IShellItem resultItem = null;
            IntPtr displayName = IntPtr.Zero;

            try
            {
                dialog = (IFileDialog)new FileOpenDialog();
                dialog.GetOptions(out var options);
                dialog.SetOptions(options | FosNoChangeDirectory | FosPickFolders |
                    FosForceFileSystem | FosPathMustExist | FosNoDereferenceLinks | FosDontAddToRecent);
                dialog.SetTitle("Elegir carpeta del proyecto");
                dialog.SetOkButtonLabel("Elegir carpeta");

                if (!string.IsNullOrWhiteSpace(initialPath) && Directory.Exists(initialPath))
                {
                    var shellItemGuid = typeof(IShellItem).GUID;
                    SHCreateItemFromParsingName(Path.GetFullPath(initialPath), IntPtr.Zero,
                        ref shellItemGuid, out initialItem);
                    dialog.SetFolder(initialItem);
                }

                SetForegroundWindow(owner);

                var result = dialog.Show(owner);
                if (result == Cancelled)
                {
                    return null;
                }
                if (result < 0)
                {
                    Marshal.ThrowExceptionForHR(result);
                }

                dialog.GetResult(out resultItem);
                resultItem.GetDisplayName(SigdnFileSystemPath, out displayName);
                var selectedPath = Path.GetFullPath(Marshal.PtrToStringUni(displayName));
                if (selectedPath.StartsWith(@"\\", StringComparison.Ordinal) ||
                    new DriveInfo(Path.GetPathRoot(selectedPath)).DriveType != DriveType.Fixed)
                {
                    throw new InvalidOperationException("La carpeta debe estar en una unidad local fija.");
                }
                for (var current = new DirectoryInfo(selectedPath); current != null; current = current.Parent)
                {
                    if ((current.Attributes & FileAttributes.ReparsePoint) != 0)
                    {
                        throw new InvalidOperationException("La carpeta no puede atravesar puntos de reanálisis.");
                    }
                }
                return selectedPath;
            }
            finally
            {
                if (displayName != IntPtr.Zero) Marshal.FreeCoTaskMem(displayName);
                if (resultItem != null) Marshal.FinalReleaseComObject(resultItem);
                if (initialItem != null) Marshal.FinalReleaseComObject(initialItem);
                if (dialog != null) Marshal.FinalReleaseComObject(dialog);
                SetForegroundWindow(owner);
            }
        }
    }
}
'@

try {
    $payloadText = [Console]::In.ReadToEnd()
    $payload = if ([string]::IsNullOrWhiteSpace($payloadText)) { $null } else { $payloadText | ConvertFrom-Json }
    $initialPath = if ($null -eq $payload -or [string]::IsNullOrWhiteSpace([string]$payload.initialPath)) {
        ''
    }
    else {
        [string]$payload.initialPath
    }
    Add-Type -TypeDefinition $source -Language CSharp
    $selectedPath = [InventorOS.NativeDialogs.FolderPicker]::Pick($initialPath)
    if ([string]::IsNullOrWhiteSpace($selectedPath)) {
        @{ selected = $false; path = $null } | ConvertTo-Json -Compress
    }
    else {
        @{ selected = $true; path = [System.IO.Path]::GetFullPath($selectedPath); localFixed = $true } | ConvertTo-Json -Compress
    }
}
catch {
    [Console]::Error.WriteLine('No se pudo abrir el selector nativo de carpetas.')
    exit 1
}
