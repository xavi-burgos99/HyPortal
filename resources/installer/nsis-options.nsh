!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!pragma warning disable 6010
!pragma warning disable 6030
!pragma warning disable 6040
!pragma warning disable 6001

!macro HyPortalDefineLangStrings LANG_ID
  LangString MUI_TEXT_WELCOME_INFO_TITLE ${LANG_ID} "Welcome to the HyPortal Setup Wizard"
  LangString MUI_UNTEXT_WELCOME_INFO_TITLE ${LANG_ID} "Welcome to the HyPortal Uninstaller"
  LangString MUI_TEXT_FINISH_INFO_TITLE ${LANG_ID} "HyPortal Setup Completed"
  LangString MUI_TEXT_FINISH_INFO_TEXT ${LANG_ID} "HyPortal was installed successfully."
  LangString MUI_UNTEXT_FINISH_INFO_TITLE ${LANG_ID} "HyPortal Uninstall Completed"
  LangString MUI_UNTEXT_FINISH_INFO_TEXT ${LANG_ID} "HyPortal was removed from this computer."
!macroend

!insertmacro HyPortalDefineLangStrings 1033
!insertmacro HyPortalDefineLangStrings 1034
!insertmacro HyPortalDefineLangStrings 1031
!insertmacro HyPortalDefineLangStrings 1036
!insertmacro HyPortalDefineLangStrings 1040
!insertmacro HyPortalDefineLangStrings 1041
!insertmacro HyPortalDefineLangStrings 1046
!insertmacro HyPortalDefineLangStrings 1049
!insertmacro HyPortalDefineLangStrings 2052

Var HyPortalOptionsPage
Var HyPortalStartMenuCheckbox
Var HyPortalDesktopCheckbox
Var HyPortalAutostartCheckbox
Var HyPortalStartMenuState
Var HyPortalDesktopState
Var HyPortalAutostartState
Var HyPortalSelectedLanguage
Var HyPortalConfigDir

LangString HyPortalLangCode 1033 "en" ; English (United States)
LangString HyPortalLangCode 1034 "es" ; Spanish (Spain)
LangString HyPortalLangCode 1031 "de" ; German (Germany)
LangString HyPortalLangCode 1036 "fr" ; French (France)
LangString HyPortalLangCode 1040 "it" ; Italian (Italy)
LangString HyPortalLangCode 1041 "ja" ; Japanese
LangString HyPortalLangCode 1046 "pt" ; Portuguese (Brazil)
LangString HyPortalLangCode 1049 "ru" ; Russian
LangString HyPortalLangCode 2052 "zh" ; Chinese (PRC)

Page custom HyPortalOptionsPageCreate HyPortalOptionsPageLeave

!macro customInit
  !insertmacro MUI_LANGDLL_DISPLAY
  StrCpy $HyPortalSelectedLanguage "$(HyPortalLangCode)"
  ${If} $HyPortalSelectedLanguage == ""
    StrCpy $HyPortalSelectedLanguage "en"
  ${EndIf}
  SetShellVarContext all
  ExpandEnvStrings $HyPortalConfigDir "%ProgramData%"
  ${If} $HyPortalConfigDir == ""
    StrCpy $HyPortalConfigDir "$APPDATA"
  ${EndIf}
  StrCpy $HyPortalConfigDir "$HyPortalConfigDir\\HyPortal"
!macroend

Function HyPortalOptionsPageCreate
  nsDialogs::Create 1018
  Pop $HyPortalOptionsPage
  ${If} $HyPortalOptionsPage == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Choose extra options / Selecciona opciones adicionales"
  Pop $0

  ${NSD_CreateCheckbox} 0 40u 100% 12u "Add Start Menu shortcut / Añadir acceso al menú Inicio"
  Pop $HyPortalStartMenuCheckbox
  ${NSD_SetState} $HyPortalStartMenuCheckbox ${BST_CHECKED}

  ${NSD_CreateCheckbox} 0 58u 100% 12u "Add Desktop shortcut / Crear acceso directo en el escritorio"
  Pop $HyPortalDesktopCheckbox
  ${NSD_SetState} $HyPortalDesktopCheckbox ${BST_CHECKED}

  ${NSD_CreateCheckbox} 0 76u 100% 12u "Launch at Windows startup / Ejecutar al iniciar Windows"
  Pop $HyPortalAutostartCheckbox
  ${NSD_SetState} $HyPortalAutostartCheckbox ${BST_UNCHECKED}

  nsDialogs::Show
FunctionEnd

Function HyPortalOptionsPageLeave
  ${NSD_GetState} $HyPortalStartMenuCheckbox $HyPortalStartMenuState
  ${NSD_GetState} $HyPortalDesktopCheckbox $HyPortalDesktopState
  ${NSD_GetState} $HyPortalAutostartCheckbox $HyPortalAutostartState
FunctionEnd

Function HyPortalWriteInstallConfig
  CreateDirectory "$HyPortalConfigDir"
  FileOpen $1 "$HyPortalConfigDir\\install-config.json" w
  ${If} $1 == error
    Return
  ${EndIf}
  StrCpy $2 "{$\r$\n  $\"language$\": $\""
  StrCpy $2 "$2$HyPortalSelectedLanguage"
  StrCpy $2 "$2$\"$\r$\n  $\"autostart$\": "
  ${If} $HyPortalAutostartState == ${BST_CHECKED}
    StrCpy $2 "$2true"
  ${Else}
    StrCpy $2 "$2false"
  ${EndIf}
  StrCpy $2 "$2$\r$\n}$\r$\n"
  FileWrite $1 $2
  FileClose $1
FunctionEnd

!macro customInstall
  SetShellVarContext all
  ${If} $HyPortalStartMenuState == ${BST_CHECKED}
    CreateDirectory "$SMPROGRAMS\\HyPortal"
    CreateShortCut "$SMPROGRAMS\\HyPortal\\HyPortal.lnk" "$INSTDIR\\HyPortal.exe"
  ${Else}
    RMDir /r "$SMPROGRAMS\\HyPortal"
  ${EndIf}

  ${If} $HyPortalDesktopState == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\\HyPortal.lnk" "$INSTDIR\\HyPortal.exe"
  ${Else}
    Delete "$DESKTOP\\HyPortal.lnk"
  ${EndIf}

  ${If} $HyPortalAutostartState == ${BST_CHECKED}
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "HyPortal" "$INSTDIR\\HyPortal.exe"
  ${Else}
    DeleteRegValue HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "HyPortal"
  ${EndIf}
  Call HyPortalWriteInstallConfig
!macroend

!macro customUnInstall
  SetShellVarContext all
  Delete "$DESKTOP\\HyPortal.lnk"
  Delete "$SMPROGRAMS\\HyPortal\\HyPortal.lnk"
  RMDir "$SMPROGRAMS\\HyPortal"
  DeleteRegValue HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "HyPortal"
  ExpandEnvStrings $0 "%ProgramData%"
  ${If} $0 == ""
    StrCpy $0 "$APPDATA"
  ${EndIf}
  StrCpy $0 "$0\\HyPortal"
  Delete "$0\\install-config.json"
  RMDir "$0"
!macroend
