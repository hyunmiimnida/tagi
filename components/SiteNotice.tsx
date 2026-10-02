"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/user.tsx";
import { CloseIcon } from "./Icons.tsx";

// 관리자 화면에서 켠 사이트 공지 (supabase/admin.sql의 announcements). 닫으면 그 공지는 이 기기에서 다시 안 보인다
const DISMISSED_KEY = "dismissedNotice";

interface Notice {
  id: number;
  body: string;
  link: string | null;
  level: "info" | "warn";
}

export function SiteNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from("announcements")
      .select("id, body, link, level")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        let dismissed: string | null = null;
        try {
          dismissed = localStorage.getItem(DISMISSED_KEY);
        } catch {
          // 저장소를 못 쓰면 매번 보여 준다
        }
        if (dismissed !== String(data.id)) setNotice(data as Notice);
      });
  }, []);

  if (!notice) return null;

  function close() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(notice!.id));
    } catch {
      // 저장하지 못해도 지금은 닫는다
    }
    setNotice(null);
  }

  const external = notice.link?.startsWith("http");
  return (
    <div className={`site-notice ${notice.level}`} role="status">
      {notice.link ? (
        external ? (
          <a href={notice.link} target="_blank" rel="noopener noreferrer">
            {notice.body}
          </a>
        ) : (
          <Link href={notice.link}>{notice.body}</Link>
        )
      ) : (
        <span>{notice.body}</span>
      )}
      <button className="site-notice-close" aria-label="공지 닫기" onClick={close}>
        <CloseIcon size={14} />
      </button>
    </div>
  );
}
