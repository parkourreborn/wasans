"use client";

import * as React from "react";
import Link from "next/link";
import { trials as trialNames } from "@/lib/trials";
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
  your_time: number;
};

const trials: Record<string, Trial> = {
  CRYSTAL: { district: "DOWNTOWN", your_time: 7.218 },
  GENESIS: { district: "DOWNTOWN", your_time: 8.318 },
  GLASS: { district: "DOWNTOWN", your_time: 7.173 },
  RISER: { district: "DOWNTOWN", your_time: 7.470 },
  SOLAR: { district: "DOWNTOWN", your_time: 12.076 },
  VESTIBULE: { district: "DOWNTOWN", your_time: 6.759 },

  CELSIUS: { district: "DIRWIK", your_time: 8.130 },
  CIRCULATION: { district: "DIRWIK", your_time: 7.754 },
  FLOW: { district: "DIRWIK", your_time: 9.552 },
  MARTYR: { district: "DIRWIK", your_time: 8.881 },
  "NEON BOLD": { district: "DIRWIK", your_time: 14.734 },
  SAWDUST: { district: "DIRWIK", your_time: 13.434 },

  ASCENSION: { district: "FRAGMENT", your_time: 9.251 },
  FAITH: { district: "FRAGMENT", your_time: 12.167 },
  GALE: { district: "FRAGMENT", your_time: 5.685 },
  GRIP: { district: "FRAGMENT", your_time: 8.712 },
  THREAD: { district: "FRAGMENT", your_time: 8.470 },
  UMBREL: { district: "FRAGMENT", your_time: 26.112 },

  DEPOT: { district: "STACK", your_time: 11.398 },
  FLAME: { district: "STACK", your_time: 8.871 },
  IRONSING: { district: "STACK", your_time: 10.510 },
  MONOXIDE: { district: "STACK", your_time: 7.691 },
  "RUST BELT": { district: "STACK", your_time: 13.467 },
  WISP: { district: "STACK", your_time: 10.759 },
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

type WorldRecordValue = {
  trial_name: string;
  time: number | string;
};

type WorldRecordsResponse = {
  results?: WorldRecordValue[];
  error?: string;
};

const trialKey = (trial: string) => trial.toUpperCase();

export default function Home() {
  const [worldRecords, setWorldRecords] = React.useState<Record<string, number>>({});
  const [loadingWorldRecords, setLoadingWorldRecords] = React.useState(true);
  const [worldRecordError, setWorldRecordError] = React.useState<string | null>(null);
  const [times, setTimes] = React.useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(trials).map(([trial, data]) => [trial, data.your_time.toFixed(3)])
    ) as Record<string, string>
  );

  React.useEffect(() => {
    const loadWorldRecords = async () => {
      try {
        const response = await fetch("/api/wrs");
        const json = (await response.json()) as WorldRecordsResponse;

        if (!response.ok) {
          throw new Error(json.error || "Unable to load world records");
        }

        setWorldRecords(
          Object.fromEntries(
            (json.results || []).map((record) => [
              trialKey(record.trial_name),
              Number(record.time),
            ])
          )
        );
      } catch (err) {
        console.error(err);
        setWorldRecordError(err instanceof Error ? err.message : "Unable to load world records");
      } finally {
        setLoadingWorldRecords(false);
      }
    };

    loadWorldRecords();
  }, []);

  const rows = React.useMemo(
    () =>
      trialNames.map((trialName) => {
        const trial = trialKey(trialName);
        const data = trials[trial];
        const wr = worldRecords[trial];
        const your_time_value = times[trial] ?? "";
        const your_time = Number(your_time_value);
        const isValidTime =
          typeof wr === "number" &&
          Number.isFinite(wr) &&
          wr > 0 &&
          your_time_value.trim() !== "" &&
          !Number.isNaN(your_time) &&
          your_time >= wr;

        return {
          trial,
          district: data.district,
          wr,
          your_time_value,
          score: isValidTime ? scoreFor(wr, your_time) : 0,
        };
      }),
    [times, worldRecords]
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
                {worldRecordError
                  ? worldRecordError
                  : loadingWorldRecords
                    ? "Loading world records."
                    : <>Score is calculated as <span className="font-semibold">(WR / your time)&sup3;</span>, then averaged.</>}
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
                      {row.wr ? row.wr.toFixed(3) : "0.000"}
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
