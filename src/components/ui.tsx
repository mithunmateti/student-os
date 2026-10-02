"use client";
/** Core UI primitives: buttons, cards, chips, inputs, dialogs, tabs, toasts, empty states. */
import Link from "next/link";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { create } from "zustand";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X, type LucideIcon } from "lucide-react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ------------------------------ Button ------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "soft";
type Size = "xs" | "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 active:brightness-95",
  secondary: "bg-surface text-accent-text ring-1 ring-inset ring-border hover:bg-surface-2",
  outline: "ring-1 ring-inset ring-border-strong text-fg hover:bg-surface-2",
  ghost: "text-fg-2 hover:text-fg hover:bg-surface-3",
  soft: "bg-accent-soft text-accent-text hover:brightness-95",
  danger: "bg-[var(--badge)] text-white hover:brightness-110",
};
const sizes: Record<Size, string> = {
  xs: "h-8 px-3 text-xs gap-1 rounded-full",
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-full",
  md: "h-10 px-4 text-sm gap-2 rounded-full",
  lg: "h-12 px-5 text-base gap-2 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, iconRight: IconR, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold whitespace-nowrap transition select-none active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className={size === "xs" ? "size-3.5" : "size-4"} aria-hidden /> : null}
      {children}
      {IconR && <IconR className="size-4" aria-hidden />}
    </button>
  );
});

export function LinkButton({
  href, variant = "secondary", size = "md", icon: Icon, iconRight: IconR, className, children, ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: LucideIcon; iconRight?: LucideIcon }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center justify-center font-semibold whitespace-nowrap transition active:scale-[0.98]", variants[variant], sizes[size], className)}
      {...rest}
    >
      {Icon && <Icon className={size === "xs" ? "size-3.5" : "size-4"} aria-hidden />}
      {children}
      {IconR && <IconR className="size-4" aria-hidden />}
    </Link>
  );
}

