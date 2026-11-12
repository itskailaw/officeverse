import type { Appearance } from "@/lib/data/types";

/** Small SVG portrait generated from an employee's 3D appearance. */
export function Avatar({ appearance: a, size = 36, ring }: { appearance: Appearance; size?: number; ring?: string }) {
  const hijab = a.hairStyle === "hijab";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0 rounded-full" style={{ boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}>
      <circle cx="32" cy="32" r="32" fill="#e2e8f0" />
      <clipPath id="av-clip">
        <circle cx="32" cy="32" r="32" />
      </clipPath>
      <g clipPath="url(#av-clip)">
        <path d="M8 64c2-14 12-20 24-20s22 6 24 20z" fill={a.shirt} />
        {hijab ? (
          <>
            <ellipse cx="32" cy="30" rx="17" ry="19" fill={a.hair} />
            <path d="M14 34c0 14 8 16 18 16s18-2 18-16" fill={a.hair} />
            <ellipse cx="32" cy="31" rx="11" ry="12.5" fill={a.skin} />
          </>
        ) : (
          <>
            {(a.hairStyle === "long" || a.hairStyle === "bob") && <rect x="15" y="22" width="34" height={a.hairStyle === "long" ? 26 : 16} rx="10" fill={a.hair} />}
            <rect x="28" y="38" width="8" height="8" fill={a.skin} />
            <ellipse cx="32" cy="29" rx="13" ry="14.5" fill={a.skin} />
            <path
              d={a.hairStyle === "buzz" ? "M19 26c1-9 7-13 13-13s12 4 13 13c-4-4-9-5-13-5s-9 1-13 5z" : "M18 28c0-11 6-16 14-16s14 5 14 16c-3-6-8-8-14-8s-11 2-14 8z"}
              fill={a.hair}
            />
            {a.hairStyle === "bun" && <circle cx="32" cy="11" r="6" fill={a.hair} />}
            {a.hairStyle === "ponytail" && <ellipse cx="45" cy="20" rx="4" ry="7" fill={a.hair} />}
          </>
        )}
        <circle cx="27" cy="30" r="1.6" fill="#111827" />
        <circle cx="37" cy="30" r="1.6" fill="#111827" />
        <path d="M28 36c2.5 2 5.5 2 8 0" stroke="#7c2d12" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {a.glasses && (
          <g stroke="#111827" strokeWidth="1.3" fill="none">
            <circle cx="27" cy="30" r="4" />
            <circle cx="37" cy="30" r="4" />
            <path d="M31 30h2" />
          </g>
        )}
      </g>
    </svg>
  );
}
