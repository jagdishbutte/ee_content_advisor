import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Briefs" },
  { href: "/selected", label: "Selected" },
  { href: "/sources", label: "Sources" },
] as const;

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-2">
          <span className="mr-2 font-semibold">Elevate Edge</span>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {n.label}
            </Link>
          ))}
          <form action="/api/logout" method="post" className="ml-auto">
            <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Log out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
