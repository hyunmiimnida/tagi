import { AdminApp } from "../../components/admin/AdminApp.tsx";
import { getCollectStatus, getSchools } from "../../lib/data.ts";

// 관리자 화면. 누구나 열 수는 있지만 데이터는 관리자 계정(supabase/admin.sql의 admins 표)에게만 보인다
export const metadata = { title: "관리자", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <AdminApp
      schools={getSchools().map(({ id, shortName }) => ({ id, shortName }))}
      collect={getCollectStatus()}
    />
  );
}
