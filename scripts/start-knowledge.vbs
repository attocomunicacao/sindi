' A GUI launcher gives the hidden Node worker its own console, isolated from terminal Ctrl+C.
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(files.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = root
nodePath = WScript.Arguments(0)
command = Chr(34) & nodePath & Chr(34) & " --import tsx " & Chr(34) & root & "\scripts\knowledge-sync.ts" & Chr(34) & " --watch"
result = shell.Run(command, 0, True)
WScript.Quit result
