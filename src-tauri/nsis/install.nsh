!include "LogicLib.nsh"

Section
    ; Add firewall rule
    nsExec::ExecToStack 'netsh advfirewall firewall add rule name="OpticLink Signaling" dir=in action=allow protocol=TCP localport=3001 profile=any'
    Pop $0
    Pop $1
    
    ${If} $0 != 0
        DetailPrint "Failed to add firewall rule: $1"
    ${Else}
        DetailPrint "Firewall rule added successfully"
    ${EndIf}
SectionEnd
