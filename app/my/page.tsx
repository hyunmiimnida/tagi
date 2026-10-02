import { MyAccount } from "../../components/MyAccount.tsx";
import { describeSources, getCategories, getListPrograms, getSchools, getSeriesInfo } from "../../lib/data.ts";

export const metadata = { title: "프로필" };

export default function MyPage() {
  const fieldTags = getCategories().find((c) => c.id === "field")?.tags ?? [];
  return (
    <>
      <h1 className="page-title">프로필</h1>
      <MyAccount
        schools={getSchools()}
        fieldTags={fieldTags}
        seriesInfo={getSeriesInfo()}
        programs={getListPrograms({ current: true })}
        sources={describeSources()}
      />
    </>
  );
}
