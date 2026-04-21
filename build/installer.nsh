!macro customInstall
  ; Windows에게 시작 메뉴/바로가기 캐시 갱신 신호 전송 (SHCNE_ASSOCCHANGED | SHCNF_FLUSH)
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend

!macro customUnInstall
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend
