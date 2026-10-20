import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Mail,
  Phone,
  X,
} from "lucide-react";
import { phoneAuthEnabled, supabase } from "../lib/supabase";

type Props = { onClose: () => void; onSuccess: () => void };
type Mode = "signin" | "signup" | "reset" | "phone";

function authError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = (error as { code?: string } | null)?.code;
  if (
    code === "email_address_not_authorized" ||
    /email.*not authorized|only.*send.*email.*team/i.test(message)
  )
    return "El servicio de correo todavía no está listo para enviar mensajes a esta dirección. No hemos podido enviarte el enlace; vuelve a intentarlo más tarde.";
  if (/invalid login credentials/i.test(message))
    return "El correo o la contraseña no son correctos.";
  if (/email not confirmed/i.test(message))
    return "Confirma tu correo con el enlace que te enviamos antes de entrar.";
  if (/already registered|already been registered/i.test(message))
    return "Este correo ya tiene una cuenta. Prueba a iniciar sesión.";
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message))
    return "Has hecho varios intentos. Espera unos minutos y vuelve a probar.";
  if (/token.*expired|invalid.*token|otp.*expired/i.test(message))
    return "El código no es válido o ha caducado. Solicita uno nuevo.";
  if (/weak password|password should/i.test(message))
    return "Elige una contraseña más segura, de al menos 10 caracteres.";
  if (/failed to fetch|network|load failed/i.test(message))
    return "No hemos podido conectar. Comprueba tu conexión y vuelve a intentarlo.";
  return "No hemos podido completar la operación. Comprueba los datos y vuelve a intentarlo.";
}

export function AuthDialog({ onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentPhone, setSentPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]',
        ),
      ).filter((item) => item.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.querySelector<HTMLElement>("h2")?.focus();
        return;
      }
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const target =
      dialog?.querySelector<HTMLElement>("input:not(:disabled)") ??
      dialog?.querySelector<HTMLElement>("h2");
    target?.focus();
  }, [mode, sentPhone]);

  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setSuccess("");
    setSentPhone("");
    setCode("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setSuccess("");
    if (!supabase) {
      setError("El acceso todavía no está disponible. Vuelve en unos minutos.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: window.location.origin },
        );
        if (error) throw error;
        setSuccess(
          "Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña. Revisa también la carpeta de spam.",
        );
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data.session) onSuccess();
        else
          setSuccess(
            "Revisa tu correo y confirma tu cuenta con el enlace que te hemos enviado. Después podrás entrar y organizar tu primer partido.",
          );
      } else if (mode === "phone") {
        if (sentPhone) {
          const { error } = await supabase.auth.verifyOtp({
            phone: sentPhone,
            token: code.trim(),
            type: "sms",
          });
          if (error) throw error;
          onSuccess();
        } else {
          const normalizedPhone = phone.replace(/[\s()-]/g, "");
          if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone))
            throw new Error("invalid phone");
          const { error } = await supabase.auth.signInWithOtp({
            phone: normalizedPhone,
            options: { data: { display_name: displayName.trim() } },
          });
          if (error) throw error;
          setSentPhone(normalizedPhone);
          setSuccess(
            "Te hemos enviado un código por SMS. Introdúcelo para confirmar tu teléfono.",
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        onSuccess();
      }
    } catch (error) {
      setError(
        error instanceof Error && error.message === "invalid phone"
          ? "Incluye el prefijo de país, por ejemplo +34, seguido de tu número."
          : authError(error),
      );
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === "signup"
      ? "El próximo partido empieza aquí."
      : mode === "reset"
        ? "Recupera tu acceso."
        : mode === "phone"
          ? "Tu teléfono, tu acceso."
          : "Vuelve al terreno de juego.";

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        <div className="dialog-heading">
          <span className="eyebrow">TU CUENTA KICKOFF</span>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Cerrar acceso"
          >
            <X size={22} />
          </button>
        </div>
        <h2 id={titleId} tabIndex={-1}>
          {heading}
        </h2>
        <p className="muted">
          {mode === "reset"
            ? "Te enviaremos un enlace para elegir una nueva contraseña."
            : "Reserva tu pista, reúne a tu equipo y sal a jugar."}
        </p>

        {mode !== "reset" && (
          <div className="segmented" aria-label="Tipo de acceso">
            <button
              type="button"
              aria-pressed={mode === "signin"}
              onClick={() => changeMode("signin")}
              disabled={busy}
            >
              Entrar
            </button>
            <button
              type="button"
              aria-pressed={mode === "signup"}
              onClick={() => changeMode("signup")}
              disabled={busy}
            >
              Crear cuenta
            </button>
            {phoneAuthEnabled && (
              <button
                type="button"
                aria-pressed={mode === "phone"}
                onClick={() => changeMode("phone")}
                disabled={busy}
              >
                <Phone size={15} /> Teléfono
              </button>
            )}
          </div>
        )}

        <form className="form-stack" onSubmit={submit}>
          {(mode === "signup" || (mode === "phone" && !sentPhone)) && (
            <label className="field">
              Cómo te llamas
              <input
                name="displayName"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Tu nombre"
                minLength={2}
                maxLength={60}
                required
                disabled={busy}
              />
            </label>
          )}
          {mode === "phone" ? (
            <>
              {!sentPhone ? (
                <label className="field">
                  Número de teléfono
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+34 600 000 000"
                    required
                    disabled={busy}
                  />
                  <small className="muted">
                    Incluye el prefijo de país. Recibirás un SMS para confirmar
                    que es tuyo.
                  </small>
                </label>
              ) : (
                <label className="field">
                  Código enviado a {sentPhone}
                  <input
                    name="otp"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="000000"
                    required
                    disabled={busy}
                  />
                </label>
              )}
            </>
          ) : (
            <label className="field">
              Correo electrónico
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
                required
                disabled={busy}
              />
            </label>
          )}
          {(mode === "signin" || mode === "signup") && (
            <label className="field">
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={mode === "signup" ? 10 : 1}
                maxLength={128}
                placeholder={
                  mode === "signup" ? "Al menos 10 caracteres" : "Tu contraseña"
                }
                required
                disabled={busy}
              />
            </label>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="notice success" role="status">
              {success}
            </p>
          )}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : mode === "phone" ? (
              <Phone size={18} />
            ) : (
              <Mail size={18} />
            )}
            {busy
              ? "Un momento…"
              : mode === "reset"
                ? "Enviar enlace"
                : mode === "signup"
                  ? "Crear mi cuenta"
                  : mode === "phone"
                    ? sentPhone
                      ? "Confirmar y entrar"
                      : "Recibir código por SMS"
                    : "Entrar a jugar"}
            {!busy && <ArrowRight size={18} />}
          </button>
        </form>
        {mode === "signin" && (
          <button
            type="button"
            className="text-button"
            onClick={() => changeMode("reset")}
            disabled={busy}
          >
            He olvidado mi contraseña
          </button>
        )}
        {mode === "reset" && (
          <button
            type="button"
            className="text-button"
            onClick={() => changeMode("signin")}
            disabled={busy}
          >
            <ArrowLeft size={15} /> Volver a entrar
          </button>
        )}
        {mode === "phone" && sentPhone && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSentPhone("");
              setCode("");
              setSuccess("");
              setError("");
            }}
            disabled={busy}
          >
            Cambiar número o pedir otro código
          </button>
        )}
        {mode === "signup" && (
          <p className="muted">
            Usaremos tu nombre para identificarte en tus partidos y tu correo
            para gestionar tu acceso.
          </p>
        )}
      </div>
    </div>
  );
}
