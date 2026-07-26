# One-time art processing for the séance planchette (DESIGN §30):
#  1. chroma-key the solid green background to transparent
#  2. inside the lens, green-tinted glass goes transparent too (the letter must show THROUGH),
#     while the pale reflections stay at partial alpha as a glass sheen
#  3. trim transparent margins and save art/planchette.png
# Uses LockBits for speed (SetPixel would take minutes on 1408x768).
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::new("art/planchette-raw.png")
$w = $src.Width; $h = $src.Height
$bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($src, 0, 0, $w, $h)
$g.Dispose()

$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($data.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

# lens geometry measured off the raw image (1408x768): glass center ~(705,395), glass r ~150
$lensX = 705.0; $lensY = 395.0; $lensR = 132.0

$minX = $w; $minY = $h; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $h; $y++) {
  $row = $y * $data.Stride
  for ($x = 0; $x -lt $w; $x++) {
    $i = $row + $x * 4
    $b = $bytes[$i]; $gr = $bytes[$i + 1]; $r = $bytes[$i + 2]
    $isGreen = ($gr -gt ($r + 18)) -and ($gr -gt ($b + 18))
    $dx = $x - $lensX; $dy = $y - $lensY
    $inLens = ($dx * $dx + $dy * $dy) -lt ($lensR * $lensR)
    if ($isGreen -and -not $inLens) {
      $bytes[$i + 3] = 0
    } elseif ($inLens) {
      if ($isGreen) {
        # glass body: a UNIFORM faint sage tint instead of raw transparency — the keyed
        # remnants read as "broken green glass" (DM 2026-07-27); a consistent tint sits
        # the reflections into the pane while the letter still shows through.
        $bytes[$i] = 96; $bytes[$i + 1] = 118; $bytes[$i + 2] = 96
        $bytes[$i + 3] = 52
      } else {
        # reflections / rim shadow -> glass sheen at 45%
        $bytes[$i + 3] = [byte](0.45 * $bytes[$i + 3])
      }
    }
    if ($bytes[$i + 3] -gt 8) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
$bmp.UnlockBits($data)

$pad = 6
$minX = [Math]::Max(0, $minX - $pad); $minY = [Math]::Max(0, $minY - $pad)
$maxX = [Math]::Min($w - 1, $maxX + $pad); $maxY = [Math]::Min($h - 1, $maxY + $pad)
$cw = $maxX - $minX + 1; $ch = $maxY - $minY + 1
$crop = $bmp.Clone((New-Object System.Drawing.Rectangle($minX, $minY, $cw, $ch)), $bmp.PixelFormat)
$crop.Save("art/planchette.png", [System.Drawing.Imaging.ImageFormat]::Png)
"cropped ${cw}x${ch} from ${w}x${h}; lens center in cropped image: $([Math]::Round($lensX-$minX)),$([Math]::Round($lensY-$minY)) r=$lensR"
$src.Dispose(); $bmp.Dispose(); $crop.Dispose()