#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
$result = Invoke-Pester ./tests/New-InventorApp.Tests.ps1 -PassThru
if ($result.FailedCount -gt 0) {
    exit 1
}
