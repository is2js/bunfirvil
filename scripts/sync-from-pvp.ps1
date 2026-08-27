[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Source
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-DirectChild {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][string]$Candidate,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $candidateFull = [IO.Path]::GetFullPath($Candidate)
  $candidateParent = [IO.Path]::GetDirectoryName($candidateFull).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not [StringComparer]::OrdinalIgnoreCase.Equals($parentFull, $candidateParent)) {
    throw "$Label must be a direct child of $parentFull (received $candidateFull)"
  }
  return $candidateFull
}

function Remove-SafeDirectChildDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][string]$Candidate,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $target = Resolve-DirectChild -Parent $Parent -Candidate $Candidate -Label $Label
  if (-not (Test-Path -LiteralPath $target)) { return }
  $item = Get-Item -LiteralPath $target -Force
  if (-not $item.PSIsContainer) { throw "$Label is not a directory: $target" }
  Remove-Item -LiteralPath $target -Recurse -Force
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  [IO.File]::WriteAllText($Path, $Text, [Text.UTF8Encoding]::new($false))
}

$scriptRoot = Split-Path -Parent $PSCommandPath
$projectRoot = [IO.Path]::GetFullPath((Join-Path $scriptRoot ".."))
$generatedRoot = Join-Path $projectRoot "public\generated"
$exportsRoot = Join-Path $generatedRoot "exports"
$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
New-Item -ItemType Directory -Force -Path $generatedRoot, $exportsRoot | Out-Null

$token = "$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$transactionFile = Resolve-DirectChild -Parent $generatedRoot -Candidate (Join-Path $generatedRoot ".sync-transaction-$token.json") -Label "transaction file"
$lockPath = Resolve-DirectChild -Parent $generatedRoot -Candidate (Join-Path $generatedRoot ".sync.lock") -Label "sync lock"
$lock = $null
$transaction = $null
$stagingRoot = $null
$finalRoot = $null
$exportBackup = $null
$installedFinal = $false
$pointerStates = @()
$removedExports = [Collections.Generic.List[string]]::new()

