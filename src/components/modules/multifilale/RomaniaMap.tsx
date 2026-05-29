import { useState } from "react";
import { cn } from "@/lib/utils";

export interface Branch {
  id: string;
  city: string;
  x: number;
  y: number;
  students: number;
  teachers: number;
  monthlyRevenue: number;
  satisfaction: number;
}

interface RomaniaMapProps {
  branches: Branch[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export function RomaniaMap({ branches, selectedId, onSelect }: RomaniaMapProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  return (
    <div className="relative rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-md">
      <h3 className="text-sm font-bold mb-3">Filialele tale pe hartă</h3>
      <div className="relative aspect-[4/3] w-full max-w-[600px] mx-auto">
        <svg
          viewBox="0 0 400 300"
          className="w-full h-full"
          role="img"
          aria-label={`Hartă România cu ${branches.length} filiale`}
          data-testid="ro-map"
        >
          <path
            d="M 60 110 Q 90 70 150 60 L 220 50 Q 290 55 330 90 L 360 130 Q 365 175 335 210 L 290 245 Q 230 265 170 255 L 110 240 Q 70 210 55 170 Z"
            fill="hsl(var(--muted))"
            stroke="hsl(var(--border))"
            strokeWidth="1.5"
          />
          <path
            d="M 110 100 Q 140 90 175 105 L 200 130 Q 195 155 165 170 L 130 165 Q 105 140 110 100 Z"
            fill="hsl(var(--muted-foreground) / 0.08)"
            stroke="hsl(var(--border))"
            strokeWidth="0.8"
            strokeDasharray="2 3"
          />

          {branches.map((branch) => {
            const isActive = selectedId === branch.id || hoverId === branch.id;
            return (
              <g key={branch.id}>
                <circle
                  cx={branch.x}
                  cy={branch.y}
                  r={isActive ? 22 : 16}
                  fill="hsl(var(--primary) / 0.15)"
                  className="transition-all"
                />
                <circle
                  cx={branch.x}
                  cy={branch.y}
                  r={isActive ? 8 : 6}
                  fill="hsl(var(--primary))"
                  className="transition-all"
                />
                <text
                  x={branch.x}
                  y={branch.y - 14}
                  textAnchor="middle"
                  className={cn(
                    "transition-all",
                    isActive ? "fill-foreground font-bold" : "fill-foreground/80"
                  )}
                  fontSize={isActive ? "12" : "11"}
                  fontWeight={isActive ? 700 : 500}
                >
                  {branch.city}
                </text>
                <circle
                  cx={branch.x}
                  cy={branch.y}
                  r={20}
                  fill="transparent"
                  className="cursor-pointer focus:outline-none"
                  onMouseEnter={() => setHoverId(branch.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => onSelect?.(branch.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Filiala ${branch.city}: ${branch.students} elevi, ${branch.teachers} profesori`}
                  data-testid={`pin-${branch.id}`}
                />
              </g>
            );
          })}
        </svg>

        {hoverId && (
          <Tooltip branch={branches.find((b) => b.id === hoverId)!} />
        )}
      </div>
    </div>
  );
}

function Tooltip({ branch }: { branch: Branch }) {
  return (
    <div
      role="tooltip"
      className="absolute top-2 right-2 rounded-lg border border-border bg-card shadow-lg p-3 text-xs animate-fade-in pointer-events-none"
    >
      <p className="font-bold text-foreground mb-1">{branch.city}</p>
      <div className="space-y-0.5 text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground tabular-nums">{branch.students}</span> elevi
        </p>
        <p>
          <span className="font-semibold text-foreground tabular-nums">{branch.teachers}</span> profesori
        </p>
        <p>
          <span className="font-semibold text-foreground tabular-nums">
            {new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(branch.monthlyRevenue)}
          </span>{" "}
          venit lună
        </p>
        <p>
          ⭐ <span className="font-semibold text-foreground tabular-nums">{branch.satisfaction.toFixed(1)}/5</span> satisfacție
        </p>
      </div>
    </div>
  );
}
