import { ScrollView } from "react-native";
import { EmptyText, Section } from "@/components/section";

// 캘린더: 관심 공고 일정 (로그인과 관심 표시를 붙이는 단계에서 만든다)
export default function CalendarScreen() {
  return (
    <ScrollView contentContainerStyle={{ paddingTop: 4 }}>
      <Section title="내 캘린더">
        <EmptyText>관심 공고에 ☆를 누르면 모집 마감일과 활동 일정이 여기에 모여요. 곧 열려요.</EmptyText>
      </Section>
    </ScrollView>
  );
}
