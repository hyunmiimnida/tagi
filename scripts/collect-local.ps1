# 내 컴퓨터에서 수집을 실행하고 결과를 GitHub에 올린다.
# 해외 서버에서 접속할 수 없는 출처(localOnly)를 수집하기 위해 쓴다.
# Windows 작업 스케줄러에 등록하면 하루 1회 자동으로 실행된다 (docs/설정-안내.md 참고).

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$logDir = Join-Path $PWD "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "collect-local.log") -Append | Out-Null

# 수집 결과 저장 커밋을 만든다. 바뀐 것이 없으면 false
function Save-Data {
  git add data | Out-Null
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { return $false }
  git commit --quiet -m "정보 수집 결과 갱신 (내 컴퓨터)" | Out-Null
  return $true
}

try {
  # 문의 AI 확인. 실패해도 수집은 계속한다 (git·data와 상관없는 작업이라 맨 앞에서 한다)
  try { node scripts/triage-feedback.ts } catch { Write-Output "문의 AI 확인 실패: $_" }

  # 손으로 하던 data 작업(과거 글 저장 등)이 아직 안 올라갔으면 섞이지 않게 이번 자동 수집은 건너뛴다
  # (2026-10-16 자동 수집과 과거 글 저장이 겹쳐 git 충돌 표시가 든 목록이 올라간 적이 있다)
  if (git status --porcelain -- data) {
    Write-Output "data 폴더에 올리지 않은 변경이 있어 이번 자동 수집을 건너뜀"
    return
  }
  git pull --rebase --autostash --quiet
  if (git diff --name-only --diff-filter=U) { throw "최신을 받다가 충돌이 남: 자동 수집을 멈춤" }
  # 일부 출처가 실패해도 성공한 결과는 올린다
  npm.cmd run collect
  # 수집하는 동안 GitHub Actions 결과가 먼저 올라오면 올리기가 실패한다.
  # 그때는 이번 데이터 커밋만 되돌리고(data 폴더만, 다른 작업은 그대로) 최신을 받아 다시 수집한다 (최대 3번)
  for ($try = 1; $try -le 3; $try++) {
    if (-not (Save-Data)) { break }
    git push --quiet
    if ($LASTEXITCODE -eq 0) { break }
    Write-Output "올리기 실패 ($try번째): 최신을 받아 다시 수집"
    git reset --soft HEAD~1
    git reset --quiet -- data
    git checkout -- data
    git pull --rebase --autostash --quiet
    npm.cmd run collect
  }
} finally {
  Stop-Transcript | Out-Null
}
