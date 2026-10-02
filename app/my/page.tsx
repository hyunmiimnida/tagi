import { MyAccount } from "../../components/MyAccount.tsx";
import { describeSources, getCategories, getSchools } from "../../lib/data.ts";

export const metadata = { title: "프로필" };

export default function MyPage() {
  const fieldTags = getCategories().find((c) => c.id === "field")?.tags ?? [];
  return (
    <>
      <h1 className="page-title">프로필</h1>
      <MyAccount
        schools={getSchools()}
        fieldTags={fieldTags}
        sources={describeSources()}
      />
    </>
  );
}
