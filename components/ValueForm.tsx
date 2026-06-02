"use client";

import { useEffect, useMemo, useState } from "react";
import { TENSION_PAIRS, WANTS } from "@/lib/values";
import type { Submission } from "@/lib/types";

interface ValueFormProps {
  open: boolean;
  worldId: string;
  regionId: string | null;
  regionName: string | null;
  existing: Submission | null;
  onClose: () => void;
  onSubmit: (sub: Submission) => Promise<void>;
}

export default function ValueForm({
  open,
  worldId,
  regionId,
  regionName,
  existing,
  onClose,
  onSubmit,
}: ValueFormProps) {
  const [wants, setWants] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWants(new Set(existing?.wants ?? []));
    setSaving(false);
  }, [open, existing]);

  // "You can want both" — surface a held tension pair as encouragement.
  const bothHeld = useMemo(() => {
    for (const p of TENSION_PAIRS) if (wants.has(p.a) && wants.has(p.b)) return p;
    return null;
  }, [wants]);

  if (!open) return null;

  function toggle(id: string) {
    setWants((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!regionId || saving) return;
    setSaving(true);
    try {
      await onSubmit({ worldId, regionId, wants: [...wants] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{existing ? "Update what you want" : "What do you want?"}</h2>
            <p className="modal-sub">
              Pick everything you believe in — even hopes people say you can&apos;t have together.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="field-block">
          <div className="field-label">For</div>
          {regionId ? (
            <div className="loc-pill">{regionName ?? "Selected place"}</div>
          ) : (
            <div className="loc-empty">
              <span>Pick a place first.</span>
              <button className="ghost-btn small" onClick={onClose}>
                Close &amp; tap the globe
              </button>
            </div>
          )}
        </div>

        <div className="want-grid">
          {WANTS.map((w) => {
            const on = wants.has(w.id);
            return (
              <button
                key={w.id}
                className={`want-card ${on ? "on" : ""}`}
                style={on ? { borderColor: w.color, boxShadow: `inset 0 0 0 1px ${w.color}` } : undefined}
                onClick={() => toggle(w.id)}
              >
                <span className="want-dot" style={{ background: w.color }} />
                {w.label}
              </button>
            );
          })}
        </div>

        {bothHeld && (
          <div className="both-note">
            You want <strong>{bothHeld.label}</strong>. Most “either/or” debates are false choices —
            this map is here to prove it.
          </div>
        )}

        <button className="primary-btn" disabled={!regionId || saving} onClick={submit}>
          {saving ? "Saving…" : existing ? "Update what I want" : "Add what I want"}
        </button>
        <p className="fine-print">Only anonymous totals are kept for each place — never individual answers.</p>
      </div>
    </div>
  );
}
