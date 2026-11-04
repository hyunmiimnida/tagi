import type { ReactNode } from "react";

// 이용약관·개인정보처리방침에 함께 쓰는 부품 (스타일은 globals.css의 .doc·.doc-table)

// 맨 위 목차: 같은 페이지 안의 제목으로 바로 간다
export function DocToc({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="목차">
      <h2>목차</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>{item.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// 표: 좁은 화면에서는 표만 옆으로 밀어 볼 수 있게 감싼다
export function DocTable({ head, rows }: { head?: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      {/* 열이 많은 표는 칸이 너무 좁아지지 않게 최소 너비를 두고 옆으로 밀어 본다 */}
      <table className="doc-table" style={head && head.length > 3 ? { minWidth: 720 } : undefined}>
        {head && (
          <thead>
            <tr>
              {head.map((cell, i) => (
                <th key={i} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) =>
                j === 0 && !head ? (
                  <th key={j} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={j}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
