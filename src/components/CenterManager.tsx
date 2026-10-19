import { useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  CalendarPlus,
  CirclePlus,
  LoaderCircle,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import { money, supabase } from "../lib/supabase";
import type { Catalog, Field } from "../types";

type Props = { userId: string; catalog: Catalog; onChange: () => void };
type Notice = { kind: "error" | "success"; text: string } | null;

// Resolve the entered wall time in the center's IANA zone, never the browser's zone.
// Reject DST gaps and repeated hours instead of silently moving a reservation.
export function localTimeToIso(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Introduce una fecha y una hora válidas.");
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(wallTime);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  )
    throw new Error("Introduce una fecha y una hora válidas.");
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const partsAt = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (name: string) =>
      Number(parts.find((item) => item.type === name)?.value);
    return Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
    );
  };
  const offsets = new Set<number>();
  for (let offsetHours = -48; offsetHours <= 48; offsetHours += 6) {
    const instant = wallTime + offsetHours * 3_600_000;
    offsets.add(partsAt(instant) - instant);
  }
  const candidates = [...offsets]
    .map((offset) => wallTime - offset)
    .filter((instant) => partsAt(instant) === wallTime);
  if (!candidates.length)
    throw new Error(
      "Esa hora no existe por el cambio de horario. Elige otra hora.",
    );
  if (candidates.length > 1)
    throw new Error(
      "Esa hora se repite por el cambio de horario. Elige una hora fuera del cambio para evitar confusiones.",
    );
  return new Date(candidates[0]).toISOString();
}

function changeError(error: unknown) {
  const value = error as { code?: string; message?: string };
  if (value.code === "23503")
    return "No se puede eliminar: este elemento tiene reservas o datos asociados.";
  if (value.code === "23505" || value.code === "23P01")
    return "Ese horario ya existe o coincide con otro. Revisa la disponibilidad del campo.";
  if (value.code === "42501")
    return "Tu sesión no tiene permiso para hacer este cambio. Vuelve a iniciar sesión.";
  if (
    value.message &&
    /^(Este |Esta |Estos |Estas |El |La |Los |Las |Selecciona |Escribe |No se |No puedes |No tienes |Debes |Necesitas |Tu )/.test(
      value.message,
    )
  )
    return value.message;
  if (value.message?.includes("slots_duration"))
    return "Cada horario debe terminar después de su inicio y durar como máximo 8 horas.";
  if (value.message?.includes("fields_amenities_count"))
    return "Añade un máximo de 12 servicios por campo.";
  if (error instanceof Error && !value.code) return error.message;
  return "No hemos podido guardar el cambio. Revisa los datos y vuelve a intentarlo.";
}

function priceInCents(value: string) {
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000)
    throw new Error("El precio debe estar entre 0 y 10.000 €.");
  return Math.round(amount * 100);
}

