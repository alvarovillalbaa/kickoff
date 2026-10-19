export type Center = {
  id: string;
  owner_id: string;
  name: string;
  city: string;
  address: string;
  timezone: string;
};
export type Field = {
  id: string;
  center_id: string;
  name: string;
  format: "5" | "7" | "11";
  surface: string;
  max_players: number;
  price_cents: number;
  amenities: string[];
};
export type Slot = {
  id: string;
  field_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
};
export type Match = {
  id: string;
  field_id: string;
  slot_id: string;
  organizer_id: string;
  center_owner_id: string;
  timezone: string;
  title: string;
  level: string;
  visibility: "public" | "invite";
  status: "scheduled" | "cancelled";
  starts_at: string;
  ends_at: string;
  max_players: number;
  price_cents: number;
  players_count: number;
  center_name: string;
  city: string;
  field_name: string;
  format: string;
};
export type Participant = {
  id: string;
  display_name: string;
  is_organizer: boolean;
  is_guest: boolean;
  is_me: boolean;
};
export type MatchDetail = Match & { participants: Participant[] };
export type Catalog = {
  centers: Center[];
  fields: Field[];
  slots: Slot[];
  matches: Match[];
};
export type GuestPass = {
  participant_id: string;
  guest_token: string;
  match_id: string;
  display_name: string;
  invite_code?: string;
  confirmed?: boolean;
};
