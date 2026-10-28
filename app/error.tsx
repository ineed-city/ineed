"use client";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <main className="m-auto max-w-md p-8 text-center">
    <h1 className="text-2xl">We couldn’t load this page.</h1>
    <p className="my-4">Nu am putut încărca pagina. Încearcă din nou.</p>
    <button onClick={retry} className="rounded-xl bg-brand px-5 py-3 text-white">Try again / Reîncearcă</button>
  </main>;
}
