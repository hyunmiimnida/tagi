import { Home } from "../components/Home.tsx";
import { getCategories, getSchools } from "../lib/data.ts";

export default function HomePage() {
  // 홈 머리말의 "오늘 ○○대학교 소식"에 쓸 학교 이름만 넘긴다
  const schools = getSchools().map(({ id, name }) => ({ id, name }));
  return <Home categories={getCategories()} schools={schools} />;
}
