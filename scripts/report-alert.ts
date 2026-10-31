// 신고·문의 알림 이슈의 본문. 공개 저장소에 올라가므로 숫자만 받는다 (글 내용이 들어올 자리를 두지 않는다)
export interface ReportCounts {
  feedback: number;
  feedbackTypes?: Record<string, number>; // 유형 이름은 정해진 목록에서만 온다 (FEEDBACK_TYPES)
  urgent?: number; // AI가 급하다고 본, 아직 끝나지 않은 문의
  dueSoon?: number; // 답변 기한이 3일 안으로 남았거나 지난 문의
  aiPending?: number; // AI가 아직 확인하지 않은 문의
  comments: number;
  programs: number;
}

export function reportAlertMarkdown(site: string, counts: ReportCounts): string {
  const lines: string[] = [];
  const inbox = `관리자 화면 → 의견함: ${site}/admin#feedback`;
  if (counts.urgent || counts.dueSoon) {
    lines.push("## 먼저 확인할 문의");
    if (counts.urgent) lines.push(`- AI가 급하다고 본 문의 ${counts.urgent}건`);
    if (counts.dueSoon) lines.push(`- 답변 기한 3일 안(또는 지남) ${counts.dueSoon}건`);
    lines.push("", inbox, "");
  }
  if (counts.feedback > 0) {
    const types = Object.entries(counts.feedbackTypes ?? {}).map(([type, n]) => `${type} ${n}`);
    lines.push(`## 새 문의 ${counts.feedback}건${types.length ? ` (${types.join(", ")})` : ""}`, "", inbox, "");
    if (counts.aiPending) lines.push(`AI 확인 대기 ${counts.aiPending}건 (내 컴퓨터 예약 작업 때 확인)`, "");
  }
  if (counts.comments > 0) lines.push(`## 댓글 신고 ${counts.comments}건`, "", `관리자 화면 → 댓글: ${site}/admin#comments`, "");
  if (counts.programs > 0) lines.push(`## 공고 정보 오류 신고 ${counts.programs}건`, "", `관리자 화면 → 정보 오류: ${site}/admin#reports`, "");
  return lines.join("\n");
}
