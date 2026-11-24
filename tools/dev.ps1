# tools/dev.ps1 - one command to build and (re)start the API.
#   .\tools\dev.ps1            build + restart on http://127.0.0.1:8130
#   .\tools\dev.ps1 -Stop      just stop it
param(
    [switch]$Stop,
    [switch]$NoBuild,
    [int]$Port = 8130
)

$root = Split-Path -Parent $PSScriptRoot
$dll = Join-Path $root 'src\Persona.Api\bin\Debug\net9.0\Persona.Api.dll'

function Stop-Persona {
    Get-CimInstance Win32_Process -Filter "Name='Persona.Api.exe'" -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Get-CimInstance Win32_Process -Filter "Name='dotnet.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*Persona.Api.dll*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 700
}

Stop-Persona
if ($Stop) { Write-Output 'stopped'; return }

if (-not $NoBuild) {
    Push-Location $root
    dotnet build src\Persona.Api\Persona.Api.csproj -v q --nologo
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'build failed' }
    Pop-Location
}

$log = Join-Path $root 'run.log'
if (Test-Path $log) { Remove-Item $log -Force }
# Processes started through WMI inherit the WMI host's environment, not this shell's,
# so forward every PERSONA_* variable explicitly.
$sets = Get-ChildItem env: | Where-Object { $_.Name -like 'PERSONA_*' } | ForEach-Object { "set $($_.Name)=$($_.Value)&& " }
$sets = -join $sets
$cmd = "C:\Windows\System32\cmd.exe /c `"cd /d $root && ${sets}set PORT=$Port&& dotnet `"$dll`" > run.log 2>&1`""
$res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
Write-Output ("started pid " + $res.ProcessId)

for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 400
    try {
        $h = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 8
        Write-Output ("up: version " + $h.version + " · personas " + $h.personas + " · analyst " + $(if ($h.ai.up) { $h.ai.model } else { 'local' }))
        return
    } catch {}
}
Write-Output 'did not come up; last log lines:'
Get-Content $log -Tail 25 -ErrorAction SilentlyContinue
