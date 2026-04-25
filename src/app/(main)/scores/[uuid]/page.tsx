"use client";

import Badges from "@/components/custom/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CopyIcon } from "lucide-react";
import React from "react";


export default function Home({ params }: Readonly<{ params: Promise<{ uuid: string }> }>) {
  const paramsData = React.use(params);
  const uuid = paramsData.uuid;
  return (
    <div className="w-full h-full flex items-center justify-center">
      <Card>
        <CardHeader>
          <div className="w-full flex flex-col gap-2">
            <div className="w-full flex items-center justify-between">
              <div className="w-full flex items-center justify-start gap-4">
                <h2 className="lg:text-3xl font-bold">Genesis 8.318</h2>
                <Separator orientation="vertical"/>
                <p className="lg:text-lg text-muted-foreground">Tel Aviv</p>
                <Separator orientation="vertical"/>
                <p className="text-muted-foreground">04/21/2026</p>
              </div>
              <Button className="cursor-pointer" variant="ghost" onClick={() => navigator.clipboard.writeText(`https://wasans.tully.sh/scores/${uuid}`)}>
                <CopyIcon />
              </Button>
            </div>

            <Badges badges={["wr", "approved"]} />
          </div>
        </CardHeader>
        <CardContent>
          <video controls src={`https://assets.wasans.tully.sh/scores/${uuid}.mp4`} />
        </CardContent>
      </Card>
    </div>
  );
}
