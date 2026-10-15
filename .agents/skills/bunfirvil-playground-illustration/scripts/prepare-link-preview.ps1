param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Output
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'This helper requires Windows System.Drawing.'
}
Add-Type -AssemblyName System.Drawing

$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$outputPath = [System.IO.Path]::GetFullPath($Output)
if ([System.IO.Path]::GetExtension($outputPath) -notin @('.jpg', '.jpeg')) {
  throw 'Output must use a .jpg or .jpeg extension.'
}
if (Test-Path -LiteralPath $outputPath) {
  throw "Use a new versioned filename; output already exists: $outputPath"
}
if (-not (Test-Path -LiteralPath (Split-Path $outputPath) -PathType Container)) {
  throw 'Output directory does not exist.'
}

# Mechanical delivery only; this helper does not generate or repaint artwork.
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$bitmap = [System.Drawing.Bitmap]::new(1200, 630)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
try {
  $scale = [Math]::Max(1200 / $sourceImage.Width, 630 / $sourceImage.Height)
  $cropWidth = 1200 / $scale
  $cropHeight = 630 / $scale
  $sourceRect = [System.Drawing.RectangleF]::new(
    [single](($sourceImage.Width - $cropWidth) / 2),
    [single](($sourceImage.Height - $cropHeight) / 2),
    [single]$cropWidth, [single]$cropHeight)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::FromArgb(3, 13, 19))
  $graphics.DrawImage($sourceImage, [System.Drawing.RectangleF]::new(0, 0, 1200, 630), $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
  $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]88)
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
  $bitmap.Save($outputPath, $codec, $parameters)
  [pscustomobject]@{ Output = $outputPath; Width = 1200; Height = 630; Bytes = (Get-Item -LiteralPath $outputPath).Length }
} finally {
  $parameters.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
  $sourceImage.Dispose()
}
