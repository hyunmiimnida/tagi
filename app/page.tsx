import { Home } from "../components/Home.tsx";
import { getCategories, getListPrograms } from "../lib/data.ts";

export default function HomePage() {
  return <Home programs={getListPrograms({ current: true })} categories={getCategories()} />;
}
