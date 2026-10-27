import Link from "next/link";

// Logo-ul iNeed: „i” italic pe pătrat verde, urmat de nume.
export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[23px] font-bold tracking-[-1px]">
      <span
        aria-hidden="true"
        className="flex h-8 w-[30px] items-center justify-center rounded-[10px] bg-ink font-serif text-[27px] italic text-mint"
      >
        i
      </span>
      iNeed
    </Link>
  );
}

// Semnul din centru: punct, bară, punct.
export function ConciergeMark() {
  return (
    <div
      aria-hidden="true"
      className="flex h-[50px] w-[50px] items-center justify-center gap-[5px] rounded-2xl bg-tile"
    >
      <span className="h-[5px] w-[5px] rounded-full bg-brand" />
      <span className="h-4 w-[5px] rounded-full bg-brand" />
      <span className="h-[5px] w-[5px] rounded-full bg-brand" />
    </div>
  );
}
