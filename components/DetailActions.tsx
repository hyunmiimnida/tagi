"use client";

import { useState } from "react";
import { downloadIcs } from "../lib/ics.ts";
import type { Program } from "../src/types.ts";
import { FavoriteButton } from "./FavoriteButton.tsx";

export function DetailActions({ program }: { program: Program }) {
  const [copied, setCopied] = useState(false);
  const hasDates = Boolean(program.recruitPeriod.end || program.activityPeriod.start);

  async function share() {
    const url = window.location.href;
    // 휴대폰에서는 공유 창을, 컴퓨터에서는 링크 복사를 쓴다
    if (navigator.share) {
      await navigator.share({ title: program.title, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="detail-actions">
      <FavoriteButton programId={program.id} withLabel />
      {hasDates && (
        <button className="button" onClick={() => downloadIcs([program], `${program.id}.ics`)}>
          📅 내 캘린더 앱에 추가
        </button>
      )}
      <button className="button" onClick={share}>
        {copied ? "링크를 복사했어요" : "🔗 공유"}
      </button>
    </div>
  );
}
