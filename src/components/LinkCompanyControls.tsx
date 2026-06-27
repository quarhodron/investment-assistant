import { useState } from "react";
import type { WatchedCompany } from "@/types";
import { companyLabel } from "@/lib/company";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  analysisId: string;
  currentCompanyId: string | null;
  companies: Pick<WatchedCompany, "id" | "name" | "ticker">[];
}

type Status = "idle" | "submitting" | "error";

const fieldLabel = "text-muted-foreground mb-1.5 flex items-center text-xs font-medium tracking-[0.16em] uppercase";
const fieldControl =
  "border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:ring-ring/40 block w-full border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60";
const primaryBtn =
  "bg-primary text-primary-foreground hover:bg-primary/80 active:bg-primary/70 inline-flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-medium tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const ghostBtn =
  "text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-medium tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-40";

async function patchCompany(analysisId: string, companyId: string | null): Promise<void> {
  const res = await fetch(`/api/analyses/${analysisId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_id: companyId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "link_failed");
  }
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="text-destructive border-destructive/40 flex items-baseline gap-3 border-l-2 bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] px-3 py-2.5 text-sm">
      <span className="text-xs font-medium tracking-[0.14em] uppercase">Error</span>
      <span>{message}</span>
    </div>
  );
}

function LinkDialog({ analysisId, currentCompanyId, companies }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentCompanyId ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const busy = status === "submitting";

  async function handleSave() {
    setStatus("submitting");
    setErrorMsg("");
    try {
      await patchCompany(analysisId, selected || null);
      window.location.reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to link company.");
      setStatus("error");
    }
  }

  async function handleUnlink() {
    setStatus("submitting");
    setErrorMsg("");
    try {
      await patchCompany(analysisId, null);
      window.location.reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to unlink company.");
      setStatus("error");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setSelected(currentCompanyId ?? "");
          setStatus("idle");
          setErrorMsg("");
        }
      }}
    >
      <DialogTrigger className={ghostBtn} type="button">
        Link to watched company
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link to watched company</DialogTitle>
          <DialogDescription>File this analysis under one of your watched companies.</DialogDescription>
        </DialogHeader>

        {companies.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You have no watched companies yet. Add one in your{" "}
            <a href="/watchlist" className="text-foreground underline underline-offset-2">
              Watchlist
            </a>{" "}
            first.
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <label htmlFor="link_company_id" className={fieldLabel}>
                Company
              </label>
              <select
                id="link_company_id"
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                }}
                disabled={busy}
                className={fieldControl}
              >
                <option value="">— No company —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {companyLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            {status === "error" && <ErrorNote message={errorMsg} />}

            <div className="border-border/60 flex items-center justify-between gap-4 border-t pt-5">
              {currentCompanyId ? (
                <button type="button" onClick={handleUnlink} disabled={busy} className={ghostBtn}>
                  Unlink
                </button>
              ) : (
                <span />
              )}
              <button type="button" onClick={handleSave} disabled={busy} className={primaryBtn}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({ analysisId }: { analysisId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [exchange, setExchange] = useState("");
  const [industry, setIndustry] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const busy = status === "submitting";

  function reset() {
    setName("");
    setTicker("");
    setExchange("");
    setIndustry("");
    setNote("");
    setStatus("idle");
    setErrorMsg("");
  }

  async function handleSubmit() {
    setStatus("submitting");
    setErrorMsg("");

    // Step 1: create the company.
    let companyId: string;
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ticker, exchange, industry, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string; message?: string };
      if (!res.ok) {
        if (res.status === 409) {
          setErrorMsg(data.message ?? "You already track this company — use Link to watched company instead.");
        } else {
          setErrorMsg(data.error ?? "Failed to create company.");
        }
        setStatus("error");
        return;
      }
      if (!data.id) {
        setErrorMsg("Company created but its id was not returned.");
        setStatus("error");
        return;
      }
      companyId = data.id;
    } catch {
      setErrorMsg("Failed to create company. Check your connection and try again.");
      setStatus("error");
      return;
    }

    // Step 2: back-link this analysis to the new company.
    try {
      await patchCompany(analysisId, companyId);
      window.location.reload();
    } catch {
      setErrorMsg(
        "Company was created but linking this analysis failed. Use “Link to watched company” to finish linking it.",
      );
      setStatus("error");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger className={primaryBtn} type="button">
        Add to watchlist
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to watchlist</DialogTitle>
          <DialogDescription>Create a new watched company and file this analysis under it.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <label htmlFor="add_name" className={fieldLabel}>
              Name <span className="text-destructive ml-1 tracking-normal normal-case">*</span>
            </label>
            <input
              type="text"
              id="add_name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              disabled={busy}
              maxLength={200}
              placeholder="e.g. Apple Inc."
              className={fieldControl}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="add_ticker" className={fieldLabel}>
                Ticker <span className="text-muted-foreground/60 ml-1 tracking-normal normal-case">(optional)</span>
              </label>
              <input
                type="text"
                id="add_ticker"
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value);
                }}
                disabled={busy}
                maxLength={20}
                placeholder="e.g. AAPL"
                className={fieldControl}
              />
            </div>
            <div>
              <label htmlFor="add_exchange" className={fieldLabel}>
                Exchange <span className="text-muted-foreground/60 ml-1 tracking-normal normal-case">(optional)</span>
              </label>
              <input
                type="text"
                id="add_exchange"
                value={exchange}
                onChange={(e) => {
                  setExchange(e.target.value);
                }}
                disabled={busy}
                maxLength={50}
                placeholder="e.g. NASDAQ"
                className={fieldControl}
              />
            </div>
          </div>

          <div>
            <label htmlFor="add_industry" className={fieldLabel}>
              Industry <span className="text-muted-foreground/60 ml-1 tracking-normal normal-case">(optional)</span>
            </label>
            <input
              type="text"
              id="add_industry"
              value={industry}
              onChange={(e) => {
                setIndustry(e.target.value);
              }}
              disabled={busy}
              maxLength={200}
              placeholder="e.g. Technology"
              className={fieldControl}
            />
          </div>

          <div>
            <label htmlFor="add_note" className={fieldLabel}>
              Note <span className="text-muted-foreground/60 ml-1 tracking-normal normal-case">(optional)</span>
            </label>
            <textarea
              id="add_note"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
              disabled={busy}
              maxLength={2000}
              rows={3}
              placeholder="Any notes about this company"
              className={fieldControl}
            />
          </div>

          {status === "error" && <ErrorNote message={errorMsg} />}

          <div className="border-border/60 flex items-center justify-end gap-4 border-t pt-5">
            <button type="button" onClick={handleSubmit} disabled={busy || !name.trim()} className={primaryBtn}>
              {busy ? "Saving…" : "Create & link"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LinkCompanyControls({ analysisId, currentCompanyId, companies }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <AddDialog analysisId={analysisId} />
      <LinkDialog analysisId={analysisId} currentCompanyId={currentCompanyId} companies={companies} />
    </div>
  );
}
