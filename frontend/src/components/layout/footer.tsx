export function Footer() {
  return (
    <footer className="sticky bottom-0 z-20 border-t border-border/70 bg-background/75 py-4 text-center text-sm text-muted-foreground backdrop-blur-md">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10">
        XYZ Chain live board · {new Date().getFullYear()}
      </div>
    </footer>
  );
}
