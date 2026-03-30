$ErrorActionPreference = "Stop"
$InstallDir = "C:\AI.Ass"

Write-Host "=== Voice Assistant Installation ===" -ForegroundColor Green

# Check Ollama
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Ollama..." -ForegroundColor Yellow
    winget install Ollama.Ollama
}

# Pull Mistral
Write-Host "Pulling Mistral model..." -ForegroundColor Yellow
ollama pull mistral

# Install Python deps
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
pip install -r "$InstallDir\requirements.txt"

# Create directories
New-Item -ItemType Directory -Force -Path "$InstallDir\data\workspace" | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\data\workspace\charts" | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\data\workspace\documents" | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\data\screenshots" | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\lib\extensions" | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\logs" | Out-Null

# Discover installed applications
Write-Host "Discovering installed applications..." -ForegroundColor Yellow
python -c "import sys; sys.path.insert(0,'$InstallDir\lib'); from app_discoverer import AppDiscoverer; d = AppDiscoverer('$InstallDir\config'); d.refresh_cache()"
Write-Host "App discovery complete" -ForegroundColor Green

# Add to PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$InstallDir\bin*") {
    [Environment]::SetEnvironmentVariable(
        "Path",
        "$userPath;$InstallDir\bin",
        "User"
    )
    Write-Host "Added to PATH: $InstallDir\bin" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Installation Complete ===" -ForegroundColor Green
Write-Host "Run: python C:\AI.Ass\bin\assistant.py" -ForegroundColor Cyan
Write-Host ""
Write-Host "Restart terminal for PATH changes to take effect" -ForegroundColor Yellow
