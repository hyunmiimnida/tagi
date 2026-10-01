import { Home } from "../components/Home.tsx";
import { getCategories, getPrograms } from "../lib/data.ts";

export default function HomePage() {
  return <Home programs={getPrograms()} categories={getCategories()} />;
}
