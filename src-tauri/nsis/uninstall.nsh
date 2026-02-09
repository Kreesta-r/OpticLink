!include "LogicLib.nsh"

Section
    ; Remove firewall rule
    nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="OpticLink Signaling"'
    Pop $0
    Pop $1

    ${If} $0 != 0
        DetailPrint "Failed to remove firewall rule: $1"
    ${Else}
        DetailPrint "Firewall rule removed successfully"
    ${EndIf}
SectionEnd
