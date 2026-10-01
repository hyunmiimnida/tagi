import Link from "next/link";
import { getSourceNames } from "../../lib/data.ts";
import { SITE_NAME } from "../../lib/filter.ts";
import { COMMENT_RULES, CONTACT, POLICY_DATE } from "../../lib/policy.ts";

export const metadata = { title: "이용약관" };

export default function TermsPage() {
  const sources = Object.values(getSourceNames()).join(", ");
  return (
    <article className="card doc">
      <h1>이용약관</h1>
      <p className="doc-date">시행일 {POLICY_DATE}</p>

      <h2>1. 서비스 내용</h2>
      <p>
        {SITE_NAME}(이하 &ldquo;서비스&rdquo;)는 대학생이 참여할 수 있는 프로그램 공고를 여러 사이트({sources})에서 모아 정리해
        보여 줍니다. 공고의 사실 정보만 요약하고, 자세한 내용과 신청은 원문 링크에서 합니다.
      </p>

      <h2>2. 정보의 정확성</h2>
      <p>
        공고의 일정, 모집 대상, 주최 같은 정보는 자동으로 정리한 것이라 틀릴 수 있습니다. 신청하기 전에 반드시 원문을 확인해
        주세요. 정리된 정보만 믿고 생긴 손해에 대해 서비스는 책임지지 않습니다.
      </p>

      <h2>3. 회원</h2>
      <ul>
        <li>카카오 또는 구글 계정으로 로그인해 관심 공고, 학교 설정, 댓글 기능을 쓸 수 있습니다.</li>
        <li>
          언제든지 <Link href="/my">내 정보</Link>에서 탈퇴할 수 있고, 탈퇴하면 계정에 저장된 모든 정보가 바로 지워집니다.
        </li>
      </ul>

      <h2>4. 댓글 이용 규칙</h2>
      <p>후기·정보 나눔 댓글은 익명으로 보이며, 처음 쓰기 전에 아래 규칙에 동의해야 합니다.</p>
      <ul>
        {COMMENT_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <p>
        규칙을 어긴 댓글은 누구나 신고할 수 있습니다. 신고가 3건 쌓이면 바로 숨겨지고, 운영자가 확인한 뒤 지웁니다. 규칙을 거듭
        어기면 댓글을 쓸 수 없게 하거나 계정을 지울 수 있습니다. 보고 싶지 않은 사람의 글은 &ldquo;숨기기&rdquo;로 나에게만 안
        보이게 할 수 있습니다.
      </p>
      <p>댓글의 책임은 쓴 사람에게 있습니다. 쓴 댓글은 언제든 직접 지울 수 있습니다.</p>

      <h2>5. 서비스 변경과 중단</h2>
      <p>서비스는 미리 알리지 않고 내용을 바꾸거나 중단할 수 있습니다. 약관을 바꾸면 이 화면에 시행일과 함께 알립니다.</p>

      <h2>6. 문의</h2>
      <p>
        <a href={CONTACT.href} target="_blank" rel="noreferrer">
          {CONTACT.label}
        </a>
        로 알려 주세요.
      </p>
    </article>
  );
}
