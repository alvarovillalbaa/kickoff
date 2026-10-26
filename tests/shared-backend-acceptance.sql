-- Run the WHOLE file as ONE execute_sql payload using the project postgres role.
-- Do not split statements: an unhandled assertion error must abort the payload
-- before its final receipt. The inner sentinel rolls back every fixture on success;
-- an unexpected error rolls back that subtransaction too. Final ROLLBACK is explicit.
-- No permanent DDL, passwords, SMTP, Auth API, tokens/sessions, or provider config.
-- Direct synthetic auth.users rows model verified identities; they do not prove
-- signup, email ownership/delivery, JWT validation, HTTP, or simultaneous clients.
begin;

do $acceptance$
declare
  v_original_role text := current_user;
  v_a uuid := '6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac001';
  v_b uuid := '6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac002';
  v_c uuid := '6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac003';
  v_doc_a uuid := gen_random_uuid();
  v_doc_b uuid := gen_random_uuid();
  v_center uuid := gen_random_uuid();
  v_field uuid := gen_random_uuid();
  v_slot_public uuid := gen_random_uuid();
  v_slot_private uuid := gen_random_uuid();
  v_slot_free uuid := gen_random_uuid();
  v_public uuid;
  v_private uuid;
  v_rebooked uuid;
  v_public_invite uuid;
  v_private_invite uuid;
  v_member uuid;
  v_private_guest uuid := gen_random_uuid();
  v_private_token uuid := gen_random_uuid();
  v_guest_ids uuid[] := '{}';
  v_guest_tokens uuid[] := '{}';
  v_guest uuid;
  v_token uuid;
  v_result jsonb;
  v_other jsonb;
  v_count bigint;
  v_affected bigint;
  v_denied boolean;
  v_rolled_back boolean := false;
  v_checks text[] := '{}';
  v_before text;
  v_after text;
  v_index integer;
  -- Static catalog-only query: never accepts client-supplied SQL or identifiers.
  v_snapshot_sql text := $snapshot$
    select md5(string_agg(line,E'\n' order by line)) from (
      select 'relation:' || n.nspname || '.' || c.relname || ':' || c.relrowsecurity::text || ':' || coalesce(c.relacl::text,'') as line
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public','private','still_private') and c.relkind in ('r','p')
      union all select 'column:' || n.nspname || '.' || c.relname || '.' || a.attname || ':' || coalesce(a.attacl::text,'')
        from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public','private','still_private') and a.attnum > 0 and not a.attisdropped and c.relkind in ('r','p')
      union all select 'function:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || coalesce(p.proacl::text,'') || ':' || pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private','still_private') and p.prokind = 'f'
      union all select 'policy:' || schemaname || '.' || tablename || '.' || policyname || ':' || permissive || ':' || roles::text || ':' || cmd || ':' || coalesce(qual,'') || ':' || coalesce(with_check,'')
        from pg_policies where schemaname in ('public','private','still_private')
      union all select 'constraint:' || n.nspname || '.' || c.relname || '.' || k.conname || ':' || pg_get_constraintdef(k.oid)
        from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private','still_private')
      union all select 'schema:' || nspname || ':' || coalesce(nspacl::text,'') from pg_namespace where nspname in ('public','private','still_private')
    ) catalog_lines
  $snapshot$;
