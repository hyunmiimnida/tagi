// 신고·의견 알림 이슈의 본문. 공개 저장소에 올라가므로 숫자만 받는다 (글 내용이 들어올 자리를 두지 않는다)
export function reportAlertMarkdown(site: string, counts: { feedback: number; comments: number; programs: number }): string {
  const lines: string[] = [];
  if (counts.feedback > 0) lines.push(`## 새 의견 ${counts.feedback}건`, "", `관리자 화면 → 의견함: ${site}/admin#feedback`, "");
  if (counts.comments > 0) lines.push(`## 댓글 신고 ${counts.comments}건`, "", `관리자 화면 → 댓글: ${site}/admin#comments`, "");
  if (counts.programs > 0) lines.push(`## 공고 정보 오류 신고 ${counts.programs}건`, "", `관리자 화면 → 정보 오류: ${site}/admin#reports`, "");
  return lines.join("\n");
}
