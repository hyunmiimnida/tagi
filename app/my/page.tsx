import { MyAccount } from "../../components/MyAccount.tsx";
import { describeSources, getSchools } from "../../lib/data.ts";

export const metadata = { title: "프로필" };

export default function MyPage() {
  return (
    <>
      <h1 className="page-title">프로필</h1>
      <MyAccount
        schools={getSchools()}
        sources={describeSources()}
      />
    </>
  );
}
