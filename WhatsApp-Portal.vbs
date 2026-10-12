Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

' 1. Check if dependencies are installed
baileysPath = strPath & "\node_modules\@whiskeysockets\baileys"
If Not fso.FolderExists(baileysPath) Then
    ' Open visible terminal only if first-time package installation is needed
    installCmd = "cmd /c cd /d """ & strPath & """ && title WhatsApp System - First Time Setup && " & _
                 "echo ================================================================ && " & _
                 "echo [WhatsApp System] Missing dependencies detected. && " & _
                 "echo Running 'npm install' to install required packages... && " & _
                 "echo Please wait a moment... && " & _
                 "echo ================================================================ && echo. && " & _
                 "npm install && echo. && echo [OK] Installation complete! Launching portal... && timeout /t 2"
    WshShell.Run installCmd, 1, True
End If

' 2. Check if node server is responding on port 3000 (100% silent, no blinking CMD windows)
Function IsServerReady()
    On Error Resume Next
    Dim http
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If http Is Nothing Then Set http = CreateObject("MSXML2.ServerXMLHTTP")
    If http Is Nothing Then Set http = CreateObject("MSXML2.XMLHTTP")
    http.setTimeouts 500, 500, 500, 500
    http.open "GET", "http://localhost:3000/api/auth/me", False
    http.send
    If Err.Number = 0 Then
        IsServerReady = True
    Else
        IsServerReady = False
    End If
    On Error GoTo 0
End Function

serverReady = IsServerReady()

' 3. Start Node server in background if not already running
If Not serverReady Then
    nodeExe = strPath & "\bin\node.exe"
    If Not fso.FileExists(nodeExe) Then
        nodeExe = "node"
    End If
    
    Dim runCmd
    runCmd = "cmd /c """"" & nodeExe & """ server.js > """ & strPath & "\server.log"" 2>&1"""
    WshShell.Run runCmd, 0, False
    
    ' Wait silently for server to become active (no console flicker)
    Dim attempts
    attempts = 0
    Do While attempts < 30
        WScript.Sleep 500
        If IsServerReady() Then
            serverReady = True
            Exit Do
        End If
        attempts = attempts + 1
    Loop
End If

' 4. Verify server started successfully
If Not serverReady Then
    MsgBox "Failed to start WhatsApp Portal server on port 3000." & vbCrLf & vbCrLf & _
           "Possible reasons:" & vbCrLf & _
           "- Node.js is not installed or not in PATH." & vbCrLf & _
           "- Dependencies are missing (run 'npm install')." & vbCrLf & _
           "- Port 3000 is occupied by another application." & vbCrLf & vbCrLf & _
           "Check 'server.log' or run 'start.bat' for detailed diagnostics.", _
           vbCritical, "WhatsApp Portal - Startup Error"
    WScript.Quit 1
End If

' 5. Locate Chrome or Edge for native App Mode (or default browser)
browserPath = ""
chromePaths = Array("C:\Program Files\Google\Chrome\Application\chrome.exe", _
                    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", _
                    WshShell.ExpandEnvironmentStrings("%LocalAppData%\Google\Chrome\Application\chrome.exe"), _
                    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", _
                    "C:\Program Files\Microsoft\Edge\Application\msedge.exe")

For Each p In chromePaths
    If fso.FileExists(p) Then
        browserPath = p
        Exit For
    End If
Next

If browserPath <> "" Then
    WshShell.Run """" & browserPath & """ --app=http://localhost:3000", 1, False
Else
    WshShell.Run "http://localhost:3000", 1, False
End If

Set WshShell = Nothing
Set fso = Nothing
