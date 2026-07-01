"use client";

import * as React from "react";
import Link from "next/link";
import { apiV1 } from "@/lib/api";
import { TrialName, trials as trialNames } from "@/lib/trials";
import { PageHeader, PageShell } from "@/components/custom/page-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type SubmissionValue = {
  trial_name: string;
  time: number | string;
  state: string;
  submission_uuid?: string;
  date?: string;
};

type SubmissionsResponse = {
  player?: {
    pbs?: SubmissionValue[];
  } | null;
  error?: string;
};

type AuthResponse = {
  user?: AuthUser | null;
};

type AuthUser = {
  uuid?: string;
  player_uuid?: string;
  role?: string;
};

const trialKey = (trial: string) => trial.toUpperCase();
const zeroTimes = Object.fromEntries(trialNames.map((trial) => [trialKey(trial), "0.000"]));
const CALCULATOR_LOCAL_STORAGE_KEY = "calculator_saved_times";

function getInitialTimes() {
  if (typeof window === "undefined") {
    return zeroTimes;
  }

  try {
    const saved = window.localStorage.getItem(CALCULATOR_LOCAL_STORAGE_KEY);
    if (!saved) {
      return zeroTimes;
    }

    const parsed = JSON.parse(saved) as Record<string, string>;
    return {
      ...zeroTimes,
      ...Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, typeof value === "string" ? value : String(value)])
      ),
    };
  } catch (err) {
    console.error("Failed to restore saved calculator times", err);
    return zeroTimes;
  }
}

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
  const [times, setTimes] = React.useState<Record<string, string>>(getInitialTimes);
  const [pbs, setPbs] = React.useState<Record<string, string>>(zeroTimes);
  const [selectedPlayerUuid, setSelectedPlayerUuid] = React.useState("");
  const [players, setPlayers] = React.useState<Array<{ uuid: string; player_name: string; score: number }>>([]);
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadWorldRecords = async () => {
      try {
        const response = await fetch(apiV1("/records/world"), { cache: "force-cache" });
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
        const response = await fetch(apiV1("/players"), { cache: "no-store" })
        const json = (await response.json()) as {
          results?: Array<{ uuid: string; player_name: string; score: number }>
          error?: string
        }

        if (!response.ok) {
          throw new Error(json.error || "Unable to load players")
        }

        const playerList = json.results || []
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
    const loadAuth = async () => {
      try {
        const response = await fetch(apiV1("/auth/me"), { cache: "no-store" });
        const authJson = (await response.json().catch(() => null)) as AuthResponse | null;
        setAuthUser(authJson?.user ?? null);
      } catch (err) {
        console.error(err);
        setAuthUser(null);
      } finally {
        setAuthChecked(true);
      }
    };

    loadAuth();
  }, []);

  const handleSaveTimes = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(CALCULATOR_LOCAL_STORAGE_KEY, JSON.stringify(times));
    setSaveMessage("Times saved locally.");
  };

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
          `${apiV1(`/players/${encodeURIComponent(playerUuid)}`)}?include=pbs`,
          { cache: "no-store" }
        )
        const json = (await response.json()) as SubmissionsResponse

        if (!response.ok) {
          throw new Error("Unable to load personal bests")
        }

        if (!json.player) {
          throw new Error("Player not found")
        }

        const bestTimes: Record<string, number> = {}

        const pbRows = json.player.pbs || []

        for (const pb of pbRows) {
          const trial = trialKey(pb.trial_name)
          const time = Number(pb.time)
          if (Number.isFinite(time) && time > 0) {
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
        setUserTimesError(err instanceof Error ? err.message : "Unable to load personal bests")
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
        const wrEntry = worldRecords.find((u) => trialKey(u.trial_name) === trial);
        const wr = Number(wrEntry?.time || 0);
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
          wr,
          wrSubmissionUuid: wrEntry?.submission_uuid || "",
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

  const statusMessage = worldRecordError
    ? worldRecordError
    : loadingWorldRecords
      ? "Loading world records."
      : userTimesError
        ? userTimesError
        : loadingUserTimes
          ? "Loading your approved times."
          : "Scores are calculated using a weighted curve: platinum times begin at 0.300, then scale upward toward the live WR table."

  return (
    <PageShell className="lg:max-w-[95vw]">
      <PageHeader title="Score Calculator" />

      <div className="space-y-2">
        {(worldRecordError || loadingWorldRecords || userTimesError || loadingUserTimes) ? (
          <p className="text-xs text-muted-foreground">{statusMessage}</p>
        ) : null}

        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Filter</p>
                <div className="mt-1 w-full max-w-md">
                  <Select value={selectedPlayerUuid} onValueChange={(value) => setSelectedPlayerUuid(value)}>
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue placeholder="Select player" />
                    </SelectTrigger>
                    <SelectContent>
                      {players.map((player) => (
                        <SelectItem key={player.uuid} value={player.uuid}>
                          {player.player_name} ({player.score.toFixed(3)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {authChecked && !authUser ? (
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={handleSaveTimes}>Save times</Button>
                  {saveMessage ? <p className="text-xs text-muted-foreground">{saveMessage}</p> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Final score</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{averageScore.toFixed(3)}</p>
          </div>
        </div>

        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader>
            <TableRow className="bg-muted/70">
              <TableHead className="rounded-tl-xl px-2 py-1.5">Trial</TableHead>
              <TableHead className="px-2 py-1.5">WR</TableHead>
              <TableHead className="px-2 py-1.5">Time</TableHead>
              <TableHead className="rounded-tr-xl px-2 py-1.5 text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.trial} className="bg-background">
                <TableCell className="px-2 py-1">
                  <div className="text-xs font-semibold leading-none">{row.trial}</div>
                </TableCell>
                <TableCell className="px-2 py-1 text-left text-xs font-medium text-sky-600">
                  {row.wrSubmissionUuid ? (
                    <Link
                      href={`/submissions/${encodeURIComponent(row.wrSubmissionUuid)}`}
                      className="underline underline-offset-4 transition hover:text-sky-700"
                    >
                      {row.wr ? row.wr.toFixed(3) : "0.000"}
                    </Link>
                  ) : (
                    <span>{row.wr ? row.wr.toFixed(3) : "0.000"}</span>
                  )}
                </TableCell>
                <TableCell className="px-2 py-1 text-left text-xs font-medium">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={row.your_time_value}
                      onChange={(event) => handleTimeChange(row.trial, event.target.value)}
                      className="h-7 w-20 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => resetTimes(row.trial)}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition ${
                        row.your_time_value !== "0.000"
                          ? "hover:bg-background opacity-100"
                          : "opacity-0 pointer-events-none"
                      }`}
                      aria-label={`Reset ${row.trial} time`}
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TableCell>
                <TableCell className="px-2 py-1 text-right text-xs font-semibold text-emerald-600">
                  {row.score.toFixed(3)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  );
}
