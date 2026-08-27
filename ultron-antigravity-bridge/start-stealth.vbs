' Ultron Project Copilot 100% Invisible Stealth Launcher
' Launches pythonw in background with NO command prompt window, NO taskbar icon, and NO Alt+Tab presence.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
strPythonExe = strScriptDir & "\venv\Scripts\pythonw.exe"
strRunScript = strScriptDir & "\run.py"

If fso.FileExists(strPythonExe) And fso.FileExists(strRunScript) Then
    WshShell.CurrentDirectory = strScriptDir
    ' 0 = Hide window, False = don't wait for completion
    WshShell.Run """" & strPythonExe & """ """ & strRunScript & """", 0, False
Else
    MsgBox "Could not find virtual environment at: " & strPythonExe, vbCritical, "Ultron Bridge Error"
End If
