' Stealth Launcher for Ultron3 Assistant
' Runs headlessly with NO command prompt window, NO taskbar presence.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
strBuiltExe1 = strScriptDir & "\out\audiodg-win32-x64\audiodg.exe"
strBuiltExe2 = strScriptDir & "\out\ServiceHost-win32-x64\ServiceHost.exe"

If fso.FileExists(strBuiltExe1) Then
    ' Launch standalone stealth audiodg executable
    WshShell.CurrentDirectory = fso.GetParentFolderName(strBuiltExe1)
    WshShell.Run """" & strBuiltExe1 & """", 0, False
ElseIf fso.FileExists(strBuiltExe2) Then
    ' Launch standalone production executable
    WshShell.CurrentDirectory = fso.GetParentFolderName(strBuiltExe2)
    WshShell.Run """" & strBuiltExe2 & """", 0, False
Else
    ' Fallback to npm start
    WshShell.CurrentDirectory = strScriptDir
    WshShell.Run "cmd.exe /c npm start", 0, False
End If
