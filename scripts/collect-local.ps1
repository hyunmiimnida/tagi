# 내 컴퓨터에서 수집을 실행하고 결과를 GitHub에 올린다.
# 해외 서버에서 접속할 수 없는 출처(localOnly)를 수집하기 위해 쓴다.
# Windows 작업 스케줄러에 등록하면 하루 1회 자동으로 실행된다 (docs/설정-안내.md 참고).

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$logDir = Join-Path $PWD "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "collect-local.log") -Append | Out-Null

try {
  git pull --rebase --quiet
  # 일부 출처가 실패해도 성공한 결과는 올린다
  npm.cmd run collect
  git add data
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    git commit --quiet -m "정보 수집 결과 갱신 (내 컴퓨터)"
    git push --quiet
  }
} finally {
  Stop-Transcript | Out-Null
}
