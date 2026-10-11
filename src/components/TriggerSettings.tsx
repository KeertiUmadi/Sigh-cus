import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { SlidersHorizontal } from "lucide-react";
import { defaultTriggers, TRIGGER_KINDS, TRIGGER_LABELS, type Triggers } from "@/lib/plant-core";

export function TriggerSettings({ value, onChange }: { value: Triggers; onChange: (t: Triggers) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full">
      <div className="flex justify-center">
        <Button variant={open ? "default" : "outline"} size="sm" onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          {open ? "Done Customizing" : "Manage My Disappointment"}
        </Button>
      </div>
      {open && (
        <div className="mt-3 space-y-2 rounded-2xl border bg-background p-3 text-sm">
          {TRIGGER_KINDS.map((k) => {
            const t = value[k];
            return (
              <div key={k} className="flex min-h-9 items-center gap-3">
                <Switch
                  id={`trig-${k}`}
                  checked={t.on}
                  onCheckedChange={(on) => onChange({ ...value, [k]: { ...t, on } })}
                  aria-label={`Watch for ${TRIGGER_LABELS[k]}`}
                />
                <label htmlFor={`trig-${k}`} className="flex-1">{TRIGGER_LABELS[k]}</label>
                {t.on ? (
                  <span className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={86400}
                      className="h-8 w-24"
                      aria-label={`${TRIGGER_LABELS[k]} seconds`}
                      value={Math.round(t.ms / 1000)}
                      onChange={(e) => {
                        const sec = Math.min(86400, Math.max(1, Math.round(Number(e.target.value) || 1)));
                        onChange({ ...value, [k]: { ...t, ms: sec * 1000 } });
                      }}
                    />
                    <span className="text-muted-foreground">sec</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">off</span>
                )}
              </div>
            );
          })}
          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => onChange(defaultTriggers())}>
              Reset to defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
