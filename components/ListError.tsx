"use client";

// 목록 데이터(public/api/list.json)를 받지 못했을 때 (인터넷이 끊겼고 저장해 둔 것도 없을 때)
export function ListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="empty card-empty" role="alert">
      <p className="empty-title">공고를 불러오지 못했어요</p>
      <p>인터넷 연결을 확인하고 다시 시도해 주세요.</p>
      <button className="button primary" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}
