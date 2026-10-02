import { Explorer } from "../../components/Explorer.tsx";
import { getCategories, getSchools } from "../../lib/data.ts";

export const metadata = { title: "공고" };

export default function ProgramsPage() {
  return <Explorer categories={getCategories()} schools={getSchools()} />;
}
