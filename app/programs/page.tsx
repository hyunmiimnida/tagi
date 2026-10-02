import { Explorer } from "../../components/Explorer.tsx";
import { getCategories, getSchools } from "../../lib/data.ts";

export const metadata = { title: "공고" };

export default function ProgramsPage() {
  return (
    <>
      {/* 화면 읽기 프로그램용 페이지 제목 (목록 화면은 검색창으로 바로 시작한다) */}
      <h1 className="sr-only">공고</h1>
      <Explorer categories={getCategories()} schools={getSchools()} />
    </>
  );
}
