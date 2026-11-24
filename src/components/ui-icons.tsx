import type { ReactNode } from "react";

export const iconPaths = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  spark:
    "m12 3 1.2 4.1L17 8.3l-3.8 1.2L12 14l-1.2-4.5L7 8.3l3.8-1.2L12 3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z",
  arrow: "m9 18 6-6-6-6",
  check: "m5 12 4 4L19 6",
  chart: "M4 19V9m5 10V5m5 14v-7m5 7V3",
  search: "m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  file: "M6 2h8l4 4v16H6zM14 2v6h6M9 13h6M9 17h6",
  globe:
    "M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0Z",
  upload: "m12 16V4m-5 5 5-5 5 5M4 17v4h16v-4",
  edit: "M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4",
  library: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
  alert: "M12 3 2 21h20L12 3Zm0 6v5m0 3v.1",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-2a4 4 0 0 1 0 7",
  plus: "M12 5v14M5 12h14",
  download: "M12 3v12m-5-5 5 5 5-5M5 21h14",
  copy: "M8 8h12v12H8zM4 16V4h12",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M18 6 6 18",
} as const;

export type IconName = keyof typeof iconPaths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`logo ${inverse ? "text-white" : ""}`}>
      <span className="logo-mark">
        <Icon name="chart" size={19} />
      </span>
      <span>
        SEO <b>Platform</b>
      </span>
    </span>
  );
}

export function Badge({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "red" | "blue" | "gray";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function WsTitle({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="ws-title">
      <div>
        <p className="overline">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      {action}
    </div>
  );
}
