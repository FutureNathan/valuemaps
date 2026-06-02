"use client";

import { useEffect, useState } from "react";
import { AXES, MAX_TOPICS, TOPICS, type AxisId } from "@/lib/axes";
import type { Submission } from "@/lib/types";

interface ValueFormProps {
  open: boolean;
  regionId: string | null;
  regionName: string | null;
  existing: Submission | null;
  onClose: () => void;
  onSubmit: (sub: Submission) => Promise<void>;
}

function defaultAxes(): Record<AxisId, number> {
  const a = {} as Record<AxisId, number>;
  for (const ax of AXES) a[ax.id] = 0;
  return a;
}

export default function ValueForm({
  open,
  regionId,
  regionName,
  existing,
  onClose,
  onSubmit,
}: ValueFormProps) {
  const [axes, setAxes] = useState<Record<AxisId, number>>(defaultAxes());
  const [topics, setTopics] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset to the visitor's previous answers (or neutral) each time it opens.
  useEffect(() => {
    if (!open) return;
    setAxes(existing ? { ...defaultAxes(), ...existing.axes } : defaultAxes());
    setTopics(existing ? [...existing.topics] : []);
    setSaving(false);
  }, [open, existing]);

  if (!open) return null;

  function toggleTopic(t: string) {
    setTopics((cur) => {
      if (cur.includes(t)) return cur.filter((x) => x !== t);
      if (cur.length >= MAX_TOPICS) return cur;
      return [...cur, t];
    });
  }

  async function submit() {
    if (!regionId || saving) return;
    setSaving(true);
    try {
      await onSubmit({ regionId, axes, topics });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{existing ? "Update your values" : "Share what you care about"}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="field-block">
          <div className="field-label">Your location</div>
          {regionId ? (
            <div className="loc-pill">📍 {regionName ?? "Selected region"}</div>
          ) : (
            <div className="loc-empty">
              <span>Pick your location first.</span>
              <button className="ghost-btn small" onClick={onClose}>
                Close & tap the globe
              </button>
            </div>
          )}
        </div>

        <div className="axes">
          {AXES.map((a) => (
            <div className="axis-row" key={a.id}>
              <div className="axis-q">{a.question}</div>
              <input
                type="range"
                min={-100}
                max={100}
                step={5}
                value={axes[a.id]}
                onChange={(e) => setAxes((cur) => ({ ...cur, [a.id]: Number(e.target.value) }))}
                style={{
                  background: `linear-gradient(90deg, ${a.leftColor}, #5b6b82 50%, ${a.rightColor})`,
                }}
              />
              <div className="axis-ends">
                <span>{a.left}</span>
                <span>{a.right}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="field-block">
          <div className="field-label">
            Top concerns <span className="muted">({topics.length}/{MAX_TOPICS})</span>
          </div>
          <div className="chips">
            {TOPICS.map((t) => {
              const on = topics.includes(t);
              const disabled = !on && topics.length >= MAX_TOPICS;
              return (
                <button
                  key={t}
                  className={`chip ${on ? "chip-on" : ""}`}
                  disabled={disabled}
                  onClick={() => toggleTopic(t)}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <button className="primary-btn" disabled={!regionId || saving} onClick={submit}>
          {saving ? "Saving…" : existing ? "Update my values" : "Add my voice"}
        </button>
        <p className="fine-print">
          Only anonymous totals are kept for your region — never individual answers.
        </p>
      </div>
    </div>
  );
}
