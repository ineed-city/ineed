import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Aici ajunge utilizatorul după ce apasă un link din email (de exemplu
// resetarea parolei). Supabase trimite un cod de unică folosință (?code=...),
// pe care îl schimbăm pe o sesiune, apoi mergem la pagina din ?next=.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safePath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("exchangeCodeForSession failed:", error.status, error.code);
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}

// Acceptă doar căi din aplicație ("/ceva"), nu adrese externe ("//site.com"),
// ca un link falsificat să nu poată trimite utilizatorul pe alt site.
function safePath(path: string | null) {
  return path?.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")
    ? path
    : "/";
}
