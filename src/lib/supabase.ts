import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "../config.public";

const url = import.meta.env.VITE_SUPABASE_URL || publicConfig.supabaseUrl;
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  publicConfig.supabasePublishableKey;
export const supabase = url && key ? createClient(url, key) : null;
export const phoneAuthEnabled =
  import.meta.env.VITE_PHONE_AUTH_ENABLED === "true";

export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase)
    throw new Error("Estamos preparando las reservas. Vuelve en unos minutos.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const money = (cents: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const dateLabel = (date: string, timeZone?: string) =>
  new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(date));
export const timeLabel = (date: string, timeZone?: string) =>
  new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(date));
