# tools/test.ps1 - the test suite (domain, API, and the AI path against a mock router).
#   .\tools\test.ps1              run everything
#   .\tools\test.ps1 -Filter Llm  only matching tests
param(
    [string]$Filter = ''
)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$env:PERSONA_TEST = '1'
$args = @('test', 'tests\Persona.Tests\Persona.Tests.csproj', '--nologo', '-v', 'q')
if ($Filter) { $args += @('--filter', "FullyQualifiedName~$Filter") }

dotnet @args
exit $LASTEXITCODE
