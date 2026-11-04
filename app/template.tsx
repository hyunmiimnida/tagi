// 화면을 옮길 때마다 새 화면이 살짝 떠오르며 나타난다 (.page-enter, app/globals.css. 동작 줄이기면 멈춤).
// template은 layout과 달리 화면을 옮길 때마다 새로 그려진다
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
