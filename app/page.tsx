import { Home } from "../components/Home.tsx";
import { getCategories } from "../lib/data.ts";

export default function HomePage() {
  return <Home categories={getCategories()} />;
}
