# =============================================================================
# RTLS Safetrack — Arranque local
#
# Arranca: Mosquitto (Docker) + positioning-api (Maven) + positioning-frontend (Vite).
#
# Pre-requisitos (UNA SOLA VEZ, ver docs/STARTUP.md):
#   - Docker Desktop corriendo
#   - Java 21 instalado
#   - Node 20+ instalado
#   - Digital Twin corriendo (auth-server :9000, MySQL :3307, Mongo :27016)
#   - BD `dt_safetrack` creada (scripts/setup-databases.sql)
#   - Permisos Mongo para `dt_app` sobre `dt_safetrack_metrics`
#   - Cliente OAuth2 `rtls-safetrack-web` registrado (scripts/register-oauth2-client.sql)
#
# Uso:
#   .\scripts\start.ps1
#
# Para parar:
#   - Cerrar las ventanas del api y del frontend (Ctrl+C en cada una)
#   - docker compose -f infra/docker-compose.yml down
# =============================================================================

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  RTLS Safetrack — arranque local" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------------------------------------------
# 1. Verificar prerequisitos del Digital Twin
# -----------------------------------------------------------------------------
Write-Host "[1/4] Verificando que el auth-server del DT esté corriendo (:9000)..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:9000/.well-known/openid-configuration" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "      ✓ auth-server respondiendo" -ForegroundColor Green
    }
}
catch {
    Write-Host "      ✗ auth-server NO accesible en :9000" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Arranca primero el Digital Twin:" -ForegroundColor Yellow
    Write-Host "    cd C:\PACO\workspaces\digital-twin\dt-infra" -ForegroundColor Gray
    Write-Host "    docker compose up -d" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# -----------------------------------------------------------------------------
# 2. Arrancar Mosquitto via docker-compose
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[2/4] Arrancando Mosquitto (Docker)..." -ForegroundColor Yellow

Push-Location "infra"
try {
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up falló"
    }
    Write-Host "      ✓ Mosquitto arrancado en :1883" -ForegroundColor Green
}
finally {
    Pop-Location
}

# -----------------------------------------------------------------------------
# 3. Arrancar positioning-api en ventana separada
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[3/4] Arrancando positioning-api (Maven Wrapper)..." -ForegroundColor Yellow
Write-Host "      Se abre una ventana nueva con los logs del api." -ForegroundColor Gray

$apiPath = Join-Path $RepoRoot "positioning-api"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$apiPath'; .\mvnw.cmd spring-boot:run"

Write-Host "      ✓ positioning-api arrancando en :8090 (tarda ~30s la primera vez)" -ForegroundColor Green

# -----------------------------------------------------------------------------
# 4. Arrancar positioning-frontend en ventana separada
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[4/4] Arrancando positioning-frontend (Vite)..." -ForegroundColor Yellow

$frontendPath = Join-Path $RepoRoot "positioning-frontend"

# Comprobar que node_modules está instalado
if (-Not (Test-Path (Join-Path $frontendPath "node_modules"))) {
    Write-Host "      node_modules no encontrado, ejecutando 'npm install'..." -ForegroundColor Gray
    Push-Location $frontendPath
    try {
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install falló"
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host "      Se abre una ventana nueva con los logs del frontend." -ForegroundColor Gray

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev"

Write-Host "      ✓ positioning-frontend arrancando en :5180" -ForegroundColor Green

# -----------------------------------------------------------------------------
# Final
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Todo arrancando" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Frontend: http://localhost:5180" -ForegroundColor White
Write-Host "  API:      http://localhost:8090/api/management/health" -ForegroundColor White
Write-Host "  Mosquitto: tcp://localhost:1883" -ForegroundColor White
Write-Host "  Auth-server (DT): http://localhost:9000" -ForegroundColor White
Write-Host ""
Write-Host "  El api tarda ~30s en estar listo la primera vez (descarga Maven)." -ForegroundColor Gray
Write-Host "  Cuando veas 'Started PositioningApiApplication' en la ventana del api," -ForegroundColor Gray
Write-Host "  abre el navegador en http://localhost:5180" -ForegroundColor Gray
Write-Host ""

# Esperar 5 segundos y abrir el browser
Start-Sleep -Seconds 5
Start-Process "http://localhost:5180"
