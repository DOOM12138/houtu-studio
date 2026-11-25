Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
Name "厚涂小站 @VERSION@"
OutFile "@OUTPUT@"
Icon "@ICON@"
UninstallIcon "@ICON@"
RequestExecutionLevel user
InstallDir ""
SetCompressor /SOLID lzma
SetCompressorDictSize 32
ShowInstDetails show
ShowUninstDetails show
BrandingText "厚涂小站 · 免费开源"
Var TestMode
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\runtime\HoutuStudio.exe"
!define MUI_FINISHPAGE_RUN_TEXT "打开厚涂小站"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "请在64位Windows上安装厚涂小站。"
    Abort
  ${EndIf}
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/TESTMODE" $1
  ${IfNot} ${Errors}
    StrCpy $TestMode "1"
  ${EndIf}
  ${If} $INSTDIR == ""
    ReadRegStr $INSTDIR HKCU "Software\HoutuStudio" "InstallDir"
  ${EndIf}
  ${If} $INSTDIR == ""
    ${GetRoot} $EXEDIR $0
    StrCpy $1 $WINDIR 2
    ${If} $0 == $1
      IfFileExists "F:\*.*" 0 +3
        StrCpy $0 "F:"
        Goto picked
      IfFileExists "D:\*.*" 0 +3
        StrCpy $0 "D:"
        Goto picked
      StrCpy $INSTDIR "$LOCALAPPDATA\Programs\HoutuStudio"
      Goto ready
    ${EndIf}
    picked:
    StrCpy $INSTDIR "$0\Apps\HoutuStudio"
  ${EndIf}
  ready:
FunctionEnd
Function CheckDestination
  IfFileExists "$INSTDIR\.git" sourceDirectory 0
  IfFileExists "$INSTDIR\.git\*.*" sourceDirectory destinationOK
  sourceDirectory:
    MessageBox MB_ICONSTOP "请选择新的安装文件夹，不要覆盖Git源码目录。"
    Abort
  destinationOK:
  ${GetRoot} $INSTDIR $0
  ${If} $INSTDIR == "$0\"
    MessageBox MB_ICONSTOP "请选择一个具体文件夹，不能安装到磁盘根目录。"
    Abort
  ${EndIf}
FunctionEnd
Function StopExisting
  IfFileExists "$INSTDIR\runtime\HoutuStudio.exe" 0 nohost
    ExecWait '"$INSTDIR\runtime\HoutuStudio.exe" --shutdown --silent' $0
    ${If} $0 != 0
      MessageBox MB_ICONSTOP "请先完成或暂停当前任务，退出厚涂小站后重试。"
      Abort
    ${EndIf}
  nohost:
  IfFileExists "$INSTDIR\runtime\node.exe" 0 stopped
    InitPluginsDir
    SetOutPath "$PLUGINSDIR"
    File /oname=prepare-install.mjs "@PREPARE@"
    nsExec::ExecToStack '"$INSTDIR\runtime\node.exe" "$PLUGINSDIR\prepare-install.mjs" --root "$INSTDIR"'
    Pop $0
    Pop $1
    ${If} $0 != 0
      MessageBox MB_ICONSTOP "$1"
      Abort
    ${EndIf}
  stopped:
FunctionEnd
Section "厚涂小站"
  Call CheckDestination
  Call StopExisting
  SetOutPath "$INSTDIR"
  File /r "@PAYLOAD@\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteINIStr "$INSTDIR\install-state.ini" "Install" "TestMode" "$TestMode"
  ${If} $TestMode != "1"
    CreateShortcut "$DESKTOP\厚涂小站.lnk" "$INSTDIR\runtime\HoutuStudio.exe" "" "$INSTDIR\runtime\HoutuStudio.exe"
    CreateDirectory "$SMPROGRAMS\厚涂小站"
    CreateShortcut "$SMPROGRAMS\厚涂小站\厚涂小站.lnk" "$INSTDIR\runtime\HoutuStudio.exe"
    CreateShortcut "$SMPROGRAMS\厚涂小站\卸载.lnk" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "Software\HoutuStudio" "InstallDir" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HoutuStudio" "DisplayName" "厚涂小站"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HoutuStudio" "DisplayVersion" "@VERSION@"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HoutuStudio" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HoutuStudio" "DisplayIcon" "$INSTDIR\runtime\HoutuStudio.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HoutuStudio" "Publisher" "Houtu Studio"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HoutuStudio" "URLInfoAbout" "https://github.com/DOOM12138/houtu-studio"
  ${EndIf}
SectionEnd
Function un.onInit
  ReadINIStr $TestMode "$INSTDIR\install-state.ini" "Install" "TestMode"
  IfFileExists "$INSTDIR\runtime\HoutuStudio.exe" 0 unready
    ExecWait '"$INSTDIR\runtime\HoutuStudio.exe" --shutdown --silent' $0
    ${If} $0 != 0
      MessageBox MB_ICONSTOP "程序仍在运行，请完成或暂停任务并退出后重试。"
      Abort
    ${EndIf}
  unready:
  IfFileExists "$INSTDIR\runtime\node.exe" 0 unStopped
    nsExec::ExecToStack '"$INSTDIR\runtime\node.exe" "$INSTDIR\scripts\prepare-install.mjs" --root "$INSTDIR"'
    Pop $0
    Pop $1
    ${If} $0 != 0
      MessageBox MB_ICONSTOP "$1"
      Abort
    ${EndIf}
  unStopped:
FunctionEnd
Section "Uninstall"
  @REMOVALS@
  Delete "$INSTDIR\install-state.ini"
  Delete "$INSTDIR\Uninstall.exe"
  ${If} $TestMode != "1"
    Delete "$DESKTOP\厚涂小站.lnk"
    Delete "$SMPROGRAMS\厚涂小站\厚涂小站.lnk"
    Delete "$SMPROGRAMS\厚涂小站\卸载.lnk"
    RMDir "$SMPROGRAMS\厚涂小站"
    DeleteRegKey HKCU "Software\HoutuStudio"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HoutuStudio"
  ${EndIf}
  ; No recursive removal: photos, credentials, presets and workflows remain.
  RMDir "$INSTDIR"
SectionEnd
