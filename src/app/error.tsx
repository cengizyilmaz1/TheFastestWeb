"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="page-shell mx-auto max-w-[720px] py-20"><p className="page-eyebrow mb-4">A short pause</p><h1 className="page-title">This page is taking a moment.</h1><p className="page-description mt-5">We could not load the information for this page. Please try again.</p><button type="button" onClick={reset} className="button-primary mt-8">Try again</button></div>;
}
