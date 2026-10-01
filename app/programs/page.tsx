import { Explorer } from "../../components/Explorer.tsx";
import { getCategories, getListPrograms, getSchools } from "../../lib/data.ts";

export const metadata = { title: "공고" };

export default function ProgramsPage() {
  return <Explorer programs={getListPrograms()} categories={getCategories()} schools={getSchools()} />;
}
