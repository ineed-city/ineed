import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rulează înainte de fiecare pagină și reîmprospătează sesiunea Supabase,
// ca utilizatorul să nu fie delogat când expiră tokenul de acces.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Cookie-urile noi merg și în cererea curentă (pentru pagini)
          // și în răspuns (pentru browser).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Antete anti-cache: sesiunea unui utilizator nu ajunge la altul.
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Nu pune cod între createServerClient și getClaims():
  // getClaims() verifică tokenul și declanșează reîmprospătarea.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Toate rutele, în afară de fișierele statice și imagini.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
