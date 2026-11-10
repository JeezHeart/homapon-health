# API smoke test (run: powershell -File test-api.ps1 from backend/).
# Creates test rows, checks validation failures, then deletes everything.
$B = 'http://localhost:3001/api'
$failures = 0
function Check($label, $cond) {
  if ($cond) { Write-Output "PASS: $label" }
  else { Write-Output "FAIL: $label"; $script:failures++ }
}
function Req($m, $u, $bodyObj) {
  $kw = @{ Uri = "$B/$u"; Method = $m; UseBasicParsing = $true }
  if ($null -ne $bodyObj) {
    $kw.Body = ($bodyObj | ConvertTo-Json -Compress)
    $kw.ContentType = 'application/json'
  }
  try {
    $r = Invoke-WebRequest @kw
    return @{ status = $r.StatusCode; json = ($r.Content | ConvertFrom-Json) }
  } catch {
    $code = [int]$_.Exception.Response.StatusCode
    $payload = $null
    try { $payload = ($_.ErrorDetails.Message | ConvertFrom-Json) } catch { }
    return @{ status = $code; json = $payload }
  }
}
$today = (Get-Date).ToString('yyyy-MM-dd')
$future = (Get-Date).AddDays(7).ToString('yyyy-MM-dd')
$past = (Get-Date).AddDays(-2).ToString('yyyy-MM-dd')

$g = Req 'GET' 'children'
Check 'seed children present (>=8)' ($g.status -eq 200 -and $g.json.children.Count -ge 8)
$althea = $g.json.children | Where-Object { $_.firstName -eq 'Althea' } | Select-Object -First 1
Check 'seed mapping camelCase + weight' ($althea.lastName -eq 'Reyes' -and $althea.weightKg -eq 11.5)

$nc = Req 'POST' 'children' @{ firstName = 'APITest'; lastName = 'DeleteMe'; birthDate = '2024-01-01'; sex = 'Female'; guardian = 'Test Guardian'; guardianMobile = '0900-000-0999'; purok = 'Test Purok' }
Check 'create child 201' ($nc.status -eq 201 -and $nc.json.child.id)
$tid = $nc.json.child.id

$bad = Req 'POST' 'children' @{ firstName = 'NoMobile' }
Check 'reject child w/o mobile 400' ($bad.status -eq 400)

$up = Req 'PUT' "children/$tid" @{ guardian = 'Changed Guardian'; weightKg = 9.5 }
Check 'update child + weight' ($up.status -eq 200 -and $up.json.child.guardian -eq 'Changed Guardian' -and $up.json.child.weightKg -eq 9.5)

$d1 = Req 'POST' 'dose-records' @{ childId = $tid; vaccineId = 'bcg'; doseNumber = 1; dateAdministered = $today; healthWorker = 'Tester' }
Check 'create dose 201' ($d1.status -eq 201)
$drid = $d1.json.record.id
$dup = Req 'POST' 'dose-records' @{ childId = $tid; vaccineId = 'bcg'; doseNumber = 1; dateAdministered = $today; healthWorker = 'Tester' }
Check 'duplicate dose 409' ($dup.status -eq 409)
$fut = Req 'POST' 'dose-records' @{ childId = $tid; vaccineId = 'bcg'; doseNumber = 2; dateAdministered = '2999-01-01'; healthWorker = 'Tester' }
Check 'future dose 400' ($fut.status -eq 400)
$cor = Req 'PUT' "dose-records/$drid" @{ remarks = 'No reaction observed' }
Check 'correct dose' ($cor.status -eq 200 -and $cor.json.record.remarks -eq 'No reaction observed')

$pa = Req 'POST' 'appointments' @{ childId = $tid; vaccineId = 'penta'; doseNumber = 1; scheduledDate = $past }
Check 'past appointment 422' ($pa.status -eq 422)
$na = Req 'POST' 'appointments' @{ childId = $tid; vaccineId = 'penta'; doseNumber = 1; scheduledDate = $future }
Check 'book appointment 201' ($na.status -eq 201)
$aid = $na.json.appointment.id
$rs = Req 'PUT' "appointments/$aid" @{ scheduledDate = $future }
Check 'reschedule ok' ($rs.status -eq 200)

$sl = Req 'POST' 'sms-log' @{ childId = $tid; message = 'Test message'; status = 'Demo sent' }
Check 'log sms 201' ($sl.status -eq 201)
$gl = Req 'GET' "sms-log?childId=$tid"
Check 'sms log filtered' ($gl.status -eq 200 -and $gl.json.log.Count -eq 1)

$dd = Req 'DELETE' "dose-records/$drid"
Check 'delete dose' ($dd.status -eq 200)
$da = Req 'DELETE' "appointments/$aid"
Check 'delete appointment' ($da.status -eq 200)
$dc = Req 'DELETE' "children/$tid"
Check 'delete child (cascades sms)' ($dc.status -eq 200)
$gone = Req 'PUT' "children/$tid" @{ guardian = 'Gone' }
Check 'deleted child 404' ($gone.status -eq 404)
$g2 = Req 'GET' 'children'
Check 'seed intact after cleanup' ($g2.status -eq 200 -and $g2.json.children.Count -ge 8)

Write-Output "Failures: $failures"
exit $failures
