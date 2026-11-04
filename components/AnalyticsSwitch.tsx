"use client";

import { useEffect, useState } from "react";
import { analyticsChosen, browserSaysNo, setAnalyticsChosen } from "../lib/analytics.ts";
import { supabase } from "../lib/user.tsx";
import { HelpTip } from "./HelpTip.tsx";

// 프로필의 "이용 기록 보내기" 스위치 (기본 켬). 끄면 이 기기에서 아무것도 보내지 않는다 (lib/analytics.ts)
export function AnalyticsSwitch() {
  const [on, setOn] = useState(true);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    setOn(analyticsChosen());
    setBlocked(browserSaysNo());
  }, []);
  if (!supabase) return null;
  return (
    <section className="card my-card">
      <div className="card-head">
        <h2 className="card-title">이용 기록</h2>
        <HelpTip label="이용 기록">
          <p>
            서비스를 고치는 데 쓰려고 어떤 화면을 열고 무엇을 눌렀는지 보내요. 기기마다 무작위로 만든 번호로만 구분하고, 입력한 글자·검색어·IP는 보내지 않아요. 180일 뒤 지워요.
          </p>
        </HelpTip>
      </div>
      <label className="my-switch my-row">
        <span>
          <strong>이용 기록 보내기</strong>
          {blocked && <small>브라우저의 추적 안 함이 켜져 있어 보내지 않아요</small>}
        </span>
        <input
          type="checkbox"
          checked={on && !blocked}
          disabled={blocked}
          onChange={(event) => {
            setAnalyticsChosen(event.target.checked);
            setOn(event.target.checked);
          }}
        />
      </label>
    </section>
  );
}
