-- Approved production hardening: deny direct access until explicit policies are chosen.
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
