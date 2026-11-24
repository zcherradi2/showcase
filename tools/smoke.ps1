# tools/smoke.ps1 - the whole product path over HTTP, no browser, no mouse.
#   .\tools\smoke.ps1                 against http://127.0.0.1:8130
#   .\tools\smoke.ps1 -Base http://...
param(
    [string]$Base = 'http://127.0.0.1:8130'
)

$ErrorActionPreference = 'Stop'
$json = @{ 'content-type' = 'application/json' }
$fail = 0

function Check($label, $condition) {
    if ($condition) { Write-Host "  OK   $label" -ForegroundColor Green }
    else { Write-Host "  FAIL $label" -ForegroundColor Red; $script:fail++ }
}

$Sheet = {
    param($warm, $ring)
    @{
        ring    = $ring
        cards   = @('hearth', 'mirror', 'drift')
        dials   = @{
            warmth = $warm; force = 4; order = 3; depth = 3
            candor = 2; drive = 4; play = $warm; nerve = 4
        }
        probes  = @{ p2am = 1; proom = 0; poffer = 1; pchange = 0 }
        receipt = 'They stayed on the phone until the sun came up.'
    }
}

Write-Host "`nhealth" -ForegroundColor Cyan
$health = Invoke-RestMethod "$Base/api/health"
Check "api answers" ($health.ok -eq $true)
Check "instrument version reported" (-not [string]::IsNullOrWhiteSpace($health.version))
Check "analyst state reported" ($null -ne $health.ai)

Write-Host "`nopen a dossier" -ForegroundColor Cyan
$created = Invoke-RestMethod "$Base/api/personas" -Method Post -Headers $json -Body (@{
        name    = 'Smoke Test'
        tagline = 'a script, not a person'
    } | ConvertTo-Json)
$id = $created.id
$token = $created.token
Check "dossier created" ($id -and $token)

$owner = @{ 'content-type' = 'application/json'; 'x-owner-token' = $token }

Write-Host "`nthe Ego (self-vote)" -ForegroundColor Cyan
$ego = Invoke-WebRequest -UseBasicParsing "$Base/api/personas/$id/ego" -Method Post -Headers $owner -Body ((& $Sheet 4 'inner') | ConvertTo-Json -Depth 5)
Check "ego accepted" ($ego.StatusCode -eq 200)
$back = Invoke-RestMethod "$Base/api/personas/$id/ego" -Headers $owner
Check "ego reads back with computed scores" (($null -ne $back.scores) -and ($null -ne $back.scores.warmth))

Write-Host "`nvotes from the room" -ForegroundColor Cyan
$rings = @('inner', 'work', 'family', 'online')
for ($i = 0; $i -lt 4; $i++) {
    $body = (& $Sheet ([int]($i % 2) * 4) $rings[$i]) | ConvertTo-Json -Depth 5
    $r = Invoke-WebRequest -UseBasicParsing "$Base/api/personas/$id/votes" -Method Post -Headers @{ 'content-type' = 'application/json'; 'x-voter-id' = "smoke-device-$i" } -Body $body
    Check "vote $($i + 1) accepted ($($rings[$i]))" ($r.StatusCode -eq 201)
}

$pub = Invoke-RestMethod "$Base/api/personas/$id"
Check "no raw votes leak to a stranger" ($pub.portrait -eq $null -or $pub.portrait.votes -eq $null)

Write-Host "`nthe portrait" -ForegroundColor Cyan
$report = Invoke-RestMethod "$Base/api/personas/$id/portrait" -Headers $owner
Check "portrait is ready" ($report.portrait.ready -eq $true)
Check "persona computed" ($report.portrait.persona.warmth -ne $null)
Check "ego computed" ($report.portrait.ego.warmth -ne $null)
Check "gap computed" ($report.portrait.gap.warmth -ne $null)
Check "rings attributed" ((($report.portrait.rings | ConvertTo-Json -Compress).Length) -gt 20)

Write-Host "`nthe reading" -ForegroundColor Cyan
$analysis = Invoke-RestMethod "$Base/api/personas/$id/analyze" -Method Post -Headers $owner -Body '{}'
Check "reading returned" ($analysis.ok -eq $true)
Check "verdict present" (-not [string]::IsNullOrWhiteSpace($analysis.analysis.verdict))
Check "persona paragraph present" (-not [string]::IsNullOrWhiteSpace($analysis.analysis.persona))
Check "ego paragraph present" (-not [string]::IsNullOrWhiteSpace($analysis.analysis.ego))
Check "shadow prediction present" (-not [string]::IsNullOrWhiteSpace($analysis.analysis.shadow))
Check "shadow is labelled a hypothesis" ($analysis.analysis.caveat -match 'hypothesis')
Check "digest small enough for a prompt" (((Invoke-RestMethod "$Base/api/personas/$id/digest" -Headers $owner) | ConvertTo-Json -Depth 8 -Compress).Length -lt 6000)

Write-Host "`nsecurity" -ForegroundColor Cyan
# A stranger gets the locked public card (that is the shareable link), never the reading.
$public = Invoke-RestMethod "$Base/api/personas/$id/portrait"
Check "stranger gets a locked public card" ($public.locked -eq $true)
Check "stranger sees no ego, gap or shadow" (($null -eq $public.ego) -and ($null -eq $public.gap) -and ($null -eq $public.analysis))
try {
    Invoke-WebRequest -UseBasicParsing "$Base/api/personas/$id/analyze" -Method Post -Body '{}' -Headers $json | Out-Null
    Check "stranger cannot spend AI credits" $false
}
catch {
    Check "stranger cannot spend AI credits" ($_.Exception.Response.StatusCode.value__ -in 401, 403)
}

Write-Host "`nresult" -ForegroundColor Cyan
Write-Host "  source=$($analysis.analysis.source) model=$($analysis.analysis.model) reason=$($analysis.reason)"
Write-Host "  verdict=$($analysis.analysis.verdict)"
Write-Host "  shadow=$($analysis.analysis.shadow.Substring(0, [Math]::Min(160, $analysis.analysis.shadow.Length)))"
if ($fail -eq 0) { Write-Host "`nall checks passed ($id)" -ForegroundColor Green; exit 0 }
else { Write-Host "`n$fail check(s) failed" -ForegroundColor Red; exit 1 }
