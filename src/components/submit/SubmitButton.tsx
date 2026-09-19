import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";

/** The product's one submit action. It keeps the same name everywhere: "Submit website". */
export function SubmitButton() {
  return (
    <Link href="/submit" className="button-primary">
      Submit website <ArrowUpRightIcon size={16} weight="bold" aria-hidden />
    </Link>
  );
}
