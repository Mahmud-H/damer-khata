Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Background green
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(31, 122, 82))
$g.FillEllipse($brush, 20, 20, 472, 472)

# Golden bag
$gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(251, 191, 36))
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(245, 158, 11), 24)
$g.DrawArc($pen, 186, 120, 140, 140, 180, 180)
$g.FillRectangle($gold, 130, 200, 252, 220)

# White inner circle
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillEllipse($white, 216, 260, 80, 80)

# Green Taka symbol lines
$gPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(31, 122, 82), 7)
$g.DrawLine($gPen, 238, 280, 274, 280)
$g.DrawLine($gPen, 256, 280, 256, 322)
$g.DrawLine($gPen, 244, 298, 268, 298)

$dir1 = "C:\Users\Mahmud\.gemini\antigravity\scratch\damer-khata\app\src\main\res\drawable"
$dir2 = "C:\Users\Mahmud\.gemini\antigravity\scratch\damer-khata\app\src\main\res\mipmap-xxxhdpi"
[System.IO.Directory]::CreateDirectory($dir1) | Out-Null
[System.IO.Directory]::CreateDirectory($dir2) | Out-Null
$bmp.Save("$dir1\ic_launcher.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save("$dir2\ic_launcher.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "App icons generated successfully!"
