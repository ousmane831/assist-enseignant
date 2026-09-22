# Assistant Enseignant - demarrage / arret des serveurs (messages en ASCII pour rester lisibles dans tous les terminaux Windows).
# Usage :  .\demarrer.ps1                 -> backend (8000) + frontend (5173) dans deux fenetres
#          .\demarrer.ps1 -Cible dev      -> frontend AU PREMIER PLAN (journaux visibles, Ctrl+C pour arreter)
#          .\demarrer.ps1 -Cible backend  -> backend seul
#          .\demarrer.ps1 -Cible frontend -> frontend seul, en arriere-plan
#          .\demarrer.ps1 -Cible stop     -> arrete ce qui ecoute sur 5173 et 8000
#          .\demarrer.ps1 -Cible tests    -> verifications + tests Django, au premier plan
param([ValidateSet("all", "dev", "backend", "frontend", "stop", "tests")][string]$Cible = "all")

$racine   = $PSScriptRoot
$dossierB = Join-Path $racine "backend"
$dossierF = Join-Path $racine "frontend"

function Test-Ecoute([int]$port) {
  [bool](Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port })
}

function Get-Python {
  $trouve = @("env\Scripts\python.exe", ".venv\Scripts\python.exe", "venv\Scripts\python.exe") |
    ForEach-Object { Join-Path $dossierB $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($trouve) { return $trouve }
  Write-Host "Environnement virtuel introuvable dans backend : utilisation de 'python' du PATH." -ForegroundColor Yellow
  return "python"
}

function Demarrer-Backend {
  if (Test-Ecoute 8000) { Write-Host "Backend deja en ecoute sur http://localhost:8000 : rien a faire." -ForegroundColor Yellow; return }
  $python = Get-Python
  Start-Process -FilePath $python -ArgumentList "manage.py", "runserver" -WorkingDirectory $dossierB
  Write-Host "Backend demarre : http://localhost:8000 (fenetre 'python')" -ForegroundColor Green
}

function Demarrer-Frontend {
  if (Test-Ecoute 5173) { Write-Host "Frontend deja en ecoute sur http://localhost:5173 : rien a faire." -ForegroundColor Yellow; return }
  if (-not (Test-Path (Join-Path $dossierF "node_modules"))) { Write-Host "node_modules absent : lancez d'abord 'npm install' dans le dossier frontend." -ForegroundColor Red; return }
  Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npm run dev" -WorkingDirectory $dossierF
  Write-Host "Frontend demarre : http://localhost:5173 (fenetre 'cmd')" -ForegroundColor Green
}

function Lancer-Tests {
  $python = Get-Python
  Push-Location $dossierB
  try {
    & $python manage.py check
    if ($LASTEXITCODE -ne 0) { Write-Host "manage.py check a echoue : tests interrompus." -ForegroundColor Red; return }
    & $python manage.py test
  } finally { Pop-Location }
}

function Demarrer-Dev {
  # Frontend au premier plan : journaux visibles et Ctrl+C arrete le serveur (comportement attendu de "npm run dev").
  if (Test-Ecoute 5173) {
    Write-Host "L'application tourne deja : http://localhost:5173" -ForegroundColor Yellow
    Write-Host "Ouvrez cette adresse dans le navigateur (Ctrl+Maj+R pour recharger la page)." -ForegroundColor Yellow
    Write-Host "Pour relancer vous-meme le serveur : 'npm run stop' puis 'npm run dev'." -ForegroundColor Yellow
    return
  }
  if (-not (Test-Path (Join-Path $dossierF "node_modules"))) { Write-Host "node_modules absent : lancez d'abord 'npm install' dans le dossier frontend." -ForegroundColor Red; return }
  Push-Location $dossierF
  try { & npm run dev } finally { Pop-Location }
}

function Arreter-Serveurs {
  foreach ($port in 5173, 8000) {
    $pids = @((Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique)
    if ($pids.Count -eq 0) { Write-Host "Port $port : rien a arreter." -ForegroundColor DarkGray; continue }
    foreach ($procId in $pids) {
      try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host "Port $port : serveur arrete (PID $procId)." -ForegroundColor Green }
      catch { Write-Host "Port $port : impossible d'arreter le PID $procId." -ForegroundColor Red }
    }
  }
}

if ($Cible -eq "dev") {
  Demarrer-Dev
} elseif ($Cible -eq "stop") {
  Arreter-Serveurs
} else {
  if ($Cible -eq "all" -or $Cible -eq "backend") { Demarrer-Backend }
  if ($Cible -eq "all" -or $Cible -eq "frontend") { Demarrer-Frontend }
  if ($Cible -eq "tests") { Lancer-Tests }

  if ($Cible -eq "all") {
    Start-Sleep -Seconds 3
    Write-Host ""
    Write-Host "Application : http://localhost:5173" -ForegroundColor Cyan
    Write-Host "API Django  : http://localhost:8000/api/" -ForegroundColor Cyan
    Write-Host "Admin       : http://localhost:8000/admin/" -ForegroundColor Cyan
  }
}
