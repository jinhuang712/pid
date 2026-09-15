/**
 * One parsed diff, two tools that show one: the edit card and the edit tool renderer.
 * Kept apart from ToolCard so registering the edit renderer did not mean copying this.
 */

/** "+3 −1" over a unified patch; undefined when there is no patch yet. */
export function diffStats(patch?: string): string | undefined {
  if (!patch) return undefined;
  let add = 0;
  let del = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) add++;
    else if (line.startsWith("-") && !line.startsWith("---")) del++;
  }
  return `+${add} −${del}`;
}

/** A unified patch with added and removed lines tinted, the way a review tool shows it. */
export function DiffBlock({ diff }: { diff: string }) {
  return (
    <pre className="font-mono whitespace-pre max-h-96 overflow-auto text-xs leading-relaxed">
      {diff.split("\n").map((line, i) => {
        const kind = line[0] === "+" ? "bg-add text-ink" : line[0] === "-" ? "bg-del text-ink" : "text-ink-3";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static diff lines
          <div key={i} className={`px-1 -mx-1 rounded-sm ${kind}`}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}
