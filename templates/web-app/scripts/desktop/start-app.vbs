' Puente silencioso: el acceso directo llama este archivo para no mostrar consola.
' Toda la logica vive en start-app.ps1.

Option Explicit

Dim shell, files, scriptRoot, pwsh, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
scriptRoot = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = files.GetParentFolderName(files.GetParentFolderName(scriptRoot))

pwsh = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\PowerShell\7\pwsh.exe"
If Not files.FileExists(pwsh) Then
    pwsh = "pwsh.exe"
End If

command = Chr(34) & pwsh & Chr(34) & " -NoProfile -File " & Chr(34) & scriptRoot & "\start-app.ps1" & Chr(34)
shell.Run command, 0, False
