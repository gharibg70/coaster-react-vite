-- The legacy policy allowed active subscribers to read either room.
-- Keep only the room-scoped policy so RLS preserves boys/girls isolation.
DROP POLICY IF EXISTS student_chat_messages_eligible_read ON public.student_chat_messages;
