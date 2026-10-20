import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Flag,
  Goal,
  LoaderCircle,
  LogOut,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { AuthDialog } from "./components/AuthDialog";
import { CenterManager } from "./components/CenterManager";
import { Dialog } from "./components/Dialog";
import { dateLabel, money, rpc, supabase, timeLabel } from "./lib/supabase";
import type {
  Catalog,
  Center,
  Field,
  GuestPass,
  Match,
  MatchDetail,
  Slot,
} from "./types";

type View = "matches" | "fields" | "mine" | "centers";
const emptyCatalog: Catalog = {
  centers: [],
  fields: [],
  slots: [],
  matches: [],
};
const guestKey = "kickoff:guest-passes";
function readGuests(): GuestPass[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(guestKey) || "[]");
    return Array.isArray(data)
      ? data.filter(
          (item): item is GuestPass =>
            item &&
            ["participant_id", "guest_token", "match_id", "display_name"].every(
              (key) => typeof item[key] === "string",
            ),
        )
      : [];
  } catch {
    return [];
  }
}
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Algo ha fallado. Inténtalo de nuevo.";
const getRoute = () => {
  const p = new URLSearchParams(window.location.search);
  return { id: p.get("partido"), invite: p.get("invitacion") };
};

export default function App() {
  const [view, setView] = useState<View>("matches");
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [date, setDate] = useState("");
  const [route, setRoute] = useState(getRoute);
  const currentRoute = useRef(route);
  currentRoute.current = route;
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [booking, setBooking] = useState<{
    slot: Slot;
    field: Field;
    center: Center;
  } | null>(null);
  const [ownerBooking, setOwnerBooking] = useState<Match | null>(null);
  const [mine, setMine] = useState<Match[]>([]);
  const [mineLoading, setMineLoading] = useState(false);
  const [mineError, setMineError] = useState("");
  const [guests, setGuests] = useState(readGuests);
  const guestPasses = useRef(guests);
  const [toast, setToast] = useState("");
  const resultsRef = useRef<HTMLElement>(null);
  const detailRequest = useRef(0);
  const mineRequest = useRef(0);
  const userId = session?.user.id;
  const displayName = session?.user.user_metadata?.display_name || "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCatalog(await rpc<Catalog>("browse"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  const loadMine = useCallback(async () => {
    const request = ++mineRequest.current;
    if (!userId) {
      setMine([]);
      setMineLoading(false);
      return;
    }
    setMineLoading(true);
    setMineError("");
    try {
      const data = await rpc<Match[]>("my_matches");
      if (request === mineRequest.current) setMine(data);
    } catch (e) {
      if (request === mineRequest.current) setMineError(errorText(e));
    } finally {
      if (request === mineRequest.current) setMineLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setAuthReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setAuthOpen(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    setMine([]);
    mineRequest.current++;
    if (view === "mine") void loadMine();
  }, [view, loadMine]);
  useEffect(() => {
    const pop = () => {
      ++detailRequest.current;
      setDetail(null);
      setDetailLoading(true);
      setRoute(getRoute());
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const loadDetail = useCallback(async () => {
    const request = ++detailRequest.current;
    if (!route.id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    const pass = guestPasses.current.find((g) => g.match_id === route.id);
    try {
      const data = await rpc<MatchDetail>("get_match", {
        p_match_id: route.id,
        p_invite_code: route.invite,
        p_participant_id: pass?.participant_id ?? null,
        p_guest_token: pass?.guest_token ?? null,
      });
      if (request === detailRequest.current) setDetail(data);
    } catch (e) {
      if (request === detailRequest.current) setDetailError(errorText(e));
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }, [route.id, route.invite, userId]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  function go(next: View, scroll = true) {
    setView(next);
    if (scroll)
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
  }
  function openMatch(id: string, invite?: string) {
    ++detailRequest.current;
    setDetail(null);
    setDetailLoading(true);
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("partido", id);
    if (invite) url.searchParams.set("invitacion", invite);
    window.history.pushState({}, "", url);
    setRoute(getRoute());
  }
  function closeMatch() {
    ++detailRequest.current;
    const url = new URL(window.location.href);
    url.search = "";
    window.history.pushState({}, "", url);
    setRoute(getRoute());
  }
  function changeGuests(next: GuestPass[]) {
    localStorage.setItem(guestKey, JSON.stringify(next));
    guestPasses.current = next;
    setGuests(next);
  }
  function removeGuest(id: string) {
    const next = guestPasses.current.filter((g) => g.participant_id !== id);
    guestPasses.current = next;
    setGuests(next);
    try {
      localStorage.setItem(guestKey, JSON.stringify(next));
    } catch {
      /* The server has already invalidated this pass. */
    }
  }
  async function changed() {
    await Promise.all([load(), loadMine()]);
    if (
      route.id &&
      currentRoute.current.id === route.id &&
      currentRoute.current.invite === route.invite
    )
      await loadDetail();
  }
  async function signOut() {
    const { error: signOutError } = await supabase!.auth.signOut();
    if (signOutError) {
      setToast(signOutError.message);
      return;
    }
    setToast("Has cerrado sesión. ¡Nos vemos en el campo!");
  }
  function chooseBooking(slot: Slot, field: Field, center: Center) {
    if (!session) {
      setAuthOpen(true);
      setToast("Entra o crea tu cuenta para reservar el campo.");
      return;
    }
    setBooking({ slot, field, center });
  }
  const matches = useMemo(
    () =>
      catalog.matches.filter((match) => {
        const zone = catalog.centers.find(
          (c) =>
            c.id ===
            catalog.fields.find((f) => f.id === match.field_id)?.center_id,
        )?.timezone;
        return (
          match.players_count < match.max_players &&
          (format === "all" || match.format === format) &&
          `${match.city} ${match.center_name} ${match.title}`
            .toLocaleLowerCase("es")
            .includes(query.toLocaleLowerCase("es")) &&
          (!date ||
            new Intl.DateTimeFormat("sv-SE", { timeZone: zone }).format(
              new Date(match.starts_at),
            ) === date)
        );
      }),
    [catalog, query, format, date],
  );
  const availableFields = useMemo(
    () =>
      catalog.fields.flatMap((field) => {
        const center = catalog.centers.find((c) => c.id === field.center_id);
        if (
          !center ||
          (format !== "all" && field.format !== format) ||
          !`${center.city} ${center.name} ${field.name}`
            .toLocaleLowerCase("es")
            .includes(query.toLocaleLowerCase("es"))
        )
          return [];
        const slots = catalog.slots.filter(
          (slot) =>
            slot.field_id === field.id &&
            (!date ||
              new Intl.DateTimeFormat("sv-SE", {
                timeZone: center.timezone,
              }).format(new Date(slot.starts_at)) === date),
        );
        return slots.length ? [{ field, center, slots }] : [];
      }),
    [catalog, query, format, date],
  );

  return (
    <>
      <a className="skip-link" href="#explorar">
        Saltar al contenido
      </a>
      <header className="site-header page-shell">
        <a className="brand" href="/" aria-label="Kickoff, inicio">
          <span className="brand-mark">
            <Goal size={24} strokeWidth={2.2} />
          </span>
          kickoff<span className="brand-dot">.</span>
        </a>
        <nav className="desktop-nav" aria-label="Principal">
          <button
            className={view === "matches" ? "nav-active" : ""}
            onClick={() => go("matches")}
          >
            Encontrar partido
          </button>
          <button
            className={view === "fields" ? "nav-active" : ""}
            onClick={() => go("fields")}
          >
            Reservar campo
          </button>
          <button
            className={view === "mine" ? "nav-active" : ""}
            onClick={() => go("mine")}
          >
            Mis partidos
          </button>
        </nav>
        <div className="header-actions">
          <button className="center-link" onClick={() => go("centers")}>
            ¿Tienes un centro?
          </button>
          {session ? (
            <button
              className="account-button"
              onClick={signOut}
              aria-label="Cerrar sesión"
            >
              <span>
                {String(displayName || session.user.email || "Tú")
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <LogOut size={17} />
            </button>
          ) : (
            <button
              className="small-button"
              disabled={!authReady}
              onClick={() => setAuthOpen(true)}
            >
              Entrar <ArrowRight size={16} />
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="hero page-shell" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" />
              MENOS GRUPOS. MÁS FÚTBOL.
            </div>
            <h1 id="hero-title">
              El plan
              <br />
              es <span>jugar.</span>
              <svg
                className="title-swoosh"
                viewBox="0 0 300 22"
                aria-hidden="true"
              >
                <path d="M5 17Q122-7 291 7" />
              </svg>
            </h1>
            <p>
              Tu campo, tu gente y un buen partido.
              <br className="desktop-break" /> Lo demás, lo organizamos aquí.
            </p>
            <div className="hero-actions">
              <button
                className="primary-button lime"
                onClick={() => go("matches")}
              >
                Encuentra tu partido <ArrowRight size={19} />
              </button>
              <button className="hero-secondary" onClick={() => go("fields")}>
                Reserva un campo <ChevronRight size={18} />
              </button>
            </div>
            <div className="hero-footnote">
              <span className="tiny-player">
                <Users size={18} />
              </span>
              <span>Trae a tu equipo. O encuentra uno nuevo.</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <img src="/pitch.svg" alt="" />
            <div className="art-label">
              <span className="live-dot" />
              AQUÍ EMPIEZA EL PARTIDO
            </div>
            <span className="art-stamp">
              NOS VEMOS
              <br />
              EN EL CAMPO <ArrowDown size={20} />
            </span>
            <div className="art-ticket">
              <span className="ticket-icon">
                <Ticket size={25} />
              </span>
              <div>
                <strong>El fútbol se juega juntos.</strong>
                <span>Una invitación y estás dentro.</span>
              </div>
              <span className="ticket-check">
                <Check size={18} />
              </span>
            </div>
          </div>
        </section>

        <div className="benefit-strip page-shell">
          <span>
            <ShieldCheck size={19} />
            Disponibilidad de cada centro
          </span>
          <span>
            <Users size={19} />
            Invita con un enlace
          </span>
          <span>
            <Goal size={19} />
            Encuentra plazas libres
          </span>
          <span className="strip-last">
            TU PRÓXIMO PARTIDO, A UN PASO <ArrowDown size={15} />
          </span>
        </div>

        <section
          className="explore page-shell"
          ref={resultsRef}
          id="explorar"
          aria-labelledby="explore-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">SAL DEL CHAT. ENTRA AL CAMPO.</p>
              <h2 id="explore-title">
                {view === "matches"
                  ? "Siempre hay sitio para uno más."
                  : view === "fields"
                    ? "Elige campo. Monta el partido."
                    : view === "mine"
                      ? "Tu agenda de fútbol."
                      : "Tu centro, a pie de campo."}
              </h2>
            </div>
            <span className="section-note">
              Fútbol de verdad.
              <br />
              Gente como tú.
            </span>
          </div>
          <div
            className="explore-tabs"
            role="group"
            aria-label="Explorar Kickoff"
          >
            <button
              aria-pressed={view === "matches"}
              onClick={() => setView("matches")}
            >
              <Users size={17} />
              Partidos con plazas
            </button>
            <button
              aria-pressed={view === "fields"}
              onClick={() => setView("fields")}
            >
              <Flag size={17} />
              Campos disponibles
            </button>
            <button
              aria-pressed={view === "mine"}
              onClick={() => setView("mine")}
            >
              <CalendarDays size={17} />
              Mis partidos
            </button>
            <button
              aria-pressed={view === "centers"}
              onClick={() => setView("centers")}
            >
              <Goal size={17} />
              Para centros
            </button>
          </div>

          {(view === "matches" || view === "fields") && (
            <>
              <form className="filters" onSubmit={(e) => e.preventDefault()}>
                <label className="search-input">
                  <MapPin size={20} />
                  <span className="sr-only">Ciudad, centro o partido</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="¿Dónde te apetece jugar?"
                  />
                </label>
                <label className="filter-field">
                  <span>Cuándo</span>
                  <input
                    aria-label="Fecha de juego"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label className="filter-field">
                  <span>Formato</span>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="all">Todo el fútbol</option>
                    <option value="5">Fútbol 5</option>
                    <option value="7">Fútbol 7</option>
                    <option value="11">Fútbol 11</option>
                  </select>
                </label>
                <button
                  className="filter-reset"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFormat("all");
                    setDate("");
                  }}
                  aria-label="Quitar filtros"
                >
                  <SlidersHorizontal size={20} />
                  <span>Limpiar</span>
                </button>
              </form>
              <div className="result-meta">
                <span>
                  {loading
                    ? "Buscando tu próximo partido…"
                    : `${view === "matches" ? matches.length : availableFields.length} ${view === "matches" ? "partidos con plazas libres" : "campos con disponibilidad"}`}
                </span>
                <span>
                  <span className="live-dot" />
                  Disponibilidad actual
                </span>
              </div>
              {error ? (
                <div className="empty-state error-state">
                  <Goal size={38} />
                  <h3>No hemos podido consultar los campos.</h3>
                  <p>{error}</p>
                  <button className="secondary-button" onClick={load}>
                    Volver a intentar
                  </button>
                </div>
              ) : loading ? (
                <div className="loading-state" role="status">
                  <LoaderCircle className="spin" size={28} />
                  Estamos buscando el mejor plan.
                </div>
              ) : view === "matches" ? (
                matches.length ? (
                  <div className="cards-grid">
                    {matches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        onOpen={() => openMatch(match.id)}
                        timezone={
                          catalog.centers.find(
                            (c) =>
                              c.id ===
                              catalog.fields.find(
                                (f) => f.id === match.field_id,
                              )?.center_id,
                          )?.timezone
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon="match"
                    title={
                      query || date || format !== "all"
                        ? "Por aquí aún no rueda el balón."
                        : "El primer partido puede ser el tuyo."
                    }
                    description={
                      query || date || format !== "all"
                        ? "Prueba otra fecha o amplía los filtros para encontrar más partidos."
                        : "Cuando alguien organice un partido abierto, sus plazas aparecerán aquí. Reserva un campo y empieza a reunir al equipo."
                    }
                    action="Ver campos disponibles"
                    onAction={() => setView("fields")}
                  />
                )
              ) : availableFields.length ? (
                <div className="cards-grid">
                  {availableFields.map(({ field, center, slots }) => (
                    <FieldCard
                      key={field.id}
                      field={field}
                      center={center}
                      slots={slots}
                      onBook={(slot) => chooseBooking(slot, field, center)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="field"
                  title={
                    catalog.centers.length
                      ? "Aún no hay horarios para esa búsqueda."
                      : "Un buen partido necesita un buen campo."
                  }
                  description={
                    catalog.centers.length
                      ? "Los centros publican sus horarios disponibles. Prueba otra fecha o vuelve más tarde."
                      : "Los centros pueden registrar sus campos y abrir los primeros horarios. Las reservas aparecerán en cuanto se publique disponibilidad."
                  }
                  action="Registrar mi centro"
                  onAction={() => setView("centers")}
                />
              )}
            </>
          )}

          {view === "mine" && (
            <>
              {!session ? (
                <EmptyState
                  icon="match"
                  title="Tus partidos, todos aquí."
                  description="Entra para ver tus reservas y los partidos a los que te has unido."
                  action="Entrar o crear cuenta"
                  onAction={() => setAuthOpen(true)}
                />
              ) : mineLoading ? (
                <div className="loading-state">
                  <LoaderCircle className="spin" />
                  Cargando tu agenda…
                </div>
              ) : mineError ? (
                <div className="notice error" role="alert">
                  {mineError}
                  <button className="text-button" onClick={loadMine}>
                    Reintentar
                  </button>
                </div>
              ) : mine.length ? (
                <div className="cards-grid">
                  {mine.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      onOpen={() =>
                        match.center_owner_id === userId &&
                        match.organizer_id !== userId
                          ? setOwnerBooking(match)
                          : openMatch(match.id)
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="match"
                  title="Tu próximo partido está por escribir."
                  description="Encuentra uno con plazas libres o reserva un campo para jugar con tu gente."
                  action="Buscar partido"
                  onAction={() => setView("matches")}
                />
              )}
              {guests.length > 0 && (
                <div className="panel guest-agenda">
                  <h3>Tus plazas como invitado</h3>
                  <p className="muted">
                    Guardadas en este navegador. Entra en tu cuenta para
                    vincularlas desde el partido.
                  </p>
                  {guests.map((pass) => (
                    <div className="list-row" key={pass.participant_id}>
                      <span>
                        {pass.display_name}
                        <small className="muted">
                          {pass.confirmed === false
                            ? "Confirmación pendiente"
                            : "Pase de invitado"}
                        </small>
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          openMatch(pass.match_id, pass.invite_code)
                        }
                      >
                        Ver partido <ArrowRight size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {view === "centers" &&
            (session && loading ? (
              <div className="loading-state">
                <LoaderCircle className="spin" />
                Cargando tus campos…
              </div>
            ) : session && error ? (
              <div className="notice error" role="alert">
                {error}
                <button className="text-button" onClick={load}>
                  Reintentar
                </button>
              </div>
            ) : session ? (
              <CenterManager
                userId={session.user.id}
                catalog={catalog}
                onChange={load}
              />
            ) : (
              <div className="center-onboarding">
                <div>
                  <p className="eyebrow">LLENA EL CAMPO, NO TU AGENDA.</p>
                  <h3>
                    Tu centro.
                    <br />
                    Sus próximos partidos.
                  </h3>
                  <p>
                    Registra cada campo, publica los horarios que quieras
                    ofrecer y recibe reservas en un solo lugar.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => setAuthOpen(true)}
                  >
                    Registrar mi centro <Plus size={18} />
                  </button>
                </div>
                <ol>
                  <li>
                    <span>01</span>
                    <div>
                      <strong>Presenta tu centro</strong>
                      <p>Nombre, dirección y ciudad para que te encuentren.</p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <strong>Abre tus campos</strong>
                      <p>Formato, precio y disponibilidad de cada uno.</p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <strong>Recibe al equipo</strong>
                      <p>Consulta las reservas desde Mis partidos.</p>
                    </div>
                  </li>
                </ol>
              </div>
            ))}
        </section>

        <section className="how-section page-shell" aria-labelledby="how-title">
          <div className="how-heading">
            <p className="eyebrow">ASÍ DE FÁCIL.</p>
            <h2 id="how-title">
              Del «¿jugamos?»
              <br />
              al pitido inicial.
            </h2>
            <p>
              Todo lo que necesitas para que
              <br />
              el partido salga del grupo.
            </p>
          </div>
          <div className="how-steps">
            <article>
              <span className="step-number">01 /</span>
              <Goal size={29} />
              <h3>Encuentra tu campo</h3>
              <p>
                Consulta horarios publicados por los centros y reserva el que
                encaja con tu equipo.
              </p>
            </article>
            <article>
              <span className="step-number">02 /</span>
              <Users size={29} />
              <h3>Pasa la convocatoria</h3>
              <p>
                Comparte tu enlace. Tus amigos pueden unirse como invitados, sin
                crear una cuenta.
              </p>
            </article>
            <article>
              <span className="step-number">03 /</span>
              <Trophy size={29} />
              <h3>Que ruede el balón</h3>
              <p>
                Abre las plazas que falten a otros jugadores. Y nos vemos en el
                campo.
              </p>
            </article>
          </div>
        </section>
        <section className="closing-cta page-shell">
          <span className="cta-decoration" aria-hidden="true">
            ↗
          </span>
          <div>
            <p className="eyebrow">EL MEJOR PLAN NO ESTÁ EN EL SOFÁ.</p>
            <h2>
              Nos falta uno.
              <br />
              <span>¿Te apuntas?</span>
            </h2>
          </div>
          <button className="primary-button lime" onClick={() => go("matches")}>
            Buscar mi próximo partido <ArrowRight size={19} />
          </button>
        </section>
      </main>
      <footer className="page-shell">
        <a className="brand" href="/">
          kickoff<span className="brand-dot">.</span>
        </a>
        <span>Más fútbol. Menos vueltas.</span>
        <button className="text-button" onClick={() => go("centers")}>
          Soy un centro deportivo <ArrowRight size={15} />
        </button>
        <span className="footer-small">
          © {new Date().getFullYear()} Kickoff
        </span>
      </footer>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        <button
          className={view === "matches" ? "active" : ""}
          onClick={() => go("matches")}
        >
          <Search size={21} />
          Partidos
        </button>
        <button
          className={view === "fields" ? "active" : ""}
          onClick={() => go("fields")}
        >
          <Goal size={21} />
          Campos
        </button>
        <button
          className={view === "mine" ? "active" : ""}
          onClick={() => go("mine")}
        >
          <CalendarDays size={21} />
          Mi agenda
        </button>
        <button
          className={view === "centers" ? "active" : ""}
          onClick={() => go("centers")}
        >
          <Flag size={21} />
          Mi centro
        </button>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label="Cerrar aviso" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          onSuccess={() => {
            setAuthOpen(false);
            setToast("Ya estás dentro. ¡Vamos a jugar!");
            void changed();
          }}
        />
      )}
      {recovery && (
        <PasswordRecovery
          onClose={() => setRecovery(false)}
          onSuccess={() => {
            setRecovery(false);
            setToast("Contraseña actualizada.");
          }}
        />
      )}
      {booking && (
        <BookingDialog
          booking={booking}
          name={displayName}
          onClose={() => setBooking(null)}
          onBooked={(id) => {
            setBooking(null);
            setToast("Campo reservado. Ya puedes invitar a tu equipo.");
            void changed();
            openMatch(id);
          }}
        />
      )}
      {ownerBooking && (
        <OwnerBooking
          match={ownerBooking}
          onClose={() => setOwnerBooking(null)}
          onCancelled={() => {
            setOwnerBooking(null);
            setToast(
              "Reserva cancelada. El horario vuelve a estar disponible.",
            );
            void changed();
          }}
        />
      )}
      {route.id && !authOpen && (
        <Dialog title="La convocatoria" onClose={closeMatch} wide>
          {detailLoading ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              Cargando partido…
            </div>
          ) : detailError ? (
            <div className="notice error" role="alert">
              {detailError}
              <button className="text-button" onClick={loadDetail}>
                Reintentar
              </button>
            </div>
          ) : (
            detail && (
              <MatchPanel
                key={`${detail.id}:${userId}`}
                match={detail}
                invite={route.invite}
                userId={userId}
                name={displayName}
                guest={guests.find((g) => g.match_id === detail.id)}
                onAuth={() => setAuthOpen(true)}
                onChange={changed}
                onToast={setToast}
                onGuest={(pass) =>
                  changeGuests([
                    ...guestPasses.current.filter(
                      (g) => g.match_id !== pass.match_id,
                    ),
                    pass,
                  ])
                }
                onRemoveGuest={removeGuest}
              />
            )
          )}
        </Dialog>
      )}
    </>
  );
}

function EmptyState({
  title,
  description,
  action,
  onAction,
  icon,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
  icon: "match" | "field";
}) {
  return (
    <div className="empty-state">
      <div className="empty-illustration" aria-hidden="true">
        {icon === "match" ? <Users size={35} /> : <Goal size={39} />}
        <span>
          <Plus size={12} />
        </span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="secondary-button" onClick={onAction}>
        {action}
        <ArrowRight size={17} />
      </button>
      <span className="empty-footnote">
        Este espacio se llena con partidos y campos reales.
      </span>
    </div>
  );
}

function MatchCard({
  match,
  onOpen,
  timezone = match.timezone,
}: {
  match: Match;
  onOpen: () => void;
  timezone?: string;
}) {
  const free = match.max_players - match.players_count;
  return (
    <article
      className={`match-card ${match.status === "cancelled" ? "cancelled" : ""}`}
    >
      <div className="card-top">
        <span className="format-badge">F{match.format}</span>
        <span className={`badge ${free <= 2 ? "last-spots" : ""}`}>
          {match.status === "cancelled"
            ? "Cancelado"
            : `${free} ${free === 1 ? "plaza libre" : "plazas libres"}`}
        </span>
      </div>
      <p className="card-city">
        <MapPin size={14} />
        {match.city}
      </p>
      <h3>{match.title}</h3>
      <p className="muted">
        {match.center_name} · {match.field_name}
      </p>
      <div className="card-schedule">
        <span>
          <CalendarDays size={16} />
          {dateLabel(match.starts_at, timezone)}
        </span>
        <span>
          <Clock3 size={16} />
          {timeLabel(match.starts_at, timezone)}–
          {timeLabel(match.ends_at, timezone)}
        </span>
      </div>
      <div className="card-players">
        <div className="player-dots" aria-hidden="true">
          {Array.from({ length: Math.min(7, match.max_players) }, (_, i) => (
            <span key={i} className={i < match.players_count ? "filled" : ""}>
              {i < match.players_count ? "•" : "+"}
            </span>
          ))}
        </div>
        <span>
          {match.players_count}/{match.max_players} jugadores · {match.level}
        </span>
      </div>
      <div className="card-bottom">
        <div>
          <strong>{money(match.price_cents / match.max_players)}</strong>
          <span>/persona si se llena</span>
        </div>
        <button
          className="round-button"
          aria-label={`Ver ${match.title}`}
          onClick={onOpen}
        >
          <ArrowRight size={20} />
        </button>
      </div>
    </article>
  );
}

function FieldCard({
  field,
  center,
  slots,
  onBook,
}: {
  field: Field;
  center: Center;
  slots: Slot[];
  onBook: (slot: Slot) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? slots : slots.slice(0, 4);
  return (
    <article className="field-card">
      <div className="field-graphic" aria-hidden="true">
        <div className="mini-pitch">
          <span />
        </div>
        <span className="field-format">FÚTBOL {field.format}</span>
      </div>
      <div className="field-card-body">
        <p className="card-city">
          <MapPin size={14} />
          {center.city}
        </p>
        <h3>{field.name}</h3>
        <p className="muted">
          {center.name} · {field.surface}
        </p>
        {field.amenities.length > 0 && (
          <p className="amenities">{field.amenities.join(" · ")}</p>
        )}
        <div className="slot-heading">
          <span>Horarios disponibles</span>
          <small>{center.timezone}</small>
        </div>
        <div className="slot-list">
          {visible.map((slot) => (
            <button key={slot.id} onClick={() => onBook(slot)}>
              <span>
                {dateLabel(slot.starts_at, center.timezone)} ·{" "}
                {timeLabel(slot.starts_at, center.timezone)}–
                {timeLabel(slot.ends_at, center.timezone)}
              </span>
              <strong>{money(slot.price_cents)}</strong>
            </button>
          ))}
        </div>
        {slots.length > 4 && (
          <button
            className="text-button"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? "Ver menos horarios"
              : `Ver los ${slots.length} horarios`}
          </button>
        )}
      </div>
    </article>
  );
}

function BookingDialog({
  booking,
  name,
  onClose,
  onBooked,
}: {
  booking: { slot: Slot; field: Field; center: Center };
  name: string;
  onClose: () => void;
  onBooked: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const id = await rpc<string>("book_match", {
        p_slot_id: booking.slot.id,
        p_title: data.get("title"),
        p_level: data.get("level"),
        p_visibility: data.get("visibility"),
        p_display_name: data.get("name"),
      });
      onBooked(id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Tu próximo partido" onClose={onClose}>
      <div className="booking-summary">
        <Goal size={30} />
        <div>
          <strong>{booking.field.name}</strong>
          <p>
            {booking.center.name} · {booking.center.city}
          </p>
          <p>
            {dateLabel(booking.slot.starts_at, booking.center.timezone)} ·{" "}
            {timeLabel(booking.slot.starts_at, booking.center.timezone)}–
            {timeLabel(booking.slot.ends_at, booking.center.timezone)} (
            {booking.center.timezone})
          </p>
        </div>
      </div>
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          Nombre del partido
          <input
            name="title"
            required
            minLength={3}
            maxLength={80}
            placeholder="El partido de los jueves"
          />
        </label>
        <label className="field">
          Tu nombre para la convocatoria
          <input
            name="name"
            required
            minLength={2}
            maxLength={40}
            defaultValue={name}
            autoComplete="given-name"
          />
        </label>
        <div className="form-grid">
          <label className="field">
            Nivel
            <select name="level">
              <option>Todos los niveles</option>
              <option>Iniciación</option>
              <option>Intermedio</option>
              <option>Avanzado</option>
            </select>
          </label>
          <label className="field">
            Convocatoria
            <select name="visibility">
              <option value="public">Abierta · cualquiera puede unirse</option>
              <option value="invite">Privada · solo con invitación</option>
            </select>
          </label>
        </div>
        <div className="booking-total">
          <span>Reserva del campo</span>
          <strong>{money(booking.slot.price_cents)}</strong>
        </div>
        <p className="fine-print">
          Confirmas la reserva completa del campo. El pago se acuerda
          directamente con el centro. Tu plaza se incluye en la convocatoria y
          tu nombre será visible para sus jugadores.
        </p>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Check size={18} />
          )}{" "}
          {busy ? "Confirmando reserva…" : "Confirmar reserva"}
        </button>
      </form>
    </Dialog>
  );
}

function MatchPanel({
  match,
  invite,
  userId,
  name,
  guest,
  onAuth,
  onChange,
  onToast,
  onGuest,
  onRemoveGuest,
}: {
  match: MatchDetail;
  invite: string | null;
  userId?: string;
  name: string;
  guest?: GuestPass;
  onAuth: () => void;
  onChange: () => Promise<void>;
  onToast: (text: string) => void;
  onGuest: (pass: GuestPass) => void;
  onRemoveGuest: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [invitation, setInvitation] = useState(""),
    [confirmCancel, setConfirmCancel] = useState(false);
  const organizer = userId === match.organizer_id;
  const validGuest =
    guest &&
    match.participants.some(
      (p) => p.id === guest.participant_id && p.is_guest && p.is_me,
    )
      ? guest
      : undefined;
  const joined = match.participants.some((p) => p.is_me);
  const started = new Date(match.starts_at).getTime() <= Date.now();
  const canJoin =
    !joined &&
    match.status === "scheduled" &&
    !started &&
    match.players_count < match.max_players;
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const display = String(new FormData(event.currentTarget).get("name"));
    await action(async () => {
      if (userId)
        await rpc("join_match", {
          p_match_id: match.id,
          p_display_name: display,
          p_invite_code: invite,
        });
      else {
        const pending = guest ?? {
          participant_id: crypto.randomUUID(),
          guest_token: crypto.randomUUID(),
          match_id: match.id,
          display_name: display,
        };
        try {
          onGuest({
            ...pending,
            display_name: display,
            invite_code: invite ?? undefined,
            confirmed: false,
          });
        } catch {
          throw new Error(
            "Para guardar tu pase de invitado, permite el almacenamiento en este navegador o entra con una cuenta. Tu plaza aún no se ha reservado.",
          );
        }
        const pass = await rpc<{ participant_id: string; guest_token: string }>(
          "join_guest",
          {
            p_match_id: match.id,
            p_display_name: display,
            p_invite_code: invite,
            p_guest_token: pending.guest_token,
            p_participant_id: pending.participant_id,
          },
        );
        onGuest({
          ...pass,
          match_id: match.id,
          display_name: display,
          invite_code: invite ?? undefined,
          confirmed: true,
        });
      }
      onToast("¡Plaza confirmada! Nos vemos en el campo.");
      await onChange();
    });
  }
  async function inviteTeam() {
    await action(async () => {
      const code = await rpc<string>("get_invite_code", {
        p_match_id: match.id,
      });
      const url = new URL(window.location.origin);
      url.searchParams.set("partido", match.id);
      url.searchParams.set("invitacion", code);
      setInvitation(url.href);
      try {
        await navigator.clipboard.writeText(url.href);
        onToast("Enlace copiado. Compártelo con tu equipo.");
      } catch {
        onToast("Copia el enlace de invitación que aparece debajo.");
      }
    });
  }
  return (
    <div className="match-detail">
      <div className="detail-title">
        <span className="format-badge">F{match.format}</span>
        <div>
          <p className="eyebrow">
            {match.visibility === "public"
              ? "CONVOCATORIA ABIERTA"
              : "SOLO CON INVITACIÓN"}
          </p>
          <h3>{match.title}</h3>
        </div>
      </div>
      <p className="detail-location">
        <MapPin size={18} />
        {match.center_name} · {match.field_name} · {match.city}
      </p>
      <div className="detail-facts">
        <span>
          <CalendarDays size={19} />
          {dateLabel(match.starts_at, match.timezone)}
        </span>
        <span>
          <Clock3 size={19} />
          {timeLabel(match.starts_at, match.timezone)}–
          {timeLabel(match.ends_at, match.timezone)}
        </span>
        <span>
          <Users size={19} />
          {match.players_count}/{match.max_players} jugadores
        </span>
        <span>
          <Trophy size={19} />
          {match.level}
        </span>
      </div>
      <p className="fine-print">
        Horario del centro: {match.timezone}. Campo completo:{" "}
        {money(match.price_cents)}. Pago directamente con el centro.
      </p>
      {match.status === "cancelled" && (
        <div className="notice error">Este partido se ha cancelado.</div>
      )}
      {started && match.status !== "cancelled" && (
        <div className="notice">
          El partido ya ha comenzado. La convocatoria está cerrada.
        </div>
      )}
      <div className="roster-heading">
        <h4>La alineación</h4>
        <span>
          {Math.max(0, match.max_players - match.players_count)} plazas libres
        </span>
      </div>
      <div className="roster">
        {match.participants.map((p, i) => (
          <div className="roster-player" key={p.id}>
            <span
              className={`player-avatar ${p.is_organizer ? "captain" : ""}`}
            >
              {p.display_name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              {p.display_name}
              <small>
                {p.is_organizer
                  ? "Organiza"
                  : p.is_me
                    ? "Tu plaza"
                    : p.is_guest
                      ? "Invitado"
                      : `Jugador ${i + 1}`}
              </small>
            </span>
            {p.is_organizer && <Flag size={16} />}
          </div>
        ))}
      </div>
      {organizer && !started && match.status === "scheduled" && (
        <>
          <button
            className="primary-button"
            onClick={inviteTeam}
            disabled={busy}
          >
            <Copy size={18} />
            Invitar a mi equipo
          </button>
          {invitation && (
            <label className="field invite-field">
              Tu enlace de invitación
              <input
                readOnly
                value={invitation}
                onFocus={(e) => e.target.select()}
              />
              <small>
                Quien tenga este enlace puede ver la convocatoria y unirse como
                invitado.
              </small>
            </label>
          )}
        </>
      )}
      {canJoin &&
        (userId || invite ? (
          <form className="form-stack join-form" onSubmit={join}>
            <h4>{invite ? "Estás convocado." : "¿Contamos contigo?"}</h4>
            <label className="field">
              Tu nombre para el partido
              <input
                name="name"
                defaultValue={name}
                required
                minLength={2}
                maxLength={40}
                autoComplete="given-name"
              />
            </label>
            <p className="fine-print">
              Tu nombre será visible para los jugadores.{" "}
              {userId
                ? "Podrás gestionar tu plaza desde tu cuenta."
                : "No necesitas una cuenta. Recordaremos tu plaza en este navegador para que puedas cancelarla."}
            </p>
            <button className="primary-button" disabled={busy}>
              {busy ? "Confirmando…" : "Me apunto al partido"}
              <ArrowRight size={17} />
            </button>
            {!userId && (
              <button type="button" className="text-button" onClick={onAuth}>
                Ya tengo cuenta · Entrar
              </button>
            )}
          </form>
        ) : (
          <div className="join-form">
            <h4>Nos falta alguien como tú.</h4>
            <p>
              Entra para reservar tu plaza. Si te han invitado, puedes abrir el
              enlace y unirte sin cuenta.
            </p>
            <button className="primary-button" onClick={onAuth}>
              Entrar para apuntarme <ArrowRight size={18} />
            </button>
          </div>
        ))}
      {joined && !organizer && !started && match.status === "scheduled" && (
        <div className="joined-actions">
          <div className="notice success">
            <Check size={18} />
            Tu plaza está confirmada.
          </div>
          {validGuest && !userId && (
            <button className="secondary-button" onClick={onAuth}>
              Guardar mi plaza con una cuenta <ArrowRight size={17} />
            </button>
          )}
          {validGuest && userId && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await rpc("claim_guest", {
                    p_participant_id: validGuest.participant_id,
                    p_guest_token: validGuest.guest_token,
                  });
                  onRemoveGuest(validGuest.participant_id);
                  onToast("La plaza ya está vinculada a tu cuenta.");
                  await onChange();
                })
              }
            >
              Guardar esta plaza en mi cuenta
            </button>
          )}
          <button
            className="text-button danger-text"
            disabled={busy}
            onClick={() =>
              action(async () => {
                if (validGuest) {
                  await rpc("leave_guest", {
                    p_participant_id: validGuest.participant_id,
                    p_guest_token: validGuest.guest_token,
                  });
                  onRemoveGuest(validGuest.participant_id);
                } else await rpc("leave_match", { p_match_id: match.id });
                onToast("Has dejado libre tu plaza.");
                await onChange();
              })
            }
          >
            No podré ir · Dejar mi plaza
          </button>
        </div>
      )}
      {organizer &&
        !started &&
        match.status === "scheduled" &&
        (confirmCancel ? (
          <div className="cancel-confirm">
            <p>
              Se cancelará el partido para todos y el campo volverá a estar
              disponible.
            </p>
            <div className="button-row">
              <button
                className="danger-button"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await rpc("cancel_match", { p_match_id: match.id });
                    setConfirmCancel(false);
                    onToast(
                      "Partido cancelado. El campo vuelve a estar disponible.",
                    );
                    await onChange();
                  })
                }
              >
                Sí, cancelar partido
              </button>
              <button
                className="secondary-button"
                onClick={() => setConfirmCancel(false)}
              >
                Seguir jugando
              </button>
            </div>
          </div>
        ) : (
          <button
            className="text-button danger-text"
            onClick={() => setConfirmCancel(true)}
          >
            Cancelar este partido
          </button>
        ))}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function OwnerBooking({
  match,
  onClose,
  onCancelled,
}: {
  match: Match;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await rpc("cancel_match", { p_match_id: match.id });
      onCancelled();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Reserva de tu campo" onClose={onClose}>
      <div className="booking-summary">
        <Goal size={30} />
        <div>
          <strong>{match.field_name}</strong>
          <p>
            {match.center_name} · {match.city}
          </p>
          <p>
            {dateLabel(match.starts_at, match.timezone)} ·{" "}
            {timeLabel(match.starts_at, match.timezone)}–
            {timeLabel(match.ends_at, match.timezone)}
          </p>
        </div>
      </div>
      <div className="form-stack">
        <h3>{match.title}</h3>
        <p className="muted">
          {match.players_count}/{match.max_players} jugadores ·{" "}
          {match.visibility === "public"
            ? "Convocatoria abierta"
            : "Convocatoria privada"}
        </p>
        <p className="fine-print">
          Horario del centro: {match.timezone}. La lista de jugadores de las
          convocatorias privadas se comparte con sus participantes.
        </p>
        <div className="booking-total">
          <span>Precio total del campo</span>
          <strong>{money(match.price_cents)}</strong>
        </div>
        {match.status === "cancelled" ? (
          <div className="notice">Reserva cancelada.</div>
        ) : new Date(match.starts_at).getTime() <= Date.now() ? (
          <div className="notice">Este partido ya ha comenzado.</div>
        ) : confirm ? (
          <div className="cancel-confirm">
            <p>
              Se cancelará esta reserva para todos los jugadores y se liberará
              el horario.
            </p>
            <div className="button-row">
              <button
                className="danger-button"
                onClick={cancel}
                disabled={busy}
              >
                {busy ? "Cancelando…" : "Confirmar cancelación"}
              </button>
              <button
                className="secondary-button"
                onClick={() => setConfirm(false)}
                disabled={busy}
              >
                Mantener reserva
              </button>
            </div>
          </div>
        ) : (
          <button
            className="text-button danger-text"
            onClick={() => setConfirm(true)}
          >
            Cancelar reserva del campo
          </button>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function PasswordRecovery({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const password = String(new FormData(event.currentTarget).get("password"));
    const { error: authError } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (authError) setError(authError.message);
    else onSuccess();
  }
  return (
    <Dialog title="Crea una contraseña nueva" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          Nueva contraseña
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </label>
        <p className="fine-print">Usa al menos 10 caracteres.</p>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </Dialog>
  );
}
