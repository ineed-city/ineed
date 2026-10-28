import Link from "next/link";

export function Brand() {
  return <Link href="/" className="brand-link"><span aria-hidden="true" className="brand-symbol">i</span>iNeed</Link>;
}

export function ConciergeMark() {
  return <div aria-hidden="true" className="concierge-mark"><span /><span /><span /></div>;
}
