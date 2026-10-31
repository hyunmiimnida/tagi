// 이용약관·개인정보처리방침·댓글 규칙에 함께 쓰는 값

// 운영용 이메일. 문의·개인정보 보호 책임자·게시물 신고(임시조치 요청) 창구이고, 수집기 이름(User-Agent)에도 들어간다
export const CONTACT_EMAIL = "whgusals4@gmail.com";
export const CONTACT = { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` };

// 개인정보처리방침에 공개하는 개인정보 보호 책임자 (개인 운영, 2026-10-31 운영자 결정)
export const PRIVACY_OFFICER = "조현민";

// 검색엔진 소유 확인 코드 (공개값). 구글 서치 콘솔·네이버 서치어드바이저의 "HTML 태그" 방식에서 content="..." 안의 값만 넣는다.
// 비어 있으면 페이지에 넣지 않는다 (docs/설정-안내.md "검색 등록" 참고)
export const SITE_VERIFICATION = { google: "", naver: "" };

// 문서를 고치면 날짜도 바꾼다
export const POLICY_DATE = "2026년 10월 31일";

export const COMMENT_RULES = [
  "욕설, 비방, 차별, 성적인 표현은 쓰지 않아요.",
  "광고, 홍보, 같은 글 반복은 쓰지 않아요.",
  "이름, 연락처, 학번 같은 개인정보는 쓰지 않아요. 내 것도, 다른 사람 것도요.",
  "확인되지 않은 정보를 사실처럼 쓰지 않아요.",
];

// 처음 후기를 쓸 때 규칙과 함께 보여 주고 동의를 받는다. 방침·약관도 같은 내용으로 맞춘다
export const REVIEW_USE_NOTICE =
  "남겨 주신 후기는 학교의 프로그램 개선을 위한 자료로 쓰일 수 있어요. 이때는 누가 썼는지 알 수 없는 통계와 요약으로만 전달하고, 닉네임과 계정, 글 원문은 전달하지 않아요.";

export const REPORT_REASONS = ["욕설·비방", "광고·스팸", "개인정보 노출", "거짓 정보", "기타"];
