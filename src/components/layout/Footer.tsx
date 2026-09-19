import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-border py-6 px-8 text-[0.78rem]">
      <div className="flex items-center justify-between gap-4 max-[600px]:flex-col max-[600px]:items-center max-[600px]:text-center">
        <Link
          href="/"
          className="flex items-center gap-2 no-underline group shrink-0"
        >
          <Image
            src="/logo.png"
            alt=""
            width={24}
            height={24}
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-text-secondary group-hover:text-accent transition-colors">TheFastestWeb</span>
        </Link>

        {/* Links */}
        <div className="text-center text-text-muted">
          <p className="mb-1">TheFastestWeb: Speed Rankings for the Web</p>
          <p>
            <Link href="/about" className="text-text-secondary no-underline hover:text-accent">About</Link>
            {" · "}
            <Link href="/blog" className="text-text-secondary no-underline hover:text-accent">Blog</Link>
            {" · "}
            <Link href="/pricing" className="text-text-secondary no-underline hover:text-accent">Advertise</Link>
            {" · "}
            <a href="mailto:thefastestwebsite@gmail.com" className="text-text-secondary no-underline hover:text-accent">Contact</a>
            {" · "}
            <Link href="/privacy" className="text-text-secondary no-underline hover:text-accent">Privacy</Link>
            {" · "}
            <Link href="/terms" className="text-text-secondary no-underline hover:text-accent">Terms</Link>
          </p>
        </div>

        {/* Spacer to balance the left side */}
        <div className="w-[120px] shrink-0 max-[600px]:hidden" />
      </div>
    </footer>
  );
}
