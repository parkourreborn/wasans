"use client"

import { useParams } from "next/navigation"

export default function Home() {
  const params = useParams<{ trial: string }>()
  const trial = decodeURIComponent(params.trial)

  return (
    <div className="w-full h-full flex items-center justify-center">
      <p className="w-full text-center text-l lg:text-2xl lg:p-32">
  hi i wasans i&apos;m trying to explain my wrs for {trial}
      </p>
    </div>
  );
}