begin
  begin
    if current_user <> 'postgres' or session_user <> 'postgres' then
      raise exception 'Run as the project postgres administrator.';
    end if;
    if exists(select 1 from auth.users where id in (v_a,v_b,v_c) or email in (
      'kickoff-shared-acceptance-a@example.invalid','kickoff-shared-acceptance-b@example.invalid','kickoff-shared-acceptance-c@example.invalid'
    )) then raise exception 'Reserved synthetic identities already exist; refusing to reuse them.'; end if;
    if exists(select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal and tgenabled <> 'D') then
      raise exception 'Inspect Auth triggers for external side effects before running fixture inserts.';
    end if;
    if exists(select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
      where n.nspname in ('public','private') and not t.tgisinternal and t.tgenabled <> 'D'
        and not (pn.nspname = 'private' and p.proname in ('validate_center','guard_slot','guard_field_delete'))) then
      raise exception 'Inspect additional application triggers for external side effects before running fixtures.';
    end if;
    if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
      raise exception 'Request roles must not bypass RLS.'; end if;
    if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relrowsecurity and ((n.nspname = 'public' and c.relname in ('documents','mcp_tokens','centers','fields','slots'))
        or (n.nspname = 'private' and c.relname in ('matches','participants','invitations')))) <> 8 then
      raise exception 'All eight shared application tables must have RLS.'; end if;
    if has_schema_privilege('authenticated','still_private','usage') or has_schema_privilege('anon','still_private','usage')
      or has_table_privilege('anon','public.documents','select')
      or has_table_privilege('authenticated','public.documents','insert')
      or has_table_privilege('authenticated','public.documents','update')
      or has_table_privilege('authenticated','private.matches','select')
      or has_table_privilege('anon','private.participants','select')
      or has_function_privilege('anon','public.book_match(uuid,text,text,text,text)','execute')
      or has_function_privilege('authenticated','still_private.save_owned_document(uuid,uuid,text,text,integer)','execute') then
      raise exception 'A shared-project grant boundary changed.'; end if;
    execute v_snapshot_sql into v_before;
    v_checks := array_append(v_checks,'shared table RLS and sensitive grant boundaries');

    execute 'set local role anon';
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{"role":"anon"}',true);
    if auth.uid() is not null or public.browse() is distinct from '{"centers":[],"fields":[],"slots":[],"matches":[]}'::jsonb then
      raise exception 'Expected the approved empty anonymous Kickoff baseline.'; end if;
    v_denied := false;
    begin perform public.book_match(v_slot_public,'Synthetic match','All levels','public','Synthetic organizer');
    exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Anonymous booking must fail.'; end if;
    v_denied := false;
    begin perform 1 from public.documents; exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Anonymous document reads must fail.'; end if;
    v_denied := false;
    begin perform 1 from private.matches; exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Anonymous private-table reads must fail.'; end if;
    v_checks := array_append(v_checks,'anonymous empty browse and forbidden booking or private reads');
    v_denied := false;
    begin perform public.mcp_dispatch(repeat('0',64),'list','{}'::jsonb);
    exception when sqlstate '28000' then v_denied := true; end;
    if not v_denied then raise exception 'Invalid MCP capability must not expose documents.'; end if;
    v_checks := array_append(v_checks,'unknown MCP capability rejects anonymous document discovery');

    execute format('set local role %I',v_original_role);
    insert into auth.users(id,email,email_confirmed_at,is_anonymous,role,aud,created_at,updated_at) values
      (v_a,'kickoff-shared-acceptance-a@example.invalid',now(),false,'authenticated','authenticated',now(),now()),
      (v_b,'kickoff-shared-acceptance-b@example.invalid',now(),false,'authenticated','authenticated',now(),now()),
      (v_c,'kickoff-shared-acceptance-c@example.invalid',now(),false,'authenticated','authenticated',now(),now());
    select count(*) into v_count from auth.users where id in (v_a,v_b,v_c) and email_confirmed_at is not null and not is_anonymous;
    if v_count <> 3 then raise exception 'Three verified synthetic foreign-key identities are required.'; end if;
    v_checks := array_append(v_checks,'three synthetic verified identities remain transaction scoped');

    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',v_a::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_a,'role','authenticated')::text,true);
    if auth.uid() is distinct from v_a or not row_security_active('public.documents') or not row_security_active('public.centers') then
      raise exception 'Authenticated fixture context must use real RLS.'; end if;
    v_result := public.save_document(v_doc_a,'Synthetic A document','A original',null);
    if (v_result->>'user_id')::uuid is distinct from v_a or (v_result->>'version')::integer is distinct from 1 then raise exception 'Still create must bind owner A.'; end if;
    select count(*) into v_count from public.documents where id = v_doc_a and user_id = v_a;
    if v_count <> 1 then raise exception 'Still owner must read their own document.'; end if;
    v_result := public.save_document(v_doc_a,'Synthetic A document','A updated',1);
    if (v_result->>'version')::integer is distinct from 2 then raise exception 'Still version must increment.'; end if;
    v_checks := array_append(v_checks,'Still owner create read and versioned update');
    v_denied := false;
    begin perform public.save_document(v_doc_a,'Stale A','Must not overwrite',1);
    exception when sqlstate '40001' then v_denied := true; end;
    if not v_denied then raise exception 'Still stale update must fail.'; end if;
    select count(*) into v_count from public.documents where id = v_doc_a and markdown = 'A updated' and version = 2;
    if v_count <> 1 then raise exception 'Still stale save changed the latest content.'; end if;
    v_denied := false;
    begin insert into public.documents(user_id,title,markdown) values(v_a,'Bypass','Forbidden');
    exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Direct document insertion must fail.'; end if;
    v_denied := false;
    begin update public.documents set markdown = 'Forbidden' where id = v_doc_a;
    exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Direct document update must fail.'; end if;
    v_checks := array_append(v_checks,'Still stale saves preserve content and direct writes stay denied');

    perform set_config('request.jwt.claim.sub',v_b::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_b,'role','authenticated')::text,true);
    v_result := public.save_document(v_doc_b,'Synthetic B document','B original',null);
    if (v_result->>'user_id')::uuid is distinct from v_b or (select count(*) from public.documents where id = v_doc_b) <> 1 then
      raise exception 'Still B must independently create and read an owned document.'; end if;
    select count(*) into v_count from public.documents where id = v_doc_a;
    if v_count <> 0 then raise exception 'Still B must not read A.'; end if;
    v_denied := false;
    begin perform public.save_document(v_doc_a,'Forged owner','Forbidden',2);
    exception when sqlstate 'P0002' then v_denied := true; end;
    if not v_denied then raise exception 'Still B must not update A.'; end if;
    delete from public.documents where id = v_doc_a;
    get diagnostics v_affected = row_count;
    if v_affected <> 0 then raise exception 'Still B must not delete A.'; end if;
    perform set_config('request.jwt.claim.sub',v_a::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_a,'role','authenticated')::text,true);
    select count(*) into v_count from public.documents where id = v_doc_b;
    if v_count <> 0 then raise exception 'Still A must not read B.'; end if;
    v_checks := array_append(v_checks,'Still cross-owner reads updates and deletion stay isolated');

    insert into public.centers(id,owner_id,name,city,address,timezone)
      values(v_center,v_a,'Synthetic acceptance center','Madrid','Synthetic test address','Europe/Madrid');
    update public.centers set name = 'Synthetic updated center' where id = v_center;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then raise exception 'Owner center update failed.'; end if;
    insert into public.fields(id,center_id,name,format,surface,max_players,price_cents)
      values(v_field,v_center,'Synthetic field','5','Synthetic turf',10,5000);
    update public.fields set price_cents = 5500 where id = v_field;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then raise exception 'Owner field update failed.'; end if;
    insert into public.slots(id,field_id,starts_at,ends_at,price_cents) values
      (v_slot_public,v_field,now()+interval '2 days',now()+interval '2 days 1 hour',5000),
      (v_slot_private,v_field,now()+interval '3 days',now()+interval '3 days 1 hour',5000),
      (v_slot_free,v_field,now()+interval '4 days',now()+interval '4 days 1 hour',5000);
    update public.slots set price_cents = 6000 where id = v_slot_free;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then raise exception 'Owner slot update failed.'; end if;
    v_checks := array_append(v_checks,'Kickoff verified owner creates and updates center field and slots');
    v_denied := false;
    begin insert into public.fields(center_id,name,format,surface,max_players,price_cents)
      values(v_center,'Invalid capacity','5','Synthetic turf',12,5000);
    exception when sqlstate '23514' then v_denied := true; end;
    if not v_denied then raise exception 'Field capacity must match format.'; end if;
    v_denied := false;
    begin insert into public.slots(field_id,starts_at,ends_at,price_cents)
      values(v_field,now()+interval '2 days 30 minutes',now()+interval '2 days 90 minutes',5000);
    exception when sqlstate '23P01' then v_denied := true; end;
    if not v_denied then raise exception 'Overlapping slot insertion must fail.'; end if;
    v_denied := false;
    begin update public.centers set timezone = 'Invalid/AcceptanceTimezone' where id = v_center;
    exception when sqlstate '22023' then v_denied := true; end;
    if not v_denied then raise exception 'Invalid timezone must fail.'; end if;
    v_checks := array_append(v_checks,'Kickoff format overlap and timezone constraints remain active');

    perform set_config('request.jwt.claim.sub',v_c::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_c,'role','authenticated')::text,true);
    update public.centers set name = 'Forbidden' where id = v_center;
    get diagnostics v_affected = row_count;
    if v_affected <> 0 then raise exception 'Another account updated center ownership data.'; end if;
    delete from public.centers where id = v_center;
    get diagnostics v_affected = row_count;
    if v_affected <> 0 then raise exception 'Another account deleted a center.'; end if;
    update public.fields set price_cents = 1 where id = v_field;
    get diagnostics v_affected = row_count;
    if v_affected <> 0 then raise exception 'Another account updated a field.'; end if;
    delete from public.fields where id = v_field;
    get diagnostics v_affected = row_count;
    if v_affected <> 0 then raise exception 'Another account deleted a field.'; end if;
    update public.slots set price_cents = 1 where id = v_slot_free;
    get diagnostics v_affected = row_count;
    if v_affected <> 0 then raise exception 'Another account updated a slot.'; end if;
    delete from public.slots where id = v_slot_free;
    get diagnostics v_affected = row_count;
    if v_affected <> 0 then raise exception 'Another account deleted a slot.'; end if;
    v_denied := false;
    begin insert into public.centers(owner_id,name,city,address) values(v_a,'Forged owner','Madrid','Synthetic address');
    exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Forged center owner insertion must fail.'; end if;
    v_denied := false;
    begin insert into public.fields(center_id,name,format,surface,max_players,price_cents)
      values(v_center,'Forbidden field','5','Synthetic turf',10,5000);
    exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Another account inserted a field into the center.'; end if;
    v_denied := false;
    begin insert into public.slots(field_id,starts_at,ends_at,price_cents)
      values(v_field,now()+interval '5 days',now()+interval '5 days 1 hour',5000);
    exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Another account inserted a slot into the field.'; end if;
    v_checks := array_append(v_checks,'Kickoff cross-owner center field and slot CRUD cannot bypass RLS');

    perform set_config('request.jwt.claim.sub',v_b::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_b,'role','authenticated')::text,true);
    v_public := public.book_match(v_slot_public,'Synthetic public match','All levels','public','Synthetic organizer');
    v_public_invite := public.get_invite_code(v_public);
    v_private := public.book_match(v_slot_private,'Synthetic private match','All levels','invite','Synthetic organizer');
    v_private_invite := public.get_invite_code(v_private);
    v_result := public.get_match(v_public);
    if (v_result->>'organizer_id')::uuid is distinct from v_b or (v_result->>'center_owner_id')::uuid is distinct from v_a
      or (v_result->>'players_count')::integer is distinct from 1 or v_public_invite is null or v_private_invite is null then
      raise exception 'Booking must bind organizer, owner snapshot and first participant.'; end if;
    v_result := public.browse();
    if not exists(select 1 from jsonb_array_elements(v_result->'matches') m where (m->>'id')::uuid = v_public)
      or exists(select 1 from jsonb_array_elements(v_result->'matches') m where (m->>'id')::uuid = v_private)
      or exists(select 1 from jsonb_array_elements(v_result->'slots') s where (s->>'id')::uuid in (v_slot_public,v_slot_private)) then
      raise exception 'Discovery must show public matches, hide private matches and exclude booked slots.'; end if;
    v_checks := array_append(v_checks,'public booking discovery and private match exclusion');
    v_denied := false;
    begin perform public.book_match(v_slot_public,'Duplicate booking','All levels','public','Synthetic organizer');
    exception when sqlstate '23505' then v_denied := true; end;
    if not v_denied then raise exception 'A second booking must not consume the same slot.'; end if;
    v_checks := array_append(v_checks,'sequential second booking of one slot is rejected');

    perform set_config('request.jwt.claim.sub',v_a::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_a,'role','authenticated')::text,true);
    v_denied := false;
    begin delete from public.slots where id = v_slot_public; exception when sqlstate '23514' then v_denied := true; end;
    if not v_denied then raise exception 'An active booked slot must not be deleted.'; end if;
    v_denied := false;
    begin delete from public.fields where id = v_field; exception when sqlstate '23514' then v_denied := true; end;
    if not v_denied then raise exception 'A field with active bookings must not be deleted.'; end if;
    v_denied := false;
    begin update public.slots set price_cents = 1 where id = v_slot_public; exception when sqlstate '23514' then v_denied := true; end;
    if not v_denied then raise exception 'A booked slot price must not change.'; end if;
    v_checks := array_append(v_checks,'active bookings protect their field slot and price');
    v_denied := false;
    begin perform public.get_match(v_private); exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Center ownership must not reveal a private roster.'; end if;
    v_result := public.my_matches();
    select count(*) into v_count from jsonb_array_elements(v_result) m where (m->>'id')::uuid = v_private and not (m ? 'participants');
    if v_count <> 1 then raise exception 'Center owner needs a private booking summary without the roster.'; end if;
    v_denied := false;
    begin perform public.get_invite_code(v_private); exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Center ownership must not reveal organizer invitation codes.'; end if;
    v_checks := array_append(v_checks,'center owner sees booking summary without private roster or invitation');

    perform set_config('request.jwt.claim.sub',v_c::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_c,'role','authenticated')::text,true);
    v_denied := false;
    begin perform public.get_match(v_private); exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Uninvited account must not read a private match.'; end if;
    v_denied := false;
    begin perform public.join_match(v_private,'Synthetic player',gen_random_uuid()); exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Wrong private invitation must not permit joining.'; end if;
    v_member := public.join_match(v_private,'Synthetic player',v_private_invite);
    v_result := public.get_match(v_private);
    if (v_result->>'players_count')::integer is distinct from 2 then raise exception 'Invited player must gain participant read access.'; end if;
    perform public.leave_match(v_private);
    v_denied := false;
    begin perform public.get_match(v_private); exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Leaving the private match must remove participant-based read access.'; end if;
    v_checks := array_append(v_checks,'private invitation gates joining and participant access ends on leave');
    v_denied := false;
    begin perform public.cancel_match(v_public); exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Unrelated account must not cancel another booking.'; end if;
    v_denied := false;
    begin perform public.get_invite_code(v_public); exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Unrelated account must not obtain the invitation.'; end if;
    v_member := public.join_match(v_public,'Synthetic player');
    v_checks := array_append(v_checks,'non-organizer invitation retrieval and cancellation remain denied');

    execute 'set local role anon';
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{"role":"anon"}',true);
    v_denied := false;
    begin perform public.join_guest(v_public,'Synthetic guest',null,gen_random_uuid(),gen_random_uuid());
    exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Public discovery must not bypass guest invitation requirements.'; end if;
    v_denied := false;
    begin perform public.join_guest(v_private,'Synthetic guest',gen_random_uuid(),v_private_guest,v_private_token);
    exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Wrong guest invitation must fail.'; end if;
    v_checks := array_append(v_checks,'anonymous guest entry requires a valid invitation even for public matches');
    v_result := public.join_guest(v_private,'Synthetic private guest',v_private_invite,v_private_guest,v_private_token);
    v_result := public.get_match(v_private,null,v_private_guest,v_private_token);
    if (v_result->>'players_count')::integer is distinct from 2 then raise exception 'Stored guest capability must recover private access.'; end if;
    v_denied := false;
    begin perform public.get_match(v_private,null,v_private_guest,gen_random_uuid()); exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Wrong guest token must not recover private access.'; end if;
    v_denied := false;
    begin perform public.leave_guest(v_private_guest,gen_random_uuid()); exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'Wrong guest token must not remove the participant.'; end if;
    perform public.leave_guest(v_private_guest,v_private_token);
    v_checks := array_append(v_checks,'private guest capability recovers access and wrong tokens cannot read or remove');

    for v_index in 1..8 loop
      v_guest := gen_random_uuid(); v_token := gen_random_uuid();
      v_guest_ids := array_append(v_guest_ids,v_guest); v_guest_tokens := array_append(v_guest_tokens,v_token);
      v_result := public.join_guest(v_public,'Synthetic capacity guest ' || v_index,v_public_invite,v_guest,v_token);
      if (v_result->>'participant_id')::uuid is distinct from v_guest or (v_result->>'guest_token')::uuid is distinct from v_token then
        raise exception 'Guest join must return the caller persisted capability.'; end if;
      if v_index = 1 then
        v_other := public.join_guest(v_public,'Synthetic capacity guest 1',v_public_invite,v_guest,v_token);
        if v_other is distinct from v_result or (public.get_match(v_public)->>'players_count')::integer is distinct from 3 then
          raise exception 'A guest retry must retain one participant and one seat.'; end if;
      end if;
    end loop;
    if (public.get_match(v_public)->>'players_count')::integer is distinct from 10 then raise exception 'Guest joins must stop at actual field capacity.'; end if;
    v_checks := array_append(v_checks,'guest retry is idempotent and real joins fill exactly ten places');
    v_denied := false;
    begin perform public.join_guest(v_public,'Synthetic overflow guest',v_public_invite,gen_random_uuid(),gen_random_uuid());
    exception when sqlstate '23514' then v_denied := true; end;
    if not v_denied then raise exception 'An eleventh guest must be rejected.'; end if;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',v_a::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_a,'role','authenticated')::text,true);
    v_denied := false;
    begin perform public.join_match(v_public,'Synthetic overflow member'); exception when sqlstate '23514' then v_denied := true; end;
    if not v_denied then raise exception 'An eleventh registered member must be rejected.'; end if;
    v_checks := array_append(v_checks,'capacity rejects both new guests and registered players');
    perform set_config('request.jwt.claim.sub',v_c::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_c,'role','authenticated')::text,true);
    if public.join_match(v_public,'Synthetic player retry') is distinct from v_member or (public.get_match(v_public)->>'players_count')::integer is distinct from 10 then
      raise exception 'A registered participant retry must not consume an extra seat at capacity.'; end if;
    v_checks := array_append(v_checks,'registered join retries reuse the participant at full capacity');

    execute format('set local role %I',v_original_role);
    v_denied := false;
    begin
      insert into private.matches(field_id,slot_id,organizer_id,center_owner_id,title,level,visibility,status,
        starts_at,ends_at,max_players,price_cents,center_name,city,timezone,field_name,format)
        select field_id,slot_id,organizer_id,center_owner_id,title,level,visibility,status,
          starts_at,ends_at,max_players,price_cents,center_name,city,timezone,field_name,format
        from private.matches where id = v_public;
    exception when sqlstate '23505' then v_denied := true; end;
    if not v_denied then raise exception 'The database uniqueness guard must reject a second scheduled booking independently of the RPC.'; end if;
    v_checks := array_append(v_checks,'database uniqueness independently prevents duplicate scheduled bookings');
    if not exists(select 1 from private.participants where id = v_guest_ids[1] and user_id is null
      and guest_token_hash = encode(sha256(convert_to(v_guest_tokens[1]::text,'UTF8')),'hex')) then
      raise exception 'Guest capability must be stored only as its digest.'; end if;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',v_a::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_a,'role','authenticated')::text,true);
    perform public.claim_guest(v_guest_ids[1],v_guest_tokens[1]);
    if (public.get_match(v_public)->>'players_count')::integer is distinct from 10 then raise exception 'Claiming a guest must not change occupancy.'; end if;
    v_denied := false;
    begin perform public.claim_guest(v_guest_ids[2],v_guest_tokens[2]); exception when sqlstate '23505' then v_denied := true; end;
    if not v_denied then raise exception 'An account already playing must not claim another seat.'; end if;
    execute format('set local role %I',v_original_role);
    if not exists(select 1 from private.participants where id = v_guest_ids[1] and user_id = v_a and guest_token_hash is null) then
      raise exception 'Claim must bind account A and clear the guest capability.'; end if;
    execute 'set local role anon';
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{"role":"anon"}',true);
    v_denied := false;
    begin perform public.leave_guest(v_guest_ids[1],v_guest_tokens[1]); exception when sqlstate '42501' then v_denied := true; end;
    if not v_denied then raise exception 'The claimed guest token must no longer remove its participant.'; end if;
    v_checks := array_append(v_checks,'guest claims bind one account preserve occupancy and revoke the old capability');

    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',v_b::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_b,'role','authenticated')::text,true);
    v_denied := false;
    begin perform public.leave_match(v_public); exception when sqlstate '23514' then v_denied := true; end;
    if not v_denied then raise exception 'Organizer must cancel rather than abandon the booking.'; end if;
    perform public.cancel_match(v_public);
    perform public.cancel_match(v_public);
    if public.get_match(v_public)->>'status' is distinct from 'cancelled' then raise exception 'Organizer cancellation must persist and be idempotent.'; end if;
    v_denied := false;
    begin perform public.join_match(v_public,'Cancelled join'); exception when sqlstate '22023' then v_denied := true; end;
    if not v_denied then raise exception 'Cancelled match must reject a new join.'; end if;
    v_checks := array_append(v_checks,'organizer cannot abandon booking and cancellation is idempotent');
    v_rebooked := public.book_match(v_slot_public,'Synthetic rebooking','All levels','public','Synthetic organizer');
    if v_rebooked = v_public then raise exception 'A cancelled slot needs a new booking identity.'; end if;
    perform public.cancel_match(v_rebooked);
    perform set_config('request.jwt.claim.sub',v_a::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_a,'role','authenticated')::text,true);
    perform public.cancel_match(v_private);
    v_result := public.browse();
    select count(*) into v_count from jsonb_array_elements(v_result->'slots') s where (s->>'id')::uuid in (v_slot_public,v_slot_private);
    if v_count <> 2 then raise exception 'Organizer and center-owner cancellation must release both slots.'; end if;
    v_checks := array_append(v_checks,'cancelled slots can be rebooked and center owner can release own booking');

    delete from public.slots where id in (v_slot_public,v_slot_private,v_slot_free);
    get diagnostics v_affected = row_count;
    if v_affected <> 3 then raise exception 'Owner must delete all released/free slots.'; end if;
    delete from public.fields where id = v_field;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then raise exception 'Owner must delete the released field.'; end if;
    delete from public.centers where id = v_center;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then raise exception 'Owner must delete the released center.'; end if;
    if public.get_match(v_public)->>'center_name' is distinct from 'Synthetic updated center' then
      raise exception 'Cancelled booking snapshots must survive source inventory removal.'; end if;
    v_checks := array_append(v_checks,'owner deletes released inventory while booking history retains snapshots');

    execute format('set local role %I',v_original_role);
    if (select count(*) from private.matches where slot_id = v_slot_public and status = 'scheduled') <> 0
      or (select count(*) from private.participants where match_id = v_public) <> 10 then
      raise exception 'Booking or capacity residue differs from expected sequential results.'; end if;
    execute v_snapshot_sql into v_after;
    if v_before is distinct from v_after then raise exception 'Acceptance checks changed schema grants policies functions or constraints.'; end if;
    v_checks := array_append(v_checks,'catalog grants policies function definitions and constraints stay unchanged');

    raise sqlstate 'KS001' using message = 'kickoff_shared_acceptance_rollback';
  exception when sqlstate 'KS001' then
    if sqlerrm <> 'kickoff_shared_acceptance_rollback' then raise; end if;
    v_rolled_back := true;
  end;

  if not v_rolled_back or current_user <> v_original_role then raise exception 'Rollback must restore the original role.'; end if;
  if exists(select 1 from auth.users where id in (v_a,v_b,v_c))
    or exists(select 1 from public.documents where user_id in (v_a,v_b,v_c))
    or exists(select 1 from public.mcp_tokens where user_id in (v_a,v_b,v_c))
    or exists(select 1 from public.centers where owner_id in (v_a,v_b,v_c))
    or exists(select 1 from private.matches where organizer_id in (v_a,v_b,v_c) or center_owner_id in (v_a,v_b,v_c))
    or exists(select 1 from private.participants where user_id in (v_a,v_b,v_c) or id = any(v_guest_ids) or id = v_private_guest)
    or exists(select 1 from public.fields where id = v_field)
    or exists(select 1 from public.slots where id in (v_slot_public,v_slot_private,v_slot_free)) then
    raise exception 'Rollback left synthetic application/Auth data.';
  end if;
  execute v_snapshot_sql into v_after;
  if v_before is distinct from v_after then raise exception 'Catalog changed across fixture rollback.'; end if;
  v_checks := array_append(v_checks,'all fixtures roll back and the original role and catalog are restored');
  if cardinality(v_checks) <> 28 then raise exception 'Named assertion count changed; update the final receipt.'; end if;
  raise notice 'Shared backend acceptance completed % groups; fixture data already rolled back; catalog hash %.',cardinality(v_checks),v_after;
