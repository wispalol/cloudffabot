$clientId = "1520518309735305357"
$perms = 8
$url = "https://discord.com/oauth2/authorize?client_id=$clientId&permissions=$perms&scope=bot+applications.commands"

Write-Host "Opening invite link in your browser..." -ForegroundColor Green
Write-Host ""
Write-Host "1. Select your server from the dropdown" -ForegroundColor Yellow
Write-Host "2. Click 'Continue' then 'Authorize'" -ForegroundColor Yellow
Write-Host "3. Come back here and run: .\start.ps1" -ForegroundColor Yellow
Write-Host ""
Start-Process $url
