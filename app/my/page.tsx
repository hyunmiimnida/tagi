import { MyAccount } from "../../components/MyAccount.tsx";
import { getSchools } from "../../lib/data.ts";

export const metadata = { title: "내 정보" };

export default function MyPage() {
  const schoolNames = Object.fromEntries(getSchools().map((s) => [s.id, s.name]));
  return (
    <>
      <h1 className="page-title">내 정보</h1>
      <MyAccount schoolNames={schoolNames} />
    </>
  );
}
