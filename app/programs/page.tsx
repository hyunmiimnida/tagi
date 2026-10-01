import { Explorer } from "../../components/Explorer.tsx";
import { getCategories, getPrograms } from "../../lib/data.ts";

export const metadata = { title: "공고" };

export default function ProgramsPage() {
  return <Explorer programs={getPrograms()} categories={getCategories()} />;
}
