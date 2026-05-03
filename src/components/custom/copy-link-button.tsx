"use client"

import { Button } from "@/components/ui/button"
import { CopyIcon } from "lucide-react"

type CopyLinkButtonProps = {
  uuid: string
}

export function CopyLinkButton({ uuid }: CopyLinkButtonProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`https://wasans.tully.sh/scores/${uuid}`)
    } catch {
      void 0
    }
  }

  return (
    <Button className="cursor-pointer" variant="ghost" onClick={handleCopy}>
      <CopyIcon />
    </Button>
  )
}
