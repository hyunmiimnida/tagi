import Link from "next/link";
import { AvatarEditor } from "../../../components/AvatarEditor.tsx";
import { ChevronIcon } from "../../../components/Icons.tsx";

export const metadata = { title: "내 캐릭터 꾸미기" };

export default function AvatarPage() {
  return (
    <>
      <Link href="/my" className="back-link">
        <ChevronIcon dir="left" size={20} />
        프로필
      </Link>
      <h1 className="page-title">내 캐릭터</h1>
      <AvatarEditor />
    </>
  );
}
