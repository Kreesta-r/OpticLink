Add-Type -AssemblyName System.Drawing

# Create header.bmp (150x57)
$header = New-Object System.Drawing.Bitmap 150, 57
$g = [System.Drawing.Graphics]::FromImage($header)
$g.Clear([System.Drawing.Color]::FromArgb(30, 30, 30))
$font = New-Object System.Drawing.Font "Segoe UI", 16
$brush = [System.Drawing.Brushes]::White
$g.DrawString("OpticLink", $font, $brush, 10, 10)
$header.Save("src-tauri/icons/header.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)

# Create sidebar.bmp (164x314)
$sidebar = New-Object System.Drawing.Bitmap 164, 314
$g2 = [System.Drawing.Graphics]::FromImage($sidebar)
$g2.Clear([System.Drawing.Color]::FromArgb(20, 20, 20))
$font2 = New-Object System.Drawing.Font "Segoe UI", 24
$g2.DrawString("Optic", $font2, $brush, 20, 100)
$g2.DrawString("Link", $font2, $brush, 20, 140)
$sidebar.Save("src-tauri/icons/sidebar.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)

Write-Host "Installer images generated successfully"