export function CenterManager({ userId, catalog, onChange }: Props) {
  const ownedCenters = catalog.centers.filter(
    (center) => center.owner_id === userId,
  );
  const [centerId, setCenterId] = useState("");
  const [fieldId, setFieldId] = useState("");
  const [showCenterForm, setShowCenterForm] = useState(false);
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [centerName, setCenterName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("Europe/Madrid");
  const [fieldName, setFieldName] = useState("");
  const [format, setFormat] = useState<Field["format"]>("7");
  const [surface, setSurface] = useState("Césped artificial");
  const [fieldPrice, setFieldPrice] = useState("");
  const [amenities, setAmenities] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [slotPrice, setSlotPrice] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const center =
    ownedCenters.find((item) => item.id === centerId) ?? ownedCenters[0];
  const fields = catalog.fields.filter(
    (field) => field.center_id === center?.id,
  );
  const field = fields.find((item) => item.id === fieldId) ?? fields[0];
  const slots = catalog.slots
    .filter((slot) => slot.field_id === field?.id)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  useEffect(() => {
    setSlotPrice(field ? (field.price_cents / 100).toFixed(2) : "");
    setStartsAt("");
    setEndsAt("");
  }, [field?.id, field?.price_cents]);

  async function createCenter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy("center");
    setNotice(null);
    try {
      if (centerName.trim().length < 2 || centerName.trim().length > 100)
        throw new Error(
          "Escribe un nombre de centro de entre 2 y 100 caracteres.",
        );
      if (city.trim().length < 2 || city.trim().length > 100)
        throw new Error("Escribe una ciudad de entre 2 y 100 caracteres.");
      if (address.trim().length < 5 || address.trim().length > 240)
        throw new Error("Escribe una dirección de entre 5 y 240 caracteres.");
      try {
        new Intl.DateTimeFormat("es-ES", { timeZone: timezone.trim() }).format(
          new Date(),
        );
      } catch {
        throw new Error(
          "La zona horaria no es válida. Usa un identificador como Europe/Madrid.",
        );
      }
      const { error } = await supabase
        .from("centers")
        .insert({
          owner_id: userId,
          name: centerName.trim(),
          city: city.trim(),
          address: address.trim(),
          timezone: timezone.trim(),
        });
      if (error) throw error;
      setCenterName("");
      setCity("");
      setAddress("");
      setShowCenterForm(false);
      setNotice({
        kind: "success",
        text: "Centro registrado. Ya puedes añadir sus campos y horarios.",
      });
      onChange();
    } catch (error) {
      setNotice({ kind: "error", text: changeError(error) });
    } finally {
      setBusy("");
    }
  }

  async function createField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy || !center) return;
    setBusy("field");
    setNotice(null);
    try {
      if (fieldName.trim().length < 2 || fieldName.trim().length > 100)
        throw new Error(
          "Escribe un nombre de campo de entre 2 y 100 caracteres.",
        );
      const services = amenities
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (services.length > 12)
        throw new Error("Añade un máximo de 12 servicios por campo.");
      const { error } = await supabase
        .from("fields")
        .insert({
          center_id: center.id,
          name: fieldName.trim(),
          format,
          surface: surface.trim(),
          max_players: Number(format) * 2,
          price_cents: priceInCents(fieldPrice),
          amenities: services,
        });
      if (error) throw error;
      setFieldName("");
      setFieldPrice("");
      setAmenities("");
      setShowFieldForm(false);
      setNotice({
        kind: "success",
        text: "Campo añadido. Publica un horario para que se pueda reservar.",
      });
      onChange();
    } catch (error) {
      setNotice({ kind: "error", text: changeError(error) });
    } finally {
      setBusy("");
    }
  }

  async function createSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy || !center || !field) return;
    setBusy("slot");
    setNotice(null);
    try {
      const start = localTimeToIso(startsAt, center.timezone);
      const end = localTimeToIso(endsAt, center.timezone);
      if (new Date(start).getTime() <= Date.now())
        throw new Error("El horario debe empezar en el futuro.");
      if (new Date(end).getTime() <= new Date(start).getTime())
        throw new Error("La hora de fin debe ser posterior al inicio.");
      if (new Date(end).getTime() - new Date(start).getTime() > 8 * 3_600_000)
        throw new Error("Cada horario puede durar como máximo 8 horas.");
      const { error } = await supabase
        .from("slots")
        .insert({
          field_id: field.id,
          starts_at: start,
          ends_at: end,
          price_cents: priceInCents(slotPrice),
        });
      if (error) throw error;
      setStartsAt("");
      setEndsAt("");
      setNotice({
        kind: "success",
        text: "Horario publicado. Los jugadores ya pueden reservarlo.",
      });
      onChange();
    } catch (error) {
      setNotice({ kind: "error", text: changeError(error) });
    } finally {
      setBusy("");
    }
  }

  async function remove(kind: "slots" | "fields", id: string, name: string) {
    if (!supabase || busy) return;
    if (
      !window.confirm(
        kind === "fields"
          ? `¿Eliminar «${name}»? Solo es posible si no tiene reservas. Tendrás que volver a crear sus horarios.`
          : "¿Retirar este horario de la disponibilidad?",
      )
    )
      return;
    setBusy(id);
    setNotice(null);
    try {
      const { data, error } = await supabase
        .from(kind)
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error(
          "El elemento ya no está disponible o no tienes permiso para eliminarlo. Actualiza la página.",
        );
      setNotice({
        kind: "success",
        text: kind === "fields" ? "Campo eliminado." : "Horario retirado.",
      });
      onChange();
    } catch (error) {
      setNotice({ kind: "error", text: changeError(error) });
    } finally {
      setBusy("");
    }
  }

  return (
    <section aria-labelledby="centers-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PARA CENTROS DEPORTIVOS</span>
          <h1 id="centers-heading">Tu campo. Su próximo partido.</h1>
          <p className="muted">
            Gestiona tus campos y publica horarios que se puedan reservar de
            verdad.
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => setShowCenterForm((show) => !show)}
          disabled={!!busy}
        >
          <Plus size={18} /> Añadir centro
        </button>
      </div>
      {notice && (
        <p
          className={`notice ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}
      {(showCenterForm || !ownedCenters.length) && (
        <div className="panel">
          <div className="panel-heading">
            <Building2 size={21} />
            <h2>Registra tu centro deportivo</h2>
          </div>
          <form className="form-stack" onSubmit={createCenter}>
            <div className="form-grid">
              <label className="field">
                Nombre del centro
                <input
                  value={centerName}
                  onChange={(event) => setCenterName(event.target.value)}
                  autoComplete="organization"
                  placeholder="Nombre de tu centro"
                  minLength={2}
                  maxLength={100}
                  required
                  disabled={!!busy}
                />
              </label>
              <label className="field">
                Ciudad
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  autoComplete="address-level2"
                  placeholder="¿Dónde está?"
                  minLength={2}
                  maxLength={100}
                  required
                  disabled={!!busy}
                />
              </label>
            </div>
            <label className="field">
              Dirección
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                autoComplete="street-address"
                placeholder="Calle y número"
                minLength={5}
                maxLength={240}
                required
                disabled={!!busy}
              />
            </label>
            <label className="field">
              Zona horaria del centro
              <input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                list="center-timezones"
                placeholder="Europe/Madrid"
                maxLength={100}
                required
                disabled={!!busy}
              />
              <datalist id="center-timezones">
                <option value="Europe/Madrid" />
                <option value="Atlantic/Canary" />
                <option value="Europe/Lisbon" />
              </datalist>
              <small className="muted">
                Los horarios se publican en esta zona, aunque gestiones el
                centro desde otro lugar.
              </small>
            </label>
            <button className="primary-button" type="submit" disabled={!!busy}>
              {busy === "center" ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <CirclePlus size={18} />
              )}{" "}
              Registrar centro
            </button>
          </form>
        </div>
      )}
      {!ownedCenters.length ? (
        <div className="empty-state">
          <Building2 size={30} />
          <h2>Un sitio para cada partido.</h2>
          <p>
            Añade tu centro, sus campos y los horarios disponibles. No
            publicaremos horarios hasta que los registres.
          </p>
        </div>
      ) : (
        <>
          <div className="subnav" aria-label="Tus centros">
            {ownedCenters.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={item.id === center?.id}
                onClick={() => {
                  setCenterId(item.id);
                  setFieldId("");
                  setShowFieldForm(false);
                  setNotice(null);
                }}
                disabled={!!busy}
              >
                {item.name}
              </button>
            ))}
          </div>
          {center && (
            <>
              <div className="panel-heading">
                <MapPin size={18} />
                <p>
                  {center.address}, {center.city}{" "}
                  <span className="muted">· {center.timezone}</span>
                </p>
              </div>
              <div className="dashboard-grid">
                <div className="panel">
                  <div className="panel-heading">
                    <h2>Tus campos</h2>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setShowFieldForm((show) => !show)}
                      disabled={!!busy}
                    >
                      <Plus size={16} /> Añadir
                    </button>
                  </div>
                  {!fields.length && (
                    <p className="muted">
                      Tu centro ya está registrado. Añade el primer campo para
                      publicar su disponibilidad.
                    </p>
                  )}
                  {fields.map((item) => (
                    <div className="list-row" key={item.id}>
                      <button
                        type="button"
                        className="text-button"
                        aria-pressed={item.id === field?.id}
                        onClick={() => {
                          setFieldId(item.id);
                          setNotice(null);
                        }}
                        disabled={!!busy}
                      >
                        <span>
                          <strong>{item.name}</strong>
                          <span className="muted">
                            Fútbol {item.format} · {item.surface} ·{" "}
                            {money(item.price_cents)}
                          </span>
                        </span>
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        title="Solo se pueden eliminar campos sin reservas"
                        aria-label={`Eliminar campo ${item.name}`}
                        onClick={() => remove("fields", item.id, item.name)}
                        disabled={
                          !!busy ||
                          catalog.matches.some(
                            (match) => match.field_id === item.id,
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                  {(showFieldForm || !fields.length) && (
                    <form className="form-stack" onSubmit={createField}>
                      <h3>Un nuevo terreno de juego</h3>
                      <label className="field">
                        Nombre del campo
                        <input
                          value={fieldName}
                          onChange={(event) => setFieldName(event.target.value)}
                          placeholder="Cómo identificáis este campo"
                          minLength={2}
                          maxLength={100}
                          required
                          disabled={!!busy}
                        />
                      </label>
                      <div className="form-grid">
                        <label className="field">
                          Modalidad
                          <select
                            value={format}
                            onChange={(event) =>
                              setFormat(event.target.value as Field["format"])
                            }
                            disabled={!!busy}
                          >
                            <option value="5">Fútbol 5 · 10 jugadores</option>
                            <option value="7">Fútbol 7 · 14 jugadores</option>
                            <option value="11">Fútbol 11 · 22 jugadores</option>
                          </select>
                        </label>
                        <label className="field">
                          Superficie
                          <select
                            value={surface}
                            onChange={(event) => setSurface(event.target.value)}
                            disabled={!!busy}
                          >
                            <option>Césped artificial</option>
                            <option>Césped natural</option>
                            <option>Pista de fútbol sala</option>
                            <option>Tierra</option>
                          </select>
                        </label>
                      </div>
                      <label className="field">
                        Precio de referencia por reserva (€)
                        <input
                          value={fieldPrice}
                          onChange={(event) =>
                            setFieldPrice(event.target.value)
                          }
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          max="10000"
                          required
                          disabled={!!busy}
                        />
                        <small className="muted">
                          Podrás elegir el precio de cada horario al publicarlo.
                        </small>
                      </label>
                      <label className="field">
                        Servicios, separados por comas
                        <input
                          value={amenities}
                          onChange={(event) => setAmenities(event.target.value)}
                          placeholder="Vestuarios, iluminación, aparcamiento…"
                          maxLength={400}
                          disabled={!!busy}
                        />
                        <small className="muted">Hasta 12 servicios.</small>
                      </label>
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={!!busy}
                      >
                        {busy === "field" ? (
                          <LoaderCircle size={17} className="spin" />
                        ) : (
                          <Plus size={17} />
                        )}{" "}
                        Añadir campo
                      </button>
                    </form>
                  )}
                </div>
                <div className="panel">
                  <div className="panel-heading">
                    <CalendarPlus size={21} />
                    <h2>
                      {field ? `Horarios de ${field.name}` : "Disponibilidad"}
                    </h2>
                  </div>
                  {!field ? (
                    <p className="muted">
                      Añade un campo para publicar sus horarios.
                    </p>
                  ) : (
                    <>
                      <p className="muted">
                        Publica cada franja que quieras ofrecer. Hora local del
                        centro: {center.timezone}.
                      </p>
                      <form className="form-stack" onSubmit={createSlot}>
                        <div className="form-grid">
                          <label className="field">
                            Inicio
                            <input
                              type="datetime-local"
                              value={startsAt}
                              onChange={(event) =>
                                setStartsAt(event.target.value)
                              }
                              required
                              disabled={!!busy}
                            />
                          </label>
                          <label className="field">
                            Fin
                            <input
                              type="datetime-local"
                              value={endsAt}
                              onChange={(event) =>
                                setEndsAt(event.target.value)
                              }
                              required
                              disabled={!!busy}
                            />
                          </label>
                        </div>
                        <label className="field">
                          Precio total del campo (€)
                          <input
                            value={slotPrice}
                            onChange={(event) =>
                              setSlotPrice(event.target.value)
                            }
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            max="10000"
                            required
                            disabled={!!busy}
                          />
                        </label>
                        <button
                          className="primary-button"
                          type="submit"
                          disabled={!!busy}
                        >
                          {busy === "slot" ? (
                            <LoaderCircle size={18} className="spin" />
                          ) : (
                            <CalendarPlus size={18} />
                          )}{" "}
                          Publicar horario
                        </button>
                      </form>
                      <h3>
                        Horarios libres publicados{" "}
                        <span className="badge">{slots.length}</span>
                      </h3>
                      {!slots.length && (
                        <p className="muted">
                          Aún no hay horarios libres para este campo. Los
                          horarios reservados dejan de aparecer aquí.
                        </p>
                      )}
                      {slots.map((slot) => (
                        <div key={slot.id} className="list-row">
                          <div>
                            <strong>
                              {new Intl.DateTimeFormat("es-ES", {
                                timeZone: center.timezone,
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }).format(new Date(slot.starts_at))}
                            </strong>
                            <span className="muted">
                              {new Intl.DateTimeFormat("es-ES", {
                                timeZone: center.timezone,
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(slot.starts_at))}{" "}
                              –{" "}
                              {new Intl.DateTimeFormat("es-ES", {
                                timeZone: center.timezone,
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(slot.ends_at))}{" "}
                              · {money(slot.price_cents)}
                            </span>
                          </div>
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Retirar horario del ${new Intl.DateTimeFormat("es-ES", { timeZone: center.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(slot.starts_at))}`}
                            onClick={() => remove("slots", slot.id, "")}
                            disabled={!!busy}
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