end;
$acceptance$;

rollback;

-- Only this final read-only statement is returned by execute_sql. It executes only
-- after the straight-through DO succeeds; no mutable temporary report survives.
with assertion_groups as (
  select array[
    'shared table RLS and sensitive grant boundaries',
    'anonymous empty browse and forbidden booking or private reads',
    'unknown MCP capability rejects anonymous document discovery',
    'three synthetic verified identities remain transaction scoped',
    'Still owner create read and versioned update',
    'Still stale saves preserve content and direct writes stay denied',
    'Still cross-owner reads updates and deletion stay isolated',
    'Kickoff verified owner creates and updates center field and slots',
    'Kickoff format overlap and timezone constraints remain active',
    'Kickoff cross-owner center field and slot CRUD cannot bypass RLS',
    'public booking discovery and private match exclusion',
    'sequential second booking of one slot is rejected',
    'active bookings protect their field slot and price',
    'center owner sees booking summary without private roster or invitation',
    'private invitation gates joining and participant access ends on leave',
    'non-organizer invitation retrieval and cancellation remain denied',
    'anonymous guest entry requires a valid invitation even for public matches',
    'private guest capability recovers access and wrong tokens cannot read or remove',
    'guest retry is idempotent and real joins fill exactly ten places',
    'capacity rejects both new guests and registered players',
    'registered join retries reuse the participant at full capacity',
    'database uniqueness independently prevents duplicate scheduled bookings',
    'guest claims bind one account preserve occupancy and revoke the old capability',
    'organizer cannot abandon booking and cancellation is idempotent',
    'cancelled slots can be rebooked and center owner can release own booking',
    'owner deletes released inventory while booking history retains snapshots',
    'catalog grants policies function definitions and constraints stay unchanged',
    'all fixtures roll back and the original role and catalog are restored'
  ]::text[] as checks
), catalog_lines as (
  select 'relation:' || n.nspname || '.' || c.relname || ':' || c.relrowsecurity::text || ':' || coalesce(c.relacl::text,'') as line
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private','still_private') and c.relkind in ('r','p')
  union all select 'column:' || n.nspname || '.' || c.relname || '.' || a.attname || ':' || coalesce(a.attacl::text,'')
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public','private','still_private') and a.attnum > 0 and not a.attisdropped and c.relkind in ('r','p')
  union all select 'function:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || coalesce(p.proacl::text,'') || ':' || pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private','still_private') and p.prokind = 'f'
  union all select 'policy:' || schemaname || '.' || tablename || '.' || policyname || ':' || permissive || ':' || roles::text || ':' || cmd || ':' || coalesce(qual,'') || ':' || coalesce(with_check,'')
    from pg_policies where schemaname in ('public','private','still_private')
  union all select 'constraint:' || n.nspname || '.' || c.relname || '.' || k.conname || ':' || pg_get_constraintdef(k.oid)
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private','still_private')
  union all select 'schema:' || nspname || ':' || coalesce(nspacl::text,'') from pg_namespace where nspname in ('public','private','still_private')
), residue as (
  select
    (select count(*) from auth.users where id in ('6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac001'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac002'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac003'::uuid)) as auth_users,
    (select count(*) from public.documents where user_id in ('6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac001'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac002'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac003'::uuid)) as documents,
    (select count(*) from public.mcp_tokens where user_id in ('6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac001'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac002'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac003'::uuid)) as mcp_tokens,
    (select count(*) from public.centers where owner_id in ('6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac001'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac002'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac003'::uuid)) as centers,
    (select count(*) from private.matches where organizer_id in ('6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac001'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac002'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac003'::uuid)
      or center_owner_id in ('6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac001'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac002'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac003'::uuid)) as matches,
    (select count(*) from private.participants where user_id in ('6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac001'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac002'::uuid,'6fc6f7f2-d2cf-4bb7-82cd-5a25db2ac003'::uuid)) as registered_participants
)
select jsonb_build_object(
  'passed',not exists(select 1 from jsonb_each(to_jsonb(residue)) e where e.value <> '0'::jsonb),
  'checks_passed',cardinality(assertion_groups.checks),'checks',to_jsonb(assertion_groups.checks),
  'fixture_residue_after_rollback',to_jsonb(residue),
  'catalog_snapshot_before_after_match',true,
  'catalog_snapshot_md5',(select md5(string_agg(line,E'\n' order by line)) from catalog_lines),
  'proof_boundary','Installed PostgreSQL grants, RLS, RPC authorization, sequential booking/capacity/version constraints and rollback only. No real signup, email delivery, JWT verification, Auth sessions, HTTP/MCP/browser transport or concurrent-client proof.'
) as shared_backend_acceptance
from assertion_groups cross join residue;
