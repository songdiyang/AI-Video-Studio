; NSIS 安装钩子：把 .jzp 工程包绑定到本应用（当前用户注册表）
; 由 tauri.conf.json -> bundle.windows.nsis.installerHooks 引用。
;
; 说明：
; - Tauri 自带的 fileAssociations 也会注册一次；此处使用 HKCU\Software\Classes，
;   优先级高于系统级关联，且与安装模式 currentUser 一致。
; - ${MAINBINARYNAME} 由 Tauri NSIS 模板提供，指向安装目录内的主程序。

!macro NSIS_HOOK_POSTINSTALL
  ; .jzp 扩展名 -> 工程包 ProgID
  WriteRegStr HKCU "Software\Classes\.jzp" "" "AIVideoStudio.jzp"
  WriteRegStr HKCU "Software\Classes\.jzp" "Content Type" "application/zip"

  ; ProgID 描述与图标
  WriteRegStr HKCU "Software\Classes\AIVideoStudio.jzp" "" "AI Video Studio Project"
  WriteRegStr HKCU "Software\Classes\AIVideoStudio.jzp\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"

  ; 双击打开命令
  WriteRegStr HKCU "Software\Classes\AIVideoStudio.jzp\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; 通知资源管理器刷新文件关联缓存
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; 仅当 .jzp 仍指向本应用的 ProgID 时才清理，避免误删其他程序的关联
  ReadRegStr $0 HKCU "Software\Classes\.jzp" ""
  StrCmp $0 "AIVideoStudio.jzp" AIVideoStudioJzpUninstDone
    DeleteRegValue HKCU "Software\Classes\.jzp" ""
    DeleteRegValue HKCU "Software\Classes\.jzp" "Content Type"
  AIVideoStudioJzpUninstDone:

  DeleteRegKey HKCU "Software\Classes\AIVideoStudio.jzp"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
