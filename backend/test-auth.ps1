# Auth gate checks: every resource rejects anonymous/invalid callers.
# Run: powershell -NoProfile -File test-auth.ps1 (backend need NOT run first;
# this script starts and stops its own server on port 3001).
$B = 'http://localhost:3001/api'
$failures = 0
function Check($label, $cond) {
  if ($cond) { Write-Output "PASS: $label" }
  else { Write-Output "FAIL: $label"; $script:failures++ }
}
function Status($m, $u, $token) {
  $kw = @{ Uri = "$B/$u"; Method = $m; UseBasicParsing = $true }
  if ($token) { $kw.Headers = @{ Authorization = "Bearer $token" } }
  try {
    return (Invoke-WebRequest @kw).StatusCode
  } catch {
    return [int]$_.Exception.Response.StatusCode
  }
}
$p = Start-Process node -ArgumentList 'src/index.js' -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
try {
  $h = Invoke-WebRequest -Uri "$B/health" -UseBasicParsing | ConvertFrom-Json
  Check 'health stays public' ($h.ok -eq $true)
  Check 'children w/o token 401' ((Status 'GET' 'children') -eq 401)
  Check 'dose-records w/o token 401' ((Status 'GET' 'dose-records') -eq 401)
  Check 'appointments w/o token 401' ((Status 'GET' 'appointments') -eq 401)
  Check 'sms-log w/o token 401' ((Status 'GET' 'sms-log') -eq 401)
  Check 'me w/o token 401' ((Status 'GET' 'me') -eq 401)
  Check 'children bad token 401' ((Status 'GET' 'children' 'garbage-token') -eq 401)
} finally {
  Stop-Process -Id $p.Id -Force
}
Write-Output "Failures: $failures"
exit $failures