/* ------------------------------- Card ------------------------------- */

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cn("card", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, action, className, id }: { title: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; action?: ReactNode; className?: string; id?: string }) {
  return (
    <header className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-fg">
          {Icon && <Icon className="size-[18px] text-accent-text" aria-hidden />}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-[13px] font-normal text-fg-3">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/* ------------------------------- Chips ------------------------------ */

export type Tone = "neutral" | "accent" | "good" | "bad" | "warn" | "muted";
const toneCls: Record<Tone, string> = {
  neutral: "bg-surface-3 text-fg-2 border-transparent",
  accent: "bg-accent-soft text-accent-text border-transparent",
  good: "bg-good-soft text-good border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  muted: "bg-muted-soft text-muted-status border-transparent",
};

export function Badge({ tone = "neutral", icon: Icon, children, className, title }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold leading-4 whitespace-nowrap", toneCls[tone], className)}>
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-border-strong bg-surface-2 px-1 font-mono text-[10.5px] font-medium text-fg-2 shadow-[inset_0_-1px_0_var(--border-strong)]">{children}</kbd>;
}

/* ----------------------------- Progress ----------------------------- */

export function ProgressBar({ value, tone = "accent", className, label, size = "md" }: { value: number; tone?: Tone | "chart"; className?: string; label?: string; size?: "sm" | "md" }) {
  const pctV = Math.max(0, Math.min(1, value)) * 100;
  const bar = { accent: "bg-accent", good: "bg-good", bad: "bg-bad", warn: "bg-warn", muted: "bg-muted-status", neutral: "bg-fg-3", chart: "bg-[var(--chart-1)]" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pctV)} aria-valuemin={0} aria-valuemax={100} className={cn("w-full overflow-hidden rounded-full bg-surface-3", size === "sm" ? "h-1.5" : "h-2", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${pctV}%` }} />
    </div>
  );
}

/* ------------------------------ Inputs ------------------------------ */

export function Field({ label, hint, error, children, htmlFor, className }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="hint !text-bad" role="alert">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn("field", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn("field min-h-20 resize-y", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cn("field appearance-none bg-[length:16px] bg-[right_0.55rem_center] bg-no-repeat pr-8", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-[15px] font-semibold text-fg">{label}</label>
        {description && <p className="mt-0.5 text-xs text-fg-3">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative inline-flex h-[31px] w-[51px] shrink-0 rounded-full transition", checked ? "bg-[#34c759]" : "bg-border-strong", disabled && "opacity-50")}
      >
        <span className={cn("absolute top-0.5 size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.2)] transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "sm", label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; size?: "sm" | "xs"; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-[14px] bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[11px] font-semibold transition",
            size === "sm" ? "h-8 px-3 text-[13px]" : "h-6 px-2 text-xs",
            value === o.value ? "bg-accent text-white" : "text-fg-3 hover:text-fg",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cn("tabular text-[11px]", value === o.value ? "text-white" : "text-fg-3")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Dialog ------------------------------ */

export function Dialog({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const w = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-[28px] bg-surface p-0 text-fg shadow-lg",
        // Phones: a bottom sheet, like the rest of iOS.
        "max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none",
        w,
      )}
    >
      {open && (
        <div className="flex max-h-[88dvh] flex-col animate-sheet sm:max-h-[85vh]">
          <div className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pt-3 pb-3 sm:pt-5">
            <div>
              <h2 className="text-lg font-bold tracking-tight">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-fg-3">{description}</p>}
            </div>
            <button onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-3 hover:text-fg" aria-label="Close dialog">
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 pb-4 scroll-thin">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] max-sm:[&>button]:flex-1">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description: ReactNode; confirmLabel?: string; danger?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </>}>
      <div className="text-sm text-fg-2">{description}</div>
    </Dialog>
  );
}

/* ------------------------------- Tabs ------------------------------- */

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number; icon?: LucideIcon }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("-mx-1 flex gap-1.5 overflow-x-auto overflow-y-hidden px-1 py-0.5 scroll-thin [scrollbar-width:none]", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition",
            value === t.value ? "bg-accent text-white" : "bg-surface text-fg-2 ring-1 ring-inset ring-border hover:text-fg",
          )}
        >
          {t.icon && <t.icon className="size-4" aria-hidden />}
          {t.label}
          {t.count !== undefined && <span className={cn("tabular rounded-full px-1.5 text-[11px]", value === t.value ? "bg-black/25 text-white" : "bg-surface-3 text-fg-3")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Toasts ------------------------------ */

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: "good" | "bad" | "info" | "warn";
  action?: { label: string; onClick: () => void };
}
const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let toastId = 0;

export function toast(message: ReactNode, tone: ToastItem["tone"] = "good", action?: ToastItem["action"], ms = 4200) {
  const id = ++toastId;
  useToasts.setState((s) => ({ items: [...s.items, { id, message, tone, action }].slice(-4) }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), ms);
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  const icons = { good: CircleCheck, bad: CircleAlert, info: Info, warn: TriangleAlert };
  const colors = { good: "text-[#7fd99a]", bad: "text-[#ff8a9a]", info: "text-[#8cbeff]", warn: "text-[#ffb36b]" };
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-[calc(var(--tabbar-h,0px)+12px)] left-1/2 z-[60] flex w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2 lg:right-6 lg:bottom-6 lg:left-auto lg:translate-x-0 no-print">
      {items.map((t) => {
        const I = icons[t.tone];
        return (
          <div key={t.id} className="pointer-events-auto flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--toast-bg)] px-4 py-3 text-[15px] font-semibold text-white shadow-[0_6px_20px_rgb(0_0_0/0.2)] animate-in">
            <I className={cn("size-4 shrink-0", colors[t.tone])} aria-hidden />
            <div className="flex-1">{t.message}</div>
            {t.action && (
              <button className="-my-2 min-h-11 px-1 text-[15px] font-bold text-[#8cbeff]" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------- Empty & states -------------------------- */

export function EmptyState({ icon: Icon, title, children, action, className }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-4 grid size-[72px] place-items-center rounded-[26px] bg-surface-2 text-accent">
        <Icon className="size-8" aria-hidden />
      </div>
      <h3 className="text-xl font-bold tracking-tight text-fg">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-[15px] text-fg-3">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Callout({ tone = "accent", icon: Icon = Info, title, children, action, className }: { tone?: "accent" | "warn" | "bad" | "good"; icon?: LucideIcon; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const c = {
    accent: "bg-accent-soft [&_svg.ic]:text-accent-text",
    warn: "bg-warn-soft [&_svg.ic]:text-warn",
    bad: "bg-bad-soft [&_svg.ic]:text-bad",
    good: "bg-good-soft [&_svg.ic]:text-good",
  }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "note"} className={cn("flex items-start gap-3 rounded-[18px] px-4 py-3.5", c, className)}>
      <Icon className="ic mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm text-fg-2">
        {title && <p className="font-bold text-fg">{title}</p>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function PageHeader({ title, subtitle, eyebrow, actions, children }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 px-1 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
        <h1 className="text-[32px] leading-[38px] font-black tracking-[-0.4px] text-fg sm:text-[38px] sm:leading-[44px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-fg-3">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 on-page">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, hint, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "warn"; hint?: string; className?: string }) {
  return (
    <div className={cn("rounded-[20px] bg-surface px-4 py-3 ring-1 ring-inset ring-border", className)} title={hint}>
      <div className="text-[13px] font-medium text-fg-3">{label}</div>
      <div className={cn("mt-1 text-[26px] leading-8 font-bold tracking-tight tabular", tone === "good" && "text-good", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-fg-3">{sub}</div>}
    </div>
  );
}

/* ---------------------------- Progress ring --------------------------- */

export function ProgressRing({ value, size = 56, stroke = 7, label, children }: { value: number; size?: number; stroke?: number; label: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} className="transition-[stroke-dashoffset] duration-500" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-sm font-bold tabular">{children ?? `${Math.round(v * 100)}%`}</div>
    </div>
  );
}

/* ---------------------------- Subject colours --------------------------- */

/** Maps any subject name onto the five Student OS subject colours. */
export function subjectClass(subject?: string | null): string {
  const s = (subject ?? "").toLowerCase();
  if (/phys/.test(s)) return "subj-physics";
  if (/chem/.test(s)) return "subj-chemistry";
  if (/math|algebra|calcul|geometry|quant/.test(s)) return "subj-maths";
  if (/bio|botany|zoology/.test(s)) return "subj-biology";
  return "subj-other";
}

export function SubjectTag({ subject, className }: { subject: string; className?: string }) {
  return <span className={cn("subj-tag", subjectClass(subject), className)}>{subject}</span>;
}
