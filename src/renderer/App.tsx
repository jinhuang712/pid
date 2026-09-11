export function App() {
  return (
    <div className="h-full flex flex-col">
      <header className="drag h-11 shrink-0 pl-[84px] pr-3 flex items-center border-b border-line text-ink-2">
        <span className="font-medium text-ink">PID</span>
      </header>
      <div className="flex-1 flex min-h-0">
        <aside className="w-[272px] shrink-0 border-r border-line bg-paper-2" />
        <main className="flex-1 flex items-center justify-center text-ink-3">Open a folder to start.</main>
      </div>
    </div>
  );
}
