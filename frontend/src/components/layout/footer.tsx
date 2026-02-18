export function Footer() {
  return (
    <footer className="sticky bottom-0 z-20 border-t border-zinc-900 bg-black/95 py-4 text-center text-sm text-zinc-500 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10">
        XYZ Chain live board · {new Date().getFullYear()}
      </div>
    </footer>
  );
}
