// 이용약관·개인정보처리방침·댓글 규칙에 함께 쓰는 값

// 운영용 이메일. 문의·개인정보 보호 책임자·게시물 신고(임시조치 요청) 창구이고, 수집기 이름(User-Agent)에도 들어간다
export const CONTACT_EMAIL = "whgusals4@gmail.com";
export const CONTACT = { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` };

// 문서를 고치면 날짜도 바꾼다
export const POLICY_DATE = "2026년 10월 1일";

export const COMMENT_RULES = [
  "욕설, 비방, 차별, 성적인 표현은 쓰지 않아요.",
  "광고, 홍보, 같은 글 반복은 쓰지 않아요.",
  "이름, 연락처, 학번 같은 개인정보는 쓰지 않아요. 내 것도, 다른 사람 것도요.",
  "확인되지 않은 정보를 사실처럼 쓰지 않아요.",
];

export const REPORT_REASONS = ["욕설·비방", "광고·스팸", "개인정보 노출", "거짓 정보", "기타"];
