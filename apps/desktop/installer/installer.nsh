!macro customUnInstall
  SetShellVarContext current

  MessageBox MB_YESNO "Do you also want to delete all Stitch application data (database, config, cache, and logs)?" /SD IDNO IDNO SkipDelete IDYES DoDelete

  DoDelete:
    ; Data: $LOCALAPPDATA\stitch\Data
    RMDir /r "$LOCALAPPDATA\stitch"

    ; Config: $APPDATA\stitch\Config
    RMDir /r "$APPDATA\stitch"

    Goto DeleteDone

  SkipDelete:

  DeleteDone:
!macroend
