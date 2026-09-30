import { CalendarView } from "../../components/CalendarView.tsx";
import { getPrograms } from "../../lib/data.ts";

export const metadata = { title: "내 캘린더" };

export default function CalendarPage() {
  return (
    <>
      <h1>내 캘린더</h1>
      <CalendarView programs={getPrograms()} />
    </>
  );
}
