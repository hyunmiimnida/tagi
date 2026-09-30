import { Explorer } from "../components/Explorer.tsx";
import { getCategories, getPrograms } from "../lib/data.ts";

export default function HomePage() {
  return <Explorer programs={getPrograms()} categories={getCategories()} />;
}
