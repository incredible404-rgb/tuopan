param(
    [Parameter(Mandatory)][string]$Out,
    [string]$Exe = "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe"
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Exe)) { throw "Obsidian.exe not found: $Exe" }

Add-Type -AssemblyName System.Drawing
Add-Type -Namespace Tuopan -Name Native -MemberDefinition '[DllImport("user32",CharSet=CharSet.Unicode)] public static extern uint PrivateExtractIconsW(string f,int i,int cx,int cy,IntPtr[] ic,uint[] id,uint n,uint fl);'

# 100% to 400% tray sizes, plus 256 for anything larger.
$frames = foreach ($size in 16, 20, 24, 32, 40, 48, 64, 256) {
    $handle = New-Object IntPtr[] 1
    $id = New-Object uint32[] 1
    if ([Tuopan.Native]::PrivateExtractIconsW($Exe, 0, $size, $size, $handle, $id, 1, 0) -lt 1) { throw "Cannot extract ${size}px icon" }
    $stream = New-Object IO.MemoryStream
    [System.Drawing.Icon]::FromHandle($handle[0]).ToBitmap().Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    [pscustomobject]@{ Size = $size; Png = $stream.ToArray() }
}

$ico = New-Object IO.MemoryStream
$writer = New-Object IO.BinaryWriter $ico
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
$offset = 6 + 16 * $frames.Count
foreach ($frame in $frames) {
    # The ICO header stores 256 as 0.
    $dimension = if ($frame.Size -ge 256) { 0 } else { $frame.Size }
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$frame.Png.Length); $writer.Write([uint32]$offset)
    $offset += $frame.Png.Length
}
foreach ($frame in $frames) { $writer.Write($frame.Png) }
[IO.File]::WriteAllBytes($Out, $ico.ToArray())
Write-Output "Wrote $Out ($($frames.Size -join ', '))"
