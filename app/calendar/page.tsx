import { CalendarView } from "../../components/CalendarView.tsx";
import { getListPrograms } from "../../lib/data.ts";

export const metadata = { title: "캘린더" };

export default function CalendarPage() {
  return (
    <>
      <h1 className="page-title">내 캘린더</h1>
      <CalendarView programs={getListPrograms()} />
    </>
  );
}
