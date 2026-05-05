"use client";

import * as React from "react";
import Link from "next/link";
import { TrialName, trials as trialNames } from "@/lib/trials";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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
import calculateScore from "@/lib/calc-score";

type Trial = {
  district: string;
};

const trials: Record<string, Trial> = {
  CRYSTAL: { district: "DOWNTOWN" },
  GENESIS: { district: "DOWNTOWN" },
  GLASS: { district: "DOWNTOWN" },
  RISER: { district: "DOWNTOWN" },
  SOLAR: { district: "DOWNTOWN" },
  VESTIBULE: { district: "DOWNTOWN" },

  CELSIUS: { district: "DIRWIK" },
  CIRCULATION: { district: "DIRWIK" },
  FLOW: { district: "DIRWIK" },
  MARTYR: { district: "DIRWIK" },
  "NEON BOLD": { district: "DIRWIK" },
  SAWDUST: { district: "DIRWIK" },

  ASCENSION: { district: "FRAGMENT" },
  FAITH: { district: "FRAGMENT" },
  GALE: { district: "FRAGMENT" },
  GRIP: { district: "FRAGMENT" },
  THREAD: { district: "FRAGMENT" },
  UMBREL: { district: "FRAGMENT" },

  DEPOT: { district: "STACK" },
  FLAME: { district: "STACK" },
  IRONSING: { district: "STACK" },
  MONOXIDE: { district: "STACK" },
  "RUST BELT": { district: "STACK" },
  WISP: { district: "STACK" },
};

const districtStyles: Record<string, string> = {
  DOWNTOWN: "bg-sky-600 text-white",
  DIRWIK: "bg-violet-600 text-white",
  FRAGMENT: "bg-emerald-600 text-white",
  STACK: "bg-fuchsia-600 text-white",
};

const scoreFor = (wr: number, your_time: number, trial: TrialName) => {
  if (your_time < wr) return 0;
  return Number(calculateScore(wr, your_time, trial).toFixed(3));
};

type WorldRecordValue = {
  trial_name: string;
  time: number | string;
  submission_uuid: string;
};

type WorldRecordsResponse = {
  results?: WorldRecordValue[];
  error?: string;
};

type AuthResponse = {
  user: {
    uuid: string;
    player_name: string;
  } | null;
};

type SubmissionValue = {
  trial_name: string;
  time: number | string;
  state: string;
};

type SubmissionsResponse = {
  results?: SubmissionValue[];
  error?: string;
};

const trialKey = (trial: string) => trial.toUpperCase();
const zeroTimes = Object.fromEntries(trialNames.map((trial) => [trialKey(trial), "0.000"]));

function getPlayerUuid() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem("player_uuid") || "";
}

export default function Home() {
  const [worldRecords, setWorldRecords] = React.useState<Array<WorldRecordValue>>([]);
  const [loadingWorldRecords, setLoadingWorldRecords] = React.useState(true);
  const [worldRecordError, setWorldRecordError] = React.useState<string | null>(null);
  const [loadingUserTimes, setLoadingUserTimes] = React.useState(true);
  const [userTimesError, setUserTimesError] = React.useState<string | null>(null);
  const [times, setTimes] = React.useState<Record<string, string>>(zeroTimes);
  const [pbs, setPbs] = React.useState<Record<string, string>>(zeroTimes);
  const [selectedPlayerUuid, setSelectedPlayerUuid] = React.useState("");
  const [players, setPlayers] = React.useState<Array<{ uuid: string; player_name: string; score: number }>>([]);

  React.useEffect(() => {
    const loadWorldRecords = async () => {
      try {
        const response = await fetch("/api/wrs", { cache: "force-cache" });
        const json = (await response.json()) as WorldRecordsResponse;

        if (!response.ok) {
          throw new Error(json.error || "Unable to load world records");
        }

        setWorldRecords(
          json.results || []
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

  React.useEffect(() => {
    const loadPlayers = async () => {
      try {
        const response = await fetch("/api/players", { cache: "force-cache" })
        const json = await response.json()

        if (!response.ok) {
          throw new Error(json.error || "Unable to load players")
        }

        const playerList = (json.results || []) as Array<{ uuid: string; player_name: string; score: number }>
        setPlayers(playerList)

        const params = new URLSearchParams(window.location.search)
        const requestedUuid = params.get("player_uuid") || params.get("player") || ""

        if (requestedUuid) {
          setSelectedPlayerUuid(requestedUuid)
          return
        }

        const storedUuid = getPlayerUuid()
        if (storedUuid) {
          setSelectedPlayerUuid(storedUuid)
        }
      } catch (err) {
        console.error(err)
      }
    }

    loadPlayers()
  }, [])

  React.useEffect(() => {
    const loadUserTimes = async () => {
      setLoadingUserTimes(true)
      setUserTimesError(null)

      try {
        const playerUuid = selectedPlayerUuid || getPlayerUuid()

        if (!playerUuid) {
          return
        }

        const response = await fetch(
          `/api/submissions/player/${encodeURIComponent(playerUuid)}?approvedOnly=true&page=1&limit=50`,
          { cache: "no-store" }
        )
        const json = (await response.json()) as SubmissionsResponse

        if (!response.ok) {
          throw new Error(json.error || "Unable to load approved times")
        }

        const bestTimes: Record<string, number> = {}

        for (const submission of json.results || []) {
          if (submission.state !== "approved") {
            continue
          }

          const trial = trialKey(submission.trial_name)
          const time = Number(submission.time)
          const currentBest = bestTimes[trial]

          if (Number.isFinite(time) && time > 0 && (!currentBest || time < currentBest)) {
            bestTimes[trial] = time
          }
        }

        const formatted = {
          ...zeroTimes,
          ...Object.fromEntries(
            Object.entries(bestTimes).map(([trial, time]) => [trial, time.toFixed(3)])
          ),
        }

        setPbs(formatted)
        setTimes(formatted)
      } catch (err) {
        console.error(err)
        setUserTimesError(err instanceof Error ? err.message : "Unable to load approved times")
      } finally {
        setLoadingUserTimes(false)
      }
    }

    loadUserTimes()
  }, [selectedPlayerUuid])

  const rows = React.useMemo(
    () =>
      trialNames.map((trialName) => {
        const trial = trialKey(trialName);
        const data = trials[trial];
        const wr = Number(worldRecords.find((u) => trialKey(u.trial_name) === trial)?.time || 0);
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
          score: isValidTime ? scoreFor(wr, your_time, trialName) : 0,
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
      [trial]: pbs[trial],
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
                    : userTimesError
                      ? userTimesError
                      : loadingUserTimes
                        ? "Loading your approved times."
                        : <>Score is calculated as <span className="font-semibold">(WR / your time)&sup3;</span>, then averaged.</>}
              </p>
              <div className="mt-3 max-w-xs">
                <NativeSelect
                  value={selectedPlayerUuid}
                  onChange={(event) => setSelectedPlayerUuid(event.target.value)}
                  className="h-10 w-full"
                  aria-label="Select a player to view scores"
                >
                  <NativeSelectOption value="">Your player or select one</NativeSelectOption>
                  {players.map((player) => (
                    <NativeSelectOption key={player.uuid} value={player.uuid}>
                      {player.player_name} ({player.score.toFixed(3)})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
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
                      href={`/submissions/${encodeURIComponent(worldRecords.find(u=>u.trial_name === row.trial)?.submission_uuid || "")}`}
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
                          row.your_time_value !== "0.000"
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
