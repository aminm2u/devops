-- Sample helpdesk history, so the report page opens with a real trend to read.
-- Only runs when the table is empty; safe to execute more than once.
-- Remove with: DELETE FROM helpdesk_tickets WHERE metadata->>'seed' = 'demo';

DO $$
DECLARE
  ticket_id integer;
  i integer;
  created_at_ts timestamp;
  resolved_ts timestamp;
  sla_ts timestamp;
  response_ts timestamp;
  st text;
  pr text;
  cat integer;
  agent integer;
  reporter integer;
  subject text;
  open_hours numeric;
  breached boolean;
  subjects text[] := ARRAY[
    'VPN disconnects every few minutes',
    'Printer on level 3 is offline',
    'Mailbox over quota, cannot receive mail',
    'Need access to the finance shared drive',
    'Laptop extremely slow after the last update',
    'Wi-Fi drops in the meeting room',
    'Build agent out of disk space',
    'Password reset for the staging console',
    'Shared calendar invitations not arriving',
    'New starter laptop setup',
    'Office 365 licence assignment',
    'Cannot connect to the internal wiki',
    'Backup job failed overnight',
    'Suspicious login alert on my account',
    'Monitor flickers when docked',
    'Request for a second display'
  ];
  categories integer[] := ARRAY[1,2,3,4,5,6,7,8];
  priorities text[] := ARRAY['urgent','high','medium','medium','low','low'];
  agents integer[] := ARRAY[13,15,16];
  reporters integer[] := ARRAY[14,17,18,19];
BEGIN
  IF (SELECT count(*) FROM helpdesk_tickets) > 0 THEN
    RAISE NOTICE 'helpdesk_tickets is not empty — skipping sample data';
    RETURN;
  END IF;

  FOR i IN 1..118 LOOP
    created_at_ts := now() - (random() * 105) * interval '1 day'
                     - (random() * 8) * interval '1 hour';
    pr := priorities[1 + floor(random() * array_length(priorities, 1))];
    cat := categories[1 + floor(random() * array_length(categories, 1))];
    agent := agents[1 + floor(random() * array_length(agents, 1))];
    reporter := reporters[1 + floor(random() * array_length(reporters, 1))];
    subject := subjects[1 + floor(random() * array_length(subjects, 1))];

    -- How long this one took to close. Set so ~85% land inside their SLA.
    open_hours := CASE
      WHEN pr = 'urgent' THEN random() * 6
      WHEN pr = 'high'   THEN random() * 20
      WHEN pr = 'medium' THEN random() * 60
      ELSE random() * 130
    END;
    breached := random() < 0.15;
    IF breached THEN
      open_hours := open_hours * (2 + random() * 3);
    END IF;

    sla_ts := created_at_ts + CASE
      WHEN pr = 'urgent' THEN interval '4 hours'
      WHEN pr = 'high'   THEN interval '12 hours'
      WHEN pr = 'medium' THEN interval '3 days'
      ELSE interval '7 days'
    END;

    resolved_ts := created_at_ts + open_hours * interval '1 hour';

    -- Anything that would still be open right now stays open, and a slice of
    -- the older work is left unresolved too — a support queue always has a
    -- backlog, and an empty one would make the ageing panel meaningless.
    IF resolved_ts > now() OR random() < 0.14 THEN
      resolved_ts := NULL;
      st := (ARRAY['open','in_progress','awaiting_response'])[1 + floor(random() * 3)];
    ELSE
      st := CASE WHEN random() < 0.6 THEN 'resolved' ELSE 'closed' END;
    END IF;

    response_ts := created_at_ts + (random() * 5) * interval '1 hour';
    IF response_ts > COALESCE(resolved_ts, now()) THEN
      response_ts := NULL;
    END IF;

    INSERT INTO helpdesk_tickets (
      title, slug, description, status, priority, category_id, source,
      assigned_to, reported_by, sla_response_at, sla_resolution_at,
      resolved_at, closed_at, satisfaction, resolution_notes,
      is_active, metadata, created_at, updated_at, team_id
    ) VALUES (
      subject,
      'seed-' || i || '-' || to_char(created_at_ts, 'YYYYMMDD') || '-' || (extract(epoch from clock_timestamp())::bigint),
      'Reported through the internal support form.',
      st,
      pr,
      cat,
      (ARRAY['web','email','phone','chat'])[1 + floor(random() * 4)],
      agent,
      reporter,
      created_at_ts + interval '2 hours',
      sla_ts,
      resolved_ts,
      CASE WHEN st = 'closed' THEN resolved_ts ELSE NULL END,
      CASE
        WHEN resolved_ts IS NOT NULL AND random() < 0.45
          THEN (CASE WHEN breached THEN 2 + floor(random() * 2) ELSE 3 + floor(random() * 3) END)
        ELSE NULL
      END,
      CASE WHEN resolved_ts IS NOT NULL THEN 'Resolved and confirmed with the requester.' ELSE NULL END,
      true,
      '{"seed":"demo"}'::jsonb,
      created_at_ts,
      COALESCE(resolved_ts, created_at_ts + interval '2 hours'),
      4
    ) RETURNING id INTO ticket_id;

    -- First public reply, when there was one inside the working window.
    IF response_ts IS NOT NULL AND random() < 0.85 THEN
      INSERT INTO helpdesk_comments (
        ticket_id, user_id, content, is_internal, is_active, created_at, updated_at
      ) VALUES (
        ticket_id, agent, 'Thanks for reporting — taking a look now.', false, true,
        response_ts, response_ts
      );
    END IF;
  END LOOP;
END $$;
