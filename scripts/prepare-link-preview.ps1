param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Output = (Join-Path $PSScriptRoot '../public/og-playground-v3.jpg')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Keep the historical command while maintaining conversion in the portable skill.
& (Join-Path $PSScriptRoot '../.agents/skills/bunfirvil-playground-illustration/scripts/prepare-link-preview.ps1') -Source $Source -Output $Output
