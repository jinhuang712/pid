export type Page = "sessions" | "skills" | "mcp" | "extensions" | "settings";

const ITEMS: { id: Page; label: string; glyph: string }[] = [
  { id: "sessions", label: "Sessions", glyph: "◧" },
  { id: "skills", label: "Skills", glyph: "/" },
  { id: "mcp", label: "MCP", glyph: "⌁" },
  { id: "extensions", label: "Extensions", glyph: "⚙" },
  { id: "settings", label: "Settings", glyph: "≡" },
];

/** First-level navigation. Skills, MCP, and Extensions are pages, not settings. */
export function NavRail({ page, onSelect }: { page: Page; onSelect: (p: Page) => void }) {
  return (
    <nav className="w-10 shrink-0 border-r border-line bg-paper-2 flex flex-col items-center py-2 gap-1">
      {ITEMS.map((it, i) => (
        <button
          type="button"
          key={it.id}
          title={it.label}
          aria-label={it.label}
          onClick={() => onSelect(it.id)}
          className={`w-7 h-7 rounded-md flex items-center justify-center text-sm ${
            page === it.id ? "bg-paper-4 text-ink" : "text-ink-3 hover:bg-paper-3 hover:text-ink"
          } ${i === ITEMS.length - 1 ? "mt-auto" : ""}`}
        >
          {it.glyph}
        </button>
      ))}
    </nav>
  );
}
