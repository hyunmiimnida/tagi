const MAX_LENGTH = 500;

interface Props {
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  sending: boolean;
  label: string;
  placeholder: string;
  nickname?: string | null;
  onCancel?: () => void;
}

export function CommentForm({ draft, onDraft, onSubmit, sending, label, placeholder, nickname, onCancel }: Props) {
  return (
    <form className="comment-form" onSubmit={onSubmit}>
      <textarea value={draft} maxLength={MAX_LENGTH} rows={3} placeholder={placeholder} autoFocus={Boolean(onCancel)}
        aria-label={`${label} 내용`} onChange={(event) => onDraft(event.target.value)} />
      <div className="comment-form-foot">
        <span>{draft.length}/{MAX_LENGTH} · {nickname ? `"${nickname}"(으)로` : "익명으로"} 올라가요</span>
        {onCancel && <button type="button" className="text-button" disabled={sending} onClick={onCancel}>취소</button>}
        <button className="button primary small" disabled={!draft.trim() || sending}>
          {sending ? "올리는 중" : `${label} 올리기`}
        </button>
      </div>
    </form>
  );
}
