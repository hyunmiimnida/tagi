import { AdminApp } from "../../components/admin/AdminApp.tsx";
import { getCollectStatus, getPrograms, getSchools, getSeriesInfo } from "../../lib/data.ts";

// 관리자 화면. 누구나 열 수는 있지만 데이터는 관리자 계정(supabase/admin.sql의 admins 표)에게만 보인다
export const metadata = { title: "관리자", robots: { index: false, follow: false } };

export default function AdminPage() {
  // 신고·관심 공고의 id를 제목으로 보여 주려고 지금 목록의 제목을 넘긴다 (합쳐진 예전 id도)
  const programTitles: Record<string, [title: string, id: string]> = {};
  for (const p of getPrograms()) {
    for (const id of [p.id, ...(p.aliases ?? [])]) programTitles[id] = [p.title, p.id];
  }
  return (
    <AdminApp
      schools={getSchools().map(({ id, shortName }) => ({ id, shortName }))}
      programTitles={programTitles}
      seriesInfo={getSeriesInfo()}
      collect={getCollectStatus()}
    />
  );
}