try {
  try {
    $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  } catch {
    throw "Another asset sync is already running."
  }

  & node (Join-Path $scriptRoot "sync-from-pvp.mjs") --source $sourceRoot --stage-only --transaction-file $transactionFile
  if ($LASTEXITCODE -ne 0) { throw "The staging exporter failed with exit code $LASTEXITCODE." }
  if (-not (Test-Path -LiteralPath $transactionFile -PathType Leaf)) { throw "The staging exporter did not create a transaction." }

  $transaction = Get-Content -LiteralPath $transactionFile -Raw | ConvertFrom-Json -Depth 100
  if ($transaction.schemaVersion -ne 1 -or [string]$transaction.exportId -notmatch '^[0-9a-z-]+$') {
    throw "The staging transaction has an invalid exportId."
  }
  if ([string]$transaction.stagingDirectory -notlike ".$($transaction.exportId).staging-*") {
    throw "The staging transaction has an invalid staging directory."
  }

  $stagingRoot = Resolve-DirectChild -Parent $exportsRoot -Candidate (Join-Path $exportsRoot ([string]$transaction.stagingDirectory)) -Label "staging export"
  $finalRoot = Resolve-DirectChild -Parent $exportsRoot -Candidate (Join-Path $exportsRoot ([string]$transaction.exportId)) -Label "final export"
  $exportBackup = Resolve-DirectChild -Parent $exportsRoot -Candidate (Join-Path $exportsRoot ".$($transaction.exportId).previous-$token") -Label "export backup"
  if (-not (Test-Path -LiteralPath $stagingRoot -PathType Container)) { throw "The validated staging export is missing." }
  Remove-SafeDirectChildDirectory -Parent $exportsRoot -Candidate $exportBackup -Label "stale export backup"

  if (Test-Path -LiteralPath $finalRoot) { Move-Item -LiteralPath $finalRoot -Destination $exportBackup }
  try {
    Move-Item -LiteralPath $stagingRoot -Destination $finalRoot
    $installedFinal = $true
  } catch {
    if ((Test-Path -LiteralPath $exportBackup) -and -not (Test-Path -LiteralPath $finalRoot)) {
      Move-Item -LiteralPath $exportBackup -Destination $finalRoot
    }
    throw
  }

  $documents = @(
    @{ Name = "catalog.v1.json"; Text = [string]$transaction.stableCatalogText },
    @{ Name = "current.json"; Text = [string]$transaction.currentText }
  )
  foreach ($document in $documents) {
    if ([string]::IsNullOrWhiteSpace($document.Text)) { throw "$($document.Name) transaction text is missing." }
    $final = Resolve-DirectChild -Parent $generatedRoot -Candidate (Join-Path $generatedRoot $document.Name) -Label "$($document.Name) final"
    $staged = Resolve-DirectChild -Parent $generatedRoot -Candidate (Join-Path $generatedRoot ".$($document.Name).staging-$token") -Label "$($document.Name) staging"
    $backup = Resolve-DirectChild -Parent $generatedRoot -Candidate (Join-Path $generatedRoot ".$($document.Name).previous-$token") -Label "$($document.Name) backup"
    Remove-Item -LiteralPath $staged, $backup -Force -ErrorAction SilentlyContinue
    Write-Utf8NoBom -Path $staged -Text $document.Text
    $pointerStates += [pscustomobject]@{ Final = $final; Staged = $staged; Backup = $backup; HadPrevious = (Test-Path -LiteralPath $final); Installed = $false }
  }

  try {
    foreach ($state in $pointerStates) {
      if ($state.HadPrevious) { Move-Item -LiteralPath $state.Final -Destination $state.Backup }
    }
    foreach ($state in $pointerStates) {
      Move-Item -LiteralPath $state.Staged -Destination $state.Final
      $state.Installed = $true
    }
  } catch {
    foreach ($state in @($pointerStates)[($pointerStates.Count - 1)..0]) {
      if ($state.Installed -and (Test-Path -LiteralPath $state.Final)) { Remove-Item -LiteralPath $state.Final -Force }
      if ($state.HadPrevious -and (Test-Path -LiteralPath $state.Backup)) { Move-Item -LiteralPath $state.Backup -Destination $state.Final }
    }
    throw
  }

  $writtenCatalog = Get-Content -LiteralPath (Join-Path $generatedRoot "catalog.v1.json") -Raw | ConvertFrom-Json -Depth 100
  $writtenCurrent = Get-Content -LiteralPath (Join-Path $generatedRoot "current.json") -Raw | ConvertFrom-Json -Depth 100
  if ($writtenCatalog.exportId -ne $transaction.exportId -or $writtenCurrent.exportId -ne $transaction.exportId) {
    throw "The committed catalog/current pointers do not match the new export."
  }

  foreach ($directory in Get-ChildItem -LiteralPath $exportsRoot -Directory -Force) {
    if ([StringComparer]::OrdinalIgnoreCase.Equals($directory.FullName, $finalRoot)) { continue }
    if ((Test-Path -LiteralPath $exportBackup) -and [StringComparer]::OrdinalIgnoreCase.Equals($directory.FullName, $exportBackup)) { continue }
    $safeStale = Resolve-DirectChild -Parent $exportsRoot -Candidate $directory.FullName -Label "stale export"
    Remove-SafeDirectChildDirectory -Parent $exportsRoot -Candidate $safeStale -Label "stale export $($directory.Name)"
    $removedExports.Add($directory.Name)
  }

  foreach ($state in $pointerStates) {
    if (Test-Path -LiteralPath $state.Backup) { Remove-Item -LiteralPath $state.Backup -Force }
  }
  Remove-SafeDirectChildDirectory -Parent $exportsRoot -Candidate $exportBackup -Label "previous current export"

  $remaining = @(Get-ChildItem -LiteralPath $exportsRoot -Directory -Force)
  if ($remaining.Count -ne 1 -or -not [StringComparer]::OrdinalIgnoreCase.Equals($remaining[0].FullName, $finalRoot)) {
    throw "Exactly one current export must remain after sync."
  }

  $summary = [ordered]@{}
  foreach ($property in $transaction.summary.PSObject.Properties) { $summary[$property.Name] = $property.Value }
  $summary["prunedExports"] = @($removedExports)
  $summary["remainingExports"] = @($remaining.Name)
  $summary | ConvertTo-Json -Depth 20
} catch {
  foreach ($state in @($pointerStates)[($pointerStates.Count - 1)..0]) {
    if ($state.Installed -and (Test-Path -LiteralPath $state.Final)) { Remove-Item -LiteralPath $state.Final -Force -ErrorAction SilentlyContinue }
    if ($state.HadPrevious -and (Test-Path -LiteralPath $state.Backup) -and -not (Test-Path -LiteralPath $state.Final)) {
      Move-Item -LiteralPath $state.Backup -Destination $state.Final -ErrorAction SilentlyContinue
    }
  }
  if ($installedFinal -and $finalRoot -and (Test-Path -LiteralPath $finalRoot)) {
    Remove-SafeDirectChildDirectory -Parent $exportsRoot -Candidate $finalRoot -Label "failed new export"
  }
  if ($exportBackup -and (Test-Path -LiteralPath $exportBackup) -and -not (Test-Path -LiteralPath $finalRoot)) {
    Move-Item -LiteralPath $exportBackup -Destination $finalRoot -ErrorAction SilentlyContinue
  }
  throw
} finally {
  foreach ($state in $pointerStates) {
    Remove-Item -LiteralPath $state.Staged -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $transactionFile -Force -ErrorAction SilentlyContinue
  if ($lock) { $lock.Dispose() }
  Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}
