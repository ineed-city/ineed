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
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);

  const { pathname } = request.nextUrl;
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/inregistrare");
  // Confidențialitatea și termenii trebuie citiți înainte de a crea un cont.
  const isLegalPage = pathname === "/privacy" || pathname === "/terms";
  const isPublic = isAuthPage || isLegalPage || pathname.startsWith("/auth/callback");

  // Cine nu e logat ajunge la /login; cine e logat nu mai vede login/înregistrare.
  if (!isLoggedIn && !isPublic) {
    return redirectWithCookies(request, response, "/login");
  }
  if (isLoggedIn && isAuthPage) {
    return redirectWithCookies(request, response, "/");
  }

  return response;
}

// Redirecționează păstrând cookie-urile de sesiune puse mai sus de Supabase.
function redirectWithCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    // Toate rutele, în afară de fișierele statice, imagini și manifestul PWA.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
