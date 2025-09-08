param(
  [string[]]$Symbols = @("TCS", "INFY"),
  [string]$Exchange = "NSE",
  [int]$Short = 20,
  [int]$Long = 50,
  [switch]$Full,
  [switch]$Live
)

if (-not (Test-Path ..\.venv\Scripts\Activate.ps1)) {
  py -3 -m venv ..\.venv
}
..\.venv\Scripts\Activate.ps1
pip install -r ..\backend\requirements.txt

if (-not (Test-Path ..\.env)) {
  Copy-Item ..\backend\.env.example ..\.env
  Write-Host "Fill .env with your Zerodha credentials and run backend/scripts/get_access_token.py"
}

python ..\backend\scripts\download_instruments.py
$argsList = @("--symbols") + $Symbols + @("--exchange", $Exchange, "--short", $Short, "--long", $Long)
if ($Full) { $argsList += "--full" } else { $argsList += "--ltp" }
if ($Live) { $argsList += "--live" }
python ..\backend\main.py @argsList


