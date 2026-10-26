-- Times are UTC: 04:00 UTC = 09:30 IST; 05:01 UTC = 10:31 IST.
create extension if not exists pg_cron;
select cron.schedule('roll-events', '0 4 * * *', $$select public.roll_forward_events();$$);
select cron.schedule('reminders', '1 5 * * *', $$select public.generate_reminders();$$);
