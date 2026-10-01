import Link from "next/link";
import { SITE_NAME } from "../../lib/filter.ts";
import { CONTACT, POLICY_DATE } from "../../lib/policy.ts";

export const metadata = { title: "개인정보처리방침" };

export default function PrivacyPage() {
  return (
    <article className="card doc">
      <h1>개인정보처리방침</h1>
      <p className="doc-date">시행일 {POLICY_DATE}</p>

      <p>{SITE_NAME}는 서비스에 꼭 필요한 정보만 모으고, 탈퇴하면 바로 지웁니다.</p>

      <h2>1. 모으는 정보와 쓰는 곳</h2>
      <table className="doc-table">
        <thead>
          <tr>
            <th>정보</th>
            <th>쓰는 곳</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>소셜 로그인 정보: 카카오·구글 계정 고유번호, 이메일(제공한 경우)</td>
            <td>로그인, 내 계정 구분</td>
          </tr>
          <tr>
            <td>학교, 신분·학년, 관심 분야, 알림 설정, 관심 표시한 공고</td>
            <td>나에게 맞는 공고와 내 캘린더 보여 주기</td>
          </tr>
          <tr>
            <td>닉네임(정한 경우), 내가 쓴 댓글, 댓글 이용 규칙 동의 시각</td>
            <td>후기·정보 나눔 (다른 사람에게는 닉네임이나 &ldquo;익명&rdquo;으로만 보임)</td>
          </tr>
          <tr>
            <td>내가 한 신고와 숨긴 사용자 목록</td>
            <td>규칙을 어긴 댓글 관리, 숨긴 사람 글 가리기</td>
          </tr>
          <tr>
            <td>알림 받을 기기 주소(마감 알림을 켠 경우, 브라우저가 만든 값)</td>
            <td>관심 공고 마감 하루 전 알림 보내기 (알림을 끄면 바로 지움)</td>
          </tr>
        </tbody>
      </table>
      <p>
        로그인하지 않으면 프로필 설정과 관심 표시는 이 기기의 브라우저에만 저장되고, 서비스로 보내지지 않습니다. 이름, 전화번호,
        학번은 모으지 않습니다.
      </p>

      <h2>2. 보관 기간</h2>
      <p>
        탈퇴할 때까지 보관하고, <Link href="/my">프로필</Link>에서 탈퇴하면 위 정보를 모두 바로 지웁니다.
      </p>

      <h2>3. 맡기는 곳 (처리 위탁)</h2>
      <ul>
        <li>Supabase: 로그인과 계정 정보 저장</li>
        <li>Vercel: 사이트 운영 (접속 기록이 일시적으로 남을 수 있음)</li>
        <li>카카오, 구글: 소셜 로그인</li>
        <li>GitHub: 매일 아침 마감 알림을 보내는 작업 실행</li>
        <li>브라우저 알림 서비스(구글·애플·모질라 등, 쓰는 브라우저에 따라): 마감 알림 전달 (공고 제목을 암호화해 보냄)</li>
      </ul>
      <p>위 목적 밖으로 정보를 다른 곳에 주거나 팔지 않습니다.</p>

      <h2>3-1. 국외 이전</h2>
      <table className="doc-table">
        <tbody>
          <tr>
            <th>받는 곳</th>
            <td>Supabase Inc.(로그인·계정 정보 저장), Vercel Inc.(사이트 운영), GitHub Inc.(알림 보내기 작업), 브라우저 알림 서비스(마감 알림을 켠 경우)</td>
          </tr>
          <tr>
            <th>나라</th>
            <td>각 회사가 서버를 둔 나라 (미국 등)</td>
          </tr>
          <tr>
            <th>옮기는 정보</th>
            <td>1번 표의 정보(Supabase), 접속 기록(Vercel), 알림 받을 기기 주소와 관심 공고(GitHub·알림 서비스, 알림을 보낼 때만)</td>
          </tr>
          <tr>
            <th>시기·방법</th>
            <td>로그인하거나 설정을 저장할 때, 사이트를 열 때 암호화된 연결(HTTPS)로 전송</td>
          </tr>
          <tr>
            <th>보관 기간</th>
            <td>탈퇴할 때까지 (접속 기록은 각 회사 정책에 따름)</td>
          </tr>
        </tbody>
      </table>
      <p>국외 이전을 원하지 않으면 로그인하지 않고 쓸 수 있습니다. 이때 설정은 이 기기의 브라우저에만 저장됩니다.</p>

      <h2>4. 내 권리</h2>
      <p>
        내 정보를 보거나 고치거나 지우고 싶으면 언제든 요청할 수 있습니다. 학교 설정과 관심 표시는 직접 바꿀 수 있고, 댓글은 직접
        지울 수 있으며, 탈퇴하면 모두 지워집니다.
      </p>

      <h2>5. 개인정보 보호 책임자와 문의</h2>
      <p>
        {SITE_NAME} 운영자 ·{" "}
        <a href={CONTACT.href}>
          {CONTACT.label}
        </a>
      </p>
      <p>열람·정정·삭제 요청은 이메일로 받고, 받은 날부터 10일 안에 처리하고 결과를 알려 드립니다.</p>
    </article>
  );
}
