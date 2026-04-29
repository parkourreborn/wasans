"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  RefreshCcw,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Trial = {
  district: string;
  wr: number;
  your_time: number;
};

const trials: Record<string, Trial> = {
  CRYSTAL: { district: "DOWNTOWN", wr: 6.351, your_time: 7.218 },
  GENESIS: { district: "DOWNTOWN", wr: 7.310, your_time: 8.318 },
  GLASS: { district: "DOWNTOWN", wr: 6.948, your_time: 7.173 },
  RISER: { district: "DOWNTOWN", wr: 6.193, your_time: 7.470 },
  SOLAR: { district: "DOWNTOWN", wr: 8.187, your_time: 12.076 },
  VESTIBULE: { district: "DOWNTOWN", wr: 5.832, your_time: 6.759 },

  CELSIUS: { district: "DIRWIK", wr: 6.320, your_time: 8.130 },
  CIRCULATION: { district: "DIRWIK", wr: 7.339, your_time: 7.754 },
  FLOW: { district: "DIRWIK", wr: 9.106, your_time: 9.552 },
  MARTYR: { district: "DIRWIK", wr: 7.233, your_time: 8.881 },
  "NEON BOLD": { district: "DIRWIK", wr: 10.508, your_time: 14.734 },
  SAWDUST: { district: "DIRWIK", wr: 8.481, your_time: 13.434 },

  ASCENSION: { district: "FRAGMENT", wr: 7.649, your_time: 9.251 },
  FAITH: { district: "FRAGMENT", wr: 8.829, your_time: 12.167 },
  GALE: { district: "FRAGMENT", wr: 5.460, your_time: 5.685 },
  GRIP: { district: "FRAGMENT", wr: 8.157, your_time: 8.712 },
  THREAD: { district: "FRAGMENT", wr: 7.482, your_time: 8.470 },
  UMBREL: { district: "FRAGMENT", wr: 10.619, your_time: 26.112 },

  DEPOT: { district: "STACK", wr: 9.071, your_time: 11.398 },
  FLAME: { district: "STACK", wr: 7.431, your_time: 8.871 },
  IRONSING: { district: "STACK", wr: 8.885, your_time: 10.510 },
  MONOXIDE: { district: "STACK", wr: 7.215, your_time: 7.691 },
  "RUST BELT": { district: "STACK", wr: 10.966, your_time: 13.467 },
  WISP: { district: "STACK", wr: 6.761, your_time: 10.759 },
};

const districtStyles: Record<string, string> = {
  DOWNTOWN: "bg-sky-600 text-white",
  DIRWIK: "bg-violet-600 text-white",
  FRAGMENT: "bg-emerald-600 text-white",
  STACK: "bg-fuchsia-600 text-white",
};

const scoreFor = (wr: number, your_time: number) => {
  if (your_time < wr) return 0;
  return Number(Math.pow(wr / your_time, 3).toFixed(3));
};

export default function Home() {
  const [times, setTimes] = React.useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(trials).map(([trial, data]) => [trial, data.your_time.toFixed(3)])
    ) as Record<string, string>
  );

  const rows = React.useMemo(
    () =>
      Object.entries(trials).map(([trial, data]) => {
        const your_time_value = times[trial] ?? "";
        const your_time = Number(your_time_value);
        const isValidTime = your_time_value.trim() !== "" && !Number.isNaN(your_time) && your_time >= data.wr;

        return {
          trial,
          district: data.district,
          wr: data.wr,
          your_time_value,
          score: isValidTime ? scoreFor(data.wr, your_time) : 0,
        };
      }),
    [times]
  );

  const averageScore = React.useMemo(() => {
    if (!rows.length) return 0;
    return Number(
      (rows.reduce((sum, row) => sum + row.score, 0) / rows.length).toFixed(3)
    );
  }, [rows]);

  const resetTimes = (trial: string) => {
    setTimes((current) => ({
      ...current,
      [trial]: trials[trial].your_time.toFixed(3),
    }));
  };

  const handleTimeChange = (trial: string, value: string) => {
    setTimes((current) => ({ ...current, [trial]: value }));
  };

  return (
    <div className="w-full min-h-screen">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Score Calculator</h2>
              <p className="text-sm text-muted-foreground">
                Score is calculated as <span className="font-semibold">(WR / your time)&sup3;</span>, then averaged.
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-muted px-4 py-3 text-right">
              <div className="w-full h-full text-center">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Average score</p>
                <p className="text-3xl font-semibold">{averageScore.toFixed(3)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 lg:p-8">
        <Card className="mx-auto max-w-7xl">
          <CardContent className="overflow-x-auto px-0">
            <Table className="min-w-full border-separate border-spacing-0">
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="rounded-tl-xl px-3 py-2">District</TableHead>
                  <TableHead className="px-3 py-2">Trial</TableHead>
                  <TableHead className="px-3 py-2">WR</TableHead>
                  <TableHead className="px-3 py-2">Your time</TableHead>
                  <TableHead className="rounded-tr-xl px-3 py-2">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.trial} className="bg-background">
                    <TableCell className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${
                          districtStyles[row.district] ?? "bg-muted text-foreground"
                        }`}
                      >
                        {row.district}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 font-semibold">{row.trial}</TableCell>
                  <TableCell className="px-3 py-2 text-left text-sm font-medium text-sky-600">
                    <Link
                      href={`/wrs/${encodeURIComponent(row.trial.toLowerCase())}`}
                      className="underline underline-offset-4 transition hover:text-sky-700"
                      target="_blank"
                    >
                      {row.wr.toFixed(3)}
                    </Link>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-left text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={row.your_time_value}
                        onChange={(event) => handleTimeChange(row.trial, event.target.value)}
                        className="w-28"
                      />
                      <button
                        type="button"
                        onClick={() => resetTimes(row.trial)}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition ${
                          row.your_time_value !== trials[row.trial].your_time.toFixed(3)
                            ? "hover:bg-background opacity-100"
                            : "opacity-0 pointer-events-none"
                        }`}
                        aria-label={`Reset ${row.trial} time`}
                      >
                        <RefreshCcw className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-left font-semibold text-emerald-600">
                    {row.score.toFixed(3)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
